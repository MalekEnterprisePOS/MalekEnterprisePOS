import { NextResponse } from "next/server";
import { startInvoiceCheckout } from "@/lib/billing/checkout";
import { onlinePaymentsEnabled } from "@/lib/billing/yoco";
import { adminDb, HttpError, rateLimit, readJson, requireUser, route } from "@/lib/firebase/admin";
import { createOrder } from "@/lib/account/server";
import { orderSchema } from "@/lib/account/order";

export const dynamic = "force-dynamic";

/**
 * One-step purchase: creates the invoice for the chosen plan, then starts the hosted Yoco payment for it and returns
 * the payment page address. The customer types their card on Yoco's own secure page (we never see card details); when
 * Yoco confirms the payment it calls our webhook, which marks the invoice paid and issues the licence automatically.
 * The price is always worked out here from Firestore, never trusted from the browser.
 */
export const POST = route(async (req) => {
  rateLimit(req, "account-checkout", 10);
  const user = await requireUser(req);
  const parsed = orderSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  // Checked first so a customer is never left with a stray invoice when payments are switched off.
  if (!onlinePaymentsEnabled()) throw new HttpError(503, "Online payments aren't switched on yet. Create an invoice and pay by bank transfer, or contact support.");
  const db = adminDb();
  const order = await createOrder(db, user, parsed.data);
  const { url } = await startInvoiceCheckout(db, order.invoiceId, { ownerCustomerId: order.customerId });
  return NextResponse.json({ ok: true, url, invoiceId: order.invoiceId });
});
