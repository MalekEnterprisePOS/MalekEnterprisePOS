"use client";

import { Copy, Eye, EyeOff, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { accountFetch } from "@/lib/account-client";
import { daysBetween, todayISO } from "@/lib/dates";
import { formatDate } from "@/lib/utils";

interface LicenseRow { id: string; tokenPrefix: string; state: string; expiryDate: string; terminalLimit: number; revoked: boolean; lastVerifiedAt: string | null; flagged?: boolean; deviceLimit?: number; devicesInUse?: number }

const STATE_NOTE: Record<string, string> = {
  ACTIVE: "This licence is valid and your tills can check in normally.",
  GRACE: "Your subscription payment is overdue. Tills keep working for now, but will stop once the grace period ends - pay the invoice below to clear this.",
  EXPIRED: "This licence's date has passed and the grace period has ended. Tills using it are now blocked until it's renewed.",
  SUSPENDED: "Your subscription is suspended or cancelled, so this licence doesn't allow tills to operate.",
  REVOKED: "This licence was revoked by an admin and can no longer be used.",
};

/** Shows the licence status always; the full key only after the owner explicitly asks (and re-proves it's them via requireUser on the server). */
export function LicenseCard({ license, autoReveal = false }: { license: LicenseRow; autoReveal?: boolean }) {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const effectiveState = license.revoked ? "REVOKED" : license.state;

  const daysLeft = daysBetween(todayISO(), license.expiryDate);

  const reveal = async () => {
    if (token) return setToken(null);
    setBusy(true);
    try {
      const r = await accountFetch<{ token: string }>("/api/account/licenses/reveal", { licenseId: license.id });
      setToken(r.token);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't show that key.");
    } finally {
      setBusy(false);
    }
  };

  // Right after a successful payment the key is shown without anyone having to ask for it.
  useEffect(() => {
    if (!autoReveal || license.revoked) return;
    accountFetch<{ token: string }>("/api/account/licenses/reveal", { licenseId: license.id }).then((r) => setToken(r.token)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReveal, license.id]);

  return (
    <div className={`rounded-xl3 border bg-surface p-6 shadow-card ${autoReveal ? "border-ok/40 ring-1 ring-ok/30" : "border-line"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-accent-strong" /><span className="font-display font-bold text-ink-900">Licence {license.tokenPrefix}...</span></div>
        <StatusBadge status={effectiveState} />
      </div>
      {license.flagged && !license.revoked && (
        <p role="alert" className="mt-2 rounded-field border border-bad/30 bg-bad/10 p-3 text-sm text-[#A22B3B]"><strong>Temporarily blocked for a security review.</strong> Your tills can&apos;t trade until we clear it, usually because a PC&apos;s clock was changed. Please contact support and we&apos;ll sort it out quickly.</p>
      )}
      {!license.flagged && STATE_NOTE[effectiveState] && <p className="mt-2 text-sm text-muted">{STATE_NOTE[effectiveState]}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-muted">Devices in use</dt><dd className="font-semibold text-ink-800">{license.devicesInUse ?? 0} of {license.deviceLimit ?? license.terminalLimit}</dd></div>
        <div><dt className="text-muted">Expires</dt><dd className="font-semibold text-ink-800">{formatDate(license.expiryDate)}</dd></div>
        <div><dt className="text-muted">Time left</dt><dd className={`font-semibold ${license.revoked || daysLeft < 0 ? "text-[#A22B3B]" : daysLeft <= 14 ? "text-[#8A5200]" : "text-ink-800"}`}>{license.revoked ? "Revoked" : daysLeft < 0 ? `Expired ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago` : daysLeft === 0 ? "Expires today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`}</dd></div>
        <div><dt className="text-muted">Last check-in</dt><dd className="font-semibold text-ink-800">{license.lastVerifiedAt ? formatDate(license.lastVerifiedAt) : "Not yet"}</dd></div>
      </dl>
      {!license.revoked && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button variant="secondary" size="sm" loading={busy} onClick={reveal}>
            {token ? <><EyeOff className="h-4 w-4" /> Hide key</> : <><Eye className="h-4 w-4" /> Show key</>}
          </Button>
          {token && (
            <>
              <code className="rounded-field bg-ink-100 px-3 py-1.5 font-mono text-sm text-ink-900">{token}</code>
              <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(token); toast.success("Copied."); }}><Copy className="h-4 w-4" /> Copy</Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
