require('dotenv').config();

const express = require('express');
const cors = require('cors');
const {
  createCheckoutSession,
  extractOrderIdFromWebhook,
  isPaymentSuccessEvent,
} = require('./lib/whop');
const { getOrder, markOrderPaid } = require('./lib/woocommerce');
const { verifyWhopWebhook } = require('./lib/webhookVerify');

const app = express();
const PORT = process.env.PORT || 3000;
const BRIDGE_BASE_URL = (process.env.BRIDGE_BASE_URL || '').replace(/\/$/, '');

app.use(cors());

// Raw body required for webhook signature verification
app.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    service: 'whop-woocommerce-bridge',
    bridge_url: BRIDGE_BASE_URL ? `${BRIDGE_BASE_URL}/create-payment` : '/create-payment',
    webhook_url: BRIDGE_BASE_URL ? `${BRIDGE_BASE_URL}/webhook` : '/webhook',
    health: '/health',
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
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
    if (ALLOW_FAKE_ORDER_ID && err.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

app.post('/create-payment', async (req, res) => {
  try {
    const { order_id, amount, customer_email, currency } = req.body;

    if (!order_id || amount === undefined || amount === null) {
      return res.status(400).json({
        success: false,
        error: 'order_id and amount are required',
      });
    }

    const wcOrder = await resolveWooOrder(order_id);

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

    const { checkoutUrl, sessionId } = await createCheckoutSession({
      amount,
      orderId: order_id,
      customerEmail: customer_email || wcOrder?.billing?.email,
      currency: currency || wcOrder?.currency?.toLowerCase() || 'usd',
    });

    res.json({
      success: true,
      checkout_url: checkoutUrl,
      session_id: sessionId,
    });
  } catch (err) {
    const whopError = err.response?.data?.error;
    console.error('[create-payment]', whopError || err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      success: false,
      error: whopError?.message || err.response?.data?.message || err.message,
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
