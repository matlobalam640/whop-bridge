const axios = require('axios');

function wcConfig() {
  const baseURL = process.env.WOOCOMMERCE_URL?.replace(/\/$/, '').trim();
  const key = process.env.WC_KEY?.trim();
  const secret = process.env.WC_SECRET?.trim();

  if (!baseURL || !key || !secret) {
    throw new Error('WooCommerce URL, WC_KEY, and WC_SECRET must be set in environment variables');
  }

  return { baseURL, key, secret };
}

function wcClient() {
  const { baseURL, key, secret } = wcConfig();

  const client = axios.create({
    baseURL: `${baseURL}/wp-json/wc/v3`,
    timeout: 30000,
  });

  // Some hosts strip Authorization headers from external servers (e.g. Vercel → Hostinger)
  if (process.env.WC_USE_QUERY_AUTH === 'true') {
    client.interceptors.request.use((config) => {
      config.params = {
        ...config.params,
        consumer_key: key,
        consumer_secret: secret,
      };
      return config;
    });
  } else {
    client.defaults.auth = { username: key, password: secret };
  }

  return client;
}

function wcErrorMessage(err) {
  const data = err.response?.data;
  return data?.message || data?.error || err.message;
}

function isWcAuthError(err) {
  const status = err.response?.status;
  const msg = wcErrorMessage(err) || '';
  return (
    status === 401 ||
    status === 403 ||
    /cannot view this resource/i.test(msg) ||
    /woocommerce_rest_cannot_view/i.test(dataCode(err))
  );
}

function dataCode(err) {
  return err.response?.data?.code;
}

async function testConnection() {
  const { data } = await wcClient().get('/orders', { params: { per_page: 1 } });
  return { ok: true, sampleOrderId: data[0]?.id ?? null };
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

module.exports = {
  getOrder,
  markOrderPaid,
  testConnection,
  wcErrorMessage,
  isWcAuthError,
};
