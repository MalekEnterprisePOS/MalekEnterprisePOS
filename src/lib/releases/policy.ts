import type { Firestore } from "firebase-admin/firestore";
import { mapSettings, type Data } from "@/lib/mappers";

/** Is the admin's "Require sign-in to download" switch on? Read fresh from settings/app so a change applies at once. */
export async function downloadRequiresLogin(db: Firestore): Promise<boolean> {
  const snap = await db.collection("settings").doc("app").get();
  return mapSettings(snap.exists ? (snap.data() as Data) : null).downloads.requireLogin;
}
