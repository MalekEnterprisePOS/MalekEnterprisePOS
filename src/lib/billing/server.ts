import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { AppSettings, Customer, Subscription } from "@/types";
import { mapCustomer, mapInvoice, mapLicense, mapSettings, mapSubscription, type Data } from "@/lib/mappers";
import { daysBetween, todayISO } from "@/lib/dates";
import { serverAuditEntry } from "@/lib/firebase/serverAudit";
import { renewedExpiry } from "@/lib/licensing/rules";
import { deliverNotification, MAX_EMAIL_ATTEMPTS, queueOnce, reconcileDelivery, type QueuedMessage } from "@/lib/notifications/server";
import type { BillingSummary } from "./server-types";
import { calcTotals, invoiceNumber } from "./invoiceRules";
import { advanceBillingDate, deriveSubscriptionStatus, licenceExpiryStage, MONTHS_PER_CYCLE, reminderStage, shouldMarkOverdue } from "./lifecycle";
import { SITE_URL } from "@/lib/constants";
import * as msg from "./messages";
import { payLinkUrl } from "./paylink";
import { onlinePaymentsEnabled } from "./yoco";

/** Re-derives a subscription's status from its invoices and saves it when it changed. Returns the new status if so. */
export async function reconcileSubscription(db: Firestore, sub: Subscription, today: string) {
  const snap = await db.collection("invoices").where("subscriptionId", "==", sub.id).get();
  const invoices = snap.docs.map((d) => mapInvoice(d.id, d.data() as Data));
  const next = deriveSubscriptionStatus({ current: sub.status, invoices, graceDays: sub.gracePeriodDays, today });
  if (next === sub.status) return null;
  const batch = db.batch();
  batch.update(db.collection("subscriptions").doc(sub.id), { status: next, updatedAt: FieldValue.serverTimestamp() });
  batch.update(db.collection("customers").doc(sub.customerId), { subscriptionStatus: next, updatedAt: FieldValue.serverTimestamp() });
  batch.set(db.collection("auditLogs").doc(), serverAuditEntry(null, { action: "subscription.status_synced", targetType: "customer", targetId: sub.customerId, targetLabel: sub.plan, metadata: { from: sub.status, to: next } }));
  await batch.commit();
  return next;
}

