"use client";

import { useEffect, useState } from "react";
import { isDemoMode } from "@/lib/demo/flag";

let cached: Promise<boolean> | null = null;

/** Asks the server whether downloads need a sign-in. Fetched once per page load; fails open to "no" only for the UI hint
 *  (the server enforces the real rule when the ticket is requested). */
export function useDownloadPolicy(): { requireLogin: boolean; ready: boolean } {
  const [state, setState] = useState<{ requireLogin: boolean; ready: boolean }>({ requireLogin: false, ready: isDemoMode });
  useEffect(() => {
    if (isDemoMode) return;
    cached ??= fetch("/api/public-config", { cache: "no-store" }).then((r) => r.json()).then((j) => j?.downloadRequiresLogin === true).catch(() => false);
    let live = true;
    cached.then((requireLogin) => { if (live) setState({ requireLogin, ready: true }); });
    return () => { live = false; };
  }, []);
  return state;
}
