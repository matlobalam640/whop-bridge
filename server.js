require('dotenv').config();

const express = require('express');
const cors = require('cors');
const {
  createCheckoutSession,
  extractOrderIdFromWebhook,
  isPaymentSuccessEvent,
} = require('./lib/whop');
const {
  getOrder,
  markOrderPaid,
  testConnection,
  wcErrorMessage,
  isWcAuthError,
} = require('./lib/woocommerce');
const { verifyWhopWebhook } = require('./lib/webhookVerify');
const { parsePaymentPayload } = require('./lib/parsePaymentRequest');
const { handleWhopyGateway, isWhopyGatewayRequest } = require('./lib/whopyGateway');

const app = express();
const PORT = process.env.PORT || 3000;
const BRIDGE_BASE_URL = (process.env.BRIDGE_BASE_URL || '').replace(/\/$/, '');

app.use(cors());

// Raw body required for webhook signature verification
app.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (_req, res) => {
  const base = BRIDGE_BASE_URL || '';
  res.json({
    service: 'whop-woocommerce-bridge',
    whopy_bridge_url: base || '/',
    whopy_note: 'Set Whopy plugin Bridge URL to your Vercel root (no /create-payment)',
    legacy_create_payment: base ? `${base}/create-payment` : '/create-payment',
    webhook_url: base ? `${base}/webhook` : '/webhook',
    health: '/health',
  });
});

/** Whopy plugin native proxy (POST with action + params) */
async function handleWhopyGatewayRoute(req, res) {
  try {
    if (!isWhopyGatewayRequest(req.body)) {
      return res.status(400).json({
        error:
          'Invalid Whopy gateway request. Plugin Bridge URL must be your Vercel root, e.g. https://project-k9230.vercel.app',
      });
    }

    const result = await handleWhopyGateway(req.body);
    res.json(result);
  } catch (err) {
    console.error('[whopy-gateway]', err.whop || err.message);
    res.status(err.statusCode || 500).json({
      error: err.message,
      source: err.source || 'gateway',
    });
  }
}

app.post('/', handleWhopyGatewayRoute);
app.post('/gateway', handleWhopyGatewayRoute);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/health/wc', async (_req, res) => {
  const { storeUrlDiagnostics } = require('./lib/woocommerce');
  const urlInfo = storeUrlDiagnostics();
  const keySet = Boolean(process.env.WC_KEY?.trim() && process.env.WC_SECRET?.trim());
  const keyPrefix = process.env.WC_KEY?.trim().slice(0, 6) || 'missing';

  try {
    const result = await testConnection();
    res.json({
      ok: true,
      woocommerce: 'connected',
      wc_key_prefix: `${keyPrefix}...`,
      ...urlInfo,
      ...result,
    });
  } catch (err) {
    const hints = [];
    if (urlInfo.store_url_has_whitespace) {
      hints.push('WOOCOMMERCE_URL in Vercel has extra spaces/tabs — edit it to exactly https://gioaccessories.com with no spaces, then redeploy.');
    }
    if (isWcAuthError(err)) {
      hints.push('WC_KEY/WC_SECRET must be Read/Write keys for an Administrator user. Your Vercel key starts with ck_5d4 — create a new key in WooCommerce if needed.');
    }

    res.status(502).json({
      ok: false,
      woocommerce: 'failed',
      wc_key_set: keySet,
      wc_key_prefix: keySet ? `${keyPrefix}...` : 'missing',
      auth_mode: require('./lib/woocommerce').useQueryAuth() ? 'query' : 'basic',
      ...urlInfo,
      error: wcErrorMessage(err),
      hint: hints.join(' '),
    });
  }
});

/**
 * Bridge URL — configure this in your WooCommerce Whop payment plugin.
 * POST body: { order_id, amount, customer_email, currency? }
 */
const ALLOW_FAKE_ORDER_ID = process.env.WHOP_ALLOW_FAKE_ORDER_ID === 'true';

async function resolveWooOrder(orderId) {
  try {
    return await getOrder(orderId);
  } catch (err) {
    if (ALLOW_FAKE_ORDER_ID && (err.response?.status === 404 || err.response?.status === 400)) {
      return null;
    }
    if (isWcAuthError(err)) {
      const authErr = new Error(
        'WooCommerce API access denied. In Vercel, verify WC_KEY and WC_SECRET match WooCommerce → Settings → Advanced → REST API (Read/Write, Administrator).'
      );
      authErr.statusCode = 502;
      authErr.wcMessage = wcErrorMessage(err);
      throw authErr;
    }
    throw err;
  }
}

app.get('/health/whop', async (_req, res) => {
  const keyPrefix = process.env.WHOP_API_KEY?.trim().slice(0, 8) || 'missing';
  try {
    await require('./lib/whop').testWhopConnection();
    res.json({
      ok: true,
      whop: 'connected',
      whop_key_prefix: `${keyPrefix}...`,
      company_id: process.env.WHOP_COMPANY_ID?.trim(),
    });
  } catch (err) {
    const whop = err.whop || require('./lib/whop').whopErrorDetails(err);
    res.status(502).json({
      ok: false,
      whop: 'failed',
      whop_key_prefix: `${keyPrefix}...`,
      company_id: process.env.WHOP_COMPANY_ID?.trim() || 'not set',
      error: whop.message || err.message,
      hint:
        'Create a new Company API key (Developer → Company API keys → Create) and enable ALL checkout/plan/payment permissions in the popup. access_pass:* scopes are for Whop Apps only — not needed here. See WHOP-API-SETUP.md.',
    });
  }
});

