/**
 * Pure Firestore-document → domain-object mappers. They accept loosely-typed data (from the web SDK,
 * the REST API or tests), never throw, and fill sensible defaults so one bad document can't break a page.
 */
import type {
  BillingFrequency, AppSettings, AuditLog, Customer, DownloadStats, Inquiry, Invoice, InvoiceLine, License, NotificationRecord, Payment, PortalUser, PricingConfig,
  PricingPlan, Release, ReleaseFile, SetupGuide, ShareLink, Shop, Subscription, Terminal,
} from "@/types";
import { DEFAULT_SETTINGS, DEFAULT_SETUP_GUIDE } from "@/lib/constants";

export type Data = Record<string, unknown>;

export const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
export const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
export const bool = (v: unknown, d = false): boolean => (typeof v === "boolean" ? v : d);
export const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
export const obj = (v: unknown): Data => (v && typeof v === "object" && !Array.isArray(v) ? (v as Data) : {});

/** Accepts Firestore Timestamps (duck-typed), ISO strings and null. */
export function toIso(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : d;

const meta = (d: Data) => ({ createdAt: toIso(d.createdAt), updatedAt: toIso(d.updatedAt) });

export function mapCustomer(id: string, d: Data): Customer {
  return {
    id, ...meta(d),
    name: str(d.name), businessName: str(d.businessName), email: str(d.email), phone: str(d.phone),
    address: str(d.address), country: str(d.country, "South Africa"),
    terminals: num(d.terminals, 1), pricePerTerminal: num(d.pricePerTerminal), currency: "ZAR",
    plan: str(d.plan), status: oneOf(d.status, ["active", "inactive"] as const, "active"),
    subscriptionStatus: oneOf(d.subscriptionStatus, ["ACTIVE", "PENDING", "OVERDUE", "GRACE", "SUSPENDED", "CANCELLED", "NONE"] as const, "NONE"),
    notes: str(d.notes),
  };
}

export function mapShop(id: string, d: Data): Shop {
  return { id, ...meta(d), customerId: str(d.customerId), name: str(d.name), address: str(d.address) };
}

export function mapSubscription(id: string, d: Data): Subscription {
  return {
    id, ...meta(d),
    customerId: str(d.customerId), plan: str(d.plan), terminalLimit: num(d.terminalLimit, 1),
    pricePerTerminal: num(d.pricePerTerminal), currency: "ZAR",
    billingFrequency: oneOf(d.billingFrequency, ["monthly", "quarterly", "annual"] as const, "monthly"),
    startDate: str(d.startDate), nextBillingDate: str(d.nextBillingDate),
    status: oneOf(d.status, ["ACTIVE", "PENDING", "OVERDUE", "GRACE", "SUSPENDED", "CANCELLED"] as const, "PENDING"),
    gracePeriodDays: num(d.gracePeriodDays, 5), autoRenewal: bool(d.autoRenewal, true),
    discountPercent: Math.min(90, Math.max(0, num(d.discountPercent))),
  };
}

function mapLines(v: unknown): InvoiceLine[] {
  if (!Array.isArray(v)) return [];
  return v.map((l) => {
    const o = obj(l);
    return { description: str(o.description), quantity: num(o.quantity, 1), unitPrice: num(o.unitPrice) };
  });
}

export function mapInvoice(id: string, d: Data): Invoice {
  return {
    id, ...meta(d),
    number: str(d.number, id), customerId: str(d.customerId), subscriptionId: typeof d.subscriptionId === "string" ? d.subscriptionId : null,
    issueDate: str(d.issueDate), dueDate: str(d.dueDate),
    status: oneOf(d.status, ["PENDING", "PAID", "OVERDUE", "CANCELLED"] as const, "PENDING"),
    lines: mapLines(d.lines), subtotal: num(d.subtotal), vatRate: num(d.vatRate), vatAmount: num(d.vatAmount), total: num(d.total),
    currency: "ZAR", paidAt: toIso(d.paidAt), paidBy: typeof d.paidBy === "string" ? d.paidBy : null,
    paymentMethod: d.paymentMethod ? oneOf(d.paymentMethod, ["online", "cash", "bank_transfer", "manual", "other"] as const, "other") : null,
    paymentNote: str(d.paymentNote),
  };
}

export function mapPayment(id: string, d: Data): Payment {
  return {
    id, ...meta(d),
    invoiceId: str(d.invoiceId), customerId: str(d.customerId), amount: num(d.amount), currency: "ZAR",
    method: oneOf(d.method, ["online", "cash", "bank_transfer", "manual", "other"] as const, "other"),
    status: oneOf(d.status, ["succeeded", "pending", "failed", "refunded"] as const, "succeeded"),
    provider: str(d.provider, "manual"), reference: str(d.reference), recordedBy: str(d.recordedBy), note: str(d.note), paidAt: toIso(d.paidAt),
  };
}

/** The token hash is intentionally dropped here. */
export function mapLicense(id: string, d: Data): License {
  return {
    id, ...meta(d),
    customerId: str(d.customerId), subscriptionId: typeof d.subscriptionId === "string" ? d.subscriptionId : null,
    tokenPrefix: str(d.tokenPrefix), terminalLimit: num(d.terminalLimit, 1), issueDate: str(d.issueDate), expiryDate: str(d.expiryDate),
    gracePeriodDays: num(d.gracePeriodDays, 5), status: oneOf(d.status, ["ACTIVE", "REVOKED", "EXPIRED"] as const, "ACTIVE"),
    revoked: bool(d.revoked), lastVerifiedAt: toIso(d.lastVerifiedAt), lastActivityAt: toIso(d.lastActivityAt),
    flagged: bool(d.flagged), flagReason: str(d.flagReason), flaggedAt: toIso(d.flaggedAt),
    deviceLimit: typeof d.deviceLimit === "number" && Number.isInteger(d.deviceLimit) && d.deviceLimit > 0 ? d.deviceLimit : null,
    lastRegeneratedAt: toIso(d.lastRegeneratedAt),
    selfRemovals: (Array.isArray(d.selfRemovals) ? d.selfRemovals : []).map((x) => toIso(x)).filter((x): x is string => Boolean(x)),
  };
}

export function mapTerminal(id: string, d: Data): Terminal {
  return {
    id, ...meta(d),
    customerId: str(d.customerId), shopId: typeof d.shopId === "string" ? d.shopId : null, shopName: str(d.shopName),
    licenseId: str(d.licenseId), deviceName: str(d.deviceName, "Unnamed device"), hardwareIdShort: str(d.hardwareIdShort),
    status: oneOf(d.status, ["ACTIVE", "DISABLED", "REVOKED"] as const, "ACTIVE"),
    registeredAt: toIso(d.registeredAt), lastSeenAt: toIso(d.lastSeenAt), localIp: str(d.localIp), version: str(d.version),
    macAddress: str(d.macAddress), hostname: str(d.hostname), os: str(d.os), publicIp: str(d.publicIp),
    clockSkewSeconds: typeof d.clockSkewSeconds === "number" && Number.isFinite(d.clockSkewSeconds) ? Math.round(d.clockSkewSeconds) : null,
    macChanged: bool(d.macChanged), previousMac: str(d.previousMac),
    secretState: oneOf(d.secretState, ["none", "bound", "missing", "wrong"] as const, "none"), removedBy: str(d.removedBy),
    adminLabel: str(d.adminLabel), note: str(d.note),
  };
}

function mapFiles(v: unknown): ReleaseFile[] {
  if (!Array.isArray(v)) return [];
  return v.map((f, i) => {
    const o = obj(f);
    const storagePath = str(o.storagePath);
    return {
      id: str(o.id, `f${i + 1}`),
      kind: oneOf(o.kind, ["installer", "checksums", "documentation", "sql", "other"] as const, "other"),
      name: str(o.name), source: oneOf(o.source, ["upload", "link"] as const, storagePath ? "upload" : "link"),
      storagePath, linkHost: str(o.linkHost), deliveryMode: oneOf(o.deliveryMode, ["proxy", "redirect"] as const, "proxy"),
      sizeBytes: num(o.sizeBytes), contentType: str(o.contentType),
    };
  });
}

export function mapRelease(id: string, d: Data): Release {
  return {
    id, ...meta(d),
    version: str(d.version), title: str(d.title), status: oneOf(d.status, ["draft", "published", "archived"] as const, "draft"),
    isLatest: bool(d.isLatest), releaseDate: str(d.releaseDate), platform: str(d.platform, "Windows"),
    changes: strArray(d.changes), minRequirements: strArray(d.minRequirements), installInstructions: strArray(d.installInstructions),
    checksumSha256: str(d.checksumSha256), files: mapFiles(d.files), publishedAt: toIso(d.publishedAt), archivedAt: toIso(d.archivedAt),
  };
}

export function mapShareLink(id: string, d: Data): ShareLink {
  return {
    id, ...meta(d), releaseId: str(d.releaseId), fileId: str(d.fileId), label: str(d.label), expiresAt: toIso(d.expiresAt),
    maxUses: num(d.maxUses, 1), uses: num(d.uses), revoked: bool(d.revoked), createdBy: str(d.createdBy), lastUsedAt: toIso(d.lastUsedAt),
  };
}

export function mapDownloadStats(id: string, d: Data): DownloadStats {
  const counts = (v: unknown): Record<string, number> => Object.fromEntries(Object.entries(obj(v)).map(([k, n]) => [k, num(n)]));
  const total = num(d.total);
  // Older documents have no click counter: the best honest figure for them is the number of downloads.
  return { releaseId: id, total, clicks: Math.max(num(d.clicks, total), total), signedInClicks: num(d.signedInClicks), guestClicks: num(d.guestClicks), days: counts(d.days), files: counts(d.files) };
}

export function mapPortalUser(id: string, d: Data): PortalUser {
  return {
    id, ...meta(d),
    email: str(d.email), name: str(d.name), businessName: str(d.businessName), phone: str(d.phone), address: str(d.address), country: str(d.country, "South Africa"),
    provider: str(d.provider), emailVerified: bool(d.emailVerified), customerId: typeof d.customerId === "string" && d.customerId ? d.customerId : null,
    loginCount: num(d.loginCount), lastLoginAt: toIso(d.lastLoginAt), downloadClicks: num(d.downloadClicks), lastDownloadAt: toIso(d.lastDownloadAt),
    profileComplete: bool(d.profileComplete),
  };
}

/** Never throws: anything an admin hasn't filled in falls back to the built-in text, so /setup is never blank. */
export function mapSetupGuide(d: Data | null): SetupGuide {
  const s = d ?? {};
  const D = DEFAULT_SETUP_GUIDE;
  const steps = (Array.isArray(s.steps) ? s.steps : []).map((x) => ({ title: str(obj(x).title).trim(), body: str(obj(x).body).trim() })).filter((x) => x.title || x.body);
  const help = (Array.isArray(s.help) ? s.help : []).map((x) => ({ question: str(obj(x).question).trim(), answer: str(obj(x).answer).trim() })).filter((x) => x.question && x.answer);
  const hasContent = Array.isArray(s.steps);
  return {
    headline: str(s.headline).trim() || D.headline, intro: str(s.intro).trim() || D.intro,
    steps: hasContent ? steps : D.steps.map((x) => ({ ...x })), help: hasContent ? help : D.help.map((x) => ({ ...x })),
    contactNote: str(s.contactNote), whatsapp: str(s.whatsapp).replace(/\D/g, ""), videoUrl: /^https:\/\//.test(str(s.videoUrl)) ? str(s.videoUrl) : "",
    updatedAt: toIso(s.updatedAt),
  };
}

export function mapPricing(d: Data): PricingConfig {
  const plans: PricingPlan[] = Array.isArray(d.plans)
    ? d.plans.map((p, i) => {
        const o = obj(p);
        return {
          id: str(o.id, `plan-${i + 1}`), name: str(o.name), description: str(o.description), pricePerTerminal: num(o.pricePerTerminal),
          minTerminals: num(o.minTerminals, 1), maxTerminals: Math.max(num(o.minTerminals, 1), num(o.maxTerminals, 200)),
          // Plans saved before these options existed offer every billing choice with no discount, exactly as they behaved then.
          frequencies: (Array.isArray(o.frequencies) ? o.frequencies : ["monthly", "quarterly", "annual"]).filter((f): f is BillingFrequency => f === "monthly" || f === "quarterly" || f === "annual"),
          discountQuarterly: Math.min(90, Math.max(0, num(o.discountQuarterly))), discountAnnual: Math.min(90, Math.max(0, num(o.discountAnnual))),
          features: strArray(o.features), highlighted: bool(o.highlighted),
        };
      })
    : [];
  return {
    currency: "ZAR", billingFrequency: oneOf(d.billingFrequency, ["monthly", "quarterly", "annual"] as const, "monthly"),
    headline: str(d.headline), subtitle: str(d.subtitle), plans, updatedAt: toIso(d.updatedAt),
  };
}

export function mapNotification(id: string, d: Data): NotificationRecord {
  return {
    id, ...meta(d),
    type: oneOf(d.type, ["payment_reminder", "payment_failed", "invoice_issued", "license_expiry", "subscription_status", "release_announcement", "general"] as const, "general"),
    channel: oneOf(d.channel, ["email", "in_app", "whatsapp"] as const, "in_app"),
    customerId: typeof d.customerId === "string" ? d.customerId : null, recipient: str(d.recipient), title: str(d.title), message: str(d.message),
    status: oneOf(d.status, ["queued", "sent", "failed", "read"] as const, "queued"),
    scheduledFor: toIso(d.scheduledFor), sentAt: toIso(d.sentAt), error: str(d.error),
  };
}

export function mapAuditLog(id: string, d: Data): AuditLog {
  return {
    id, userId: str(d.userId), userEmail: str(d.userEmail), action: str(d.action), targetType: str(d.targetType),
    targetId: str(d.targetId), targetLabel: str(d.targetLabel), metadata: obj(d.metadata), createdAt: toIso(d.createdAt),
  };
}

export function mapInquiry(id: string, d: Data): Inquiry {
  return { id, name: str(d.name), email: str(d.email), phone: str(d.phone), business: str(d.business), message: str(d.message), createdAt: toIso(d.createdAt) };
}

/** The offline allowance in hours, from either the current hours fields or the older day fields, held to 0 to 360 with max >= min. */
function offlineHours(l: Data): { min: number; max: number } {
  const D = DEFAULT_SETTINGS.licensing;
  const fromDays = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v * 24 : fallback);
  const min = Math.min(360, Math.max(0, num(l.offlineMinHours, fromDays(l.offlineGraceDays, D.offlineMinHours))));
  const max = Math.min(360, Math.max(min, num(l.offlineMaxHours, fromDays(l.offlineMaxDays, D.offlineMaxHours))));
  return { min: Math.round(min), max: Math.round(max) };
}

