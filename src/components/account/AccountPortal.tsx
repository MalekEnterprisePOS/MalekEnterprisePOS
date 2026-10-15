"use client";

import { BookOpen, CheckCircle2, CircleAlert, Download, Loader2, LogOut, Pencil, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { BillingFrequency, Invoice, Payment, PricingPlan } from "@/types";
import type { Profile } from "@/lib/account/profile";
import { Button, ButtonLink } from "@/components/ui/Button";
import { CardsSkeleton, ErrorState } from "@/components/ui/States";
import { accountFetch } from "@/lib/account-client";
import { useCustomerAuth } from "@/lib/account/useCustomerAuth";
import { formatDate, formatZAR } from "@/lib/utils";
import { AuthGate } from "./AuthGate";
import { VerifyEmailGate } from "./VerifyEmailGate";
import { PlanPicker } from "./PlanPicker";
import { LicenseCard } from "./LicenseCard";
import { InvoiceList } from "./InvoiceList";
import { PayNowCard } from "./PayNowCard";
import { ProfileForm } from "./ProfileForm";
import { RenewCard } from "./RenewCard";
import { DevicesCard } from "./DevicesCard";
import { PlanSummary } from "./PlanSummary";
import { SecurityCard } from "./SecurityCard";
import type { PortalDevice, PortalLicense, PortalSecurity, PortalSubscription } from "./types";

interface Portal {
  email: string;
  security: PortalSecurity;
  profile: Profile & { complete: boolean };
  customer: { id: string; businessName: string; name: string; email: string; phone: string; plan: string; terminals: number; status: string; subscriptionStatus: string } | null;
  subscription: PortalSubscription | null;
  licenses: PortalLicense[];
  invoices: (Invoice & { orderKind: string })[];
  payments: Payment[];
  terminals: PortalDevice[];
  plans: PricingPlan[];
  billingFrequency: BillingFrequency;
  vatRate: number;
  customPrice: number | null;
  canTestPay: boolean;
  canPayOnline: boolean;
  supportEmail: string;
}

export function AccountPortal() {
  const auth = useCustomerAuth();
  const [portal, setPortal] = useState<Portal | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  /** From the pricing page's "Get started" button: /account?plan=<id>. Kept in the address so a refresh keeps the choice. */
  const [wantedPlan, setWantedPlan] = useState<string | undefined>();
  const [wantedBilling, setWantedBilling] = useState<string | undefined>();
  useEffect(() => { const q = new URLSearchParams(window.location.search); setWantedPlan(q.get("plan") ?? undefined); setWantedBilling(q.get("billing") ?? undefined); }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    accountFetch<Portal>("/api/account/me", undefined, "GET")
      .then((p) => setPortal({ ...p, plans: p.plans ?? [], licenses: p.licenses ?? [], invoices: p.invoices ?? [], payments: p.payments ?? [], terminals: p.terminals ?? [], subscription: p.subscription ?? null, customPrice: p.customPrice ?? null }))
      .catch((e) => { console.error("[AccountPortal] load failed:", e); setError(e instanceof Error ? e : new Error(String(e))); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (auth.status === "signed-in" && auth.emailVerified) load();
  }, [auth.status, auth.emailVerified, load]);

  // Coming back from the payment page: ?paid=INV-... (success) or ?payment=cancelled|failed.
  const [ret, setRet] = useState<{ paid?: string; payment?: string } | null>(null);
  const [polls, setPolls] = useState(0);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const paid = q.get("paid") ?? undefined, payment = q.get("payment") ?? undefined;
    if (paid || payment) { setRet({ paid, payment }); window.history.replaceState(null, "", window.location.pathname); }
  }, []);
  const returnedInvoice = ret?.paid ? portal?.invoices.find((i) => i.number === ret.paid) : undefined;
  const confirmed = returnedInvoice?.status === "PAID";
  useEffect(() => {
    // The webhook usually lands within seconds; re-check quietly for up to a minute.
    if (!ret?.paid || confirmed || !portal || polls >= 20) return;
    const t = window.setTimeout(() => { setPolls((n) => n + 1); load(); }, 3000);
    return () => window.clearTimeout(t);
  }, [ret, confirmed, portal, polls, load]);

  if (auth.status === "loading") return <CardsSkeleton count={3} />;
  if (auth.status === "signed-out") return <AuthGate />;
  if (!auth.emailVerified) return <VerifyEmailGate email={auth.user?.email ?? ""} />;
  if (loading && !portal) return <CardsSkeleton count={3} />;
  if (error) return <ErrorState title="Couldn't load your account" error={error} onRetry={load} />;
  if (!portal) return null;

  const liveLicense = portal.licenses.filter((l) => !l.revoked).sort((a, b) => b.expiryDate.localeCompare(a.expiryDate))[0];
  const hasUnpaidInvoice = portal.invoices.some((i) => i.status === "PENDING" || i.status === "OVERDUE");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl3 border border-line bg-surface p-4">
        <span className="text-sm text-muted">Signed in as <strong className="text-ink-800">{portal.customer?.email ?? auth.user?.email}</strong></span>
        <div className="flex items-center gap-1">
          <Link href="/setup" className="inline-flex h-8 items-center gap-1.5 rounded-field px-3 text-[13px] font-semibold text-ink-700 hover:bg-ink-100/80"><BookOpen className="h-4 w-4" aria-hidden />Setup guide</Link>
          <Button variant="ghost" size="sm" onClick={() => auth.signOut()}><LogOut className="h-4 w-4" /> Sign out</Button>
        </div>
      </div>

      {ret?.paid && (confirmed ? (
        <div role="status" className="flex items-start gap-3 rounded-xl3 border border-ok/30 bg-ok/10 p-4 text-sm text-[#0F6E48]"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><span><strong>Payment received. Thank you!</strong> {portal.licenses.length > 0 ? "Your licence is active and its key is shown below." : "Your account is up to date."}</span></div>
      ) : polls < 20 ? (
        <div role="status" className="flex items-start gap-3 rounded-xl3 border border-line bg-surface p-4 text-sm text-ink-800"><Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" /><span><strong>Confirming your payment…</strong> This usually takes a few seconds. You can stay on this page; your licence appears here by itself.</span></div>
      ) : (
        <div role="status" className="flex items-start gap-3 rounded-xl3 border border-warn/40 bg-warn/10 p-4 text-sm text-ink-800"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><span><strong>Still confirming.</strong> If you were charged, your invoice will update shortly and we&apos;ll email you. Refresh in a minute, or contact support.</span></div>
      ))}
      {ret?.payment && (
        <div role="status" className={`flex items-start gap-3 rounded-xl3 border p-4 text-sm ${ret.payment === "failed" ? "border-bad/30 bg-bad/10 text-[#A22B3B]" : "border-line bg-surface text-ink-800"}`}><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><span>{ret.payment === "failed" ? <><strong>The payment didn&apos;t go through.</strong> Nothing was charged. Please try again or use a different card.</> : <><strong>Payment cancelled.</strong> No money was taken. You can pay whenever you&apos;re ready.</>}</span></div>
      )}

      {portal.canPayOnline && <PayNowCard invoices={portal.invoices} />}

      {portal.customer?.status === "inactive" && (
        <div className="flex items-start gap-3 rounded-xl3 border border-bad/30 bg-bad/10 p-4 text-sm text-[#A22B3B]">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <span>This account is inactive. {portal.supportEmail ? <>Contact <a className="underline" href={`mailto:${portal.supportEmail}`}>{portal.supportEmail}</a> to reactivate it.</> : "Contact support to reactivate it."}</span>
        </div>
      )}

      {!portal.profile.complete && <ProfileForm mode="complete" initial={portal.profile} email={portal.email} onSaved={load} />}

      {portal.subscription && liveLicense && portal.canPayOnline && portal.profile.complete && (
        <RenewCard plans={portal.plans} planName={portal.subscription.plan} terminals={portal.subscription.terminalLimit} frequency={portal.subscription.billingFrequency} expiryDate={liveLicense.expiryDate} hasUnpaidInvoice={hasUnpaidInvoice} />
      )}

      {!portal.customer || !portal.subscription ? (
        <>
          <p className="text-sm text-muted">{portal.customer ? `Welcome back, ${portal.customer.businessName}.` : `Welcome${portal.profile.name ? `, ${portal.profile.name.split(" ")[0]}` : ""}.`} Choose a plan below to get your licence.</p>
          <PlanPicker plans={portal.plans} billingFrequency={portal.billingFrequency} vatRate={portal.vatRate} customPrice={portal.customPrice} canPayOnline={portal.canPayOnline} profileComplete={portal.profile.complete} initialPlanId={wantedPlan} initialBilling={wantedBilling} onOrdered={load} />
        </>
      ) : (
        <div className="space-y-4">
          <PlanSummary businessName={portal.customer.businessName} subscription={portal.subscription} license={liveLicense} vatRate={portal.vatRate} customPrice={portal.customPrice} />
          {portal.subscription.status !== "CANCELLED" && (
            <div className="rounded-xl3 border border-line bg-surface p-6 shadow-card">
              <p className="mb-3 text-sm font-semibold text-ink-800">Need more tills, or want to switch plans?</p>
              <PlanPicker plans={portal.plans} billingFrequency={portal.subscription.billingFrequency} vatRate={portal.vatRate} customPrice={portal.customPrice} canPayOnline={portal.canPayOnline} profileComplete={portal.profile.complete} initialPlanId={wantedPlan} initialBilling={wantedBilling} onOrdered={load} />
            </div>
          )}
        </div>
      )}

      {portal.licenses.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-bold text-ink-900">Your licence{portal.licenses.length === 1 ? "" : "s"}</h2>
          {portal.licenses.map((l, i) => <LicenseCard key={l.id} license={l} autoReveal={Boolean(ret?.paid && confirmed && i === 0)} />)}
        </div>
      )}

      {portal.licenses.some((l) => !l.revoked) && portal.terminals.length === 0 && (
        <div className="rounded-xl3 border border-line bg-surface p-6 shadow-card">
          <h2 className="font-display text-lg font-bold text-ink-900">Next: install the software</h2>
          <p className="mt-1 text-sm text-muted">Download the installer, then paste your licence key into the app when it asks for it.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/download" size="md"><Download className="h-4 w-4" aria-hidden />Download installer</ButtonLink>
            <ButtonLink href="/setup" variant="secondary" size="md"><BookOpen className="h-4 w-4" aria-hidden />Step-by-step setup guide</ButtonLink>
          </div>
        </div>
      )}

      {portal.customer && (portal.licenses.length > 0 || portal.terminals.length > 0) && (
        <>
          <DevicesCard devices={portal.terminals} license={liveLicense} security={portal.security} onChanged={load} />
          <SecurityCard email={portal.email} security={portal.security} license={liveLicense} deviceCount={portal.terminals.filter((t) => t.status === "ACTIVE").length} onChanged={load} />
        </>
      )}

      <div className="space-y-3">
        <h2 className="font-display text-lg font-bold text-ink-900">Invoices</h2>
        <InvoiceList invoices={portal.invoices} canTestPay={portal.canTestPay} canPayOnline={portal.canPayOnline} onPaid={load} />
      </div>

      {portal.profile.complete && (editing ? (
        <ProfileForm mode="edit" initial={portal.profile} email={portal.email} onSaved={() => { setEditing(false); load(); }} onCancel={() => setEditing(false)} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl3 border border-line bg-surface p-5 shadow-card">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-ink-900">Your details</h2>
            <p className="truncate text-sm text-muted">{portal.profile.name}, {portal.profile.businessName}, {portal.profile.phone}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" aria-hidden />Edit</Button>
        </div>
      ))}

      {portal.payments.length > 0 && (
        <div className="overflow-hidden rounded-xl3 border border-line bg-surface shadow-card">
          <h2 className="border-b border-line px-6 py-4 font-display text-lg font-bold text-ink-900">Payment history</h2>
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Method</th></tr></thead>
            <tbody className="divide-y divide-line">
              {portal.payments.map((p) => (
                <tr key={p.id}><td className="px-4 py-3 text-muted">{p.paidAt ? formatDate(p.paidAt) : "-"}</td><td className="px-4 py-3 font-semibold text-ink-800">{formatZAR(p.amount)}</td><td className="px-4 py-3 text-muted capitalize">{p.method.replace("_", " ")}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
