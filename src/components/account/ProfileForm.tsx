"use client";

import { UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { accountFetch } from "@/lib/account-client";
import { profileProblem, type Profile } from "@/lib/account/profile";

interface Props {
  initial: Profile;
  email: string;
  /** "complete": first-time gate shown before buying. "edit": the "Your details" card. */
  mode: "complete" | "edit";
  onSaved: () => void;
  onCancel?: () => void;
}

/** Name, shop, phone and address. Email is shown but fixed: it is the one they signed in with. */
export function ProfileForm({ initial, email, mode, onSaved, onCancel }: Props) {
  const toast = useToast();
  const [v, setV] = useState<Profile>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof Profile) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = profileProblem(v);
    if (problem) { setError(problem); return; }
    setError(""); setBusy(true);
    try {
      await accountFetch("/api/account/profile", v);
      toast.success(mode === "complete" ? "Details saved. You can choose a plan now." : "Your details were updated.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`space-y-5 rounded-xl3 border bg-surface p-6 shadow-card sm:p-8 ${mode === "complete" ? "border-accent/60 ring-1 ring-accent/40" : "border-line"}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/25 text-accent-ink"><UserRound className="h-5 w-5" aria-hidden /></span>
        <div>
          <h2 className="font-display text-lg font-bold text-ink-900">{mode === "complete" ? "Tell us about your shop" : "Your details"}</h2>
          <p className="text-sm text-muted">{mode === "complete" ? "We need these before you can choose a plan. They go on your invoice and help us support you." : "These appear on your invoices."}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Your full name" autoComplete="name" required value={v.name} onChange={set("name")} />
        <TextField label="Shop or business name" autoComplete="organization" required value={v.businessName} onChange={set("businessName")} />
        <TextField label="Phone number" type="tel" inputMode="tel" autoComplete="tel" required value={v.phone} onChange={set("phone")} />
        <TextField label="Email" type="email" value={email} readOnly disabled hint="This is the email you signed in with." />
        <TextField label="Address (optional)" autoComplete="street-address" value={v.address} onChange={set("address")} className="sm:col-span-2" />
        <TextField label="Country" autoComplete="country-name" value={v.country} onChange={set("country")} />
      </div>
      {error && <p role="alert" className="rounded-field bg-bad/10 p-3 text-sm text-[#A22B3B]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" loading={busy}>{mode === "complete" ? "Save and continue" : "Save changes"}</Button>
        {onCancel && <Button type="button" variant="ghost" size="lg" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
