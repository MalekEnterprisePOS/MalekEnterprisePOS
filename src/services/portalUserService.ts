import type { PortalUser } from "@/types";
import type { UserSources } from "@/lib/users";
import { mapPortalUser } from "@/lib/mappers";
import { listCustomers } from "./customerService";
import { listInvoices } from "./invoiceService";
import { listLicenses } from "./licenseService";
import { listDownloadStats } from "./releaseService";
import { listSubscriptions } from "./subscriptionService";
import { listTerminals } from "./terminalService";
import { listDocs, newestFirst } from "./base";

export const listPortalUsers = (): Promise<PortalUser[]> => listDocs("portalUsers", mapPortalUser, ...newestFirst());

/** One read of everything the Users page needs. A missing collection (nobody has signed in yet) is just an empty list. */
export async function loadUsersData() {
  const [portalUsers, customers, subscriptions, licenses, invoices, terminals, downloads] = await Promise.all([
    listPortalUsers(), listCustomers(), listSubscriptions(), listLicenses(), listInvoices(), listTerminals(), listDownloadStats().catch(() => []),
  ]);
  const sources: UserSources = { portalUsers, customers, subscriptions, licenses, invoices, terminals };
  return { sources, downloads };
}
