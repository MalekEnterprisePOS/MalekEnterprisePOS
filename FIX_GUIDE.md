# What was fixed, and the 5 things YOU must do once

## Fixed in the code (already in this zip)
1. **Prices include VAT, exactly as typed.** Type `349.99` in Admin > Pricing and the site shows **R349.99 incl. VAT**
   (cents are no longer rounded to R350) and Yoco charges R349.99. The VAT part (R45.65 on R349.99) is shown inside
   the price. Changed everywhere: pricing page, calculator, checkout, account, invoices, admin, and emails.
2. **Users page.** It now also reads everyone from Firebase Authentication and creates any missing records
   (people who signed up before tracking existed), and one blocked collection no longer blanks the page: you get a
   clear warning instead.
3. **Firebase permissions.** `firestore.rules` already contains the missing rules (`portalUsers`, `adminSeen`,
   `settings/setup`). The rules on your live Firebase are the OLD ones, so they must be published (step 2 below).
4. **Payments.** The code supports live Yoco keys. `apphosting.yaml` now sets `PAYMENT_PROVIDER=yoco` and the site
   address to `https://malekenterprise.co.za`.

## Do these once (code can't do them for you)

### 1. Google sign-in error ("domain not authorized")
Firebase Console > Authentication > Settings > **Authorized domains** > Add domain:
`malekenterprise.co.za` and `www.malekenterprise.co.za`. Takes effect immediately.

### 2. Publish the security rules (fixes Users / permissions)
```
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project malek-enterprise-pos
```
Then sign out of /admin and sign in again.

### 3. Put the LIVE Yoco keys in the Firebase Console (never in the code or GitHub)
Firebase Console > App Hosting > your backend > Settings > Environment, add:
| Name | Value |
|---|---|
| `YOCO_SECRET_KEY` | your **sk_live_...** key (SECRET key, not pk_) |
| `PAYMENT_PROVIDER` | `yoco` |
| `YOCO_WEBHOOK_SECRET` | from step 4 |

The public key (pk_live_) is not needed by this site.
**The test card still showing means the Console still has the old sk_test key. Replace it.**

### 4. Register the live webhook (once)
In a terminal in the website folder (PowerShell):
```
$env:YOCO_SECRET_KEY="sk_live_YOUR_KEY"; npm run yoco:webhook -- https://malekenterprise.co.za/api/webhooks/payments
```
Copy the printed `SECRET` (starts `whsec_`) into `YOCO_WEBHOOK_SECRET` (step 3). Without it, customers pay but
licences are not issued automatically.

### 5. Push the code and redeploy
Push this folder to GitHub with the same commands as before; App Hosting redeploys. Then check
`https://malekenterprise.co.za/api/health` and Admin > Settings for the green "Yoco is connected" status.

## SECURITY: rotate your Yoco keys
The live secret key was pasted into a chat. Anyone who saw it can take payments or read transactions.
In the Yoco portal > Developer > API keys, **regenerate** the secret key and use the NEW one in step 3.
