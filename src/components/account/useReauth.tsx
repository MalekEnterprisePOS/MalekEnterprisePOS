"use client";

import { ShieldCheck } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { AccountApiError } from "@/lib/account-client";
import { confirmIdentity, signInMethod } from "@/lib/account/reauth";

/** Thrown when the person closes the "confirm it's you" box. Callers should ignore it quietly. */
export class CancelledError extends Error { constructor() { super("Cancelled"); } }

interface Pending { retry: () => void; cancel: () => void }

/**
 * For actions the server only allows right after a fresh sign-in (removing a device, replacing the key).
 *   const { attempt, dialog } = useReauth();
 *   await attempt(() => accountFetch(...));   // if the server says "confirm it's you", a box appears, then it retries by itself
 * Render {dialog} once in the component.
 */
export function useReauth(): { attempt: <T>(fn: () => Promise<T>) => Promise<T>; dialog: ReactNode } {
  const [pending, setPending] = useState<Pending | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const attempt = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    const run = () => fn().then(resolve).catch((err: unknown) => {
      if (err instanceof AccountApiError && err.code === "reauth_required") {
        setPassword(""); setError("");
        // After one confirmation the retry must work; a second "reauth_required" is a real problem, so it is shown instead of looping.
        setPending({ retry: () => fn().then(resolve, reject), cancel: () => reject(new CancelledError()) });
      } else reject(err);
    });
    void run();
  }), []);

  const submit = async () => {
    if (!pending) return;
    setBusy(true); setError("");
    try {
      await confirmIdentity(password);
      const p = pending;
      setPending(null); setPassword("");
      p.retry();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't confirm it's you.");
    } finally {
      setBusy(false);
    }
  };

  const google = signInMethod() === "google";
  const dialog = pending ? (
    <Modal open onClose={() => { if (!busy) { pending.cancel(); setPending(null); } }} title="Confirm it's you" size="sm"
      description="This change affects your licence, so we need to check it's really you."
      footer={<><Button variant="secondary" disabled={busy} onClick={() => { pending.cancel(); setPending(null); }}>Cancel</Button><Button variant="dark" loading={busy} onClick={submit}>{google ? "Continue with Google" : "Confirm"}</Button></>}>
      <div className="space-y-4">
        <p className="flex items-start gap-2 text-sm text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden />{google ? "A Google window will open. Choose the same account you signed in with." : "Enter your password to continue."}</p>
        {!google && <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} data-autofocus />}
        {error && <p role="alert" className="rounded-field bg-bad/10 p-3 text-sm text-[#A22B3B]">{error}</p>}
      </div>
    </Modal>
  ) : null;

  return { attempt, dialog };
}
