import { FieldValue, type Firestore } from "firebase-admin/firestore";

/**
 * Counts one press of a Download button (a "click"): per release, split into signed-in and guest, and per signed-in
 * person. Separate from `recordDownload`, which counts downloads that actually started. The gap between the two is people
 * who clicked but never completed the download. Never throws: counting must not get in the way of a download.
 */
export async function recordDownloadClick(db: Firestore, releaseId: string, fileId: string, uid: string | null): Promise<void> {
  try {
    await db.collection("downloads").doc(releaseId).set(
      { clicks: FieldValue.increment(1), [uid ? "signedInClicks" : "guestClicks"]: FieldValue.increment(1), clickFiles: { [fileId]: FieldValue.increment(1) }, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    // update() (not set) so a click can never create a half-empty user record; the record exists from their first sign-in.
    if (uid) await db.collection("portalUsers").doc(uid).update({ downloadClicks: FieldValue.increment(1), lastDownloadAt: FieldValue.serverTimestamp() });
  } catch (e) {
    console.error("[downloads] click count failed", e);
  }
}
