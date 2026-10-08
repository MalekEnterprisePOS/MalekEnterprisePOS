/**
 * Server-side bookkeeping for the `portalUsers` collection: one document per person who has signed in to the customer
 * portal, created the first time they sign in (even if they never buy anything). It is what lets the admin see who has
 * signed up, who has a plan, who is late or expired, and how often people log in and download.
 * Only the Admin SDK writes here (firestore.rules denies every browser write).
 */
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Customer } from "@/types";
import { str, type Data } from "@/lib/mappers";
import { EMPTY_PROFILE, isProfileComplete, type Profile } from "./profile";

export interface PortalIdentity { uid: string; email: string; emailVerified: boolean; name?: string; provider?: string }

const pick = (...xs: (string | undefined)[]) => xs.map((x) => (x ?? "").trim()).find(Boolean) ?? "";

/** The person's details as the account page should show them: what they saved, falling back to an admin-created customer record. */
export async function loadProfile(db: Firestore, uid: string, customer: Customer | null, identityName = ""): Promise<{ profile: Profile; complete: boolean }> {
  const d = ((await db.collection("portalUsers").doc(uid).get()).data() ?? {}) as Data;
  const profile: Profile = {
    name: pick(str(d.name), customer?.name, identityName),
    businessName: pick(str(d.businessName), customer?.businessName),
    phone: pick(str(d.phone), customer?.phone),
    address: pick(str(d.address), customer?.address),
    country: pick(str(d.country), customer?.country, EMPTY_PROFILE.country),
  };
  return { profile, complete: isProfileComplete(profile) };
}

interface TouchOptions {
  /** Hints from the sign-up form (only used to fill details that are still empty). */
  details?: Partial<Pick<Profile, "name" | "businessName" | "phone">>;
  /** True for a real new sign-in; false for background syncs that should not inflate the login count. */
  countLogin: boolean;
}

/** Creates the person's document on first sign-in, otherwise refreshes it. Safe to call repeatedly. */
export async function touchPortalUser(db: Firestore, user: PortalIdentity, customer: Customer | null, opts: TouchOptions): Promise<void> {
  const ref = db.collection("portalUsers").doc(user.uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = (snap.data() ?? {}) as Data;
    const merged: Profile = {
      name: pick(str(cur.name), opts.details?.name, customer?.name, user.name),
      businessName: pick(str(cur.businessName), opts.details?.businessName, customer?.businessName),
      phone: pick(str(cur.phone), opts.details?.phone, customer?.phone),
      address: pick(str(cur.address), customer?.address),
      country: pick(str(cur.country), customer?.country, EMPTY_PROFILE.country),
    };
    const fields = {
      email: user.email, provider: user.provider ?? str(cur.provider), emailVerified: user.emailVerified,
      ...merged, customerId: customer?.id ?? (typeof cur.customerId === "string" ? cur.customerId : null),
      profileComplete: isProfileComplete(merged), updatedAt: FieldValue.serverTimestamp(),
    };
    // Background syncs (every account-page load) only write when something actually changed.
    if (snap.exists && !opts.countLogin && ["email", "provider", "emailVerified", "name", "businessName", "phone", "address", "country", "customerId", "profileComplete"].every((k) => cur[k] === (fields as Data)[k])) return;
    if (!snap.exists) {
      tx.set(ref, { ...fields, loginCount: 1, lastLoginAt: FieldValue.serverTimestamp(), downloadClicks: 0, lastDownloadAt: null, createdAt: FieldValue.serverTimestamp() });
    } else {
      tx.update(ref, opts.countLogin ? { ...fields, loginCount: FieldValue.increment(1), lastLoginAt: FieldValue.serverTimestamp() } : fields);
    }
  });
}

/** Saves what the person typed on the account page, and keeps their customer record (if any) in step. */
export async function saveProfile(db: Firestore, user: PortalIdentity, customer: Customer | null, input: Profile): Promise<void> {
  const ref = db.collection("portalUsers").doc(user.uid);
  const fields = { ...input, email: user.email, provider: user.provider ?? "", emailVerified: user.emailVerified, customerId: customer?.id ?? null, profileComplete: true, updatedAt: FieldValue.serverTimestamp() };
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) tx.update(ref, fields);
    else tx.set(ref, { ...fields, loginCount: 1, lastLoginAt: FieldValue.serverTimestamp(), downloadClicks: 0, lastDownloadAt: null, createdAt: FieldValue.serverTimestamp() });
  });
  if (customer) {
    await db.collection("customers").doc(customer.id).update({
      name: input.name, businessName: input.businessName, phone: input.phone, address: input.address, country: input.country, updatedAt: FieldValue.serverTimestamp(),
    });
  }
}
