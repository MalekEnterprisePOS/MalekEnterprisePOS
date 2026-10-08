import { NextResponse } from "next/server";
import { GatewayError, getGateway, type PaymentEvent } from "@/lib/billing/gateway";
import { applyPaymentEvent } from "@/lib/billing/payments";
import { adminDb, HttpError, rateLimit, route } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * Payment gateway webhook (Yoco in production, the signed mock gateway in test mode). The signature is verified
 * first; then the shared payment code checks the amount against the invoice, uses the gateway reference as an
 * idempotency key, and fulfils any paid purchase order (activates the subscription and issues the licence).
 */
export const POST = route(async (req) => {
  rateLimit(req, "payment-webhook", 120);
  const raw = await req.text();
  let event: PaymentEvent | null;
  let provider: string;
  try {
    const gateway = getGateway();
    event = gateway.verifyAndParse(raw, req.headers);
    provider = gateway.name;
  } catch (e) {
    if (e instanceof GatewayError) throw new HttpError(e.status, e.message);
    throw e;
  }
  if (!event) return NextResponse.json({ ok: true, ignored: true }); // valid event we don't act on (e.g. a refund notice)

  const db = adminDb();
  if (!event.invoiceId && event.checkoutRef) {
    // The gateway only echoed its checkout id: find which invoice we created that checkout for.
    const hit = await db.collection("invoices").where("gatewayCheckoutId", "==", event.checkoutRef).limit(1).get();
    if (hit.docs[0]) event = { ...event, invoiceId: hit.docs[0].id };
  }
  if (!event.invoiceId) {
    // Answer 200 so the gateway stops retrying something we can never match, but leave a loud trace for the owner.
    console.error(`[webhook] ${provider} event ${event.reference} matched no invoice (checkout ${event.checkoutRef ?? "n/a"}). Match it by hand.`);
    return NextResponse.json({ ok: true, unmatched: true });
  }
  return NextResponse.json({ ok: true, ...(await applyPaymentEvent(db, event, provider)) });
});