export function mapSettings(d: Data | null): AppSettings {
  const s = d ?? {};
  const g = obj(s.general), b = obj(s.branding), bi = obj(s.billing), l = obj(s.licensing), n = obj(s.notifications), r = obj(s.releases), dl = obj(s.downloads);
  const D = DEFAULT_SETTINGS;
  return {
    general: { productName: str(g.productName, D.general.productName), supportEmail: str(g.supportEmail), salesEmail: str(g.salesEmail) },
    branding: { logoText: str(b.logoText, D.branding.logoText), accentHex: str(b.accentHex, D.branding.accentHex) },
    billing: {
      vatRate: num(bi.vatRate, D.billing.vatRate), invoicePrefix: str(bi.invoicePrefix, D.billing.invoicePrefix),
      billingDay: num(bi.billingDay, D.billing.billingDay), defaultGraceDays: num(bi.defaultGraceDays, D.billing.defaultGraceDays),
      reminderDaysBefore: num(bi.reminderDaysBefore, D.billing.reminderDaysBefore),
    },
    licensing: {
      defaultValidityDays: num(l.defaultValidityDays, D.licensing.defaultValidityDays),
      // Saved before the allowance was set in hours? Its day values are carried over (7 days = 168 hours).
      offlineMinHours: offlineHours(l).min,
      offlineMaxHours: offlineHours(l).max,
      verificationIntervalHours: num(l.verificationIntervalHours, D.licensing.verificationIntervalHours),
      activityWriteMinutes: Math.min(15, Math.max(1, num(l.activityWriteMinutes, D.licensing.activityWriteMinutes))),
      checkIntervalMinutes: Math.min(3, Math.max(1, num(l.checkIntervalMinutes, D.licensing.checkIntervalMinutes))),
      selfRemovalsPer30Days: num(l.selfRemovalsPer30Days, D.licensing.selfRemovalsPer30Days),
      clockToleranceMinutes: num(l.clockToleranceMinutes, D.licensing.clockToleranceMinutes),
      enforceDeviceSecret: bool(l.enforceDeviceSecret, D.licensing.enforceDeviceSecret),
    },
    notifications: { emailEnabled: bool(n.emailEnabled), sendReminders: bool(n.sendReminders, true) },
    releases: { requireChecksum: bool(r.requireChecksum) },
    downloads: { requireLogin: bool(dl.requireLogin, D.downloads.requireLogin) },
  };
}
