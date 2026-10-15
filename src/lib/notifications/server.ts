import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { mapSettings, type Data } from "@/lib/mappers";
import { MAIL_COLLECTION, sendEmail } from "./email";
import { renderEmail } from "./templates";

export const MAX_EMAIL_ATTEMPTS = 3;

export interface QueuedMessage {
  type: string; customerId: string | null; recipient: string; title: string; message: string;
  channel?: "email" | "in_app"; ctaLabel?: string; ctaUrl?: string;
}

/** Idempotent: a deterministic id means the daily job can't queue the same reminder twice. */
export async function queueOnce(db: Firestore, id: string, data: QueuedMessage): Promise<boolean> {
  try {
    await db.collection("notifications").doc(id).create({
      channel: "email", ...data, status: "queued", attempts: 0, scheduledFor: null, sentAt: null, error: "",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (e) {
    if ((e as { code?: number }).code === 6) return false; // ALREADY_EXISTS
    throw e;
  }
}

const loadSettings = async (db: Firestore) => mapSettings((await db.collection("settings").doc("app").get()).data() as Data | null);

/** Sends one queued email notification (branded HTML + plain text) and records the outcome on the document. */
export async function deliverNotification(db: Firestore, id: string): Promise<{ status: "sent" | "failed"; error?: string }> {
  const ref = db.collection("notifications").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Notification not found.");
  const n = snap.data() ?? {};
  if (n.channel !== "email") return { status: "failed", error: "Only email notifications can be sent from here." };
  if (n.status === "sent") return { status: "sent" };
  if (!n.recipient) {
    await ref.update({ status: "failed", error: "No recipient email address.", updatedAt: FieldValue.serverTimestamp() });
    return { status: "failed", error: "No recipient email address." };
  }
  const settings = await loadSettings(db);
  const brand = { productName: settings.general.productName, supportEmail: settings.general.supportEmail };
  const { html, text } = renderEmail({ title: String(n.title), message: String(n.message), ctaLabel: n.ctaLabel as string | undefined, ctaUrl: n.ctaUrl as string | undefined }, brand);
  const res = await sendEmail(db, { to: String(n.recipient), subject: String(n.title), text, html, replyTo: settings.general.supportEmail || undefined, idempotencyKey: `notif-${id}` });
  const attempts = Number(n.attempts ?? 0) + 1;
  if (res.ok) {
    // "sent" = handed to Firebase. reconcileDelivery() later confirms the extension really delivered it (or flips this to failed).
    await ref.update({ status: "sent", attempts, mailId: res.mailId, mailState: "HANDED_OFF", sentAt: FieldValue.serverTimestamp(), error: "", updatedAt: FieldValue.serverTimestamp() });
    return { status: "sent" };
  }
  await ref.update({ status: "failed", attempts, error: res.error, updatedAt: FieldValue.serverTimestamp() });
  return { status: "failed", error: res.error };
}

/** Sends a queued notification straight away when email is switched on. Never throws: a failure just leaves it queued/failed for the daily retry. */
export async function sendNow(db: Firestore, id: string): Promise<void> {
  try {
    if (!(await loadSettings(db)).notifications.emailEnabled) return;
    await deliverNotification(db, id);
  } catch (e) {
    console.error("[notifications] immediate send failed", id, e);
  }
}

/** Queue once, and if that created it, email it right away (payment receipts should not wait for the daily job). */
export async function queueAndSend(db: Firestore, id: string, data: QueuedMessage): Promise<boolean> {
  const created = await queueOnce(db, id, data);
  if (created && (data.channel ?? "email") === "email") await sendNow(db, id);
  return created;
}

/** A mail document the extension hasn't touched after this long means the extension isn't installed or isn't running. */
export const MAIL_PICKUP_TIMEOUT_MS = 30 * 60_000;

/**
 * Checks what the Trigger Email extension did with emails we handed over, and records it on the notification:
 * SUCCESS -> confirmed; ERROR -> marked failed (the daily job then retries it, up to MAX_EMAIL_ATTEMPTS times);
 * untouched for 30 minutes -> marked failed with a hint to check the extension. Returns how many changed.
 */
export async function reconcileDelivery(db: Firestore, nowMs: number = Date.now()): Promise<{ confirmed: number; failed: number }> {
  const out = { confirmed: 0, failed: 0 };
  const open = await db.collection("notifications").where("status", "==", "sent").where("mailState", "==", "HANDED_OFF").limit(50).get();
  for (const d of open.docs) {
    const mailId = String(d.data().mailId ?? "");
    if (!mailId) continue;
    const mail = await db.collection(MAIL_COLLECTION).doc(mailId).get();
    if (!mail.exists) continue;
    const delivery = (mail.data()?.delivery ?? {}) as { state?: string; error?: unknown };
    if (delivery.state === "SUCCESS") {
      await d.ref.update({ mailState: "SUCCESS", updatedAt: FieldValue.serverTimestamp() });
      out.confirmed++;
    } else if (delivery.state === "ERROR") {
      await d.ref.update({ status: "failed", mailState: "ERROR", error: `Email service refused it: ${String(delivery.error ?? "unknown error").slice(0, 300)}`, updatedAt: FieldValue.serverTimestamp() });
      out.failed++;
    } else if (!delivery.state && mail.createTime && nowMs - mail.createTime.toMillis() > MAIL_PICKUP_TIMEOUT_MS) {
      await d.ref.update({ status: "failed", mailState: "NOT_PICKED_UP", error: "Firebase has the email but nothing sent it. Install the Trigger Email extension (collection: mail) and check its SMTP settings.", updatedAt: FieldValue.serverTimestamp() });
      out.failed++;
    }
  }
  return out;
}
