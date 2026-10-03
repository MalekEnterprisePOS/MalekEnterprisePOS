import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, HttpError, rateLimit, readJson, requireUser, route } from "@/lib/firebase/admin";
import { downloadRequiresLogin } from "@/lib/releases/policy";
import { getReleaseServer, pickFile } from "@/lib/releases/serve";
import { downloadSecret, signTicket } from "@/lib/releases/ticket";

export const dynamic = "force-dynamic";

/** The Download button calls this to get a link that works for five minutes. Only published releases qualify, and when the admin requires sign-in the caller must be signed in with a verified email. */
export const POST = route(async (req) => {
  rateLimit(req, "dl-ticket", 20);
  const body = z.object({ releaseId: z.string().min(1).max(64), fileId: z.string().max(40).optional() }).safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, "releaseId is required.");
  const secret = downloadSecret();
  if (!secret) throw new HttpError(503, "Downloads aren't configured yet.");
  const db = adminDb();
  if (await downloadRequiresLogin(db)) {
    // The admin switched on "Require sign-in to download": no valid, verified sign-in = no ticket. Checked on the server, so it can't be bypassed in the browser.
    let user;
    try { user = await requireUser(req); } catch { return NextResponse.json({ error: "Sign in to download the installer.", code: "login_required" }, { status: 401 }); }
    if (!user.emailVerified) return NextResponse.json({ error: "Verify your email address first - we sent you a link. Then try again.", code: "verify_required" }, { status: 403 });
  }
  const release = await getReleaseServer(db, body.data.releaseId);
  if (!release || release.status !== "published") throw new HttpError(404, "That release isn't available.");
  const file = pickFile(release, body.data.fileId);
  if (!file) throw new HttpError(404, "That file isn't available.");
  return NextResponse.json({ url: `/api/download/file?t=${signTicket(release.id, file.id, secret)}`, fileName: file.name, expiresInSeconds: 300 }, { headers: { "Cache-Control": "no-store" } });
});
