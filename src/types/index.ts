/** Business dates are stored as plain "YYYY-MM-DD" strings (timezone-safe).
 *  createdAt / updatedAt are Firestore server timestamps, exposed here as ISO strings. */
export type ISODateTime = string;
export type ISODate = string;

export interface Timestamps {
  createdAt: ISODateTime | null;
  updatedAt: ISODateTime | null;
}

export type CustomerStatus = "active" | "inactive";
export type SubscriptionStatus = "ACTIVE" | "PENDING" | "OVERDUE" | "GRACE" | "SUSPENDED" | "CANCELLED";
export type BillingFrequency = "monthly" | "quarterly" | "annual";
export type InvoiceStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
export type PaymentMethod = "online" | "cash" | "bank_transfer" | "manual" | "other";
export type PaymentStatus = "succeeded" | "pending" | "failed" | "refunded";
export type LicenseStatus = "ACTIVE" | "REVOKED" | "EXPIRED";
export type LicenseState = "ACTIVE" | "GRACE" | "SUSPENDED" | "EXPIRED" | "REVOKED";
export type TerminalStatus = "ACTIVE" | "DISABLED" | "REVOKED";
export type ReleaseStatus = "draft" | "published" | "archived";

export interface Customer extends Timestamps {
  id: string;
  name: string;
  businessName: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  terminals: number;
  pricePerTerminal: number;
  currency: "ZAR";
  plan: string;
  status: CustomerStatus;
  /** Denormalised from the customer's subscription so lists can show it without a join. */
  subscriptionStatus: SubscriptionStatus | "NONE";
  notes: string;
}

export interface Shop extends Timestamps {
  id: string;
  customerId: string;
  name: string;
  address: string;
}

