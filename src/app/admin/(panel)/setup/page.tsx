"use client";

import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useActor } from "@/components/admin/AuthProvider";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { useAsyncData } from "@/hooks/useAsyncData";
import { errorMessage } from "@/lib/utils";
import { getSetupGuide, saveSetupGuide } from "@/services/setupService";
import type { SetupGuide } from "@/types";

type Draft = Omit<SetupGuide, "updatedAt">;

const move = <T,>(xs: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= xs.length) return xs;
  const copy = [...xs];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
};

export default function SetupGuidePage() {
  const actor = useActor();
  const toast = useToast();
  const { data, loading, error, reload } = useAsyncData(getSetupGuide, []);
  const [d, setD] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) { const { updatedAt: _ignored, ...rest } = data; void _ignored; setD(rest); } }, [data]);

  const header = (
    <PageHeader title="Setup guide" description="The public page customers read to get started. Edit the steps and help answers here and the website updates within a minute."
      actions={<><a href="/setup" target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-field border border-line bg-surface px-4 text-sm font-semibold text-ink-900 shadow-sm hover:bg-paper"><ExternalLink className="h-4 w-4" aria-hidden />View page</a><Button variant="dark" loading={saving} disabled={!d} onClick={save}>Save guide</Button></>} />
  );

  async function save() {
    if (!d) return;
    if (d.videoUrl.trim() && !/^https:\/\//.test(d.videoUrl.trim())) return toast.error("The video link must start with https://");
    if (d.steps.filter((s) => s.title.trim() || s.body.trim()).length === 0) return toast.error("Add at least one step.");
    setSaving(true);
    try { await saveSetupGuide(actor, d); toast.success("Setup guide saved."); reload(); } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  }

  if (error) return <>{header}<ErrorState title="Couldn't load the setup guide" error={error} onRetry={reload} /></>;
  if ((loading && !d) || !d) return <>{header}<Skeleton className="h-96" /></>;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => (p ? { ...p, [k]: v } : p));

  return (
    <>
      {header}
      <div className="space-y-5">
        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <TextField label="Page heading" value={d.headline} onChange={(e) => set("headline", e.target.value)} className="sm:col-span-2" />
          <TextAreaField label="Introduction" value={d.intro} onChange={(e) => set("intro", e.target.value)} className="sm:col-span-2" />
        </section>

        <section className="panel space-y-4 p-5">
          <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Steps</h2><Button variant="secondary" size="sm" onClick={() => set("steps", [...d.steps, { title: "", body: "" }])}><Plus className="h-4 w-4" aria-hidden />Add step</Button></div>
          {d.steps.map((s, i) => (
            <div key={i} className="grid gap-3 rounded-field border border-line p-4">
              <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-ink-900 text-sm font-bold text-accent" aria-hidden>{i + 1}</span>
                <TextField label="Step title" value={s.title} onChange={(e) => set("steps", d.steps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="flex-1" />
                <div className="mt-6 flex gap-1">
                  <Button variant="ghost" size="sm" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => set("steps", move(d.steps, i, i - 1))}><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" aria-label={`Move step ${i + 1} down`} disabled={i === d.steps.length - 1} onClick={() => set("steps", move(d.steps, i, i + 1))}><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" aria-label={`Delete step ${i + 1}`} onClick={() => set("steps", d.steps.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div></div>
              <TextAreaField label="What the customer should do" rows={3} value={s.body} onChange={(e) => set("steps", d.steps.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
            </div>
          ))}
        </section>

        <section className="panel space-y-4 p-5">
          <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Help answers</h2><Button variant="secondary" size="sm" onClick={() => set("help", [...d.help, { question: "", answer: "" }])}><Plus className="h-4 w-4" aria-hidden />Add question</Button></div>
          {d.help.length === 0 && <p className="text-sm text-muted">No help questions. The Help section is hidden on the page until you add one.</p>}
          {d.help.map((h, i) => (
            <div key={i} className="grid gap-3 rounded-field border border-line p-4">
              <div className="flex items-end gap-2">
                <TextField label="Question" value={h.question} onChange={(e) => set("help", d.help.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} className="flex-1" />
                <Button variant="ghost" size="sm" aria-label={`Delete question ${i + 1}`} onClick={() => set("help", d.help.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <TextAreaField label="Answer" rows={2} value={h.answer} onChange={(e) => set("help", d.help.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
            </div>
          ))}
        </section>

        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="text-base font-semibold sm:col-span-2">Contact and extras</h2>
          <TextAreaField label="Note under the help list" rows={2} hint="For example: Call us on 082 123 4567, Monday to Friday 8 to 5." value={d.contactNote} onChange={(e) => set("contactNote", e.target.value)} className="sm:col-span-2" />
          <TextField label="WhatsApp number" inputMode="tel" hint="With country code, e.g. 27821234567. Shows a Chat on WhatsApp button. Leave empty to hide it." value={d.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          <TextField label="How-to video link (optional)" type="url" hint="Must start with https://. Shows a Watch the video button." value={d.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} />
        </section>
      </div>
    </>
  );
}
