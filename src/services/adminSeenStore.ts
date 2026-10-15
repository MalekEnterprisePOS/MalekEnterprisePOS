"use client";

import { getDoc, setDoc } from "firebase/firestore";
import { EMPTY_SEEN, mergeSeen, parseSeen, type SeenState } from "@/lib/adminSeen";
import { docRef } from "./base";

/**
 * The admin's "already seen" memory for the notification bell, shared by everything on the page that needs it.
 * It is kept in this browser straight away (so the badge clears instantly and works even if saving to the account fails) and
 * saved to the admin's own account document in the background (so it follows them to another PC or phone).
 */
const storageKey = (uid: string) => `mep.admin.seen.v1:${uid}`;

let currentUid: string | null = null;
let state: SeenState = EMPTY_SEEN;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function readLocal(uid: string): SeenState {
  try { return parseSeen(JSON.parse(localStorage.getItem(storageKey(uid)) ?? "null")); } catch { return EMPTY_SEEN; }
}
function writeLocal(uid: string, s: SeenState) {
  try { localStorage.setItem(storageKey(uid), JSON.stringify(s)); } catch { /* storage blocked: it still works for this visit */ }
}
const emit = () => listeners.forEach((l) => l());

/** Call once the signed-in admin is known. Loads what this browser remembers, then what their account remembers. */
export function initSeen(uid: string): void {
  if (!uid || uid === currentUid) return;
  currentUid = uid;
  state = readLocal(uid);
  emit();
  getDoc(docRef("adminSeen", uid)).then((snap) => {
    if (uid !== currentUid || !snap.exists()) return;
    state = mergeSeen(state, parseSeen(snap.data()));
    writeLocal(uid, state);
    emit();
  }).catch(() => undefined); // no saved copy, or not allowed yet: this browser's memory is enough
}

export const getSeen = (): SeenState => state;

export function subscribeSeen(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Changes what has been seen. The badge reacts at once; saving to the account happens a moment later. */
export function updateSeen(change: (s: SeenState) => SeenState): void {
  const next = change(state);
  if (next === state) return;
  state = next;
  emit();
  const uid = currentUid;
  if (!uid) return;
  writeLocal(uid, state);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    setDoc(docRef("adminSeen", uid), { seen: state.seen, inquiriesSeenAt: state.inquiriesSeenAt }, { merge: true }).catch(() => undefined);
  }, 700);
}
