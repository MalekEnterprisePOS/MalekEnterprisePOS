import type { BillingFrequency } from "@/types";

/** The shapes /api/account/me returns that the account cards use. */
export interface PortalSubscription { id: string; plan: string; terminalLimit: number; status: string; nextBillingDate: string; billingFrequency: BillingFrequency; pricePerTerminal: number; discountPercent: number }

export interface PortalLicense {
  id: string; tokenPrefix: string; state: string; expiryDate: string; terminalLimit: number; revoked: boolean; lastVerifiedAt: string | null; flagged?: boolean; flagReason?: string;
  deviceLimit: number; devicesInUse: number;
  /** Devices the customer may still remove themselves in the current 30 days. */
  removals: { used: number; left: number; perWindow: number; nextAvailableAt: string | null };
  regenerateAvailableAt: string | null;
}

export interface PortalDevice {
  id: string; licenseId: string; deviceName: string; shopName: string; status: string; lastSeenAt: string | null; version: string; macAddress: string; hostname: string; os: string;
  online: boolean; clockSkewSeconds: number | null; macChanged: boolean; registeredAt: string | null;
}

export interface PortalSecurity { provider: string; emailVerified: boolean; lastLoginAt: string | null; loginCount: number; clockToleranceMinutes: number; selfRemovalsPer30Days: number }
