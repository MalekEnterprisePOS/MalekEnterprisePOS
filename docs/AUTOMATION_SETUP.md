# Automatic payments, emails and sign-in: setup guide

## What is automatic now

| When | What happens, with no action from you |
|------|----------------------------------------|
| Customer buys a plan | Invoice created, **Pay now** opens Yoco, payment verified by webhook, subscription activated, **licence key issued**, "licence ready" email sent |
| Invoice is due in 3 days / today / overdue / last grace day | Reminder email with a **Pay invoice online** button (signed link, no login needed) |
| Customer pays | Invoice marked PAID, receipt email, suspended licence restored |
| Grace period ends unpaid | Licence suspended, suspension email |
| An email fails to send | Retried on the next daily run (up to 3 tries) |
| You get cash / a bank transfer | Invoice > **Mark as paid** (still works) |
| You want to WhatsApp someone a payment link | Invoice > **Copy payment link** |

Admin > Settings > **Downloads**: switch "Require sign-in to download" ON or OFF. It is enforced on the server.

## One-time setup (do in this order)

### 1. Google sign-in (2 minutes, Firebase Console)
1. Authentication > Sign-in method > **Google** > Enable > Save.
2. Authentication > Settings > **Authorized domains** > add every address the site uses, for example
   `malek-enterprise-pos--malek-enterprise-pos.us-east4.hosted.app`, your Vercel domain, and your own domain later.
   If one is missing, Google sign-in shows "isn't enabled for this website address".

### 2. Emails with Resend
1. resend.com > Domains > Add your domain (for example the one you buy on GoDaddy). Copy the DNS records Resend shows
   into GoDaddy's DNS page, then click Verify.
2. Resend > API Keys > create one.
3. On your host set `RESEND_API_KEY` and `EMAIL_FROM` (for example `Malek Enterprise POS <billing@yourdomain.co.za>`).
4. Admin > Settings > Notifications: tick **Deliver reminders by email** > Save.
5. Admin > Notifications > Delivery setup > **Send test email to me**. Check your inbox and spam.

### 3. Card payments with Yoco
1. Yoco Business Portal > Developer > API keys. Start with the **test** secret key (`sk_test_...`).
2. On your host set `PAYMENT_PROVIDER=yoco` and `YOCO_SECRET_KEY=sk_test_...`. Redeploy.
3. Register the webhook once (Windows CMD, in the project folder):
   `npm run yoco:webhook -- https://YOUR-SITE/api/webhooks/payments sk_test_...`
   It prints a `whsec_...` SECRET. Set it as `YOCO_WEBHOOK_SECRET` on your host. Redeploy.
4. Admin > Dashboard/Settings > System status: **Payment gateway** should be green.
5. Buy a plan as a customer using Yoco's test card (numbers are in Yoco's developer docs). Watch the invoice flip to Paid
   and the licence appear.
6. Going live: repeat steps 1 to 3 with the **live** key (`sk_live_...`). Live and test webhook secrets are different.

### 4. The daily job (reminders, overdue, suspensions)
`vercel.json` only schedules this on Vercel. For Firebase, the included GitHub Action does it:
1. Commit and push the `.github/workflows/billing-cron.yml` file (it is in the zip).
2. GitHub repo > Settings > Secrets and variables > Actions > add **APP_URL** (your live site) and **CRON_SECRET**
   (the same value as on your host).
3. Actions tab > **Daily billing job** > Run workflow. Then check Admin System status > **Daily billing job**: it shows
   when it last ran and what it did.
GitHub pauses scheduled workflows after 60 days without repository activity; re-enable them if that happens.

## Environment variables to add on your host (Firebase Console and/or Vercel)
`PAYMENT_PROVIDER=yoco`, `YOCO_SECRET_KEY`, `YOCO_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`,
`NEXT_PUBLIC_SITE_URL` (your live address, no trailing slash). Optional: `PAY_LINK_SECRET`.
Variables starting `NEXT_PUBLIC_` are baked in at build time, so redeploy after changing them.

## Honest limits
- Yoco, Resend and Google were not contacted while this was built. The code follows their published APIs and is covered
  by automated tests with simulated responses; your first real test payment and test email are the final proof.
- Yoco does not accept payments under R2.00.
- If Yoco cannot match a payment to an invoice, the webhook answers OK (so Yoco stops retrying) and logs a line
  starting `[webhook]` in your host logs. Match it by hand with Mark as paid.