export interface Subscription extends Timestamps {
  id: string;
  customerId: string;
  plan: string;
  terminalLimit: number;
  pricePerTerminal: number;
  currency: "ZAR";
  billingFrequency: BillingFrequency;
  startDate: ISODate;
  nextBillingDate: ISODate;
  status: SubscriptionStatus;
  gracePeriodDays: number;
  autoRenewal: boolean;
  /** Percent off each cycle, copied from the plan when it was bought (e.g. 15 for a yearly saving). 0 = none. */
  discountPercent: number;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice extends Timestamps {
  id: string;
  number: string;
  customerId: string;
  subscriptionId: string | null;
  issueDate: ISODate;
  dueDate: ISODate;
  status: InvoiceStatus;
  lines: InvoiceLine[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  currency: "ZAR";
  paidAt: ISODateTime | null;
  paidBy: string | null;
  paymentMethod: PaymentMethod | null;
  paymentNote: string;
}

export interface Payment extends Timestamps {
  id: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  currency: "ZAR";
  method: PaymentMethod;
  status: PaymentStatus;
  provider: string;
  reference: string;
  recordedBy: string;
  note: string;
  paidAt: ISODateTime | null;
}

/** The token hash is deliberately not part of this type — it never reaches the UI. */
export interface License extends Timestamps {
  id: string;
  customerId: string;
  subscriptionId: string | null;
  tokenPrefix: string;
  terminalLimit: number;
  issueDate: ISODate;
  expiryDate: ISODate;
  gracePeriodDays: number;
  status: LicenseStatus;
  revoked: boolean;
  lastVerifiedAt: ISODateTime | null;
  lastActivityAt: ISODateTime | null;
  /** Set by a till that detected tampering (e.g. the PC clock was wound back). A flagged licence is always blocked until an admin clears it. */
  flagged: boolean;
  flagReason: string;
  /** When it was last flagged. Kept after the flag is cleared, as history. */
  flaggedAt: ISODateTime | null;
  /**
   * The most devices (PCs running the POS) allowed on this licence, set by an admin. Null means "follow the plan":
   * as many devices as the subscription has tills. See effectiveDeviceLimit() in lib/licensing/rules.ts.
   */
  deviceLimit: number | null;
  /** When the customer last generated a new key themselves (limits how often they can). */
  lastRegeneratedAt: ISODateTime | null;
  /** When the customer removed devices themselves, newest last. Only the most recent 20 are kept. */
  selfRemovals: ISODateTime[];
}

export interface Terminal extends Timestamps {
  id: string;
  customerId: string;
  shopId: string | null;
  shopName: string;
  licenseId: string;
  deviceName: string;
  hardwareIdShort: string;
  status: TerminalStatus;
  registeredAt: ISODateTime | null;
  lastSeenAt: ISODateTime | null;
  localIp: string;
  version: string;
  /** Reported by the POS. Normalised to AA:BB:CC:DD:EE:FF, or "" when the PC didn't send a usable one. Helpful for the admin, but a PC can fake it: the hardware id is what identifies a device. */
  macAddress: string;
  hostname: string;
  os: string;
  /** The address the licence server saw the request come from. */
  publicIp: string;
  /** How far the PC's own clock was from the server's at its last check (seconds, positive = PC is ahead). Null = it never reported its time. */
  clockSkewSeconds: number | null;
  /** Set when the PC's MAC address differs from the one it registered with (a new network card, or a cloned install). */
  macChanged: boolean;
  previousMac: string;
  /** "bound": proved its device secret. "none": no secret issued yet. "missing": has one but didn't send it (older POS). "wrong": sent a secret that doesn't match, a strong sign of a copied install. */
  secretState: "none" | "bound" | "missing" | "wrong";
  /** "customer" or "admin" once the device has been removed. */
  removedBy: string;
  /** A name the admin gave this device (for example "Front till"). Shown instead of the name the PC reports; the POS never overwrites it. */
  adminLabel: string;
  /** The admin's private note about this device. Never shown to the customer. */
  note: string;
}

export type ReleaseFileKind = "installer" | "checksums" | "documentation" | "sql" | "other";

export type ReleaseFileSource = "upload" | "link";
/** For link files: "proxy" streams the file through our server (the link is never revealed); "redirect" sends visitors to it. */
export type LinkDeliveryMode = "proxy" | "redirect";

export interface ReleaseFile {
  /** Stable id used in download URLs. */
  id: string;
  kind: ReleaseFileKind;
  name: string;
  /** "upload" = stored in our Firebase Storage; "link" = hosted elsewhere (e.g. a GitHub release). */
  source: ReleaseFileSource;
  /** Upload only: Storage path. Never a URL. */
  storagePath: string;
  /** Link only: hostname for display, e.g. "github.com". The full URL is kept server-side and never sent to browsers. */
  linkHost: string;
  deliveryMode: LinkDeliveryMode;
  sizeBytes: number;
  contentType: string;
}

export interface ShareLink extends Timestamps {
  id: string;
  releaseId: string;
  fileId: string;
  label: string;
  expiresAt: ISODateTime | null;
  maxUses: number;
  uses: number;
  revoked: boolean;
  createdBy: string;
  lastUsedAt: ISODateTime | null;
}

export interface DownloadStats {
  releaseId: string;
  /** Downloads that actually started (the installer was fetched). */
  total: number;
  /** Times someone pressed a Download button and was handed a download link. Always >= total. */
  clicks: number;
  /** Of `clicks`: how many came from signed-in customers and how many from guests. */
  signedInClicks: number;
  guestClicks: number;
  /** YYYY-MM-DD → downloads that day. */
  days: Record<string, number>;
  /** file id → downloads. */
  files: Record<string, number>;
}

export interface Release extends Timestamps {
  id: string;
  version: string;
  title: string;
  status: ReleaseStatus;
  isLatest: boolean;
  releaseDate: ISODate;
  platform: string;
  changes: string[];
  minRequirements: string[];
  installInstructions: string[];
  checksumSha256: string;
  files: ReleaseFile[];
  publishedAt: ISODateTime | null;
  archivedAt: ISODateTime | null;
}

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  pricePerTerminal: number;
  minTerminals: number;
  /** The most tills one customer can buy on this plan. Set by the admin when the plan is created. */
  maxTerminals: number;
  /** Which billing options customers can pick on this plan. */
  frequencies: BillingFrequency[];
  /** Percent off the monthly rate when paying every 3 months / every year. 0 = no discount. */
  discountQuarterly: number;
  discountAnnual: number;
  features: string[];
  highlighted: boolean;
}

export interface PricingConfig {
  currency: "ZAR";
  billingFrequency: BillingFrequency;
  headline: string;
  subtitle: string;
  plans: PricingPlan[];
  updatedAt: ISODateTime | null;
}

export type NotificationType =
  | "payment_reminder"
  | "payment_failed"
  | "invoice_issued"
  | "license_expiry"
  | "subscription_status"
  | "release_announcement"
  | "general";
export type NotificationChannel = "email" | "in_app" | "whatsapp";
export type NotificationStatus = "queued" | "sent" | "failed" | "read";

export interface NotificationRecord extends Timestamps {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  customerId: string | null;
  recipient: string;
  title: string;
  message: string;
  status: NotificationStatus;
  scheduledFor: ISODateTime | null;
  sentAt: ISODateTime | null;
  error: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  metadata: Record<string, unknown>;
  createdAt: ISODateTime | null;
}

/**
 * Everyone who has signed in to the customer portal, whether or not they ever bought a plan.
 * Written only by the server (see src/lib/account/portalUsers.ts); admins read it on the Users page.
 */
export interface PortalUser extends Timestamps {
  /** The Firebase Auth uid (also the document id). */
  id: string;
  email: string;
  name: string;
  businessName: string;
  phone: string;
  address: string;
  country: string;
  /** "google.com" or "password". */
  provider: string;
  emailVerified: boolean;
  /** The customer record this person owns, once they have bought a plan (or an admin created one for them). */
  customerId: string | null;
  loginCount: number;
  lastLoginAt: ISODateTime | null;
  /** Times this person pressed a Download button while signed in. */
  downloadClicks: number;
  lastDownloadAt: ISODateTime | null;
  profileComplete: boolean;
}

export interface SetupStep { title: string; body: string }
export interface SetupHelpItem { question: string; answer: string }

/** The public /setup page. Every word of it is edited by an admin under Admin > Setup guide. */
export interface SetupGuide {
  headline: string;
  intro: string;
  steps: SetupStep[];
  help: SetupHelpItem[];
  /** Shown under the help list, e.g. "Call us on 082 123 4567 between 8 and 5." */
  contactNote: string;
  /** Digits only with country code, e.g. 27821234567. Becomes a "Chat on WhatsApp" button. */
  whatsapp: string;
  /** Optional https link to a how-to video. */
  videoUrl: string;
  updatedAt: ISODateTime | null;
}

export interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone: string;
  business: string;
  message: string;
  createdAt: ISODateTime | null;
}

