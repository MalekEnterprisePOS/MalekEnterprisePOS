import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { SITE_URL } from "@/lib/constants";
import { mapSettings, type Data } from "@/lib/mappers";
import { queueAndSend } from "@/lib/notifications/server";

export type AlertKind = "overLimit" | "identity" | "macChanged" | "clock";

/**
 * Emails the admin about something unusual on a licence, at most once per `everyHours` for each kind, per licence, so a PC that
 * checks in every 15 minutes can't flood the inbox. The claim is made in a transaction so two simultaneous checks send one email.
 * Never throws: an alert must never stop a licence check from answering.
 */
export async function alertAdminOnce(db: Firestore, licenseRef: DocumentReference, kind: AlertKind, o: { customerId: string; title: string; message: string }, everyHours = 24): Promise<boolean> {
  try {
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(licenseRef);
      const last = (snap.data()?.alertAt as Record<string, { toMillis?: () => number } | undefined> | undefined)?.[kind];
      const lastMs = typeof last?.toMillis === "function" ? last.toMillis() : 0;
      if (Date.now() - lastMs < everyHours * 3_600_000) return false;
      tx.update(licenseRef, { [`alertAt.${kind}`]: FieldValue.serverTimestamp() });
      return true;
    });
    if (!claimed) return false;
    const settings = mapSettings((await db.collection("settings").doc("app").get()).data() as Data | null);
    const to = settings.general.supportEmail || settings.general.salesEmail;
    if (!to) return true; // nowhere to send it: the admin still sees the warning in Admin > Licences
    await queueAndSend(db, `licalert_${licenseRef.id}_${kind}_${Date.now()}`, {
      type: "general", customerId: o.customerId, recipient: to, title: o.title, message: o.message, ctaLabel: "Open Licences", ctaUrl: `${SITE_URL}/admin/licenses`,
    });
    return true;
  } catch (e) {
    console.error("[licensing] couldn't send the admin alert:", e);
    return false;
  }
}

/** A security notice to the customer themselves (device removed, key regenerated). Never throws. */
export async function notifyCustomer(db: Firestore, customerId: string, key: string, o: { title: string; message: string }): Promise<void> {
  try {
    const email = String((await db.collection("customers").doc(customerId).get()).data()?.email ?? "").trim();
    if (!email) return;
    await queueAndSend(db, `secnote_${customerId}_${key}_${Date.now()}`, { type: "general", customerId, recipient: email, title: o.title, message: o.message, ctaLabel: "Open My account", ctaUrl: `${SITE_URL}/account` });
  } catch (e) {
    console.error("[licensing] couldn't send the customer notice:", e);
  }
}
