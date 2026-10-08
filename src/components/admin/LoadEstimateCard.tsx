"use client";

import { Gauge } from "lucide-react";
import { useMemo, useState } from "react";
import type { License, Terminal } from "@/types";
import { TextField } from "@/components/ui/Field";
import { FREE_DAILY_READS, FREE_DAILY_WRITES, estimateLoad } from "@/lib/licensing/load";
import { cn } from "@/lib/utils";

const n = (v: number) => v.toLocaleString("en-ZA");

/** Shows the admin what the current check and recording settings cost in database work per day, today and for a bigger business. */
export function LoadEstimateCard({ licenses, terminals, checkIntervalMinutes, activityWriteMinutes }: { licenses: License[]; terminals: Terminal[]; checkIntervalMinutes: number; activityWriteMinutes: number }) {
  const [shops, setShops] = useState("100");
  const [tills, setTills] = useState("4");

  const devicesPerLicence = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of terminals) if (t.status === "ACTIVE") counts.set(t.licenseId, (counts.get(t.licenseId) ?? 0) + 1);
    return licenses.filter((l) => !l.revoked && counts.has(l.id)).map((l) => counts.get(l.id)!);
  }, [licenses, terminals]);

  const now = useMemo(() => estimateLoad({ devicesPerLicence, checkIntervalMinutes, activityWriteMinutes }), [devicesPerLicence, checkIntervalMinutes, activityWriteMinutes]);
  const shopCount = Math.max(0, Math.min(100_000, Math.floor(Number(shops) || 0)));
  const tillCount = Math.max(1, Math.min(200, Math.floor(Number(tills) || 1)));
  const scenario = useMemo(() => estimateLoad({ devicesPerLicence: Array.from({ length: Math.min(shopCount, 20_000) }, () => tillCount + 1), checkIntervalMinutes, activityWriteMinutes }), [shopCount, tillCount, checkIntervalMinutes, activityWriteMinutes]);
  const scale = shopCount > 20_000 ? shopCount / 20_000 : 1; // very large inputs are scaled instead of looped
  const sc = { reads: Math.round(scenario.readsPerDay * scale), writes: Math.round(scenario.writesPerDay * scale), requests: Math.round(scenario.requestsPerDay * scale), noThrottle: Math.round(scenario.writesWithoutThrottle * scale), noBatch: Math.round(scenario.readsWithoutBatching * scale) };

  const bar = (value: number, free: number) => (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100" role="img" aria-label={`${Math.round((value / free) * 100)}% of the free daily allowance`}>
      <div className={cn("h-full rounded-full", value > free ? "bg-bad" : value > free * 0.7 ? "bg-warn" : "bg-ok")} style={{ width: `${Math.min(100, (value / free) * 100)}%` }} />
    </div>
  );

  return (
    <section className="panel space-y-5 p-5" aria-labelledby="load-heading">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-900 text-accent"><Gauge className="h-[18px] w-[18px]" aria-hidden /></span>
        <div>
          <h2 id="load-heading" className="text-base font-semibold">Database load from licence checks</h2>
          <p className="text-sm text-muted">What the settings above cost per day. Checks happen at random moments, on average every {Math.round(now.avgWaitSeconds)} seconds. A shop&apos;s server PC checks all its tills in one request. The free Firestore allowance is {n(FREE_DAILY_READS)} reads and {n(FREE_DAILY_WRITES)} writes a day; beyond that it is charged per operation.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-paper/60 p-4"><p className="text-sm text-muted">Requests a day</p><p className="font-display text-2xl font-extrabold tabular">{n(now.requestsPerDay)}</p><p className="text-xs text-muted">{n(now.checksPerDay)} PC checks, {devicesPerLicence.length} licence{devicesPerLicence.length === 1 ? "" : "s"} online</p></div>
        <div className="rounded-2xl border border-line bg-paper/60 p-4"><p className="text-sm text-muted">Reads a day</p><p className="font-display text-2xl font-extrabold tabular">{n(now.readsPerDay)}</p>{bar(now.readsPerDay, FREE_DAILY_READS)}{now.readsWithoutBatching > now.readsPerDay && <p className="mt-1 text-xs text-muted">{n(now.readsWithoutBatching)} without one-request checking</p>}</div>
        <div className="rounded-2xl border border-line bg-paper/60 p-4"><p className="text-sm text-muted">Writes a day</p><p className="font-display text-2xl font-extrabold tabular">{n(now.writesPerDay)}</p>{bar(now.writesPerDay, FREE_DAILY_WRITES)}<p className="mt-1 text-xs text-muted">{n(now.writesWithoutThrottle)} without the recording limit</p></div>
      </div>

      <div className="rounded-2xl border border-dashed border-line p-4">
        <p className="mb-3 text-sm font-semibold text-ink-800">What if I had more customers?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Shops (each with its own licence)" type="number" min={0} inputMode="numeric" value={shops} onChange={(e) => setShops(e.target.value)} />
          <TextField label="Client tills per shop (besides the server PC)" type="number" min={1} max={200} inputMode="numeric" value={tills} onChange={(e) => setTills(e.target.value)} />
        </div>
        <p className="mt-3 text-sm text-ink-800" aria-live="polite">
          About <strong>{n(sc.requests)}</strong> requests, <strong>{n(sc.reads)}</strong> reads and <strong>{n(sc.writes)}</strong> writes a day
          {sc.noThrottle > sc.writes ? <> (recording limit saves about {n(sc.noThrottle - sc.writes)} writes)</> : null}.
        </p>
        <p className="mt-1 text-xs text-muted">Checking a shop&apos;s tills together means reads grow in step with the number of PCs, not with its square.{sc.noBatch > sc.reads ? ` Checking each till separately would have been about ${n(sc.noBatch)} reads.` : ""}</p>
      </div>
    </section>
  );
}
