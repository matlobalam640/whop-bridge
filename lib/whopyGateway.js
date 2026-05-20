const axios = require('axios');
const { whopHeaders, whopErrorDetails } = require('./whop');

const WHOP_API_BASE = 'https://api.whop.com/api/v1';

/**
 * Whopy plugin proxy protocol (class-whop-api.php):
 * POST { bridge_url } with body:
 *   { action: "create_checkout_configuration", params: { payload: {...} } }
 * Expects response: { data: { id, plan: { id }, environment } }
 */
async function handleWhopyGateway(body) {
  const action = body?.action;
  const params = body?.params || {};

  switch (action) {
    case 'create_checkout_configuration':
      return createCheckoutConfiguration(params.payload);
    case 'get_plan':
      return getPlan(params.plan_id);
    case 'create_dynamic_plan':
      return createDynamicPlan(params);
    case 'get_me':
      return { data: { company_id: process.env.WHOP_COMPANY_ID?.trim() } };
    default:
      const err = new Error(`Unknown gateway action: ${action || '(empty)'}`);
      err.statusCode = 400;
      throw err;
  }
}

async function createCheckoutConfiguration(payload) {
  if (!payload || typeof payload !== 'object') {
    throw Object.assign(new Error('Missing checkout payload'), { statusCode: 400 });
  }

  const companyId = process.env.WHOP_COMPANY_ID?.trim();
  if (!companyId) {
    throw Object.assign(new Error('WHOP_COMPANY_ID not configured on bridge'), { statusCode: 500 });
  }

  const whopPayload = { ...payload, mode: payload.mode || 'payment' };

  if (whopPayload.plan && typeof whopPayload.plan === 'object') {
    whopPayload.plan = { ...whopPayload.plan, company_id: whopPayload.plan.company_id || companyId };

    if (!whopPayload.plan.product_id && !whopPayload.plan.access_pass_id) {
      if (process.env.WHOP_PRODUCT_ID) {
        whopPayload.plan.product_id = process.env.WHOP_PRODUCT_ID;
      } else if (process.env.WHOP_ACCESS_PASS_ID) {
        whopPayload.plan.access_pass_id = process.env.WHOP_ACCESS_PASS_ID;
      }
    }
  }

  if (whopPayload.plan_id && !whopPayload.plan) {
    // plan_id-only mode
  }

  let data;
  try {
    const response = await axios.post(
      `${WHOP_API_BASE}/checkout_configurations`,
      whopPayload,
      { headers: whopHeaders() }
    );
    data = response.data;
  } catch (err) {
    const details = whopErrorDetails(err);
    const apiErr = new Error(details.message || 'Whop checkout creation failed');
    apiErr.statusCode = details.status || 502;
    apiErr.source = 'whop';
    throw apiErr;
  }

  return {
    data: {
      id: data.id,
      plan: data.plan,
      environment: data.environment || 'production',
      purchase_url: data.purchase_url,
    },
  };
}

async function getPlan(planId) {
  if (!planId) {
    throw Object.assign(new Error('plan_id required'), { statusCode: 400 });
  }

  const { data } = await axios.get(`${WHOP_API_BASE}/plans/${planId}`, {
    headers: whopHeaders(),
  });

  return { data };
}

async function createDynamicPlan(params) {
  const companyId = process.env.WHOP_COMPANY_ID?.trim();
  const amount = Number(params.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error('Invalid amount'), { statusCode: 400 });
  }

  const planBody = {
    company_id: companyId,
    initial_price: amount,
    plan_type: 'one_time',
    currency: (params.currency || 'usd').toLowerCase(),
    visibility: 'hidden',
    title: params.title || 'Payment',
  };

  if (params.product_id) planBody.product_id = params.product_id;
  else if (params.access_pass_id) planBody.access_pass_id = params.access_pass_id;
  else if (process.env.WHOP_PRODUCT_ID) planBody.product_id = process.env.WHOP_PRODUCT_ID;

  const { data } = await axios.post(`${WHOP_API_BASE}/plans`, planBody, {
    headers: whopHeaders(),
  });

  return { data };
}

function isWhopyGatewayRequest(body) {
  return Boolean(body && typeof body.action === 'string');
}

module.exports = {
  handleWhopyGateway,
  isWhopyGatewayRequest,
};
