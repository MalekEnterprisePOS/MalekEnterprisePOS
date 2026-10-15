"use client";

import { Copy, KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { accountFetch } from "@/lib/account-client";
import { formatDate, timeAgo } from "@/lib/utils";
import type { PortalLicense, PortalSecurity } from "./types";
import { CancelledError, useReauth } from "./useReauth";

/** How the account is protected, plus the one big emergency button: replace the licence key. */
export function SecurityCard({ email, security, license, deviceCount, onChanged }: { email: string; security: PortalSecurity; license: PortalLicense | undefined; deviceCount: number; onChanged: () => void }) {
  const toast = useToast();
  const { attempt, dialog } = useReauth();
  const [confirm, setConfirm] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const cooldown = license?.regenerateAvailableAt ?? null;

  return (
    <div className="rounded-xl3 border border-line bg-surface p-6 shadow-card">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-ink-900 text-accent"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
        <div><h2 className="font-display text-lg font-bold text-ink-900">Account security</h2><p className="text-sm text-muted">Who can reach your licence, and what to do if a key gets out.</p></div>
      </div>

      <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs uppercase tracking-wide text-muted">Signed in as</dt><dd className="mt-0.5 break-all font-semibold text-ink-900">{email}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-muted">Sign-in method</dt><dd className="mt-0.5 font-semibold text-ink-900">{security.provider === "google.com" ? "Google" : security.provider === "password" ? "Email and password" : "Unknown"}{security.emailVerified ? ", email verified" : ", email NOT verified"}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-muted">Last sign-in</dt><dd className="mt-0.5 font-semibold text-ink-900">{security.lastLoginAt ? timeAgo(security.lastLoginAt) : "This is your first"} <span className="font-normal text-muted">({security.loginCount} in total)</span></dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-muted">Connected devices</dt><dd className="mt-0.5 font-semibold text-ink-900">{deviceCount}</dd></div>
      </dl>

      {license?.flagged && (
        <p role="alert" className="mt-5 flex items-start gap-2 rounded-field border border-bad/30 bg-bad/10 p-3 text-sm text-[#A22B3B]"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span><strong>Your licence is paused for a security review.</strong> {license.flagReason || "A PC's clock was set backward."} Contact support to have it checked and cleared.</span></p>
      )}

      <ul className="mt-5 list-disc space-y-1.5 pl-5 text-sm text-muted">
        <li>Your licence key is like a password. Only type it into the POS on your own PCs.</li>
        <li>Each PC gets its own private secret when it activates, so a copied install can&apos;t pass as the original.</li>
        <li>A PC whose date and time is wrong by more than {security.clockToleranceMinutes >= 1440 ? `${Math.round(security.clockToleranceMinutes / 1440)} day${security.clockToleranceMinutes >= 2880 ? "s" : ""}` : `${security.clockToleranceMinutes} minutes`} is stopped, so expiry dates can&apos;t be dodged. Switch on automatic date and time.</li>
        <li>Removing a device or replacing the key needs you to confirm your password (or Google account) again, and we email you each time.</li>
      </ul>

      {license && !license.revoked && (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="font-semibold text-ink-900">Think your key was shared or copied?</h3>
          <p className="mt-1 text-sm text-muted">Generate a new key. The old one stops working at once, on every PC. Your PCs keep their places, and you just type the new key into each one.</p>
          <Button className="mt-3" variant="secondary" disabled={Boolean(cooldown) || Boolean(license.flagged)} onClick={() => setConfirm(true)}><KeyRound className="h-4 w-4" aria-hidden />Generate a new licence key</Button>
          {cooldown && <p className="mt-2 text-xs text-muted">You replaced the key recently. You can do it again from {formatDate(cooldown)}, or contact support.</p>}
        </div>
      )}

      {newKey && (
        <div role="status" className="mt-5 rounded-field border border-ok/30 bg-ok/10 p-4 text-sm">
          <p className="font-semibold text-[#0F6E48]">Your new licence key</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded-md bg-white px-3 py-2 font-receipt text-[13px] text-ink-900 ring-1 ring-line">{newKey}</code>
            <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(newKey).then(() => toast.success("Copied.")); }}><Copy className="h-3.5 w-3.5" aria-hidden />Copy</Button>
          </div>
          <p className="mt-2 text-muted">The old key no longer works. Enter this one on each PC. It stays available above under Show key.</p>
        </div>
      )}

      <ConfirmDialog
        open={confirm} title="Generate a new licence key?" tone="danger" confirmLabel="Replace my key"
        description="The old key stops working immediately, so every PC will be refused at its next check until you enter the new key. You can only do this once every 24 hours. We'll ask you to confirm it's you, and email you a notice."
        details={license ? [{ label: "Current key", value: `${license.tokenPrefix}...` }, { label: "PCs affected", value: String(deviceCount) }] : []}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          if (!license) return;
          try {
            const r = await attempt(() => accountFetch<{ token: string }>("/api/account/licenses/regenerate", { licenseId: license.id }));
            setNewKey(r.token); setConfirm(false);
            toast.success("New key generated.");
            onChanged();
          } catch (e) {
            if (e instanceof CancelledError) return;
            toast.error(e instanceof Error ? e.message : "Couldn't generate a new key.");
          }
        }}
      />
      {dialog}
    </div>
  );
}
