import { NextResponse } from "next/server";
import { z } from "zod";
import { startInvoiceCheckout } from "@/lib/billing/checkout";
import { adminDb, HttpError, rateLimit, readJson, requireUser, route } from "@/lib/firebase/admin";
import { findCustomerForUser } from "@/lib/account/server";

export const dynamic = "force-dynamic";
const body = z.object({ invoiceId: z.string().min(1).max(120) });

/** A signed-in customer pays one of THEIR OWN unpaid invoices online. Returns the Yoco page to redirect to. */
export const POST = route(async (req) => {
  rateLimit(req, "account-pay", 15);
  const user = await requireUser(req);
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "Invalid request.");
  const db = adminDb();
  const customer = await findCustomerForUser(db, user);
  if (!customer) throw new HttpError(404, "No account found.");
  const { url } = await startInvoiceCheckout(db, parsed.data.invoiceId, { ownerCustomerId: customer.id });
  return NextResponse.json({ ok: true, url });
});
