# Whop API key setup (Company API key)

Your bridge uses a **Company API key** (`apik_...`), not a Whop App.

The permissions `access_pass:create` and `access_pass:update` appear in **App → Permissions** (for developers building Whop apps). **You do not need those for this bridge.**

---

## Fix "You are not authorized" (403 / 401)

Your key can **read** (list payments) but cannot **create** checkout sessions. You need a new key with **create** permissions enabled.

### Step 1 — Create a new Company API key

1. [Whop Dashboard → Developer](https://whop.com/dashboard/developer)
2. Section **Company API keys** (top of page — not "Apps")
3. **Create** (top right)
4. Name: `WooCommerce Bridge`
5. In the permissions popup, enable **every toggle** related to:
   - Checkout / checkout configurations
   - Plans
   - Payments
   - Products (if shown)
6. **Create** and copy the key (`apik_...`)

### Step 2 — Update Vercel

| Variable | Value |
|----------|--------|
| `WHOP_API_KEY` | new `apik_...` key |
| `WHOP_COMPANY_ID` | `biz_4tGYGjNFbckZwR` |

Redeploy.

### Step 3 — Test

```
https://YOUR-APP.vercel.app/health/whop
```

Must return `"ok": true`.

---

## Workaround: use an existing plan (no dynamic pricing)

If your store always charges the **same price**, or you create plans manually in Whop:

1. Whop Dashboard → **Checkout links** → create a link / plan
2. Copy **plan ID** (`plan_...`) from the ⋮ menu → Details
3. In Vercel add:

```
WHOP_PLAN_ID=plan_xxxxxxxxxxxxx
```

4. Redeploy

**Note:** Cart totals from WooCommerce may not match a fixed Whop plan price. Best for single-price products.

---

## Two types of Whop credentials

| Type | Where | Use for this bridge |
|------|--------|---------------------|
| **Company API key** | Developer → Company API keys | Yes — set `WHOP_API_KEY` |
| **App + Permissions** | Developer → Apps → Permissions | No — only if building a Whop marketplace app |

---

## Required API capability

The bridge calls:

`POST https://api.whop.com/api/v1/checkout_configurations`

Your key must be allowed to **create** checkout configurations (not just list them).
