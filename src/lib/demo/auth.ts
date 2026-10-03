/* Demo-mode replacement for "firebase/auth": any email and password signs in as an admin. */
type Listener = (u: DemoUser | null) => void;

export interface DemoUser {
  uid: string; email: string; emailVerified: boolean;
  getIdToken: () => Promise<string>;
  getIdTokenResult: () => Promise<{ claims: { admin: boolean } }>;
}

const KEY = "malek-demo-user";
const listeners = new Set<Listener>();
let current: DemoUser | null = null;

const makeUser = (email: string): DemoUser => ({ uid: "demo-admin", email, emailVerified: true, getIdToken: async () => "demo-token", getIdTokenResult: async () => ({ claims: { admin: true } }) });

if (typeof window !== "undefined") {
  const saved = window.sessionStorage.getItem(KEY);
  if (saved) current = makeUser(saved);
}

const notify = () => listeners.forEach((l) => l(current));
const auth = { get currentUser() { return current; } };

export const getAuth = () => auth;
export function onAuthStateChanged(_a: unknown, cb: Listener) {
  listeners.add(cb);
  setTimeout(() => cb(current), 150);
  return () => { listeners.delete(cb); };
}
export async function signInWithEmailAndPassword(_a: unknown, email: string) {
  await new Promise((r) => setTimeout(r, 500));
  current = makeUser(email || "admin@malek.example");
  window.sessionStorage.setItem(KEY, current.email);
  notify();
  return { user: current };
}
export async function signOut() { current = null; window.sessionStorage.removeItem(KEY); notify(); }

/* eslint-disable @typescript-eslint/no-unused-vars -- demo stand-ins keep the real function signatures */
/* Customer-portal sign-in helpers. In the demo everything "works" instantly; nothing real is contacted. */
export class GoogleAuthProvider { setCustomParameters(_p: Record<string, string>) { /* demo: nothing to configure */ } }
async function demoSignIn(email: string) {
  await new Promise((r) => setTimeout(r, 400));
  current = makeUser(email);
  window.sessionStorage.setItem(KEY, current.email);
  notify();
  return { user: current };
}
export const signInWithPopup = (_a: unknown, _p?: unknown) => demoSignIn("demo.customer@gmail.com");
export const signInWithRedirect = async (_a: unknown, _p?: unknown) => { await demoSignIn("demo.customer@gmail.com"); };
export const createUserWithEmailAndPassword = (_a: unknown, email: string, _pw?: string) => demoSignIn(email);
export const sendEmailVerification = async (..._args: unknown[]) => undefined;
export const sendPasswordResetEmail = async (..._args: unknown[]) => undefined;
