#!/usr/bin/env node
/**
 * Registers this site's payment webhook with Yoco and prints the signing secret (whsec_...).
 * Run it ONCE per Yoco environment (test keys and live keys are separate):
 *
 *   Windows CMD:   set YOCO_SECRET_KEY=sk_test_xxx && npm run yoco:webhook -- https://YOUR-SITE/api/webhooks/payments
 *   or pass the key: npm run yoco:webhook -- https://YOUR-SITE/api/webhooks/payments sk_test_xxx
 *
 * Then set the printed secret as YOCO_WEBHOOK_SECRET on your host (Firebase App Hosting / Vercel).
 */
const [url, keyArg] = process.argv.slice(2);
const secretKey = keyArg || process.env.YOCO_SECRET_KEY;

if (!url || !/^https:\/\/.+\/api\/webhooks\/payments\/?$/.test(url) || !secretKey) {
  console.error("Usage: npm run yoco:webhook -- https://YOUR-SITE/api/webhooks/payments [sk_test_or_live_key]\n(or set YOCO_SECRET_KEY first). The URL must be https and end in /api/webhooks/payments.");
  process.exit(1);
}

const res = await fetch("https://payments.yoco.com/api/webhooks", {
  method: "POST",
  headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Malek Enterprise POS payments", url }),
});
const text = await res.text();
let json; try { json = JSON.parse(text); } catch { json = null; }

if (!res.ok) {
  console.error(`Yoco said ${res.status}: ${text.slice(0, 400)}`);
  if (res.status === 401 || res.status === 403) console.error("That looks like a wrong or missing secret key (it should start with sk_test_ or sk_live_).");
  process.exit(1);
}
console.log(`\nWebhook registered (${json?.mode ?? "unknown"} mode).\nID:     ${json?.id ?? "?"}\nURL:    ${json?.url ?? url}\nSECRET: ${json?.secret ?? "(not returned: see the Yoco dashboard)"}\n`);
console.log("Next: set YOCO_WEBHOOK_SECRET to the SECRET above on your host, then redeploy. Keep it private.");
