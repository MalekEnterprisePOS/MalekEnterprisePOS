import { beforeEach, describe, expect, it, vi } from "vitest";

// The download-ticket route with the database / sign-in layer faked, to prove the sign-in switch is enforced ON THE SERVER.
const state = { requireLogin: false, user: null as null | { uid: string; email: string; emailVerified: boolean } };

vi.mock("@/lib/firebase/admin", async (orig) => {
  const real = await orig<typeof import("@/lib/firebase/admin")>();
  return {
    ...real,
    adminDb: () => ({}),
    requireUser: async () => { if (!state.user) throw new real.HttpError(401, "Sign in to continue."); return state.user; },
  };
});
vi.mock("@/lib/releases/policy", () => ({ downloadRequiresLogin: async () => state.requireLogin }));
vi.mock("@/lib/releases/serve", () => ({
  getReleaseServer: async () => ({ id: "rel1", status: "published", files: [{ id: "f1", name: "Setup.exe" }] }),
  pickFile: () => ({ id: "f1", name: "Setup.exe" }),
}));

import { POST } from "@/app/api/download/ticket/route";

let n = 0;
const call = () => POST(new Request("http://localhost/api/download/ticket", {
  method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${++n}` }, body: JSON.stringify({ releaseId: "rel1" }),
}));

beforeEach(() => { vi.stubEnv("DOWNLOAD_SIGNING_SECRET", "x".repeat(40)); state.requireLogin = false; state.user = null; });

describe("download ticket: require-sign-in switch", () => {
  it("OFF: anyone gets a ticket without signing in", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).url).toMatch(/^\/api\/download\/file\?t=/);
  });
  it("ON + not signed in: refused with login_required", async () => {
    state.requireLogin = true;
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "login_required" });
  });
  it("ON + signed in but email not verified: refused with verify_required", async () => {
    state.requireLogin = true; state.user = { uid: "u1", email: "a@b.co", emailVerified: false };
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "verify_required" });
  });
  it("ON + signed in with a verified email: gets a ticket", async () => {
    state.requireLogin = true; state.user = { uid: "u1", email: "a@b.co", emailVerified: true };
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).fileName).toBe("Setup.exe");
  });
});
