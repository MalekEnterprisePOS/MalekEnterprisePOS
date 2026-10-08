import { NextResponse } from "next/server";
import { adminDb, HttpError, rateLimit, readJson, requireUser, route } from "@/lib/firebase/admin";
import { findCustomerForUser } from "@/lib/account/server";
import { saveProfile } from "@/lib/account/portalUsers";
import { profileSchema } from "@/lib/account/profile";
import { serverAuditEntry } from "@/lib/firebase/serverAudit";

export const dynamic = "force-dynamic";

/** Saves the signed-in customer's own details (name, shop, phone, address). Their email is fixed: it comes from their sign-in. */
export const POST = route(async (req) => {
  rateLimit(req, "account-profile", 20);
  const user = await requireUser(req);
  const parsed = profileSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check your details.");
  const db = adminDb();
  const customer = await findCustomerForUser(db, user);
  await saveProfile(db, user, customer, parsed.data);
  if (customer) await db.collection("auditLogs").add(serverAuditEntry({ uid: user.uid, email: user.email }, { action: "customer.profile_updated", targetType: "customer", targetId: customer.id, targetLabel: parsed.data.businessName }));
  return NextResponse.json({ ok: true, profile: { ...parsed.data, complete: true } });
});
