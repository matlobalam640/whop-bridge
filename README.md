# Whop → WooCommerce Payment Bridge

Node.js bridge that connects WooCommerce checkout to Whop payments, as described in the Whop WooCommerce Bridge Setup Guide.

## Flow

```
WooCommerce Checkout → Bridge /create-payment → Whop Checkout
       ↑                                              ↓
       └──── Whop webhook /webhook marks order paid ──┘
```

## Quick start

```bash
cd whop-bridge
npm install
cp .env.example .env
# Edit .env with your keys
npm start
```

## URLs you configure

| Purpose | URL |
|--------|-----|
| **Bridge URL** (WooCommerce plugin) | `https://pay.yourdomain.com/create-payment` |
| **Webhook URL** (Whop Dashboard → Developer → Webhooks) | `https://pay.yourdomain.com/webhook` |

Set `BRIDGE_BASE_URL=https://pay.yourdomain.com` in `.env` (no trailing slash).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WHOP_API_KEY` | Yes | Whop API key |
| `WHOP_COMPANY_ID` | Yes | Company ID (`biz_...`) |
| `WHOP_WEBHOOK_SECRET` | Yes (prod) | Webhook signing secret from Whop |
| `WOOCOMMERCE_URL` | Yes | Store URL, e.g. `https://yourstore.com` |
| `WC_KEY` / `WC_SECRET` | Yes | WooCommerce REST API keys (Read/Write) |
| `BRIDGE_BASE_URL` | After deploy | Public URL of this server |
| `WHOP_PLAN_ID` | No | Reuse a fixed Whop plan instead of per-order plans |
| `WC_ORDER_RECEIVED_URL` | No | Thank-you page after payment |
| `SKIP_WEBHOOK_VERIFY` | No | `true` only for local testing |

## Whop dashboard setup

1. **API key** — Developer → create API key with checkout + payment permissions.
2. **Webhook** — URL: `https://pay.yourdomain.com/webhook`, events: `payment.succeeded` (API v1).
3. Copy **webhook secret** into `WHOP_WEBHOOK_SECRET`.

## WooCommerce setup

1. **REST API** — WooCommerce → Settings → Advanced → REST API → Add key (Read/Write).
2. **Payment plugin** — Set Bridge URL to your deployed `/create-payment` endpoint.

## Test create-payment locally

```bash
curl -X POST http://localhost:3000/create-payment \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": 123, \"amount\": 29.99, \"customer_email\": \"test@example.com\"}"
```

Response:

```json
{
  "success": true,
  "checkout_url": "https://whop.com/checkout/...",
  "session_id": "ch_..."
}
```

Redirect the customer to `checkout_url` to pay.

## Deploy

Host on Render, Railway, Hostinger VPS, or any Node host with HTTPS. Examples:

- Render: set start command `npm start`, add env vars from `.env`.
- VPS: use `pm2 start server.js --name whop-bridge`.

Use **ngrok** for local webhook testing:

```bash
ngrok http 3000
# Set BRIDGE_BASE_URL to the ngrok HTTPS URL
```

## Security

- Always use HTTPS in production.
- Keep `.env` out of git.
- Webhook signatures are verified automatically (Standard Webhooks).
- Order totals are validated against WooCommerce before creating checkout.
