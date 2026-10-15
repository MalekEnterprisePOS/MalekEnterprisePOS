"use client";

import { MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useCustomerAuth } from "@/lib/account/useCustomerAuth";

/** Blocks the portal (but not sign-out) until the email is verified - buying a plan needs a real, reachable email.
 *  It re-checks by itself every few seconds, so the page moves on the moment the link in the email is clicked. */
export function VerifyEmailGate({ email }: { email: string }) {
  const auth = useCustomerAuth();
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => { auth.refreshToken().catch(() => undefined); }, 4000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-md rounded-xl3 border border-line bg-surface p-8 text-center shadow-card">
      <MailCheck className="mx-auto mb-3 h-8 w-8 text-accent-strong" />
      <h2 className="font-display text-xl font-bold text-ink-900">Verify your email</h2>
      <p className="mt-2 text-sm text-muted">We sent a link to <strong>{email}</strong>. Open it and this page will continue by itself. Check your spam folder if you can&apos;t see it.</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button variant="secondary" loading={checking} onClick={async () => { setChecking(true); try { await auth.refreshToken(); } finally { setChecking(false); } }}>I&apos;ve verified it</Button>
        <Button variant="ghost" disabled={sent} onClick={async () => { await auth.resendVerification(); setSent(true); }}>{sent ? "Sent" : "Resend email"}</Button>
      </div>
      <button type="button" onClick={() => auth.signOut()} className="mt-5 text-xs font-medium text-muted underline underline-offset-2 hover:text-ink-800">Wrong email? Sign out</button>
    </div>
  );
}
