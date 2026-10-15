import type { PortalUser } from "@/types";
import type { UserSources } from "@/lib/users";
import { mapPortalUser } from "@/lib/mappers";
import { listCustomers } from "./customerService";
import { listInvoices } from "./invoiceService";
import { listLicenses } from "./licenseService";
import { listDownloadStats } from "./releaseService";
import { listSubscriptions } from "./subscriptionService";
import { listTerminals } from "./terminalService";
import { adminFetch } from "@/lib/api-client";
import { explainError } from "@/lib/firebase/explain";
import { listDocs, newestFirst } from "./base";

export const listPortalUsers = (): Promise<PortalUser[]> => listDocs("portalUsers", mapPortalUser, ...newestFirst());

/** Asks the server to add anyone from Firebase Authentication who has no Users record yet. Never throws. */
export const syncUsersFromAuth = (): Promise<{ created: number } | null> =>
  adminFetch<{ ok: true; scanned: number; created: number }>("/api/admin/users/sync", {}).then((r) => ({ created: r.created })).catch(() => null);

/**
 * One read of everything the Users page needs. Each list is read on its own, so one blocked collection (for example
 * Firestore rules that were never deployed) can't blank the whole page: the rest still shows, with a clear warning.
 */
export async function loadUsersData() {
  const synced = await syncUsersFromAuth();
  const problems: string[] = [];
  const soft = async <T,>(label: string, p: Promise<T[]>): Promise<T[]> => {
    try { return await p; } catch (e) {
      const x = explainError(e);
      problems.push(`${label}: ${x.message} ${x.hint}`);
      return [];
    }
  };
  const [portalUsers, customers, subscriptions, licenses, invoices, terminals, downloads] = await Promise.all([
    soft("Sign-ins (portalUsers)", listPortalUsers()), soft("Customers", listCustomers()), soft("Subscriptions", listSubscriptions()), soft("Licences", listLicenses()),
    soft("Invoices", listInvoices()), soft("Devices", listTerminals()), listDownloadStats().catch(() => []),
  ]);
  const sources: UserSources = { portalUsers, customers, subscriptions, licenses, invoices, terminals };
  return { sources, downloads, problems, synced: synced?.created ?? 0 };
}
