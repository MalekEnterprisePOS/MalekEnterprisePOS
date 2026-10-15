import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import type { AdminActor, SetupGuide } from "@/types";
import { mapSetupGuide, type Data } from "@/lib/mappers";
import { getDb } from "@/lib/firebase/client";
import { auditEntry } from "./auditService";
import { col, docRef, commitBatch } from "./base";

export async function getSetupGuide(): Promise<SetupGuide> {
  const snap = await getDoc(docRef("settings", "setup"));
  return mapSetupGuide(snap.exists() ? (snap.data() as Data) : null);
}

/** Saves the public /setup page. settings/setup is readable by anyone (it is public content), writable only by admins. */
export async function saveSetupGuide(actor: AdminActor, g: Omit<SetupGuide, "updatedAt">): Promise<void> {
  const batch = writeBatch(getDb());
  batch.set(docRef("settings", "setup"), {
    headline: g.headline.trim(), intro: g.intro.trim(), contactNote: g.contactNote.trim(), whatsapp: g.whatsapp.replace(/\D/g, ""), videoUrl: g.videoUrl.trim(),
    steps: g.steps.map((s) => ({ title: s.title.trim(), body: s.body.trim() })).filter((s) => s.title || s.body),
    help: g.help.map((h) => ({ question: h.question.trim(), answer: h.answer.trim() })).filter((h) => h.question && h.answer),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(col("auditLogs")), auditEntry(actor, { action: "setup.updated", targetType: "settings", targetId: "setup", targetLabel: "Setup guide" }));
  await commitBatch(batch);
}
