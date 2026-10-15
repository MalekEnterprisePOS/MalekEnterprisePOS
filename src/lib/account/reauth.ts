"use client";

import { EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

/** How this person signs in, so the confirmation asks for the right thing. */
export function signInMethod(): "google" | "password" {
  const user = getFirebaseAuth().currentUser;
  return user?.providerData.some((p) => p.providerId === "google.com") ? "google" : "password";
}

/**
 * Proves the person at the keyboard is the account owner right now (their password, or a fresh Google sign-in), then refreshes
 * the session so the server sees a brand-new sign-in time. Throws a plain-English error if the password is wrong.
 */
export async function confirmIdentity(password?: string): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user || !user.email) throw new Error("Sign in to continue.");
  try {
    if (signInMethod() === "google") await reauthenticateWithPopup(user, new GoogleAuthProvider());
    else await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password ?? ""));
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (code === "auth/wrong-password" || code === "auth/invalid-credential" || code === "auth/invalid-login-credentials") throw new Error("That password isn't right.");
    if (code === "auth/too-many-requests") throw new Error("Too many attempts. Wait a few minutes and try again.");
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") throw new Error("The Google window was closed before you confirmed.");
    if (code === "auth/missing-password" || password === "") throw new Error("Enter your password.");
    throw new Error("Couldn't confirm it's you. Try again.");
  }
  await user.getIdToken(true);
}
