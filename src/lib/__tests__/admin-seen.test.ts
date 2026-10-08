import { describe, expect, it } from "vitest";
import { badgeCount, bellEntries, markBellSeen, EMPTY_SEEN, fingerprint, isUnseen, markInquiriesSeen, markItemsSeen, mergeSeen, newestTime, parseSeen, unseenInquiryCount } from "@/lib/adminSeen";

describe("what the bell treats as new", () => {
  it("everything is new until the admin has looked", () => {
    expect(isUnseen(EMPTY_SEEN, "overdue", fingerprint(["inv1"]))).toBe(true);
  });
  it("once seen, the same thing stays quiet", () => {
    const s = markItemsSeen(EMPTY_SEEN, [{ key: "overdue", fingerprint: fingerprint(["inv1", "inv2"]) }]);
    expect(isUnseen(s, "overdue", fingerprint(["inv2", "inv1"]))).toBe(false); // same ids, different order
  });
  it("but it becomes new again when it changes (another invoice goes overdue, or one is paid and another is late)", () => {
    const s = markItemsSeen(EMPTY_SEEN, [{ key: "overdue", fingerprint: fingerprint(["inv1"]) }]);
    expect(isUnseen(s, "overdue", fingerprint(["inv1", "inv2"]))).toBe(true);
    expect(isUnseen(s, "overdue", fingerprint(["inv9"]))).toBe(true);
  });
  it("seeing one kind doesn't hide another", () => {
    const s = markItemsSeen(EMPTY_SEEN, [{ key: "overdue", fingerprint: "a" }]);
    expect(isUnseen(s, "expiring", "a")).toBe(true);
    expect(isUnseen(s, "drafts", "a")).toBe(true);
  });
  it("marking nothing changes nothing", () => {
    expect(markItemsSeen(EMPTY_SEEN, [])).toBe(EMPTY_SEEN);
  });
});

describe("contact messages", () => {
  const t = (d: string) => `2026-10-${d}T10:00:00.000Z`;
  it("all are new at first, including old ones (they are no longer capped to 7 days)", () => {
    expect(unseenInquiryCount([t("01"), t("02"), t("05")], EMPTY_SEEN)).toBe(3);
  });
  it("only those after the newest seen one count", () => {
    const s = markInquiriesSeen(EMPTY_SEEN, [t("01"), t("02")]);
    expect(unseenInquiryCount([t("01"), t("02"), t("03")], s)).toBe(1);
  });
  it("viewing them all clears the count, and a later message is new again", () => {
    const times = [t("01"), t("02")];
    const s = markInquiriesSeen(EMPTY_SEEN, times);
    expect(unseenInquiryCount(times, s)).toBe(0);
    expect(unseenInquiryCount([...times, t("09")], s)).toBe(1);
  });
  it("the watermark never moves backwards", () => {
    const s = markInquiriesSeen(EMPTY_SEEN, [t("09")]);
    expect(markInquiriesSeen(s, [t("01")]).inquiriesSeenAt).toBe(t("09"));
  });
  it("a message that arrives between loading and marking is not hidden", () => {
    const loaded = [t("01")];
    const s = markInquiriesSeen(EMPTY_SEEN, loaded);          // marks up to the newest LOADED message, not 'now'
    expect(unseenInquiryCount([t("01"), t("02")], s)).toBe(1);
  });
  it("junk times are ignored", () => {
    expect(unseenInquiryCount([null, undefined, "not a date"], EMPTY_SEEN)).toBe(0);
    expect(newestTime([null, "x", t("03"), t("02")])).toBe(t("03"));
    expect(newestTime([])).toBeNull();
  });
});

