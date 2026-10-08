"use client";

import { Monitor, StickyNote, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { License, Subscription, Terminal, TerminalStatus } from "@/types";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { ATTENTION_LABEL, deviceAttention, overLimitIds, type Attention } from "@/lib/devices";
import { effectiveDeviceLimit, isOnline } from "@/lib/licensing/rules";
import { cn, errorMessage, formatDateTime } from "@/lib/utils";
import { acceptMacChange, bulkSetTerminalStatus, deviceTitle, resetDeviceIdentity, setTerminalStatus, updateTerminalDetails } from "@/services/terminalService";
import { useActor } from "./AuthProvider";
import { DeviceLimitDialog } from "./DeviceLimitDialog";
import { RowMenu } from "./RowMenu";

interface Props {
  terminals: Terminal[];
  licenses: License[];
  customerName: (id: string) => string;
  onChanged: () => void;
  showCustomer?: boolean;
  /** Pass these to show each licence's real device limit (otherwise the licence's own number is used). */
  subscriptions?: Subscription[];
  /** Adds checkboxes and a bar to block, allow or remove many devices at once. */
  bulk?: boolean;
}

const COPY: Record<TerminalStatus, { title: string; text: string; label: string; danger: boolean; done: string }> = {
  DISABLED: { title: "Block", label: "Block", danger: true, done: "blocked", text: "is told to stop at its next licence check (within about 3 minutes). It keeps its place on the licence, and you can allow it again." },
  REVOKED: { title: "Remove", label: "Remove", danger: true, done: "removed", text: "is unlinked and its place is freed for another PC. To use it again it has to be activated from scratch." },
  ACTIVE: { title: "Allow", label: "Allow", danger: false, done: "allowed", text: "can trade again, as long as the licence is within its device limit." },
};

const ATTENTION_FILTER: { value: string; label: string }[] = [
  { value: "any", label: "Anything needing attention" },
  ...(Object.keys(ATTENTION_LABEL) as Attention[]).map((a) => ({ value: a, label: ATTENTION_LABEL[a] })),
  { value: "unproven", label: "Identity not proven (older POS)" },
];

export function TerminalTable({ terminals, licenses, customerName, onChanged, showCustomer = true, subscriptions, bulk = false }: Props) {
  const toast = useToast();
  const actor = useActor();
  const router = useRouter();
  const [target, setTarget] = useState<{ terminal: Terminal; to: TerminalStatus } | null>(null);
  const [bulkTarget, setBulkTarget] = useState<TerminalStatus | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<{ terminal: Terminal; label: string; shop: string; note: string } | null>(null);
  const [identityFor, setIdentityFor] = useState<Terminal | null>(null);
  const [limitFor, setLimitFor] = useState<License | null>(null);
  const [busy, setBusy] = useState(false);

  const licenseOf = (id: string) => licenses.find((l) => l.id === id);
  const subOf = (l: License) => subscriptions?.find((s) => s.id === l.subscriptionId) ?? null;
  const limitOf = (licenseId: string) => { const l = licenseOf(licenseId); return l ? effectiveDeviceLimit(l, l ? subOf(l) : null) : 0; };
  const activeOn = (licenseId: string) => terminals.filter((t) => t.licenseId === licenseId && t.status === "ACTIVE").length;
  const over = useMemo(() => overLimitIds(terminals, (id) => { const l = licenses.find((x) => x.id === id); return l ? effectiveDeviceLimit(l, subscriptions?.find((s) => s.id === l.subscriptionId) ?? null) : 0; }), [terminals, licenses, subscriptions]);
  const attention = (t: Terminal) => deviceAttention(t, over);
  const selectedTerminals = terminals.filter((t) => selected.has(t.id));

  const runBulk = async (to: TerminalStatus) => {
    setBusy(true);
    try {
      const r = await bulkSetTerminalStatus(actor, selectedTerminals, to);
      if (r.done.length > 0) toast.success(`${r.done.length} device${r.done.length === 1 ? "" : "s"} ${COPY[to].done}.`);
      if (r.failed.length > 0) toast.error(`${r.failed.length} couldn't be changed. ${r.failed[0]!.terminal.deviceName}: ${r.failed[0]!.error}`);
      setBulkTarget(null);
      setSelected(new Set());
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      await updateTerminalDetails(actor, edit.terminal, { adminLabel: edit.label, shopName: edit.shop, note: edit.note });
      toast.success("Device details saved.");
      setEdit(null);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {bulk && selected.size > 0 && (
        <div role="region" aria-label="Actions for the selected devices" className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-panel border border-ink-900/15 bg-ink-900 px-4 py-3 text-white shadow-lift">
          <p className="mr-auto text-sm font-semibold" aria-live="polite">{selected.size} device{selected.size === 1 ? "" : "s"} selected</p>
          <Button size="sm" variant="onDark" onClick={() => setBulkTarget("DISABLED")}>Block</Button>
          <Button size="sm" variant="onDark" onClick={() => setBulkTarget("ACTIVE")}>Allow</Button>
          <Button size="sm" variant="onDark" onClick={() => setBulkTarget("REVOKED")}>Remove</Button>
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <DataTable
        caption="Devices"
        csv={{ filename: "devices", columns: [
          { header: "Name", value: (t) => deviceTitle(t) }, { header: "Reported name", value: (t) => t.deviceName }, { header: "Customer", value: (t) => customerName(t.customerId) }, { header: "Shop", value: (t) => t.shopName },
          { header: "MAC address", value: (t) => t.macAddress }, { header: "Computer", value: (t) => t.hostname }, { header: "System", value: (t) => t.os }, { header: "Local IP", value: (t) => t.localIp }, { header: "Internet IP", value: (t) => t.publicIp },
          { header: "Status", value: (t) => t.status }, { header: "Version", value: (t) => t.version }, { header: "Last seen", value: (t) => t.lastSeenAt },
          { header: "Identity check", value: (t) => t.secretState }, { header: "Clock off by (seconds)", value: (t) => t.clockSkewSeconds }, { header: "Needs attention", value: (t) => attention(t).map((a) => ATTENTION_LABEL[a]).join("; ") }, { header: "Note", value: (t) => t.note },
        ] }}
        rows={terminals} rowKey={(t) => t.id} searchPlaceholder="Search name, customer, MAC, IP or note" pageSize={bulk ? 15 : 10}
        searchText={(t) => `${deviceTitle(t)} ${t.deviceName} ${customerName(t.customerId)} ${t.shopName} ${t.hardwareIdShort} ${t.macAddress} ${t.hostname} ${t.localIp} ${t.publicIp} ${t.note}`}
        selection={bulk ? { selected, onChange: setSelected } : undefined}
        filters={[
          { key: "status", label: "Status", options: ["ACTIVE", "DISABLED", "REVOKED"].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })), predicate: (t, v) => t.status === v },
          { key: "online", label: "Online", options: [{ value: "online", label: "Online now" }, { value: "offline", label: "Not online" }], predicate: (t, v) => (v === "online") === (t.status === "ACTIVE" && isOnline(t.lastSeenAt)) },
          { key: "attention", label: "Attention", options: ATTENTION_FILTER, predicate: (t, v) => v === "any" ? attention(t).length > 0 : v === "unproven" ? t.status === "ACTIVE" && t.secretState === "missing" : attention(t).includes(v as Attention) },
        ]}
        empty={<EmptyState icon={Monitor} title="No devices yet" description="A PC appears here the first time it activates with a licence key." />}
        columns={[
          { key: "device", header: "Device", sortValue: (t) => deviceTitle(t), render: (t) => {
            const flags = attention(t);
            return (
              <div className="min-w-[10rem]">
                <p className="flex items-center gap-1.5 font-medium">{deviceTitle(t)}{t.note && <span title={t.note}><StickyNote className="h-3.5 w-3.5 text-ink-400" aria-label="Has a note" /></span>}</p>
                <p className="text-[11px] text-muted">{[t.adminLabel && t.deviceName, t.hostname].filter(Boolean).join(", ") || "computer name not reported"}</p>
                {flags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{flags.map((a) => <span key={a} className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-[#8A5200]"><TriangleAlert className="h-3 w-3" aria-hidden />{ATTENTION_LABEL[a]}</span>)}</div>}
              </div>
            );
          } },
          { key: "mac", header: "MAC address", sortValue: (t) => t.macAddress, render: (t) => <div><p className="font-receipt text-xs">{t.macAddress || <span className="text-muted">not reported</span>}</p><p className="font-receipt text-[11px] text-muted">{t.localIp || "-"}{t.publicIp ? ` / ${t.publicIp}` : ""}</p></div> },
          ...(showCustomer ? [{ key: "customer", header: "Customer", sortValue: (t: Terminal) => customerName(t.customerId), render: (t: Terminal) => <div><p>{customerName(t.customerId)}</p>{t.shopName && <p className="text-[11px] text-muted">{t.shopName}</p>}</div> }] : [{ key: "shop", header: "Shop", render: (t: Terminal) => t.shopName || "—" }]),
          { key: "license", header: "Licence", sortValue: (t) => licenseOf(t.licenseId)?.tokenPrefix ?? "", render: (t) => <div><code className="font-receipt text-xs">{licenseOf(t.licenseId)?.tokenPrefix ?? "—"}</code><p className="text-[11px] text-muted">{activeOn(t.licenseId)} of {limitOf(t.licenseId)} in use</p></div> },
          { key: "status", header: "Status", sortValue: (t) => t.status, render: (t) => <StatusBadge status={t.status} /> },
          { key: "seen", header: "Last seen", sortValue: (t) => t.lastSeenAt ?? "", render: (t) => {
            const live = t.status === "ACTIVE" && isOnline(t.lastSeenAt);
            return <span className={cn("inline-flex items-center gap-1.5", live ? "font-semibold text-[#0B6B45]" : "text-muted")}><span className={cn("h-2 w-2 rounded-full", live ? "bg-ok" : "bg-ink-300")} aria-hidden />{live ? "Online now" : formatDateTime(t.lastSeenAt)}</span>;
          } },
          { key: "version", header: "Version", render: (t) => t.version || "—" },
          { key: "actions", header: "", align: "right", render: (t) => {
            const lic = licenseOf(t.licenseId);
            return (
              <RowMenu label={`Actions for ${deviceTitle(t)}`} items={[
                { label: "Edit name, shop and note", onSelect: () => setEdit({ terminal: t, label: t.adminLabel, shop: t.shopName, note: t.note }) },
                { label: "Allow", onSelect: () => setTarget({ terminal: t, to: "ACTIVE" }), hidden: t.status === "ACTIVE" },
                { label: "Block", onSelect: () => setTarget({ terminal: t, to: "DISABLED" }), hidden: t.status !== "ACTIVE" },
                { label: "Accept MAC change", onSelect: async () => { try { await acceptMacChange(actor, t); toast.success("MAC change accepted."); onChanged(); } catch (e) { toast.error(errorMessage(e)); } }, hidden: !t.macChanged },
                { label: "Reset identity", onSelect: () => setIdentityFor(t), hidden: t.secretState !== "wrong" && t.secretState !== "missing" },
                { label: "Set this licence's device limit", onSelect: () => lic && setLimitFor(lic), hidden: !lic || lic.revoked },
                { label: "Open customer", onSelect: () => router.push(`/admin/customers/${t.customerId}`), hidden: !showCustomer },
                { label: "Remove (unlink)", danger: true, onSelect: () => setTarget({ terminal: t, to: "REVOKED" }), hidden: t.status === "REVOKED" },
              ]} />
            );
          } },
        ]}
      />

      <ConfirmDialog
        open={Boolean(target)} title={target ? `${COPY[target.to].title} this device?` : ""} tone={target && COPY[target.to].danger ? "danger" : "primary"}
        confirmLabel={target ? COPY[target.to].label : ""} description={target ? `This PC ${COPY[target.to].text}` : ""}
        details={target ? [{ label: "Device", value: deviceTitle(target.terminal) }, { label: "Customer", value: customerName(target.terminal.customerId) }, { label: "MAC", value: target.terminal.macAddress || "not reported" }, { label: "Now", value: target.terminal.status }] : []}
        onClose={() => setTarget(null)}
        onConfirm={async () => {
          if (!target) return;
          try {
            await setTerminalStatus(actor, target.terminal, target.to);
            toast.success(`${deviceTitle(target.terminal)} ${COPY[target.to].done}.`);
            setTarget(null);
            onChanged();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />

      <ConfirmDialog
        open={bulkTarget !== null} title={bulkTarget ? `${COPY[bulkTarget].title} ${selectedTerminals.length} device${selectedTerminals.length === 1 ? "" : "s"}?` : ""} tone={bulkTarget && COPY[bulkTarget].danger ? "danger" : "primary"}
        confirmLabel={bulkTarget ? `${COPY[bulkTarget].label} ${selectedTerminals.length}` : ""}
        description={bulkTarget ? `Each selected PC ${COPY[bulkTarget].text} Devices that can't be changed (for example when allowing would go over the limit) are skipped and reported.` : ""}
        details={selectedTerminals.slice(0, 6).map((t) => ({ label: customerName(t.customerId), value: deviceTitle(t) })).concat(selectedTerminals.length > 6 ? [{ label: "and", value: `${selectedTerminals.length - 6} more` }] : [])}
        onClose={() => setBulkTarget(null)}
        onConfirm={async () => { if (bulkTarget) await runBulk(bulkTarget); }}
      />

      {edit && (
        <Modal open onClose={() => setEdit(null)} title="Edit device" description={`${edit.terminal.deviceName}, ${customerName(edit.terminal.customerId)}`} size="sm"
          footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button variant="dark" loading={busy} onClick={saveEdit}>Save</Button></>}>
          <div className="space-y-4">
            <TextField label="Name you give this device" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} data-autofocus hint={`For example "Front till". Shown instead of "${edit.terminal.deviceName}". The POS never overwrites it.`} />
            <TextField label="Shop" value={edit.shop} onChange={(e) => setEdit({ ...edit, shop: e.target.value })} />
            <TextAreaField label="Private note" rows={3} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} hint="Only admins see this." />
            <p className="text-xs text-muted">MAC address, IP, version and the clock come from the PC itself and can&apos;t be edited.</p>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(identityFor)} title="Reset this device's identity?" tone="primary" confirmLabel="Reset identity"
        description="The PC is given a brand-new device secret at its next check, and the failed-check warning clears. Only do this if you're sure it's the genuine PC (for example it was re-installed). If you think its install was copied, block or remove it instead."
        details={identityFor ? [{ label: "Device", value: deviceTitle(identityFor) }, { label: "MAC", value: identityFor.macAddress || "not reported" }, { label: "Check", value: identityFor.secretState }] : []}
        onClose={() => setIdentityFor(null)}
        onConfirm={async () => {
          if (!identityFor) return;
          try { await resetDeviceIdentity(actor, identityFor); toast.success("Identity reset. The PC gets a new secret at its next check."); setIdentityFor(null); onChanged(); } catch (e) { toast.error(errorMessage(e)); }
        }}
      />

      {limitFor && (
        <DeviceLimitDialog license={limitFor} currentLimit={limitOf(limitFor.id)} planTills={subOf(limitFor)?.terminalLimit ?? limitFor.terminalLimit}
          subtitle={`${customerName(limitFor.customerId)}, ${limitFor.tokenPrefix}`} onClose={() => setLimitFor(null)} onSaved={onChanged} />
      )}
    </>
  );
}
