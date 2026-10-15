/**
 * Email through Firebase. Nothing here talks to a third-party API: it writes a document to the `mail` collection in
 * Firestore, and the official Firebase "Trigger Email from Firestore" extension (firestore-send-email) sends it and
 * writes the outcome back to the same document (`delivery.state`: PENDING, PROCESSING, SUCCESS, ERROR, RETRY).
 * Sign-in emails (verify address, password reset) are sent by Firebase Authentication itself.
 */
import type { Firestore } from "firebase-admin/firestore";

export const MAIL_COLLECTION = "mail";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Becomes the mail document's id, so asking twice for the same email can never send it twice. */
  idempotencyKey?: string;
}

export type SendResult = { ok: true; mailId: string } | { ok: false; error: string };

/** Firestore document ids can't contain "/" and shouldn't be huge. */
const safeId = (s: string) => s.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 200);

/** Hands one email to Firebase. "ok" means Firebase has it; the extension then delivers it (see reconcileDelivery). */
export async function sendEmail(db: Firestore, input: OutgoingEmail): Promise<SendResult> {
  const ref = input.idempotencyKey ? db.collection(MAIL_COLLECTION).doc(safeId(input.idempotencyKey)) : db.collection(MAIL_COLLECTION).doc();
  const from = process.env.EMAIL_FROM?.trim();
  try {
    await ref.create({
      to: [input.to],
      ...(from ? { from } : {}), // optional: otherwise the extension's own default sender is used
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      message: { subject: input.subject, text: input.text, ...(input.html ? { html: input.html } : {}) },
    });
    return { ok: true, mailId: ref.id };
  } catch (e) {
    if ((e as { code?: number }).code === 6) {
      // ALREADY_EXISTS: this email was handed over before. If the extension reported an error, ask it to try again.
      try {
        const state = ((await ref.get()).data()?.delivery as { state?: string } | undefined)?.state;
        if (state === "ERROR") await ref.update({ "delivery.state": "RETRY" });
      } catch { /* the next daily run tries again */ }
      return { ok: true, mailId: ref.id };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't write the email to Firebase." };
  }
}
