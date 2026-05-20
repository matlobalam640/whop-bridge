const axios = require('axios');

function wcClient() {
  const baseURL = process.env.WOOCOMMERCE_URL?.replace(/\/$/, '');
  const key = process.env.WC_KEY;
  const secret = process.env.WC_SECRET;

  if (!baseURL || !key || !secret) {
    throw new Error('WooCommerce URL, WC_KEY, and WC_SECRET must be set in .env');
  }

  return axios.create({
    baseURL: `${baseURL}/wp-json/wc/v3`,
    auth: { username: key, password: secret },
    timeout: 30000,
  });
}

async function getOrder(orderId) {
  const { data } = await wcClient().get(`/orders/${orderId}`);
  return data;
}

async function markOrderPaid(orderId, { transactionId } = {}) {
  const payload = {
    status: 'processing',
    set_paid: true,
  };

  if (transactionId) {
    payload.transaction_id = String(transactionId);
  }

  const { data } = await wcClient().put(`/orders/${orderId}`, payload);
  return data;
}

module.exports = { getOrder, markOrderPaid };
