/**
 * Normalize payment payloads from Whopy plugin / WooCommerce (JSON, form, query).
 */
function tryParseJson(value) {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function pickFirst(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function parsePaymentPayload(req) {
  const body =
    (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? req.body
      : null) ||
    tryParseJson(req.body) ||
    {};

  const query = req.query || {};
  const nested =
    (body.data && typeof body.data === 'object' ? body.data : null) ||
    (body.payload && typeof body.payload === 'object' ? body.payload : null) ||
    (body.body && typeof body.body === 'object' ? body.body : null) ||
    {};

  const merged = { ...query, ...body, ...nested };

  let order_id = pickFirst(merged, [
    'order_id',
    'orderId',
    'orderID',
    'order',
    'id',
    'wc_order_id',
    'woocommerce_order_id',
  ]);

  let amount = pickFirst(merged, [
    'amount',
    'total',
    'price',
    'cart_total',
    'cartTotal',
    'order_total',
    'orderTotal',
  ]);

  const customer_email = pickFirst(merged, [
    'customer_email',
    'customerEmail',
    'email',
    'billing_email',
    'billingEmail',
  ]);

  const currency = pickFirst(merged, ['currency', 'order_currency', 'orderCurrency']);

  const return_url = pickFirst(merged, ['return_url', 'returnUrl', 'redirect_url', 'redirectUrl']);

  const test_order = pickFirst(merged, ['test_order', 'testOrder', 'test']);

  if (amount !== undefined) {
    amount = parseFloat(String(amount).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(amount)) amount = undefined;
  }

  if (order_id !== undefined) {
    order_id = String(order_id).trim();
  }

  return {
    order_id,
    amount,
    customer_email,
    currency,
    return_url,
    test_order,
    received_keys: Object.keys(merged),
    content_type: req.headers['content-type'] || '',
  };
}

module.exports = { parsePaymentPayload };
