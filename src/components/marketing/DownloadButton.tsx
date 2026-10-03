"use client";

import { Download, Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";
import { useCustomerAuth } from "@/lib/account/useCustomerAuth";
import { useDownloadPolicy } from "@/lib/downloads/usePolicy";
import { isDemoMode } from "@/lib/demo/flag";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";

interface Props { releaseId: string; fileId?: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; children?: ReactNode; icon?: boolean }

/**
 * Downloads never link straight to a file. The button asks the server for a ticket that works for five minutes
 * and then follows it, so there is no permanent file address for anyone to copy, scrape or share.
 * When the admin has switched on "Require sign-in to download", signed-out visitors see "Sign in to download" instead,
 * and the ticket request carries their sign-in so the server can check it (the server enforces this, not the button).
 */
export function DownloadButton({ releaseId, fileId, variant = "primary", size = "md", className, children = "Download", icon = true }: Props) {
  const auth = useCustomerAuth();
  const policy = useDownloadPolicy();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);

  const gated = !isDemoMode && (policy.requireLogin || needsLogin) && auth.status === "signed-out";

  async function start() {
    if (isDemoMode) { setState("error"); setMessage("Demo mode: no real files to download."); return; }
    setState("busy"); setMessage("");
    try {
      const user = getFirebaseAuth().currentUser;
      const token = user ? await user.getIdToken() : null;
      const res = await fetch("/api/download/ticket", {
        method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ releaseId, fileId }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string; code?: string };
      if (json.code === "login_required") { setNeedsLogin(true); setState("idle"); return; }
      if (!res.ok || !json.url) throw new Error(json.error ?? "Couldn't start the download.");
      window.location.assign(json.url);
      window.setTimeout(() => setState("idle"), 2500);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Couldn't start the download.");
    }
  }

  if (gated) {
    return (
      <span className="inline-flex flex-col items-start gap-1.5">
        <Link href={`/login?next=${encodeURIComponent("/download")}`} className={cn(buttonClasses(variant, size), className)}><LogIn className="h-4 w-4" aria-hidden />Sign in to download</Link>
        <span className="text-xs text-muted">Free to sign in with Google or email.</span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      <button type="button" onClick={start} disabled={state === "busy"} aria-busy={state === "busy"} className={cn(buttonClasses(variant, size), className)}>
        {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon ? <Download className="h-4 w-4" aria-hidden /> : null}
        {children}
      </button>
      {state === "error" && <span role="alert" className="max-w-xs text-xs font-medium text-[#A22B3B]">{message}</span>}
    </span>
  );
}