app.post('/create-payment', async (req, res) => {
  try {
    const parsed = parsePaymentPayload(req);
    let { order_id, amount, customer_email, currency, return_url, test_order } = parsed;

    let skipWooLookup =
      test_order === true ||
      test_order === 'true' ||
      test_order === 1 ||
      test_order === '1';

    // Whopy may send only amount before order exists — load total from WC order if we have id
    if (order_id && (amount === undefined || amount === null)) {
      try {
        const wcOrder = await getOrder(order_id);
        amount = parseFloat(wcOrder.total);
        customer_email = customer_email || wcOrder.billing?.email;
        currency = currency || wcOrder.currency?.toLowerCase();
      } catch {
        // handled below
      }
    }

    // Cart checkout: amount without order_id (plugin / pending checkout)
    if (!order_id && amount > 0 && ALLOW_FAKE_ORDER_ID) {
      order_id = `wc-${Date.now()}`;
      skipWooLookup = true;
    }

    if (!order_id || amount === undefined || amount === null || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'order_id and amount are required',
        hint:
          'Send JSON or form fields: order_id (or orderId) and amount (or total). Whopy plugin must POST to /create-payment with cart total.',
        received_keys: parsed.received_keys,
        content_type: parsed.content_type,
      });
    }

    const wcOrder = skipWooLookup ? null : await resolveWooOrder(order_id);

    if (wcOrder) {
      const wcTotal = parseFloat(wcOrder.total);
      if (Number.isFinite(wcTotal) && Math.abs(wcTotal - Number(amount)) > 0.01) {
        return res.status(400).json({
          success: false,
          error: 'Amount does not match WooCommerce order total',
        });
      }
    } else if (!ALLOW_FAKE_ORDER_ID) {
      return res.status(404).json({
        success: false,
        error: 'WooCommerce order not found',
      });
    }

    const session = await createCheckoutSession({
      amount,
      orderId: order_id,
      customerEmail: customer_email || wcOrder?.billing?.email,
      currency: currency || wcOrder?.currency?.toLowerCase() || 'usd',
      returnUrl: return_url,
    });

    res.json({
      success: true,
      checkout_url: session.checkoutUrl,
      session_id: session.sessionId,
      plan_id: session.planId,
      embed: session.embed,
    });
  } catch (err) {
    console.error('[create-payment]', err.whop || err.wcMessage || err.response?.data || err.message);
    const status = err.statusCode || err.response?.status || 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({
      success: false,
      error: err.message || wcErrorMessage(err) || err.response?.data?.message,
      source: err.source || (err.wcMessage ? 'woocommerce' : undefined),
      whop_error: err.whop || undefined,
      wc_error: err.wcMessage || undefined,
      hint:
        err.source === 'whop'
          ? 'Create a new Company API key with checkout/plan CREATE permissions (see WHOP-API-SETUP.md).'
          : undefined,
    });
  }
});

async function handleWebhook(req, res) {
  const rawBody = req.body?.toString?.('utf8') || '';

  try {
    const secret = process.env.WHOP_WEBHOOK_SECRET;
    const skipVerify = process.env.SKIP_WEBHOOK_VERIFY === 'true';

    if (secret && !skipVerify) {
      const valid = verifyWhopWebhook(rawBody, req.headers, secret);
      if (!valid) {
        console.warn('[webhook] Invalid signature');
        return res.sendStatus(401);
      }
    }

    const event = JSON.parse(rawBody || '{}');
    console.log('[webhook] received:', event.type || event.status || 'unknown');

    if (!isPaymentSuccessEvent(event)) {
      return res.sendStatus(200);
    }

    const orderId = extractOrderIdFromWebhook(event);
    if (!orderId) {
      console.warn('[webhook] No order_id in metadata');
      return res.sendStatus(200);
    }

    const paymentId = event.data?.id || event.id;

    try {
      await markOrderPaid(orderId, { transactionId: paymentId });
      console.log(`[webhook] Order ${orderId} marked as paid`);
    } catch (err) {
      if (ALLOW_FAKE_ORDER_ID && err.response?.status === 404) {
        console.log(`[webhook] Order ${orderId} not in WooCommerce (test/fake id), skipping update`);
      } else {
        throw err;
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[webhook]', err.response?.data || err.message);
    res.sendStatus(500);
  }
}

module.exports = app;

// Local only — Vercel runs serverless via api/index.js (no app.listen)
if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`Whop bridge running on port ${PORT}`);
    if (BRIDGE_BASE_URL) {
      console.log(`Bridge URL:  ${BRIDGE_BASE_URL}/create-payment`);
      console.log(`Webhook URL: ${BRIDGE_BASE_URL}/webhook`);
    } else {
      console.log('Set BRIDGE_BASE_URL in .env after deploy (e.g. https://pay.yourdomain.com)');
      console.log(`Local bridge URL: http://localhost:${PORT}/create-payment`);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} is already in use. Another server is still running.\n`);
      console.error('Fix in PowerShell:');
      console.error(
        `  Get-NetTCPConnection -LocalPort ${PORT} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
      );
      console.error(`\nOr set a different port in .env:  PORT=3001\n`);
      process.exit(1);
    }
    throw err;
  });
}
