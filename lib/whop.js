const axios = require('axios');

const WHOP_API_BASE = 'https://api.whop.com/api/v1';

function whopHeaders() {
  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) throw new Error('WHOP_API_KEY is not set in .env');
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Create a Whop checkout session and return the customer payment URL.
 */
async function createCheckoutSession({
  amount,
  orderId,
  customerEmail,
  currency = 'usd',
}) {
  const companyId = process.env.WHOP_COMPANY_ID;
  if (!companyId) {
    throw new Error('WHOP_COMPANY_ID is not set in .env (biz_... from Whop dashboard)');
  }

  const orderReceivedBase =
    process.env.WC_ORDER_RECEIVED_URL ||
    `${process.env.WOOCOMMERCE_URL?.replace(/\/$/, '')}/checkout/order-received/`;

  const redirectUrl = `${orderReceivedBase}${orderReceivedBase.includes('?') ? '&' : '?'}order_id=${orderId}`;

  const metadata = {
    order_id: String(orderId),
    customer_email: customerEmail || '',
    source: 'woocommerce_bridge',
  };

  let body;

  if (process.env.WHOP_PLAN_ID) {
    body = {
      mode: 'payment',
      plan_id: process.env.WHOP_PLAN_ID,
      metadata,
      redirect_url: redirectUrl,
    };
  } else {
    const price = Number(amount);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Invalid amount: must be a positive number');
    }

    body = {
      mode: 'payment',
      plan: {
        company_id: companyId,
        initial_price: price,
        plan_type: 'one_time',
        currency,
        visibility: 'hidden',
      },
      metadata,
      redirect_url: redirectUrl,
    };
  }

  const { data } = await axios.post(
    `${WHOP_API_BASE}/checkout_configurations`,
    body,
    { headers: whopHeaders() }
  );

  const checkoutUrl =
    data.purchase_url ||
    data.checkout_url ||
    (data.plan?.id ? `https://whop.com/checkout/${data.plan.id}` : null);

  if (!checkoutUrl) {
    throw new Error('Whop did not return a checkout URL');
  }

  return {
    checkoutUrl: checkoutUrl.startsWith('http')
      ? checkoutUrl
      : `https://whop.com${checkoutUrl}`,
    sessionId: data.id,
    planId: data.plan?.id,
  };
}

function extractOrderIdFromWebhook(event) {
  const data = event.data || event;
  const metadata = data.metadata || event.metadata || {};
  const orderId = metadata.order_id || metadata.orderId;

  if (orderId) return String(orderId);

  return null;
}

function isPaymentSuccessEvent(event) {
  if (event.type === 'payment.succeeded') return true;
  if (event.status === 'paid' || event.status === 'succeeded') return true;
  return false;
}

module.exports = {
  createCheckoutSession,
  extractOrderIdFromWebhook,
  isPaymentSuccessEvent,
};
