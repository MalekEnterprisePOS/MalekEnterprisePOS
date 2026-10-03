import { NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase/admin";
import { downloadRequiresLogin } from "@/lib/releases/policy";

export const dynamic = "force-dynamic";

/** The few non-secret switches the public pages need to know about (currently just whether downloads need a sign-in). */
export async function GET() {
  let requireLogin = false;
  if (adminConfigured()) {
    try { requireLogin = await downloadRequiresLogin(adminDb()); } catch (e) { console.error("[public-config]", e); }
  }
  return NextResponse.json({ downloadRequiresLogin: requireLogin }, { headers: { "Cache-Control": "no-store" } });
}
