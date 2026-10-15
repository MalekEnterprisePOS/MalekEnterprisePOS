import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminAuth, adminDb, rateLimit, requireAdmin, route } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * Backfills the Users page from Firebase Authentication. Anyone who signed up (Google or email) but has no record in
 * `portalUsers` yet - for example people who signed in before the tracking existed, or whose first sign-in call failed -
 * gets one now. Existing records are only topped up (never overwritten), admins are skipped, and it is safe to run
 * as often as you like. Server-only: it uses the Admin SDK, so it is not affected by the Firestore security rules.
 */
export const POST = route(async (req) => {
  await requireAdmin(req);
  rateLimit(req, "users-sync", 10);
  const db = adminDb();
  const auth = adminAuth();

  const customersByEmail = new Map<string, string>();
  for (const d of (await db.collection("customers").get()).docs) {
    const email = String(d.data().email ?? "").trim().toLowerCase();
    if (email) customersByEmail.set(email, d.id);
  }
  const existing = new Set((await db.collection("portalUsers").select().get()).docs.map((d) => d.id));

  let created = 0;
  let scanned = 0;
  let token: string | undefined;
  do {
    const page = await auth.listUsers(1000, token);
    let batch = db.batch();
    let inBatch = 0;
    for (const u of page.users) {
      scanned++;
      if (u.customClaims?.admin === true || existing.has(u.uid)) continue;
      const email = (u.email ?? "").toLowerCase();
      const created_ = u.metadata.creationTime ? new Date(u.metadata.creationTime) : new Date();
      const last = u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime) : null;
      batch.set(db.collection("portalUsers").doc(u.uid), {
        email, name: u.displayName ?? "", businessName: "", phone: "", address: "", country: "South Africa",
        provider: u.providerData[0]?.providerId ?? "password", emailVerified: u.emailVerified,
        customerId: customersByEmail.get(email) ?? null, profileComplete: false,
        loginCount: last ? 1 : 0, lastLoginAt: last, downloadClicks: 0, lastDownloadAt: null,
        createdAt: created_, updatedAt: FieldValue.serverTimestamp(),
      });
      created++;
      if (++inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
    }
    if (inBatch > 0) await batch.commit();
    token = page.pageToken;
  } while (token);

  return NextResponse.json({ ok: true, scanned, created });
});
