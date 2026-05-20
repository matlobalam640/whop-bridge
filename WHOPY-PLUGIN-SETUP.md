# Whopy plugin + Vercel bridge (correct setup)

No `functions.php` override. No session-fix plugin needed.

## Bridge URL in Whopy settings

Use your **Vercel root URL only**:

```
https://project-k9230.vercel.app
```

**Do not** add `/create-payment` — the Whopy plugin uses its own gateway protocol on the root URL.

| Wrong | Right |
|-------|--------|
| `https://project-k9230.vercel.app/create-payment` | `https://project-k9230.vercel.app` |

## How Whopy talks to the bridge

WordPress → `POST https://your-app.vercel.app` with:

```json
{
  "action": "create_checkout_configuration",
  "params": {
    "payload": {
      "mode": "payment",
      "plan": {
        "currency": "usd",
        "plan_type": "one_time",
        "initial_price": 1045.99,
        "title": "Payment"
      },
      "redirect_url": "https://gioaccessories.com/checkout/",
      "source_url": "https://gioaccessories.com/checkout/"
    }
  }
}
```

Bridge returns:

```json
{
  "data": {
    "id": "ch_xxxxxxxx",
    "plan": { "id": "plan_xxxxxxxx" },
    "environment": "production"
  }
}
```

Whopy JS embeds with **both** `plan_id` and `sessionId` — that is built into the plugin.

## Checkout flow (one-page)

1. Customer opens checkout, selects **Credit / Debit Card**
2. Whopy AJAX `whopy_create_plan` → your Vercel bridge (root URL)
3. Embed loads with plan + session
4. Customer pays → **Place order** creates WooCommerce order
5. Order marked paid via `whop_plan_id` + `whop_receipt_id` hidden fields

No WooCommerce order exists at step 2 — that is normal.

## Vercel environment variables

| Variable | Required |
|----------|----------|
| `WHOP_API_KEY` | Yes |
| `WHOP_COMPANY_ID` | Yes |
| `WHOP_WEBHOOK_SECRET` | Optional (plugin can use WP webhook) |
| `WHOP_PRODUCT_ID` or `WHOP_ACCESS_PASS_ID` | If cart products have no Whop product meta |

`WHOP_ALLOW_FAKE_ORDER_ID` is **not** used by native Whopy flow.

## Webhook (optional)

Whopy can handle webhooks on WordPress:

`https://gioaccessories.com/wc-api/whop_webhook`

Or use bridge:

`https://project-k9230.vercel.app/webhook`

## Remove extras

- Remove `functions.php` `gio_override_whopy_create_plan` (conflicts with plugin)
- Deactivate **Whop Bridge Embed Session Fix** plugin (not needed)

## Test

1. Deploy Vercel after latest git push
2. Set Whopy Bridge URL to root URL only
3. Network filter: `whopy_create_plan` → should succeed with `plan_id` + `sessionId`
4. Embed should show card form (not 404 planets)
