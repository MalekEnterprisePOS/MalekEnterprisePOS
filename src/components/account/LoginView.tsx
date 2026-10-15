"use client";

import { CreditCard, Download, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CardsSkeleton } from "@/components/ui/States";
import { safeNext } from "@/lib/account/safeNext";
import { useCustomerAuth } from "@/lib/account/useCustomerAuth";
import { AuthGate } from "./AuthGate";

const PERKS = [
  { icon: KeyRound, title: "Your licence, instantly", text: "Pay once and your licence key appears here automatically. No waiting for an email." },
  { icon: CreditCard, title: "Pay by card in a minute", text: "Settle invoices online. We verify the payment and keep your tills running." },
  { icon: Download, title: "Download & update", text: "Get the latest installer for the server and every till." },
  { icon: ShieldCheck, title: "Secure by design", text: "Sign in with Google or email. Only you see your invoices and keys." },
];

export function LoginView() {
  const auth = useCustomerAuth();
  const router = useRouter();
  const [next, setNext] = useState("/account");
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setNext(safeNext(q.get("next")));
    if (q.get("mode") === "signup") setMode("signup");
  }, []);

  useEffect(() => {
    // Verified users go where they were headed. Unverified users land on the account page, which shows the "verify your email" step.
    if (auth.status === "signed-in") router.replace(auth.emailVerified ? next : "/account");
  }, [auth.status, auth.emailVerified, next, router]);

  if (auth.status === "loading" || auth.status === "signed-in") return <CardsSkeleton count={2} />;

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-6">
        <div>
          <h2 className="display-wide text-2xl font-bold text-ink-900">Welcome to Malek Enterprise POS</h2>
          <p className="mt-2 max-w-md text-[15px] text-muted">{mode === "signup" ? "Create your free account, then pick a plan to get your licence." : "Sign in to manage your plan, pay invoices and download the software."}</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {PERKS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-xl3 border border-line bg-surface p-4 shadow-card">
              <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-accent/20 text-accent-strong"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
              <p className="font-semibold text-ink-900">{title}</p>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Shop staff? The back-office is at <Link href="/admin/login" className="underline underline-offset-2 hover:text-ink-800">admin sign-in</Link>.</p>
      </div>
      <AuthGate key={mode} initialMode={mode} />
    </div>
  );
}
