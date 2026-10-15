import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { Release, ReleaseFile } from "@/types";

// Release delivery for an installer kept in a separate PRIVATE GitHub repo. GitHub itself is faked.
const gh = { status: 302, location: "https://release-assets.githubusercontent.com/github-production-release-asset/1/abc?sig=xyz&se=2026-10-01T10%3A05%3A00Z", calls: [] as { url: string; opts: Record<string, unknown> }[] };

vi.mock("@/lib/security/urlGuard", async (orig) => {
  const real = await orig<typeof import("@/lib/security/urlGuard")>();
  return {
    ...real,
    guardedFetch: async (url: string, opts: Record<string, unknown>) => {
      gh.calls.push({ url, opts });
      const headers = new Headers(gh.location ? { location: gh.location } : {});
      return { res: new Response(null, { status: gh.status, headers }), finalUrl: new URL(url) };
    },
  };
});

import { deliverFile } from "@/lib/releases/serve";

const API_URL = "https://api.github.com/repos/MalekEnterprisePOS/pos-app/releases/assets/123456";
let storedUrl = API_URL;
const db = { collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ links: { f1: { url: storedUrl } } }) }) }) }) } as unknown as Firestore;
const release = { id: "r1", version: "1.0.1" } as Release;
const file = (mode: "redirect" | "proxy") => ({ id: "f1", kind: "installer", name: "MalekEnterprisePOS_Setup.exe", source: "link", deliveryMode: mode } as ReleaseFile);
const deliver = (mode: "redirect" | "proxy" = "redirect") => deliverFile(new Request("http://localhost/api/download/file"), db, release, file(mode), { count: false });

beforeEach(() => {
  gh.status = 302; gh.location = "https://release-assets.githubusercontent.com/github-production-release-asset/1/abc?sig=xyz&se=2026-10-01T10%3A05%3A00Z"; gh.calls = [];
  storedUrl = API_URL; vi.stubEnv("GITHUB_TOKEN", "github_pat_SECRET_TOKEN_VALUE");
});

describe("deliverFile: installer in a separate private GitHub repo", () => {
  it("sends the visitor to GitHub's short-lived link, using the server-side token", async () => {
    const res = await deliver();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(gh.location);
    expect(gh.calls[0]!.url).toBe(API_URL);
    expect(gh.calls[0]!.opts).toMatchObject({ githubToken: "github_pat_SECRET_TOKEN_VALUE", stopAtRedirect: true });
  });
  it("never puts the token or the API address in the response the visitor sees", async () => {
    const res = await deliver();
    const everything = JSON.stringify([...res.headers.entries()]);
    expect(everything).not.toContain("SECRET_TOKEN");
    expect(everything).not.toContain("api.github.com");
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });
  it("refuses to redirect anywhere that isn't GitHub's own download host", async () => {
    gh.location = "https://evil.example/malware.exe";
    await expect(deliver()).rejects.toMatchObject({ status: 502 });
  });
  it("refuses a non-https or private-network target", async () => {
    gh.location = "http://release-assets.githubusercontent.com/x";
    await expect(deliver()).rejects.toBeDefined();
    gh.location = "https://127.0.0.1/x";
    await expect(deliver()).rejects.toBeDefined();
  });
  it("says 'temporarily unavailable' (404) when GitHub can't see the asset, e.g. a token without access", async () => {
    gh.status = 404; gh.location = "";
    await expect(deliver()).rejects.toMatchObject({ status: 404, message: "That file is temporarily unavailable." });
  });
  it("says 'temporarily unavailable' (502) when GitHub answers with something other than a redirect", async () => {
    gh.status = 200; gh.location = "";
    await expect(deliver()).rejects.toMatchObject({ status: 502 });
  });
  it("leaves an ordinary public link exactly as before (redirect straight to it)", async () => {
    storedUrl = "https://github.com/MalekEnterprisePOS/pos-app/releases/download/v1.0.1/Setup.exe";
    const res = await deliver();
    expect(res.headers.get("location")).toBe(storedUrl);
    expect(gh.calls).toHaveLength(0);
  });
});
