"use client";

import { CircleSlash, Gauge, Monitor, TriangleAlert, Wifi } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { StatCard } from "@/components/admin/StatCard";
import { TerminalTable } from "@/components/admin/TerminalTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState, TableSkeleton } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import { overLimitIds, summarizeDevices } from "@/lib/devices";
import { effectiveDeviceLimit } from "@/lib/licensing/rules";
import { listCustomers } from "@/services/customerService";
import { listLicenses } from "@/services/licenseService";
import { listSubscriptions } from "@/services/subscriptionService";
import { listTerminals } from "@/services/terminalService";

/** The control centre for every PC connected to a licence: who is online, what needs attention, and block / allow / remove / edit, one at a time or many at once. */
export default function DevicesPage() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [terminals, licenses, customers, subscriptions] = await Promise.all([listTerminals(), listLicenses(), listCustomers(), listSubscriptions()]);
    return { terminals, licenses, customers, subscriptions };
  }, []);
  const name = (id: string) => data?.customers.find((c) => c.id === id)?.businessName ?? "Unknown customer";

  const summary = useMemo(() => {
    if (!data) return null;
    const over = overLimitIds(data.terminals, (id) => {
      const l = data.licenses.find((x) => x.id === id);
      return l ? effectiveDeviceLimit(l, data.subscriptions.find((s) => s.id === l.subscriptionId) ?? null) : 0;
    });
    return summarizeDevices(data.terminals, over);
  }, [data]);

  return (
    <>
      <PageHeader title="Devices" description="Every PC connected to a licence. See who is online and what needs attention, edit a device, and block, allow or remove one or many. Changes reach the PCs within about 3 minutes."
        actions={<Link href="/admin/settings" className="inline-flex h-10 items-center gap-2 rounded-field border border-line bg-surface px-4 text-sm font-semibold text-ink-900 shadow-sm hover:bg-paper"><Gauge className="h-4 w-4" aria-hidden />Check frequency and load</Link>} />
      {error ? <ErrorState title="Couldn't load devices" error={error} onRetry={reload} /> : loading && !data ? <TableSkeleton /> : data && summary && (
        <>
          <div className="mb-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Active devices" value={summary.active} icon={Monitor} hint={`${summary.total} in total, ${summary.removed} removed`} />
            <StatCard label="Online right now" value={summary.online} icon={Wifi} hint="Checked in within the last 30 minutes" />
            <StatCard label="Need attention" value={summary.needAttention} icon={TriangleAlert} tone={summary.needAttention > 0 ? "warn" : "default"} hint={summary.overLimit > 0 ? `${summary.overLimit} over their licence's limit` : "MAC changes, failed identity checks, wrong clocks"} />
            <StatCard label="Blocked" value={summary.blocked} icon={CircleSlash} hint="Blocked by an admin" />
          </div>
          <TerminalTable terminals={data.terminals} licenses={data.licenses} subscriptions={data.subscriptions} customerName={name} onChanged={reload} bulk />
        </>
      )}
    </>
  );
}