export interface AppSettings {
  general: { productName: string; supportEmail: string; salesEmail: string };
  branding: { logoText: string; accentHex: string };
  billing: {
    vatRate: number;
    invoicePrefix: string;
    billingDay: number;
    defaultGraceDays: number;
    reminderDaysBefore: number;
  };
  licensing: {
    defaultValidityDays: number;
    /** The shortest a PC may keep trading without reaching the licence server, in hours. The actual allowance is random between this and offlineMaxHours (168 = 7 days). */
    offlineMinHours: number;
    /** The longest, in hours (at most 360 = 15 days). */
    offlineMaxHours: number;
    verificationIntervalHours: number;
    /** An unchanged, recently seen PC is recorded in the database at most this often (minutes, 1 to 15). Cuts write load; "online" stays accurate to this. */
    activityWriteMinutes: number;
    /** The longest wait (minutes, at most 3) between licence checks while a PC has internet. The actual wait is random, 1 minute up to this. */
    checkIntervalMinutes: number;
    /** How many devices a customer may remove from their own licence in any 30 days. Admins are never limited. */
    selfRemovalsPer30Days: number;
    /** A PC whose clock is further off than this (minutes) is blocked until it is corrected. 0 = don't check. */
    clockToleranceMinutes: number;
    /** ON: a PC that can't prove it is the one that registered (its device secret) is blocked. OFF: it is only flagged. */
    enforceDeviceSecret: boolean;
  };
  notifications: { emailEnabled: boolean; sendReminders: boolean };
  releases: { requireChecksum: boolean };
  /** requireLogin: visitors must sign in (with a verified email) before the installer will download. */
  downloads: { requireLogin: boolean };
}

export interface AdminActor {
  uid: string;
  email: string;
}
