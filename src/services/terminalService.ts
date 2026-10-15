import { deleteField, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import type { AdminActor, Terminal, TerminalStatus } from "@/types";
import { mapLicense, mapSubscription, mapTerminal } from "@/lib/mappers";
import { canRegisterTerminal, computeLicenseState, effectiveDeviceLimit } from "@/lib/licensing/rules";
import { todayISO } from "@/lib/dates";
import { getDb } from "@/lib/firebase/client";
import { terminalDetailsSchema, type TerminalDetailsInput } from "@/lib/validation/schemas";
import { auditEntry } from "./auditService";
import { col, docRef, getOne, listDocs, newestFirst, whereEq, commitBatch } from "./base";

export const listTerminals = (): Promise<Terminal[]> => listDocs("terminals", mapTerminal, ...newestFirst());
export const listTerminalsForCustomer = (customerId: string): Promise<Terminal[]> =>
  listDocs("terminals", mapTerminal, whereEq("customerId", customerId));

/** Disable / revoke / reactivate. Reactivating re-checks the customer's terminal limit. */
export async function setTerminalStatus(actor: AdminActor, terminal: Terminal, to: TerminalStatus): Promise<void> {
  if (to === "ACTIVE") {
    const license = await getOne("licenses", terminal.licenseId, mapLicense);
    if (!license) throw new Error("This terminal's licence no longer exists.");
    const sub = license.subscriptionId ? await getOne("subscriptions", license.subscriptionId, mapSubscription) : null;
    const siblings = await listDocs("terminals", mapTerminal, whereEq("licenseId", license.id));
    const check = canRegisterTerminal({
      state: computeLicenseState(license, sub?.status ?? null, todayISO()),
      terminalLimit: effectiveDeviceLimit(license, sub),
      activeTerminals: siblings.filter((t) => t.status === "ACTIVE" && t.id !== terminal.id).length,
      alreadyActive: false,
    });
    if (!check.ok) throw new Error(check.reason);
  }
  const action = to === "ACTIVE" ? "terminal.reactivated" : to === "DISABLED" ? "terminal.disabled" : "terminal.revoked";
  const batch = writeBatch(getDb());
  // An admin unlink can't be undone by the customer re-activating the PC themselves (only a customer's own removal can).
  batch.update(docRef("terminals", terminal.id), { status: to, removedBy: to === "REVOKED" ? "admin" : "", updatedAt: serverTimestamp() });
  batch.set(doc(col("auditLogs")), auditEntry(actor, {
    action, targetType: "terminal", targetId: terminal.id, targetLabel: terminal.deviceName, metadata: { customerId: terminal.customerId, from: terminal.status },
  }));
  await commitBatch(batch);
}

/** The admin has looked at a changed MAC address and is happy with it (for example a replaced network card). */
export async function acceptMacChange(actor: AdminActor, terminal: Terminal): Promise<void> {
  const batch = writeBatch(getDb());
  batch.update(docRef("terminals", terminal.id), { macChanged: false, previousMac: "", updatedAt: serverTimestamp() });
  batch.set(doc(col("auditLogs")), auditEntry(actor, { action: "terminal.mac_change_accepted", targetType: "terminal", targetId: terminal.id, targetLabel: terminal.deviceName, metadata: { customerId: terminal.customerId, previousMac: terminal.previousMac, mac: terminal.macAddress } }));
  await commitBatch(batch);
}

/**
 * Forgets a PC's device secret so the NEXT check hands it a new one. Use it when a PC was legitimately re-installed (it lost its
 * secret) so it stops showing as unverified. Don't use it on a PC you think was copied: block or remove that one instead.
 */
export async function resetDeviceIdentity(actor: AdminActor, terminal: Terminal): Promise<void> {
  const batch = writeBatch(getDb());
  batch.update(docRef("terminals", terminal.id), { secretHash: deleteField(), secretState: "none", macChanged: false, previousMac: "", updatedAt: serverTimestamp() });
  batch.set(doc(col("auditLogs")), auditEntry(actor, { action: "terminal.identity_reset", targetType: "terminal", targetId: terminal.id, targetLabel: terminal.deviceName, metadata: { customerId: terminal.customerId, was: terminal.secretState } }));
  await commitBatch(batch);
}

/** The name to show for a device: the admin's own label if they gave one, otherwise what the PC reports. */
export const deviceTitle = (t: Pick<Terminal, "adminLabel" | "deviceName">): string => t.adminLabel || t.deviceName || "(unnamed)";

/** Saves the admin's label, shop name and private note for a device. The PC never overwrites these. */
export async function updateTerminalDetails(actor: AdminActor, terminal: Terminal, input: TerminalDetailsInput): Promise<void> {
  const parsed = terminalDetailsSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the details.");
  const d = parsed.data;
  const batch = writeBatch(getDb());
  batch.update(docRef("terminals", terminal.id), { adminLabel: d.adminLabel, shopName: d.shopName, note: d.note, updatedAt: serverTimestamp() });
  batch.set(doc(col("auditLogs")), auditEntry(actor, {
    action: "terminal.edited", targetType: "terminal", targetId: terminal.id, targetLabel: deviceTitle({ adminLabel: d.adminLabel, deviceName: terminal.deviceName }),
    metadata: { customerId: terminal.customerId, labelFrom: terminal.adminLabel, labelTo: d.adminLabel, shopFrom: terminal.shopName, shopTo: d.shopName },
  }));
  await commitBatch(batch);
}

export interface BulkResult { done: Terminal[]; failed: { terminal: Terminal; error: string }[] }

/**
 * Block, allow or remove several devices at once. Each one goes through exactly the same checks as doing it alone (for example
 * allowing a device still respects the licence's device limit), so one that can't be changed doesn't stop the rest: it is
 * reported back with the reason.
 */
export async function bulkSetTerminalStatus(actor: AdminActor, terminals: Terminal[], to: TerminalStatus): Promise<BulkResult> {
  const result: BulkResult = { done: [], failed: [] };
  for (const terminal of terminals) {
    if (terminal.status === to) continue;
    try {
      await setTerminalStatus(actor, terminal, to);
      result.done.push(terminal);
    } catch (e) {
      result.failed.push({ terminal, error: e instanceof Error ? e.message : "Couldn't change this device." });
    }
  }
  return result;
}