async function createCycleInvoice(db: Firestore, sub: Subscription, settings: AppSettings, today: string): Promise<{ created: boolean; invoiceId: string }> {
  const invoiceId = `sub_${sub.id}_${sub.nextBillingDate}`;
  const invRef = db.collection("invoices").doc(invoiceId);
  const counterRef = db.collection("settings").doc("counters");
  const subRef = db.collection("subscriptions").doc(sub.id);
  let created = false;

  await db.runTransaction(async (tx) => {
    const [invSnap, counters, subSnap] = await Promise.all([tx.get(invRef), tx.get(counterRef), tx.get(subRef)]);
    if (subSnap.data()?.nextBillingDate !== sub.nextBillingDate) return; // someone else moved it on
    if (!invSnap.exists) {
      const field = `invoice_${today.slice(0, 7).replace("-", "")}`;
      const seq = ((counters.data()?.[field] as number | undefined) ?? 0) + 1;
      const lines = [{
        description: `Malek Enterprise POS licence, ${sub.terminalLimit} terminal${sub.terminalLimit === 1 ? "" : "s"} (${sub.billingFrequency})`,
        quantity: sub.terminalLimit, unitPrice: sub.pricePerTerminal * MONTHS_PER_CYCLE[sub.billingFrequency],
      }];
      tx.set(counterRef, { [field]: seq, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(invRef, {
        number: invoiceNumber(settings.billing.invoicePrefix, today, seq), customerId: sub.customerId, subscriptionId: sub.id,
        issueDate: today, dueDate: sub.nextBillingDate > today ? sub.nextBillingDate : today, status: "PENDING", lines,
        ...calcTotals(lines, settings.billing.vatRate), vatRate: settings.billing.vatRate, currency: "ZAR",
        paidAt: null, paidBy: null, paymentMethod: null, paymentNote: "", periodKey: sub.nextBillingDate,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      created = true;
    }
    tx.update(subRef, { nextBillingDate: advanceBillingDate(sub.nextBillingDate, sub.billingFrequency), updatedAt: FieldValue.serverTimestamp() });
  });
  return { created, invoiceId };
}

export type { BillingSummary };

/**
 * The daily job: bill what's due, flag what's late, keep subscription and licence standing in step, queue the
 * reminder emails (each stage once per invoice), hand them to Firebase to send, and retry any that failed.
 * Safe to run more than once a day: everything it creates has a deterministic id.
 */
export async function runBillingJob(db: Firestore, today: string = todayISO()): Promise<BillingSummary> {
  const summary: BillingSummary = { date: today, invoicesCreated: 0, markedOverdue: 0, remindersQueued: 0, statusChanges: 0, licencesExtended: 0, licenceWarnings: 0, emailsSent: 0, emailsFailed: 0 };
  const settings = mapSettings(await db.collection("settings").doc("app").get().then((s) => (s.exists ? (s.data() as Data) : null)));
  const notify = settings.notifications.sendReminders;
  const online = onlinePaymentsEnabled();
  const cta = (invoiceId: string): msg.Cta => ({ url: online ? payLinkUrl(invoiceId) : `${SITE_URL}/account`, online });
  const portalUrl = `${SITE_URL}/account`;

  const customers = new Map<string, Customer>((await db.collection("customers").get()).docs.map((d) => [d.id, mapCustomer(d.id, d.data() as Data)]));
  const loadSubs = async () => (await db.collection("subscriptions").get()).docs.map((d) => mapSubscription(d.id, d.data() as Data)).filter((s) => s.status !== "CANCELLED");
  const to = (id: string) => customers.get(id)?.email ?? "";
  const who = (id: string) => customers.get(id)?.businessName ?? "your business";
  const email = (customerId: string, type: string, m: Pick<QueuedMessage, "title" | "message" | "ctaLabel" | "ctaUrl">) => ({ type, customerId, recipient: to(customerId), ...m });

  // 1. Create invoices that are due
  for (const sub of await loadSubs()) {
    if (!sub.autoRenewal || !sub.nextBillingDate || sub.nextBillingDate > today) continue;
    const { created, invoiceId } = await createCycleInvoice(db, sub, settings, today);
    if (!created) continue;
    summary.invoicesCreated++;
    if (notify) {
      const inv = mapInvoice(invoiceId, (await db.collection("invoices").doc(invoiceId).get()).data() as Data);
      await queueOnce(db, `inv_${invoiceId}`, email(sub.customerId, "invoice_issued", msg.invoiceIssued(who(sub.customerId), inv, cta(inv.id))));
    }
  }

  // 2. Overdue flags, then the reminder ladder for every unpaid invoice
  const subsNow = await loadSubs();
  const graceOf = new Map(subsNow.map((s) => [s.id, s.gracePeriodDays]));
  const unpaidSnaps = await Promise.all(["PENDING", "OVERDUE"].map((st) => db.collection("invoices").where("status", "==", st).get()));
  for (const inv of unpaidSnaps.flatMap((q) => q.docs.map((d) => mapInvoice(d.id, d.data() as Data)))) {
    if (shouldMarkOverdue(inv, today)) {
      await db.collection("invoices").doc(inv.id).update({ status: "OVERDUE", updatedAt: FieldValue.serverTimestamp() });
      summary.markedOverdue++;
    }
    if (!notify || inv.issueDate === today) continue; // the "invoice issued" email already covers the day it was created
    const graceDays = graceOf.get(inv.subscriptionId ?? "") ?? settings.billing.defaultGraceDays;
    const stage = reminderStage({ dueDate: inv.dueDate, today, reminderDaysBefore: settings.billing.reminderDaysBefore, graceDays });
    if (!stage) continue;
    if (await queueOnce(db, `remind_${inv.id}_${stage}`, email(inv.customerId, "payment_reminder", msg.reminder(stage, who(inv.customerId), inv, cta(inv.id), graceDays)))) summary.remindersQueued++;
  }

  // 3. Subscription standing (pending -> overdue -> suspended, or back to active once paid)
  for (const sub of subsNow) {
    const next = await reconcileSubscription(db, sub, today);
    if (!next) continue;
    summary.statusChanges++;
    if (notify && next === "SUSPENDED") {
      const openInvoice = unpaidSnaps.flatMap((q) => q.docs).find((d) => d.data().subscriptionId === sub.id);
      await queueOnce(db, `substatus_${sub.id}_${next}_${today}`, email(sub.customerId, "subscription_status", msg.suspended(who(sub.customerId), openInvoice ? cta(openInvoice.id) : { url: portalUrl, online: false })));
    }
  }

  // 4. Licence renewals and expiry warnings (14, 7, 3, 1 days before, on the day, and once it has expired)
  const fresh = new Map((await loadSubs()).map((s) => [s.id, s]));
  for (const doc of (await db.collection("licenses").get()).docs) {
    const lic = mapLicense(doc.id, doc.data() as Data);
    if (lic.revoked || lic.status === "REVOKED") continue;
    const sub = fresh.get(lic.subscriptionId ?? "");
    let expiry = lic.expiryDate;
    if (sub?.status === "ACTIVE") {
      const renewed = renewedExpiry(lic.expiryDate, sub.nextBillingDate, sub.gracePeriodDays);
      if (renewed !== lic.expiryDate) { await doc.ref.update({ expiryDate: renewed, terminalLimit: sub.terminalLimit, updatedAt: FieldValue.serverTimestamp() }); summary.licencesExtended++; expiry = renewed; }
    }
    // A paid-up, auto-renewing subscription extends its own licence, so only warn when it won't renew by itself.
    if (!notify || (sub?.status === "ACTIVE" && sub.autoRenewal)) continue;
    const left = daysBetween(today, expiry);
    const stage = licenceExpiryStage(left);
    if (!stage) continue;
    if (await queueOnce(db, `licexp_${lic.id}_${expiry}_${stage}`, email(lic.customerId, "license_expiry", msg.licenceExpiry(stage, who(lic.customerId), expiry, left, portalUrl)))) summary.licenceWarnings++;
  }

  // 5. Send queued emails through Firebase, confirm what the extension delivered, and retry recent failures
  if (settings.notifications.emailEnabled) {
    await reconcileDelivery(db);
    const pick = (status: string) => db.collection("notifications").where("status", "==", status).where("channel", "==", "email").limit(50).get();
    const [queued, failed] = await Promise.all([pick("queued"), pick("failed")]);
    const retry = failed.docs.filter((d) => d.data().recipient && Number(d.data().attempts ?? 0) < MAX_EMAIL_ATTEMPTS);
    for (const d of [...queued.docs, ...retry]) {
      const r = await deliverNotification(db, d.id);
      if (r.status === "sent") summary.emailsSent++; else summary.emailsFailed++;
    }
  }

  await db.collection("settings").doc("lastBillingRun").set({ date: today, ranAt: FieldValue.serverTimestamp(), summary: { ...summary } });
  await db.collection("auditLogs").add(serverAuditEntry(null, { action: "billing.job_run", targetType: "system", targetId: "billing", targetLabel: today, metadata: { ...summary } }));
  return summary;
}
