"use client";

import { Clock, Monitor, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { accountFetch } from "@/lib/account-client";
import { humanizeSeconds } from "@/lib/licensing/rules";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import type { PortalDevice, PortalLicense, PortalSecurity } from "./types";
import { CancelledError, useReauth } from "./useReauth";

/** Every PC using the licence, whether it is online, whether its clock is right, and a way to remove one to free its place. */
export function DevicesCard({ devices, license, security, onChanged }: { devices: PortalDevice[]; license: PortalLicense | undefined; security: PortalSecurity; onChanged: () => void }) {
  const toast = useToast();
  const { attempt, dialog } = useReauth();
  const [target, setTarget] = useState<PortalDevice | null>(null);
  const live = devices.filter((d) => d.status === "ACTIVE");
  const allowance = license?.removals;
  const canRemove = Boolean(license) && !license?.flagged && !license?.revoked && security.selfRemovalsPer30Days > 0 && (allowance?.left ?? 0) > 0;
  const whyNot = !license ? "" : license.flagged ? "Devices can't be removed while the licence is under a security review. Contact support."
    : security.selfRemovalsPer30Days <= 0 ? "Removing devices yourself is switched off. Contact support and we'll do it for you."
    : (allowance?.left ?? 0) <= 0 ? `You've used all ${allowance?.perWindow} removals for the last 30 days${allowance?.nextAvailableAt ? `. The next one opens on ${formatDate(allowance.nextAvailableAt)}` : ""}. Contact support to remove one sooner.` : "";

  return (
    <div className="rounded-xl3 border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div>
          <h2 className="font-display text-lg font-bold text-ink-900">Your devices</h2>
          <p className="text-sm text-muted">{license ? `${live.length} of ${license.deviceLimit} places in use` : "PCs appear here after they activate with your licence key."}</p>
        </div>
        {license && allowance && security.selfRemovalsPer30Days > 0 && <p className="text-xs text-muted">You can remove {allowance.left} more device{allowance.left === 1 ? "" : "s"} yourself in the next 30 days.</p>}
      </div>
      {devices.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-muted">No PC has used your licence yet. Install the software, then paste your licence key when it asks.</p>
      ) : (
        <ul className="divide-y divide-line">
          {devices.map((d) => {
            const skew = d.clockSkewSeconds;
            const clockBad = skew !== null && security.clockToleranceMinutes > 0 && Math.abs(skew) > security.clockToleranceMinutes * 60;
            return (
              <li key={d.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-6 py-4">
                <span className={cn("mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl", d.online ? "bg-ok/12 text-ok" : "bg-ink-100 text-ink-600")}><Monitor className="h-5 w-5" aria-hidden /></span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-900">{d.deviceName || "(unnamed)"}</span>
                    <StatusBadge status={d.status} />
                    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", d.online ? "text-[#0B6B45]" : "text-muted")}><span className={cn("h-2 w-2 rounded-full", d.online ? "bg-ok" : "bg-ink-300")} aria-hidden />{d.online ? "Connected now" : d.lastSeenAt ? `Last seen ${timeAgo(d.lastSeenAt)}` : "Never connected"}</span>
                  </div>
                  <p className="text-xs text-muted">{[d.hostname, d.os, d.version && `app ${d.version}`].filter(Boolean).join(", ") || "Details not reported yet"}</p>
                  <p className="text-xs text-muted">MAC address <span className="font-receipt text-ink-800">{d.macAddress || "not reported"}</span></p>
                  <p className={cn("flex items-center gap-1.5 text-xs", clockBad ? "font-semibold text-[#A22B3B]" : "text-muted")}>
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {skew === null ? "Clock: not reported" : clockBad ? `Clock is wrong by about ${humanizeSeconds(skew)}. This PC is blocked until it is corrected.` : Math.abs(skew) <= 120 ? "Clock: correct" : `Clock: ${humanizeSeconds(skew)} ${skew > 0 ? "ahead" : "behind"} (within the allowed range)`}
                  </p>
                  {d.macChanged && <p className="flex items-center gap-1.5 text-xs font-semibold text-[#8A5200]"><TriangleAlert className="h-3.5 w-3.5" aria-hidden />This PC&apos;s network card changed since it was activated. That&apos;s normal after a repair; if you don&apos;t expect it, remove the PC and generate a new key.</p>}
                  {d.status === "DISABLED" && <p className="text-xs text-muted">Blocked by the administrator. Contact support.</p>}
                </div>
                {d.status === "ACTIVE" && (
                  <Button size="sm" variant="ghost" className="text-[#A22B3B]" disabled={!canRemove} title={canRemove ? undefined : whyNot} onClick={() => setTarget(d)}><Trash2 className="h-3.5 w-3.5" aria-hidden />Remove</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {whyNot && live.length > 0 && <p className="border-t border-line px-6 py-3 text-xs text-muted">{whyNot}</p>}

      <ConfirmDialog
        open={Boolean(target)} title="Remove this device?" tone="danger" confirmLabel="Remove device"
        description={`This PC stops working at its next licence check and its place is freed for another PC. You can activate it again later with your licence key. You can remove ${allowance?.left ?? 0} more device${allowance?.left === 1 ? "" : "s"} in the next 30 days. We'll ask you to confirm it's you, and email you a notice.`}
        details={target ? [{ label: "Device", value: target.deviceName }, { label: "MAC", value: target.macAddress || "not reported" }, { label: "Last seen", value: target.lastSeenAt ? timeAgo(target.lastSeenAt) : "never" }] : []}
        onClose={() => setTarget(null)}
        onConfirm={async () => {
          if (!target) return;
          try {
            await attempt(() => accountFetch("/api/account/devices/remove", { terminalId: target.id }));
            toast.success(`${target.deviceName} was removed.`);
            setTarget(null);
            onChanged();
          } catch (e) {
            if (e instanceof CancelledError) return;
            toast.error(e instanceof Error ? e.message : "Couldn't remove that device.");
          }
        }}
      />
      {dialog}
    </div>
  );
}
