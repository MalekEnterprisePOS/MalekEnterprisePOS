# Firebase App Hosting: fix guide (v2)

## What failed, in order

| # | Error | Cause | Fixed by |
|---|-------|-------|----------|
| 1 | `Can't resolve '@/components/...'` | Firebase's build skipped devDependencies (incl. `typescript`), so the `@/` shortcut stopped working | `next.config.mjs` alias + build tools moved to `dependencies` (already in the zip) |
| 2 | `Misconfigured secret ... license-key-encryption-secret` | My first `apphosting.yaml` referenced secrets you never created | New `apphosting.yaml`: no secret references |

Error 2 happens before the build even starts, so the build itself has not run again yet with fix 1.

## Step 1: deploy the new files

Replace your project files with the zip, then:

```cmd
git add .
git commit -m "Fix App Hosting config"
git push origin main
```

## Step 2: fix these values in Firebase Console

Firebase Console > App Hosting > your backend > Settings > Environment.

**Fix these 4:**

| Variable | What to set |
|----------|-------------|
| `FIREBASE_ADMIN_PRIVATE_KEY` | Paste the `private_key` from a NEW service-account JSON. **No surrounding quotes** (yours currently has literal `"` at both ends, which breaks the key). Keep the `\n` sequences. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Copy the exact `appId` from Project settings > Your apps. Yours (`1:387161747:web:c7a5e6763b2`) is cut off. |
| `CRON_SECRET` | Generate a NEW one (see below). The old one is exposed. |
| `LICENSE_SIGNING_PRIVATE_KEY` | Must be a PEM key, not a hex string. Run `npm run signing-key` and paste the value between the quotes. |

New random value for `CRON_SECRET`:

```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Delete these (not used by the code, or now set by `apphosting.yaml`):**
`FIREBASE_ADMIN_SDK_KEY`, `FIRESTORE_DATABASE_ID`, `NODE_ENV`, `NEXT_PUBLIC_FIREBASE_DOMAIN`, `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_API_TIMEOUT`, `NEXT_PUBLIC_LICENSE_VERIFICATION_ENABLED`, `NEXT_PUBLIC_MAX_CONCURRENT_TERMINALS`,
`NEXT_PUBLIC_LICENSE_CHECK_INTERVAL`, `NEXT_PUBLIC_ENABLE_ANALYTICS`, `NEXT_PUBLIC_LOG_LEVEL`,
`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`.

**Optional, add later if you need the feature:** `LICENSE_KEY_ENCRYPTION_SECRET` (customers can view their own key),
`RESEND_API_KEY` + `EMAIL_FROM` (emails), `GITHUB_TOKEN` (release links), `PAYMENT_PROVIDER`, `ALLOW_TEST_PAYMENTS`.

## Step 3: rollout

Firebase Console > App Hosting > your backend > **Create rollout** (or push to `main` again).

## Security: your keys are exposed

The build log printed every environment value in plain text, and you pasted the same values in chat. So:

1. Firebase Console > Project settings > Service accounts > **Generate new private key**, use it in Step 2.
2. Google Cloud Console > IAM > Service accounts > Keys: **delete the old keys** (ids starting `b967160f` and `1e78e06e`).
3. Do not reuse the old `CRON_SECRET`.

Later, to keep secrets out of build logs, move private values to Secret Manager
(`firebase apphosting:secrets:set <name>`) and reference them with `secret:` in `apphosting.yaml`.
Create each secret BEFORE referencing it, otherwise you get error 2 again.

## Billing cron

`vercel.json` schedules `/api/cron/billing` daily. That only runs on Vercel. On Firebase, create a Cloud Scheduler
job that calls the URL with header `Authorization: Bearer <CRON_SECRET>`.
