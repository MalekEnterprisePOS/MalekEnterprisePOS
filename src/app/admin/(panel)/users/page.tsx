"use client";

import { Download, LogIn, MousePointerClick, UserCheck, UserX, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { StatCard } from "@/components/admin/StatCard";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import { buildUserRows, STANDING_LABEL, STANDING_ORDER, summarizeDownloads, summarizeUsers, type PlanStanding, type UserRow } from "@/lib/users";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { loadUsersData } from "@/services/portalUserService";

const STANDING_BADGE: Record<PlanStanding, string> = { no_plan: "NONE", awaiting_payment: "PENDING", active: "ACTIVE", grace: "GRACE", expired: "EXPIRED", suspended: "SUSPENDED" };

function UsersView() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("segment") as PlanStanding | "all" | "never" | null;
  const [segment, setSegment] = useState<PlanStanding | "all" | "never">(initial && (initial === "all" || initial === "never" || STANDING_ORDER.includes(initial)) ? initial : "all");
  const { data, loading, error, reload } = useAsyncData(loadUsersData, []);

  const rows = useMemo(() => (data ? buildUserRows(data.sources) : []), [data]);
  const summary = useMemo(() => summarizeUsers(rows), [rows]);
  const downloads = useMemo(() => summarizeDownloads(data?.downloads ?? []), [data]);
  const shown = useMemo(() => rows.filter((r) => (segment === "all" ? true : segment === "never" ? !r.signedIn : r.standing === segment)), [rows, segment]);

  const pills: { id: PlanStanding | "all" | "never"; label: string; count: number }[] = [
    { id: "all", label: "Everyone", count: summary.total },
    ...STANDING_ORDER.map((s) => ({ id: s, label: STANDING_LABEL[s], count: summary.byStanding[s] })),
    { id: "never", label: "Never signed in", count: summary.neverSignedIn },
  ];

  return (
    <>
      <PageHeader title="Users" description="Everyone who has signed up or signed in, and where each one stands: no plan, active, late, expired. Includes customers you added yourself who haven't signed in yet." />
      {error ? <ErrorState title="Couldn't load users" error={error} onRetry={reload} /> : loading && !data ? <TableSkeleton /> : data && (
        <>
          <div className="mb-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Signed up" value={summary.signedIn} icon={LogIn} hint={`${summary.neverSignedIn} customer${summary.neverSignedIn === 1 ? "" : "s"} never signed in`} />
            <StatCard label="Signed in, no plan yet" value={summary.byStanding.no_plan + summary.byStanding.awaiting_payment} icon={UserX} tone="warn" hint={`${summary.byStanding.awaiting_payment} with an unpaid invoice`} />
            <StatCard label="Active plans" value={summary.byStanding.active + summary.byStanding.grace} icon={UserCheck} hint={`${summary.expiringSoon} expire within 14 days`} />
            <StatCard label="Expired or suspended" value={summary.byStanding.expired + summary.byStanding.suspended} icon={Users} tone={summary.byStanding.expired + summary.byStanding.suspended > 0 ? "bad" : "default"} />
          </div>
          <section className="mb-6 grid gap-5 rounded-xl3 border border-line bg-surface p-5 shadow-card sm:grid-cols-4" aria-label="Download link statistics">
            <div className="flex items-center gap-3 sm:col-span-1"><span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-900 text-accent"><Download className="h-[18px] w-[18px]" aria-hidden /></span><div><p className="font-display text-lg font-bold">Downloads</p><p className="text-xs text-muted">All releases, all time</p></div></div>
            <dl className="grid grid-cols-3 gap-4 sm:col-span-3">
              <div><dt className="flex items-center gap-1.5 text-xs text-muted"><MousePointerClick className="h-3.5 w-3.5" aria-hidden />Link clicks</dt><dd className="font-display text-2xl font-extrabold tabular">{downloads.clicks}</dd></div>
              <div><dt className="text-xs text-muted">By signed-in users</dt><dd className="font-display text-2xl font-extrabold tabular">{downloads.signedInClicks}</dd></div>
              <div><dt className="text-xs text-muted">Downloads started</dt><dd className="font-display text-2xl font-extrabold tabular">{downloads.completed}</dd></div>
            </dl>
          </section>

          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by plan standing">
            {pills.map((p) => (
              <button key={p.id} type="button" onClick={() => setSegment(p.id)} aria-pressed={segment === p.id}
                className={cn("inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition", segment === p.id ? "border-ink-900 bg-ink-900 text-white" : "border-line bg-surface text-ink-700 hover:border-ink-300")}>
                {p.label}<span className={cn("rounded-full px-1.5 text-xs tabular", segment === p.id ? "bg-white/20" : "bg-ink-100")}>{p.count}</span>
              </button>
            ))}
          </div>

          <DataTable<UserRow>
            caption="Users" rows={shown} rowKey={(r) => r.key} searchPlaceholder="Search name, shop, email or phone" searchText={(r) => `${r.name} ${r.businessName} ${r.email} ${r.phone}`}
            onRowClick={(r) => { if (r.customerId) router.push(`/admin/customers/${r.customerId}`); }}
            csv={{ filename: "users", columns: [
              { header: "Name", value: (r) => r.name }, { header: "Shop", value: (r) => r.businessName }, { header: "Email", value: (r) => r.email }, { header: "Phone", value: (r) => r.phone },
              { header: "Signed in", value: (r) => (r.signedIn ? "yes" : "never") }, { header: "Sign-in method", value: (r) => r.provider }, { header: "Signed up", value: (r) => r.signedUpAt?.slice(0, 10) },
              { header: "Last login", value: (r) => r.lastLoginAt?.slice(0, 16).replace("T", " ") }, { header: "Logins", value: (r) => r.loginCount },
              { header: "Plan standing", value: (r) => STANDING_LABEL[r.standing] }, { header: "Plan", value: (r) => r.plan }, { header: "Tills", value: (r) => r.terminals },
              { header: "Licence expires", value: (r) => r.expiryDate }, { header: "Devices active", value: (r) => r.devicesActive }, { header: "Device limit", value: (r) => r.deviceLimit }, { header: "Download clicks", value: (r) => r.downloadClicks },
            ] }}
            filters={[{ key: "method", label: "Sign-in method", options: [{ value: "google.com", label: "Google" }, { value: "password", label: "Email and password" }], predicate: (r, v) => r.provider === v }]}
            empty={<EmptyState icon={Users} title={segment === "all" ? "Nobody has signed up yet" : "Nobody in this group"} description={segment === "all" ? "People appear here the first time they sign in on the website." : "Try another filter above."} />}
            columns={[
              { key: "who", header: "Person", sortValue: (r) => r.businessName || r.name || r.email, render: (r) => (
                <div className="flex items-center gap-3"><Avatar name={r.businessName || r.name || r.email} size="sm" />
                  <div className="min-w-0"><p className="truncate font-semibold text-ink-900">{r.businessName || <span className="text-muted">No shop name yet</span>}</p><p className="truncate text-xs text-muted">{[r.name, r.email].filter(Boolean).join(", ")}</p>{r.phone && <p className="truncate text-xs text-muted">{r.phone}</p>}</div></div>
              ) },
              { key: "standing", header: "Plan standing", sortValue: (r) => STANDING_ORDER.indexOf(r.standing), render: (r) => (
                <div className="space-y-1"><div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={STANDING_BADGE[r.standing]} /><span className="text-xs font-semibold text-ink-700">{STANDING_LABEL[r.standing]}</span></div>{r.plan && <p className="text-xs text-muted">{r.plan}, {r.terminals} till{r.terminals === 1 ? "" : "s"}</p>}{r.expiringSoon && <Badge tone="warn">Expires soon</Badge>}</div>
              ) },
              { key: "expires", header: "Licence expires", sortValue: (r) => r.expiryDate ?? "", render: (r) => r.expiryDate ? <div><p className="text-ink-800">{formatDate(r.expiryDate)}</p><p className={cn("text-xs", r.daysLeft !== null && r.daysLeft < 0 ? "text-[#A22B3B]" : "text-muted")}>{r.daysLeft === null ? "" : r.daysLeft < 0 ? `${-r.daysLeft} day${r.daysLeft === -1 ? "" : "s"} ago` : r.daysLeft === 0 ? "today" : `in ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"}`}</p></div> : <span className="text-muted">-</span> },
              { key: "login", header: "Last login", sortValue: (r) => r.lastLoginAt ?? "", render: (r) => r.signedIn ? <div><p className="text-ink-800">{r.lastLoginAt ? timeAgo(r.lastLoginAt) : "-"}</p><p className="text-xs text-muted">{r.loginCount} login{r.loginCount === 1 ? "" : "s"}, {r.provider === "google.com" ? "Google" : r.provider === "password" ? "email" : "unknown"}{!r.emailVerified ? ", email not verified" : ""}</p></div> : <Badge tone="neutral">Never signed in</Badge> },
              { key: "devices", header: "Devices in use", align: "right", sortValue: (r) => r.devicesActive, render: (r) => r.deviceLimit === null ? <span className="text-muted">-</span> : <div><p className="font-semibold tabular text-ink-800">{r.devicesActive} / {r.deviceLimit}</p><p className="text-xs text-muted">{r.devicesOnline} online now</p></div> },
              { key: "dl", header: "Download clicks", align: "right", sortValue: (r) => r.downloadClicks, render: (r) => <div><p className="font-semibold tabular text-ink-800">{r.downloadClicks}</p>{r.lastDownloadAt && <p className="text-xs text-muted">{timeAgo(r.lastDownloadAt)}</p>}</div> },
              { key: "since", header: "Signed up", sortValue: (r) => r.signedUpAt ?? "", render: (r) => <span className="text-muted">{formatDate(r.signedUpAt)}</span> },
            ]}
          />
          <p className="mt-3 text-xs text-muted">Click a row to open that customer. Download clicks only count people who were signed in when they pressed the button; guests are included in the totals above.</p>
        </>
      )}
    </>
  );
}

export default function UsersPage() {
  return <Suspense fallback={<TableSkeleton />}><UsersView /></Suspense>;
}
