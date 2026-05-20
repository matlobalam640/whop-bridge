const axios = require('axios');

function wcConfig() {
  const baseURL = process.env.WOOCOMMERCE_URL?.replace(/\/$/, '').trim();
  const key = process.env.WC_KEY?.trim();
  const secret = process.env.WC_SECRET?.trim();

  if (!baseURL || !key || !secret) {
    throw new Error('WooCommerce URL, WC_KEY, and WC_SECRET must be set in environment variables');
  }

  if (!key.startsWith('ck_') || !secret.startsWith('cs_')) {
    throw new Error('WC_KEY must start with ck_ and WC_SECRET must start with cs_');
  }

  return { baseURL, key, secret };
}

/** Query auth is default — Hostinger/Vercel often break HTTP Basic Auth. */
function useQueryAuth() {
  return process.env.WC_USE_QUERY_AUTH !== 'false';
}

function wcClient() {
  const { baseURL, key, secret } = wcConfig();

  const client = axios.create({
    baseURL: `${baseURL}/wp-json/wc/v3`,
    timeout: 30000,
  });

  if (useQueryAuth()) {
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
    /cannot list resources/i.test(msg) ||
    /woocommerce_rest_cannot_view/i.test(err.response?.data?.code) ||
    /woocommerce_rest_cannot_list/i.test(err.response?.data?.code)
  );
}

async function testConnection() {
  const { data } = await wcClient().get('/orders', { params: { per_page: 1, status: 'any' } });
  return {
    ok: true,
    sampleOrderId: data[0]?.id ?? null,
    auth_mode: useQueryAuth() ? 'query' : 'basic',
  };
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
  useQueryAuth,
};
