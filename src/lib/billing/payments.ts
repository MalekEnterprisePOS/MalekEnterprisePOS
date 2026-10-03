import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { PaymentEvent } from "./gateway";
import { reconcileSubscription } from "./server";
import { HttpError } from "@/lib/httpError";
import { serverAuditEntry } from "@/lib/firebase/serverAudit";
import { todayISO } from "@/lib/dates";
import { mapInvoice, mapSubscription, type Data } from "@/lib/mappers";
import { queueAndSend } from "@/lib/notifications/server";
import { SITE_URL } from "@/lib/constants";
import * as msg from "./messages";
import { payLinkUrl } from "./paylink";
import { onlinePaymentsEnabled } from "./yoco";
import { fulfilPaidOrders } from "@/lib/account/server";

/**
 * Records one gateway payment event. Shared by the real webhook and the test-payment button so both go through the
 * same checks: the amount must match the invoice, and the gateway reference is an idempotency key, so a retried
 * event never records (or fulfils) anything twice. After a successful payment any paid purchase order is fulfilled,
 * i.e. the subscription is activated and the licence is issued.
 */
export async function applyPaymentEvent(db: Firestore, event: PaymentEvent, provider: string): Promise<{ duplicate?: true; recorded?: "failed" | "succeeded" }> {
  const invRef = db.collection("invoices").doc(event.invoiceId);
  const invSnap = await invRef.get();
  if (!invSnap.exists) throw new HttpError(404, "Invoice not found.");
  const invoice = mapInvoice(invSnap.id, invSnap.data() as Data);
  const paymentRef = db.collection("payments").doc(`pay_${provider}_${event.reference}`.replace(/[^A-Za-z0-9_-]/g, "_"));
  if ((await paymentRef.get()).exists) return { duplicate: true };

  const base = { invoiceId: invoice.id, customerId: invoice.customerId, amount: event.amount, currency: "ZAR", method: "online", provider, reference: event.reference, recordedBy: `${provider} webhook`, note: "", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };

  if (event.type === "payment.failed") {
    await paymentRef.set({ ...base, status: "failed", paidAt: null });
    const customer = (await db.collection("customers").doc(invoice.customerId).get()).data() ?? {};
    await queueAndSend(db, `payfail_${paymentRef.id}`, {
      type: "payment_failed", customerId: invoice.customerId, recipient: String(customer.email ?? ""),
      ...msg.paymentFailed(String(customer.businessName ?? "your business"), invoice, { url: payLinkUrl(invoice.id), online: onlinePaymentsEnabled() }),
    });
    return { recorded: "failed" };
  }

  if (event.currency !== "ZAR" || Math.abs(event.amount - invoice.total) > 0.005) {
    await paymentRef.set({ ...base, status: "failed", paidAt: null, note: `Rejected: expected ZAR ${invoice.total}, received ${event.currency} ${event.amount}.` });
    throw new HttpError(422, "Payment amount or currency doesn't match the invoice.");
  }

  // Money that arrives for an invoice that is already paid (e.g. someone paid twice from two emails) is recorded, but flagged.
  const wasPaid = invoice.status === "PAID";
  const batch = db.batch();
  batch.set(paymentRef, { ...base, status: "succeeded", paidAt: FieldValue.serverTimestamp(), note: wasPaid ? "This invoice was already paid, so this looks like a duplicate payment. Check the gateway dashboard and refund it if so." : "" });
  if (invoice.status !== "PAID") batch.update(invRef, { status: "PAID", paidAt: FieldValue.serverTimestamp(), paidBy: `${provider} webhook`, paymentMethod: "online", paymentNote: event.reference, updatedAt: FieldValue.serverTimestamp() });
  batch.set(db.collection("auditLogs").doc(), serverAuditEntry(null, { action: "invoice.marked_paid", targetType: "customer", targetId: invoice.customerId, targetLabel: invoice.number, metadata: { invoiceId: invoice.id, provider, reference: event.reference, amount: event.amount } }));
  await batch.commit();

  if (invoice.subscriptionId) {
    const subSnap = await db.collection("subscriptions").doc(invoice.subscriptionId).get();
    if (subSnap.exists) await reconcileSubscription(db, mapSubscription(subSnap.id, subSnap.data() as Data), todayISO());
  }
  await fulfilPaidOrders(db, invoice.customerId);

  // Instant receipt. New purchases get the "your licence is ready" email from fulfilPaidOrders instead of this one.
  if (!wasPaid && invSnap.data()?.orderKind !== "purchase") {
    const customer = (await db.collection("customers").doc(invoice.customerId).get()).data() ?? {};
    await queueAndSend(db, `paid_${invoice.id}`, {
      type: "general", customerId: invoice.customerId, recipient: String(customer.email ?? ""),
      ...msg.paymentReceived(String(customer.businessName ?? "your business"), invoice, `${SITE_URL}/account`),
    });
  }
  return { recorded: "succeeded" };
}
