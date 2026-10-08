import type { License, LicenseState, Subscription, Terminal } from "@/types";
import { mapLicense } from "@/lib/mappers";
import { computeLicenseState, isOnline } from "@/lib/licensing/rules";
import { todayISO } from "@/lib/dates";
import { adminFetch } from "@/lib/api-client";
import { listDocs, newestFirst, whereEq } from "./base";

export const listLicenses = (): Promise<License[]> => listDocs("licenses", mapLicense, ...newestFirst());
export const listLicensesForCustomer = (customerId: string): Promise<License[]> =>
  listDocs("licenses", mapLicense, whereEq("customerId", customerId));

export function effectiveState(license: License, subscription: Subscription | undefined): LicenseState {
  return computeLicenseState(license, subscription?.status ?? null, todayISO());
}

export function activeTerminalCount(licenseId: string, terminals: Terminal[]): number {
  return terminals.filter((t) => t.licenseId === licenseId && t.status === "ACTIVE").length;
}

/** Devices on a licence that have checked in recently ("in use right now"). */
export function onlineTerminalCount(licenseId: string, terminals: Terminal[], now: number = Date.now()): number {
  return terminals.filter((t) => t.licenseId === licenseId && t.status === "ACTIVE" && isOnline(t.lastSeenAt, now)).length;
}

export interface LicenseActionResult {
  ok: true;
  licenseId: string;
  /** Present only when a new token was generated. It is shown once and never stored in plain text. */
  token?: string;
}

type LicenseCommand =
  | { action: "generate"; customerId: string; subscriptionId?: string; expiryDate?: string }
  | { action: "regenerate" | "revoke" | "reactivate" | "clear_flag"; licenseId: string }
  | { action: "extend"; licenseId: string; expiryDate: string }
  | { action: "set_device_limit"; licenseId: string; deviceLimit: number | null };

/** All licence mutations run on the server (Admin SDK) so tokens are generated and hashed there. */
export const runLicenseCommand = (cmd: LicenseCommand) => adminFetch<LicenseActionResult>("/api/admin/licenses", cmd);
