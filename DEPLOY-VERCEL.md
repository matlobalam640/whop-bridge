# Deploy Whop Bridge on Vercel (step by step)

## Before you start

- A [Vercel account](https://vercel.com/signup) (free is fine)
- [Git](https://git-scm.com/download/win) installed
- Your project folder: `D:\AbdulShopify\whop-bridge`

---

## Step 1 — Push code to GitHub

Vercel deploys from Git. If you do not have a repo yet:

1. Create a new repository on [github.com/new](https://github.com/new) (e.g. `whop-bridge`). Do **not** add a README if the folder already has files.

2. In PowerShell:

```powershell
cd D:\AbdulShopify\whop-bridge
git init
git add .
git commit -m "Whop WooCommerce bridge"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/whop-bridge.git
git push -u origin main
```

Replace `YOUR_USERNAME` and repo name with yours.

> `.env` is gitignored — secrets stay on your machine and are added in Vercel only.

---

## Step 2 — Import project in Vercel

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **Add New…** → **Project**
3. **Import** your GitHub repository `whop-bridge`
4. Vercel should detect settings automatically:
   - **Framework Preset:** Other
   - **Root Directory:** `./` (leave as project root)
   - **Build Command:** leave empty
   - **Output Directory:** leave empty
5. Do **not** click Deploy yet — add environment variables first (Step 3).

---

## Step 3 — Add environment variables

On the import screen (or **Settings → Environment Variables**), add every variable from your `.env`:

| Name | Example / notes |
|------|-----------------|
| `WHOP_API_KEY` | Your Whop API key |
| `WHOP_WEBHOOK_SECRET` | From Whop Developer → Webhooks |
| `WHOP_COMPANY_ID` | `biz_...` |
| `WOOCOMMERCE_URL` | `https://gioaccessories.com` |
| `WC_KEY` | WooCommerce consumer key |
| `WC_SECRET` | WooCommerce consumer secret |
| `WC_ORDER_RECEIVED_URL` | `https://gioaccessories.com/checkout/order-received/` |
| `WHOP_ALLOW_FAKE_ORDER_ID` | `false` for production (or `true` for testing) |
| `BRIDGE_BASE_URL` | Leave empty for first deploy; set after Step 5 |

Apply to **Production**, **Preview**, and **Development**.

Then click **Deploy**.

Wait until the build shows **Ready** (usually 1–2 minutes).

---

## Step 4 — Copy your live URL

After deploy, Vercel gives you a URL like:

```
https://whop-bridge-xxxxx.vercel.app
```

Open it in the browser — you should see JSON with `service`, `bridge_url`, and `webhook_url`.

Test health:

```
https://whop-bridge-xxxxx.vercel.app/health
```

---

## Step 5 — Set `BRIDGE_BASE_URL` and redeploy

1. Vercel → your project → **Settings** → **Environment Variables**
2. Add or edit:
   - **Name:** `BRIDGE_BASE_URL`
   - **Value:** `https://whop-bridge-xxxxx.vercel.app` (your real URL, no trailing slash)
3. **Deployments** → latest deployment → **⋯** → **Redeploy**

Your public URLs:

| Use | URL |
|-----|-----|
| **Bridge URL** (WooCommerce plugin) | `https://YOUR-APP.vercel.app/create-payment` |
| **Whop webhook** | `https://YOUR-APP.vercel.app/webhook` |

---

## Step 6 — Configure Whop

1. [Whop Dashboard](https://whop.com/dashboard/developer) → **Webhooks**
2. **Webhook URL:** `https://YOUR-APP.vercel.app/webhook`
3. Event: **`payment.succeeded`** (API v1)
4. Save the webhook secret (must match `WHOP_WEBHOOK_SECRET` in Vercel)

---

## Step 7 — Configure WooCommerce

1. In your Whop payment plugin settings, set **Bridge URL** to:
   ```
   https://YOUR-APP.vercel.app/create-payment
   ```
2. Ensure WooCommerce REST API keys match `WC_KEY` / `WC_SECRET` in Vercel.

---

## Deploy updates later

After you change code:

```powershell
cd D:\AbdulShopify\whop-bridge
git add .
git commit -m "Describe your change"
git push
```

Vercel redeploys automatically on every push to `main`.

---

## Option B — Deploy without GitHub (CLI)

1. Install Vercel CLI:

```powershell
npm install -g vercel
```

2. From the project folder:

```powershell
cd D:\AbdulShopify\whop-bridge
vercel login
vercel
```

Follow prompts (link to your Vercel account, confirm project).

3. Add env vars (first time):

```powershell
vercel env add WHOP_API_KEY
vercel env add WHOP_WEBHOOK_SECRET
vercel env add WHOP_COMPANY_ID
vercel env add WOOCOMMERCE_URL
vercel env add WC_KEY
vercel env add WC_SECRET
vercel env add WC_ORDER_RECEIVED_URL
vercel env add BRIDGE_BASE_URL
```

4. Production deploy:

```powershell
vercel --prod
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| 404 on `/create-payment` | Confirm `vercel.json` and `api/index.js` exist; redeploy |
| Webhook signature fails | `WHOP_WEBHOOK_SECRET` in Vercel must match Whop dashboard exactly |
| Whop 403 / not authorized | Add checkout permissions on the API key in Whop |
| Works locally, fails on Vercel | Check **Deployments → Functions** logs in Vercel dashboard |

---

## Custom domain (optional)

1. Vercel → **Settings** → **Domains**
2. Add e.g. `pay.gioaccessories.com`
3. Add the DNS records Vercel shows at your domain host
4. Update `BRIDGE_BASE_URL` to `https://pay.gioaccessories.com` and redeploy
