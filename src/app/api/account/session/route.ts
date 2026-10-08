import { NextResponse } from "next/server";
import { adminDb, rateLimit, requireUser, route } from "@/lib/firebase/admin";
import { findCustomerForUser } from "@/lib/account/server";
import { touchPortalUser } from "@/lib/account/portalUsers";
import { profileHintSchema } from "@/lib/account/profile";

export const dynamic = "force-dynamic";

/**
 * Called once per browser session, right after someone signs in (or signs up). It creates or refreshes their record in
 * `portalUsers` so the admin can see who has signed up, when they last logged in and how often. Works for unverified
 * emails too, because "signed in but never verified" is something the admin wants to see.
 * The optional body carries the sign-up form's name / shop / phone, used only to fill details that are still empty.
 */
export const POST = route(async (req) => {
  rateLimit(req, "account-session", 40);
  const user = await requireUser(req);
  const raw = await req.json().catch(() => ({}));
  const parsed = profileHintSchema.safeParse(raw);
  const db = adminDb();
  const customer = await findCustomerForUser(db, user);
  await touchPortalUser(db, user, customer, { details: parsed.success ? parsed.data : undefined, countLogin: true });
  return NextResponse.json({ ok: true });
});