describe("remembering between visits and devices", () => {
  it("merging keeps what either side has seen, preferring this browser for the same item, and the later message mark", () => {
    const local = { seen: { overdue: "A" }, inquiriesSeenAt: "2026-10-02T00:00:00.000Z" };
    const remote = { seen: { overdue: "OLD", expiring: "E" }, inquiriesSeenAt: "2026-10-05T00:00:00.000Z" };
    expect(mergeSeen(local, remote)).toEqual({ seen: { overdue: "A", expiring: "E" }, inquiriesSeenAt: "2026-10-05T00:00:00.000Z" });
  });
  it("saved data of any shape is read safely", () => {
    expect(parseSeen(null)).toEqual(EMPTY_SEEN);
    expect(parseSeen("oops")).toEqual(EMPTY_SEEN);
    expect(parseSeen({ seen: { overdue: "A", bad: 5 }, inquiriesSeenAt: "garbage" })).toEqual({ seen: { overdue: "A" }, inquiriesSeenAt: null });
    expect(parseSeen({ seen: { drafts: "d1" }, inquiriesSeenAt: "2026-10-01T00:00:00.000Z" })).toEqual({ seen: { drafts: "d1" }, inquiriesSeenAt: "2026-10-01T00:00:00.000Z" });
  });
});

describe("the bell, as the admin experiences it", () => {
  const none = { overdueIds: [], expiringLicenceIds: [], draftReleaseIds: [], inquiryTimes: [] as string[] };
  const at = (d: string) => `2026-10-${d}T10:00:00.000Z`;

  it("nothing outstanding: no badge", () => {
    expect(badgeCount(bellEntries(none, EMPTY_SEEN))).toBe(0);
  });

  it("THE REPORTED PROBLEM: one thing needs attention, the admin opens the bell, and the badge goes away and stays away", () => {
    const a = { ...none, overdueIds: ["inv1"] };
    let seen = EMPTY_SEEN;
    expect(badgeCount(bellEntries(a, seen))).toBe(1);                  // shows as pending
    seen = markBellSeen(seen, bellEntries(a, seen), a);               // the admin opens the bell
    expect(badgeCount(bellEntries(a, seen))).toBe(0);                  // cleared
    expect(bellEntries(a, seen)).toHaveLength(1);                      // the job is still listed for reference...
    expect(bellEntries(a, seen)[0]!.unseen).toBe(false);               // ...but not marked new
    expect(badgeCount(bellEntries(a, seen))).toBe(0);                  // and a later refresh of the same data doesn't bring it back
  });

  it("only something NEW brings the badge back", () => {
    let a = { ...none, overdueIds: ["inv1"], draftReleaseIds: ["r1"] };
    const seen = markBellSeen(EMPTY_SEEN, bellEntries(a, EMPTY_SEEN), a);
    expect(badgeCount(bellEntries(a, seen))).toBe(0);
    a = { ...a, overdueIds: ["inv1", "inv2"] };                        // another invoice goes overdue
    expect(badgeCount(bellEntries(a, seen))).toBe(1);
    expect(bellEntries(a, seen).find((e) => e.key === "overdue")!.unseen).toBe(true);
    expect(bellEntries(a, seen).find((e) => e.key === "drafts")!.unseen).toBe(false); // the draft release is still seen
  });

  it("messages are listed only while new, and reading them removes them from the bell", () => {
    let a = { ...none, inquiryTimes: [at("01"), at("02")] };
    let seen = EMPTY_SEEN;
    expect(bellEntries(a, seen)).toMatchObject([{ key: "messages", count: 2, unseen: true }]);
    seen = markBellSeen(seen, bellEntries(a, seen), a);
    expect(bellEntries(a, seen)).toEqual([]);                          // gone, not just dimmed
    a = { ...a, inquiryTimes: [...a.inquiryTimes, at("09")] };
    expect(bellEntries(a, seen)).toMatchObject([{ key: "messages", count: 1, unseen: true }]);
  });

  it("counts each kind once (a badge of 3 means three kinds of thing are new)", () => {
    const a = { overdueIds: ["i"], expiringLicenceIds: ["l"], draftReleaseIds: [], inquiryTimes: [at("01"), at("02"), at("03")] };
    expect(badgeCount(bellEntries(a, EMPTY_SEEN))).toBe(3);
    expect(bellEntries(a, EMPTY_SEEN).map((e) => e.key)).toEqual(["overdue", "expiring", "messages"]);
  });

  it("when the overdue invoice is paid and the list empties, it disappears, and a later overdue one is new again", () => {
    const first = { ...none, overdueIds: ["inv1"] };
    const seen = markBellSeen(EMPTY_SEEN, bellEntries(first, EMPTY_SEEN), first);
    expect(bellEntries(none, seen)).toEqual([]);
    expect(badgeCount(bellEntries({ ...none, overdueIds: ["inv7"] }, seen))).toBe(1);
  });
});
