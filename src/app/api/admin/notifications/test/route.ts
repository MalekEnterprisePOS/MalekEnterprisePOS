import { NextResponse } from "next/server";
import { adminDb, rateLimit, requireAdmin, route } from "@/lib/firebase/admin";
import { SITE_URL } from "@/lib/constants";
import { MAIL_COLLECTION, sendEmail } from "@/lib/notifications/email";
import { renderEmail } from "@/lib/notifications/templates";
import { mapSettings, type Data } from "@/lib/mappers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Admin: sends a real, branded test email to the admin's own address through Firebase, then waits for the Trigger Email extension's verdict. */
export const POST = route(async (req) => {
  rateLimit(req, "admin-test-email", 5);
  const admin = await requireAdmin(req);
  if (!admin.email) return NextResponse.json({ ok: false, error: "Your admin account has no email address." });
  const db = adminDb();
  const settings = mapSettings((await db.collection("settings").doc("app").get()).data() as Data | null);
  const { html, text } = renderEmail({
    title: "Test email: automatic emails are working",
    message: "This is a test from your Malek Enterprise POS admin panel.\n\nIf you can read this, payment reminders, receipts and licence expiry emails will reach your customers the same way.",
    ctaLabel: "Open my account page", ctaUrl: `${SITE_URL}/account`,
  }, { productName: settings.general.productName, supportEmail: settings.general.supportEmail });
  const res = await sendEmail(db, { to: admin.email, subject: "Test email from Malek Enterprise POS", text, html, replyTo: settings.general.supportEmail || undefined });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error });

  for (let i = 0; i < 12; i++) {
    await sleep(2000);
    const delivery = ((await db.collection(MAIL_COLLECTION).doc(res.mailId).get()).data()?.delivery ?? {}) as { state?: string; error?: unknown };
    if (delivery.state === "SUCCESS") return NextResponse.json({ ok: true, sentTo: admin.email });
    if (delivery.state === "ERROR") return NextResponse.json({ ok: false, error: `The email service refused it: ${String(delivery.error ?? "unknown error").slice(0, 300)}` });
  }
  return NextResponse.json({ ok: false, error: "Firebase has the email, but the Trigger Email extension hasn't reported back after 24 seconds. Check that the extension is installed (collection: mail) and look at its function logs." });
});
