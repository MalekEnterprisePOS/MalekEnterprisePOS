import { NextResponse } from "next/server";
import { adminDb, requireAdmin, route } from "@/lib/firebase/admin";
import { SITE_URL } from "@/lib/constants";
import { onlinePaymentsEnabled } from "@/lib/billing/yoco";
import { signingKeyInfo } from "@/lib/licensing/lease";
import { mapSettings, type Data } from "@/lib/mappers";
import { MAIL_COLLECTION } from "@/lib/notifications/email";
import { downloadSecret } from "@/lib/releases/ticket";
import { daysBetween, todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** Reports which integrations are configured (never their values) so the admin knows what still needs setting up. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const db = adminDb();
  const settings = mapSettings((await db.collection("settings").doc("app").get()).data() as Data | null);
  const last = (await db.collection("settings").doc("lastBillingRun").get()).data() as { date?: string; summary?: { invoicesCreated?: number; remindersQueued?: number; emailsSent?: number } } | undefined;
  const signing = signingKeyInfo();
  const provider = (process.env.PAYMENT_PROVIDER ?? "").toLowerCase();
  const yocoKey = process.env.YOCO_SECRET_KEY ?? "";
  const daysSince = last?.date ? daysBetween(last.date, todayISO()) : null;
  const cronOk = Boolean(process.env.CRON_SECRET) && daysSince !== null && daysSince <= 2;

  const cronDetail = !process.env.CRON_SECRET ? "Set CRON_SECRET (App Hosting > Environment) so the daily job (invoices, reminders, licence expiry emails, suspensions) can run."
    : daysSince === null ? "CRON_SECRET is set but the job has never run. Create the Google Cloud Scheduler job that calls /api/cron/billing once a day (Cloud Scheduler is part of your Firebase project), then press \"Run now\" on it."
    : daysSince <= 2 ? `Last ran ${last?.date}: ${last?.summary?.invoicesCreated ?? 0} invoice(s) created, ${last?.summary?.remindersQueued ?? 0} reminder(s) queued, ${last?.summary?.emailsSent ?? 0} email(s) handed to Firebase.`
    : `Last ran ${last?.date} (${daysSince} days ago). The scheduler has stopped: check the Cloud Scheduler job and its last run result.`;

  const webhookSecret = process.env.YOCO_WEBHOOK_SECRET ?? "";
  const siteHttps = SITE_URL.startsWith("https://");
  const yocoKeyProblem = !yocoKey ? "YOCO_SECRET_KEY isn't set."
    : yocoKey.startsWith("pk_") ? "YOCO_SECRET_KEY holds the PUBLIC key (pk_...). Use the SECRET key (sk_test_... or sk_live_...)."
    : !/^sk_(test|live)_/.test(yocoKey) ? "YOCO_SECRET_KEY should start with sk_test_ or sk_live_."
    : "";
  const webhookProblem = !webhookSecret ? `Register the webhook once (npm run yoco:webhook -- ${SITE_URL}/api/webhooks/payments <your sk_ key>) and set YOCO_WEBHOOK_SECRET to the printed whsec_ value.`
    : !webhookSecret.startsWith("whsec_") ? "YOCO_WEBHOOK_SECRET should start with whsec_ (use the value the webhook command printed)."
    : "";
  const paymentsOk = provider === "mock" ? Boolean(process.env.PAYMENT_WEBHOOK_SECRET) : provider === "yoco" ? !yocoKeyProblem && !webhookProblem && siteHttps : false;
  const paymentsDetail = provider === "yoco"
    ? yocoKeyProblem || webhookProblem || (!siteHttps ? "NEXT_PUBLIC_SITE_URL must be your https address, because Yoco redirects customers back to it." : `Yoco is connected with ${yocoKey.startsWith("sk_test") ? "TEST" : "LIVE"} keys. Webhook endpoint: ${SITE_URL}/api/webhooks/payments. Paid invoices activate licences automatically.${yocoKey.startsWith("sk_test") ? " Switch to the sk_live_ key and register a new webhook before taking real money." : ""}`)
    : provider === "mock" ? (process.env.PAYMENT_WEBHOOK_SECRET ? "Test mode: the mock gateway accepts signed test events." : "Mock gateway selected but PAYMENT_WEBHOOK_SECRET is missing.")
    : "No gateway connected. Set PAYMENT_PROVIDER=yoco (plus the Yoco keys) for automatic card payments. Until then cash and bank payments are recorded with Mark as paid.";

  // Email goes out through Firebase's Trigger Email extension: we write to the `mail` collection and it reports back on each document.
  const recentMail = (await db.collection(MAIL_COLLECTION).limit(25).get()).docs.map((d) => (d.data().delivery as { state?: string } | undefined)?.state ?? "NONE");
  const delivered = recentMail.includes("SUCCESS");
  const mailErrors = recentMail.filter((x) => x === "ERROR").length;
  const emailOk = settings.notifications.emailEnabled && delivered;
  const emailDetail = !settings.notifications.emailEnabled ? "Settings > Notifications > \"Deliver reminders by email\" is OFF, so emails stay queued and nothing is sent."
    : recentMail.length === 0 ? "Delivery is ON but no email has been sent yet. Press \"Send test email\" on this page to confirm the Firebase Trigger Email extension works."
    : delivered ? `Working: the Trigger Email extension has delivered mail${mailErrors ? ` (${mailErrors} recent email(s) failed, see the Notifications list for the reason)` : ""}. Reminders, receipts and licence expiry emails go out automatically.`
    : recentMail.every((x) => x === "NONE") ? "Emails are waiting in Firebase but nothing is sending them. Install the Trigger Email extension (collection: mail) and set its SMTP connection."
    : "The Trigger Email extension reported errors and no successes yet. Check its SMTP connection URI and sender address, then press \"Send test email\".";

  const checks = [
    { id: "server", label: "Server credentials", ok: true, detail: "Connected. Licence and notification actions can run." },
    { id: "cron", label: "Daily billing job", ok: cronOk, detail: cronDetail },
    { id: "signing", label: "Licence signing key", ok: signing.valid, detail: signing.valid ? `Licence responses are signed so the POS can verify them offline. The POS must contain THIS public key (LicenseConfig.java): ${signing.publicKey}` : signing.problem ?? "Run npm run signing-key and set LICENSE_SIGNING_PRIVATE_KEY. Until then licence responses are unsigned and the POS will refuse them." },
    { id: "downloads", label: "Secure downloads", ok: Boolean(downloadSecret()), detail: downloadSecret() ? `Download links are signed and expire after five minutes. The download page is currently ${settings.downloads.requireLogin ? "SIGN-IN REQUIRED" : "open to everyone"} (change it in Settings > Downloads).${process.env.GITHUB_TOKEN ? " A GitHub token is set, so private repository releases can be used." : ""}` : "Set DOWNLOAD_SIGNING_SECRET (any long random string) so visitors can download. Until then the Download button shows an error." },
    { id: "payments", label: "Payment gateway", ok: paymentsOk, detail: paymentsDetail },
    { id: "email", label: "Email delivery (Firebase)", ok: emailOk, detail: emailDetail },
  ];
  return NextResponse.json({ checks });
});
