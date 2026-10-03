import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { licenceExpiryStage } from "@/lib/billing/lifecycle";
import { licenceExpiry } from "@/lib/billing/messages";
import { sendEmail } from "@/lib/notifications/email";
import { reconcileDelivery } from "@/lib/notifications/server";

describe("licence expiry ladder", () => {
  it.each([
    [30, null], [15, null], [14, "d14"], [8, "d14"], [7, "d7"], [4, "d7"], [3, "d3"], [2, "d3"], [1, "d1"], [0, "today"], [-1, "expired"], [-7, "expired"], [-8, null],
  ])("%i days left -> %s", (left, stage) => { expect(licenceExpiryStage(left)).toBe(stage); });

  it("every stage produces a title and a link to the account", () => {
    for (const [stage, left] of [["d14", 14], ["d7", 7], ["d3", 3], ["d1", 1], ["today", 0], ["expired", -2]] as const) {
      const m = licenceExpiry(stage, "Acme", "2026-10-10", left, "https://x.test/account");
      expect(m.title.length).toBeGreaterThan(5);
      expect(m.ctaUrl).toBe("https://x.test/account");
    }
  });
});

/** A tiny in-memory stand-in for the one collection these functions touch. */
function fakeDb(docs: Record<string, Record<string, unknown>> = {}) {
  const ref = (id: string) => ({
    id,
    create: vi.fn(async (data: Record<string, unknown>) => { if (docs[id]) throw Object.assign(new Error("exists"), { code: 6 }); docs[id] = data; }),
    get: vi.fn(async () => ({ exists: Boolean(docs[id]), data: () => docs[id] })),
    update: vi.fn(async (patch: Record<string, unknown>) => { docs[id] = { ...docs[id], ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v])) }; }),
  });
  return { docs, db: { collection: () => ({ doc: (id?: string) => ref(id ?? `auto${Object.keys(docs).length}`) }) } as unknown as Firestore };
}

describe("sendEmail via the Firebase mail collection", () => {
  it("writes a mail document the Trigger Email extension understands", async () => {
    const { db, docs } = fakeDb();
    const r = await sendEmail(db, { to: "a@b.co", subject: "Hi", text: "t", html: "<p>t</p>", replyTo: "s@b.co", idempotencyKey: "notif-1" });
    expect(r).toEqual({ ok: true, mailId: "notif-1" });
    expect(docs["notif-1"]).toMatchObject({ to: ["a@b.co"], replyTo: "s@b.co", message: { subject: "Hi", text: "t", html: "<p>t</p>" } });
  });
  it("never writes the same email twice", async () => {
    const { db, docs } = fakeDb();
    await sendEmail(db, { to: "a@b.co", subject: "Hi", text: "t", idempotencyKey: "notif-1" });
    const again = await sendEmail(db, { to: "a@b.co", subject: "Changed", text: "t", idempotencyKey: "notif-1" });
    expect(again.ok).toBe(true);
    expect((docs["notif-1"]!.message as { subject: string }).subject).toBe("Hi");
  });
  it("asks the extension to retry an email it reported as failed", async () => {
    const { db, docs } = fakeDb({ "notif-1": { delivery: { state: "ERROR" } } });
    await sendEmail(db, { to: "a@b.co", subject: "Hi", text: "t", idempotencyKey: "notif-1" });
    expect(docs["notif-1"]).toMatchObject({ "delivery.state": "RETRY" });
  });
});

describe("reconcileDelivery", () => {
  it("exports a function", () => { expect(typeof reconcileDelivery).toBe("function"); });
});
