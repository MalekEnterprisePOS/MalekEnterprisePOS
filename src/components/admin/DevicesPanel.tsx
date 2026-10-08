"use client";

import { Clock, Cpu, Fingerprint, Monitor, ShieldBan, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import type { License, Terminal, TerminalStatus } from "@/types";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { devicesWithinLimit, humanizeSeconds, isOnline } from "@/lib/licensing/rules";
import { cn, errorMessage, formatDate, timeAgo } from "@/lib/utils";
import { acceptMacChange, resetDeviceIdentity, setTerminalStatus } from "@/services/terminalService";
import { useActor } from "./AuthProvider";

const COPY: Record<TerminalStatus, { title: string; text: string; label: string; danger: boolean; done: string }> = {
  DISABLED: { title: "Block this device", label: "Block", danger: true, done: "blocked", text: "The PC is told to stop at its next licence check (within minutes while it has internet). It keeps its place on the licence, and you can allow it again." },
  REVOKED: { title: "Remove this device", label: "Remove", danger: true, done: "removed", text: "The PC is unlinked and its place on the licence is freed for another PC. To use it again it has to register from scratch." },
  ACTIVE: { title: "Allow this device", label: "Allow", danger: false, done: "allowed", text: "The PC can trade again, as long as the licence is within its device limit." },
};

/** Every PC that has ever used one licence: what it is, where it is, whether it is online right now, and a way to block or remove it. */
export function DevicesPanel({ license, terminals, limit, onChanged }: { license: License; terminals: Terminal[]; limit: number; onChanged: () => void }) {
  const toast = useToast();
  const actor = useActor();
  const [target, setTarget] = useState<{ device: Terminal; to: TerminalStatus } | null>(null);
  const [identityFor, setIdentityFor] = useState<Terminal | null>(null);

  const devices = useMemo(() => terminals.filter((t) => t.licenseId === license.id && t.status !== "REVOKED")
    .sort((a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE") || (a.registeredAt ?? "").localeCompare(b.registeredAt ?? "")), [terminals, license.id]);
  const inLimit = useMemo(() => devicesWithinLimit(devices, limit), [devices, limit]);
  const active = devices.filter((d) => d.status === "ACTIVE");
  const online = active.filter((d) => isOnline(d.lastSeenAt)).length;
  const macCounts = useMemo(() => { const m = new Map<string, number>(); for (const d of devices) if (d.macAddress) m.set(d.macAddress, (m.get(d.macAddress) ?? 0) + 1); return m; }, [devices]);
  const removed = terminals.filter((t) => t.licenseId === license.id && t.status === "REVOKED").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Devices allowed", limit], ["Active devices", active.length], ["Online right now", online]].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl border border-line bg-paper/60 p-4"><p className="text-sm text-muted">{label}</p><p className="font-display text-3xl font-extrabold tabular">{value}</p></div>
        ))}
      </div>
      {active.length > limit && (
        <p role="alert" className="flex items-start gap-2 rounded-field border border-bad/30 bg-bad/10 p-3 text-sm text-[#A22B3B]"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{active.length} devices are active but only {limit} {limit === 1 ? "is" : "are"} allowed. The newest {active.length - limit} will be blocked at their next check. Raise the limit or remove a device.</span></p>
      )}
      {devices.length === 0 ? (
        <p className="rounded-field border border-dashed border-line p-6 text-center text-sm text-muted">No PC has used this licence yet. Devices appear here the first time the POS activates with the key.</p>
      ) : (
        <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
          {devices.map((d) => {
            const live = d.status === "ACTIVE" && isOnline(d.lastSeenAt);
            const over = d.status === "ACTIVE" && !inLimit.has(d.id);
            return (
              <li key={d.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-3.5">
                <span className={cn("mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl", live ? "bg-ok/12 text-ok" : "bg-ink-100 text-ink-600")}><Monitor className="h-[18px] w-[18px]" aria-hidden /></span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-900">{d.deviceName}</span>
                    <StatusBadge status={d.status} />
                    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", live ? "text-[#0B6B45]" : "text-muted")}><span className={cn("h-2 w-2 rounded-full", live ? "bg-ok" : "bg-ink-300")} aria-hidden />{live ? "Online now" : d.lastSeenAt ? `Last seen ${timeAgo(d.lastSeenAt)}` : "Never checked in"}</span>
                    {over && <span className="rounded-full border border-bad/30 bg-bad/10 px-2 py-0.5 text-xs font-semibold text-[#A22B3B]">Over the limit: blocked</span>}
                    {d.secretState === "wrong" && <span title="This PC sent a device secret that doesn't match the one it was given: the usual sign of an install copied to another PC." className="rounded-full border border-bad/30 bg-bad/10 px-2 py-0.5 text-xs font-semibold text-[#A22B3B]">Wrong device secret: possible copy</span>}
                    {d.secretState === "missing" && <span title="This PC has a device secret on file but didn't send it, which is normal for an older POS that doesn't store it yet." className="rounded-full border border-warn/40 bg-warn/15 px-2 py-0.5 text-xs font-semibold text-[#8A5200]">Identity not proven</span>}
                    {d.macChanged && <span title={`It registered with ${d.previousMac || "another MAC address"}.`} className="rounded-full border border-warn/40 bg-warn/15 px-2 py-0.5 text-xs font-semibold text-[#8A5200]">MAC changed (was {d.previousMac || "unknown"})</span>}
                    {d.macAddress && (macCounts.get(d.macAddress) ?? 0) > 1 && <span title="Another device on this licence reported the same MAC address. This is usually the same PC after a re-install, using up an extra place." className="rounded-full border border-warn/40 bg-warn/15 px-2 py-0.5 text-xs font-semibold text-[#8A5200]">Same MAC as another device</span>}
                  </div>
                  <dl className="grid gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2 lg:grid-cols-3">
                    <div className="flex gap-1.5"><dt className="inline-flex items-center gap-1"><Cpu className="h-3 w-3" aria-hidden />MAC</dt><dd className={cn("font-receipt", d.macAddress ? "text-ink-800" : "")}>{d.macAddress || "not reported"}</dd></div>
                    <div className="flex gap-1.5"><dt>Computer</dt><dd className="text-ink-800">{d.hostname || "not reported"}</dd></div>
                    <div className="flex gap-1.5"><dt>System</dt><dd className="truncate text-ink-800">{d.os || "not reported"}</dd></div>
                    <div className="flex gap-1.5"><dt>Local IP</dt><dd className="font-receipt text-ink-800">{d.localIp || "-"}</dd></div>
                    <div className="flex gap-1.5"><dt>Internet IP</dt><dd className="font-receipt text-ink-800">{d.publicIp || "-"}</dd></div>
                    <div className="flex gap-1.5"><dt>App version</dt><dd className="text-ink-800">{d.version || "-"}</dd></div>
                    <div className="flex gap-1.5"><dt>Shop</dt><dd className="text-ink-800">{d.shopName || "-"}</dd></div>
                    <div className="flex gap-1.5"><dt>Device ID</dt><dd className="font-receipt text-ink-800">{d.hardwareIdShort || "-"}</dd></div>
                    <div className="flex gap-1.5"><dt>Registered</dt><dd className="text-ink-800">{d.registeredAt ? formatDate(d.registeredAt) : "-"}</dd></div>
                    <div className="flex gap-1.5"><dt className="inline-flex items-center gap-1"><Fingerprint className="h-3 w-3" aria-hidden />Identity</dt><dd className={cn(d.secretState === "bound" ? "text-[#0B6B45]" : d.secretState === "wrong" ? "font-semibold text-[#A22B3B]" : "text-ink-800")}>{d.secretState === "bound" ? "Verified install" : d.secretState === "wrong" ? "Failed the check" : d.secretState === "missing" ? "Not proven (older POS)" : "No secret issued yet"}</dd></div>
                    <div className="flex gap-1.5"><dt className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden />PC clock</dt><dd className={cn(d.clockSkewSeconds !== null && Math.abs(d.clockSkewSeconds) > 3600 ? "font-semibold text-[#A22B3B]" : "text-ink-800")}>{d.clockSkewSeconds === null ? "not reported" : Math.abs(d.clockSkewSeconds) <= 120 ? "correct" : `${humanizeSeconds(d.clockSkewSeconds)} ${d.clockSkewSeconds > 0 ? "ahead" : "behind"}`}</dd></div>
                  </dl>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {d.macChanged && <Button size="sm" variant="ghost" onClick={async () => { try { await acceptMacChange(actor, d); toast.success("MAC change accepted."); onChanged(); } catch (e) { toast.error(errorMessage(e)); } }}>Accept MAC change</Button>}
                  {(d.secretState === "wrong" || d.secretState === "missing") && <Button size="sm" variant="ghost" onClick={() => setIdentityFor(d)}>Reset identity</Button>}
                  {d.status === "ACTIVE"
                    ? <Button size="sm" variant="ghost" className="text-[#A22B3B]" onClick={() => setTarget({ device: d, to: "DISABLED" })}><ShieldBan className="h-3.5 w-3.5" aria-hidden />Block</Button>
                    : <Button size="sm" variant="ghost" onClick={() => setTarget({ device: d, to: "ACTIVE" })}><ShieldCheck className="h-3.5 w-3.5" aria-hidden />Allow</Button>}
                  <Button size="sm" variant="ghost" aria-label={`Remove ${d.deviceName}`} onClick={() => setTarget({ device: d, to: "REVOKED" })}><Trash2 className="h-3.5 w-3.5" aria-hidden />Remove</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted">A MAC address is reported by the PC itself, so treat it as a helpful label rather than proof: the device ID is what the licence server uses to tell PCs apart.{removed > 0 ? ` ${removed} removed device${removed === 1 ? " is" : "s are"} not shown.` : ""}</p>

      <ConfirmDialog
        open={Boolean(identityFor)} title="Reset this device's identity?" tone="primary" confirmLabel="Reset identity"
        description="The PC is given a brand-new device secret at its next check, and the failed-check warning clears. Only do this if you're sure it's the genuine PC (for example it was re-installed). If you think its install was copied, block or remove it instead."
        details={identityFor ? [{ label: "Device", value: identityFor.deviceName }, { label: "MAC", value: identityFor.macAddress || "not reported" }, { label: "Check", value: identityFor.secretState }] : []}
        onClose={() => setIdentityFor(null)}
        onConfirm={async () => {
          if (!identityFor) return;
          try { await resetDeviceIdentity(actor, identityFor); toast.success("Identity reset. The PC gets a new secret at its next check."); setIdentityFor(null); onChanged(); } catch (e) { toast.error(errorMessage(e)); }
        }}
      />

      <ConfirmDialog
        open={Boolean(target)} title={target ? COPY[target.to].title : ""} tone={target && COPY[target.to].danger ? "danger" : "primary"}
        confirmLabel={target ? COPY[target.to].label : ""} description={target ? COPY[target.to].text : ""}
        details={target ? [{ label: "Device", value: target.device.deviceName }, { label: "MAC", value: target.device.macAddress || "not reported" }, { label: "Now", value: target.device.status }] : []}
        onClose={() => setTarget(null)}
        onConfirm={async () => {
          if (!target) return;
          try {
            await setTerminalStatus(actor, target.device, target.to);
            toast.success(`${target.device.deviceName} ${COPY[target.to].done}.`);
            setTarget(null);
            onChanged();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}
