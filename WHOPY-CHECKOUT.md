# Whopy plugin + one-page checkout

## What you see ("page does not exist")

The Whopy plugin embeds Whop checkout with **only `plan_id`**.

When the bridge creates a **dynamic** checkout (cart total $1,045.99), Whop also returns a **`session_id`** (`ch_...`).

**Without `session_id` in the embed → Whop shows "Nothing to see here yet / page does not exist".**

This is not a broken bridge URL. The embed is missing the session.

---

## Correct embed (required)

From bridge `/create-payment` response:

```json
{
  "plan_id": "plan_wdiGXj9IP0JnI",
  "session_id": "ch_u91z61NRbmttU6E",
  "checkout_url": "https://whop.com/checkout/plan_wdiGXj9IP0JnI/?session=ch_u91z61NRbmttU6E"
}
```

HTML embed must include **both**:

```html
<div
  data-whop-checkout-plan-id="plan_wdiGXj9IP0JnI"
  data-whop-checkout-session="ch_u91z61NRbmttU6E"
  data-whop-checkout-return-url="https://gioaccessories.com/checkout/order-received/"
></div>
<script async defer src="https://js.whop.com/static/checkout/loader.js"></script>
```

---

## Your checkout flow (one-page)

```
1. Customer on checkout page (billing + order summary)
2. Clicks "Checkout" / payment section opens
3. Whopy AJAX → your bridge /create-payment (cart total + email)
4. Bridge returns plan_id + session_id
5. Whopy must embed iframe WITH session_id  ← often missing = 404 UI
6. Customer pays → Whop webhook → WooCommerce order updated
```

### `WHOP_ALLOW_FAKE_ORDER_ID`

| Value | When |
|-------|------|
| `true` | Step 3 runs **before** "Place order" (no WC order yet). Uses temp `order_id` in metadata. |
| `false` | Step 3 runs **after** WC creates order (real `order_id`). Production ideal. |

For one-page checkout with Whopy, **`true`** is normal until the plugin creates a real order on place order.

---

## WordPress fix (if Whopy omits session)

Add to theme `functions.php` or a small plugin:

See `wordpress/whop-embed-session-fix.php` in this repo.

---

## "Make Payment" button

If embed is fixed, customer pays inside the iframe.  
If embed fails, use **redirect** to full `checkout_url` from the bridge response instead of iframe.
