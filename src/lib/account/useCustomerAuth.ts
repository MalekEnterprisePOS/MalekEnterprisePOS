"use client";

import { createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, updateProfile, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { isDemoMode } from "@/lib/demo/flag";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import type { Profile } from "./profile";

export type AuthStatus = "loading" | "signed-out" | "signed-in";

export type SignUpDetails = Pick<Profile, "name" | "businessName" | "phone">;

/** Details typed on the sign-up form, handed to the one "session" call that follows the sign-in. */
let pendingSignup: SignUpDetails | null = null;

const sessionKey = (uid: string) => `mep.session.v1:${uid}`;

/**
 * Tells the server a person has signed in, once per browser session, so the admin's Users page can show who has signed
 * up, when they last logged in and how often. It never blocks or breaks sign-in: a failure is logged and retried next time.
 */
async function recordSession(user: User): Promise<void> {
  if (isDemoMode) return;
  const key = sessionKey(user.uid);
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1"); // set before the network call so several components can't double-count
  } catch { /* storage blocked: we may count a few extra page loads, which is harmless */ }
  const details = pendingSignup;
  pendingSignup = null;
  try {
    const token = await user.getIdToken();
    const res = await fetch("/api/account/session", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(details ?? {}), keepalive: true });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.warn("[account] couldn't record the sign-in:", e);
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
    if (details) pendingSignup = details;
  }
}

/** Auth state for the CUSTOMER portal. Deliberately separate from the admin's useAuth (@/components/admin/AuthProvider) -
 *  a customer must never be checked for the admin custom claim, and an admin signing in here would just be treated
 *  as an ordinary customer with no linked account. */
export function useCustomerAuth() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!isFirebaseConfigured) { setStatus("signed-out"); return; }
    return onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u);
      setStatus(u ? "signed-in" : "signed-out");
      if (u) void recordSession(u);
    });
  }, []);

  return {
    status, user, emailVerified: user?.emailVerified ?? false,
    signIn: (email: string, password: string) => signInWithEmailAndPassword(getFirebaseAuth(), email, password),
    // Google's own emailVerified is always true, so this account skips straight past VerifyEmailGate.
    // Requires the Google provider to be switched on in Firebase Console -> Authentication -> Sign-in method,
    // and this site's domain to be listed under Authentication -> Settings -> Authorized domains.
    signInWithGoogle: async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        return await signInWithPopup(getFirebaseAuth(), provider);
      } catch (e) {
        // Some phones / in-app browsers block popups: fall back to a full-page redirect (onAuthStateChanged picks the result up).
        if ((e as { code?: string }).code === "auth/popup-blocked") { await signInWithRedirect(getFirebaseAuth(), provider); return null; }
        throw e;
      }
    },
    /** Creates the account, remembers the name / shop / phone from the form, and sends the verification email. */
    signUp: async (email: string, password: string, details?: SignUpDetails) => {
      if (details) pendingSignup = details; // read by recordSession() as soon as the new user is signed in
      const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      if (details?.name) await updateProfile(cred.user, { displayName: details.name }).catch(() => undefined);
      await sendEmailVerification(cred.user);
      return cred;
    },
    resendVerification: () => { const u = getFirebaseAuth().currentUser; return u ? sendEmailVerification(u) : Promise.resolve(); },
    resetPassword: (email: string) => sendPasswordResetEmail(getFirebaseAuth(), email),
    signOut: () => {
      const u = getFirebaseAuth().currentUser;
      if (u) { try { sessionStorage.removeItem(sessionKey(u.uid)); } catch { /* ignore */ } }
      return signOut(getFirebaseAuth());
    },
    /** Re-reads the account from Firebase (so a just-clicked verification link is noticed) and refreshes the token. */
    refreshToken: async () => {
      const current = getFirebaseAuth().currentUser;
      if (!current) return;
      await current.reload();
      await current.getIdToken(true);
      setUser(getFirebaseAuth().currentUser);
      bump((n) => n + 1);
    },
  };
}
