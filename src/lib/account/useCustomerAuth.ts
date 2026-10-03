"use client";

import { createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

export type AuthStatus = "loading" | "signed-out" | "signed-in";

/** Auth state for the CUSTOMER portal. Deliberately separate from the admin's useAuth (@/components/admin/AuthProvider) -
 *  a customer must never be checked for the admin custom claim, and an admin signing in here would just be treated
 *  as an ordinary customer with no linked account. */
export function useCustomerAuth() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) { setStatus("signed-out"); return; }
    return onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u);
      setStatus(u ? "signed-in" : "signed-out");
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
    signUp: async (email: string, password: string) => {
      const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      await sendEmailVerification(cred.user);
      return cred;
    },
    resendVerification: () => { const u = getFirebaseAuth().currentUser; return u ? sendEmailVerification(u) : Promise.resolve(); },
    resetPassword: (email: string) => sendPasswordResetEmail(getFirebaseAuth(), email),
    signOut: () => signOut(getFirebaseAuth()),
    refreshToken: async () => { await getFirebaseAuth().currentUser?.getIdToken(true); },
  };
}
