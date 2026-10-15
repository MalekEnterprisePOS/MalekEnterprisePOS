import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpError } from "@/lib/httpError";
import { SITE_URL } from "@/lib/constants";
import { mapInvoice, type Data } from "@/lib/mappers";
import { GatewayError } from "./gateway-core";
import { createYocoCheckout, onlinePaymentsEnabled, yocoSecretKey, YOCO_MIN_AMOUNT } from "./yoco";

/**
 * Starts an online payment for one invoice and returns the Yoco page to send the customer to.
 * The amount ALWAYS comes from the invoice in Firestore, never from the caller. When the customer pays, Yoco calls
 * our webhook (/api/webhooks/payments), which marks the invoice paid and issues the licence - nothing here does that.
 */
export async function startInvoiceCheckout(db: Firestore, invoiceId: string, opts: { ownerCustomerId?: string } = {}): Promise<{ url: string; invoiceNumber: string }> {
  if (!onlinePaymentsEnabled()) throw new HttpError(503, "Online payments aren't switched on yet. Please pay by bank transfer or contact support.");
  const snap = await db.collection("invoices").doc(invoiceId).get();
  if (!snap.exists) throw new HttpError(404, "Invoice not found.");
  const invoice = mapInvoice(snap.id, snap.data() as Data);
  if (opts.ownerCustomerId && invoice.customerId !== opts.ownerCustomerId) throw new HttpError(404, "Invoice not found.");
  if (invoice.status === "PAID") throw new HttpError(409, "This invoice is already paid.");
  if (invoice.status === "CANCELLED") throw new HttpError(409, "This invoice was replaced by a newer one. Sign in to see your current invoice.");
  if (invoice.total < YOCO_MIN_AMOUNT) throw new HttpError(422, "Amounts below R2.00 can't be paid online. Please contact support.");

  try {
    const checkout = await createYocoCheckout({
      secretKey: yocoSecretKey() as string,
      amountCents: Math.round(invoice.total * 100),
      successUrl: `${SITE_URL}/account?paid=${encodeURIComponent(invoice.number)}`,
      cancelUrl: `${SITE_URL}/account?payment=cancelled`,
      failureUrl: `${SITE_URL}/account?payment=failed`,
      metadata: { invoiceId: invoice.id, invoiceNumber: invoice.number, customerId: invoice.customerId },
    });
    await snap.ref.update({ gatewayCheckoutId: checkout.id, gatewayCheckoutAt: FieldValue.serverTimestamp() });
    return { url: checkout.redirectUrl, invoiceNumber: invoice.number };
  } catch (e) {
    if (e instanceof GatewayError) throw new HttpError(e.status, e.message);
    throw e;
  }
}
