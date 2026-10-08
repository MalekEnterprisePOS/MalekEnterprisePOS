export const PRODUCT_NAME = "Malek Enterprise POS";
// `||` (not `??`) is deliberate here: if NEXT_PUBLIC_SITE_URL is ever set to an
// empty string on the hosting platform (rather than left unset), `??` would NOT
// fall back — only `null`/`undefined` trigger it, not "" — and the empty string
// would flow into `new URL(SITE_URL)` in layout.tsx, crashing the entire build
// with "TypeError: Invalid URL". `||` falls back on any falsy value, including "".
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export const COLLECTIONS = {
  users: "users",
  customers: "customers",
  shops: "shops",
  subscriptions: "subscriptions",
  invoices: "invoices",
  payments: "payments",
  licenses: "licenses",
  terminals: "terminals",
  releases: "releases",
  pricing: "pricing",
  notifications: "notifications",
  auditLogs: "auditLogs",
  settings: "settings",
  inquiries: "inquiries",
  downloads: "downloads",
  shareLinks: "shareLinks",
  portalUsers: "portalUsers",
  adminSeen: "adminSeen",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export const PUBLIC_NAV = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/releases", label: "Releases" },
  { href: "/download", label: "Download" },
  { href: "/setup", label: "Setup" },
  { href: "/account", label: "My account" },
] as const;

export const DEFAULT_SETTINGS = {
  general: { productName: PRODUCT_NAME, supportEmail: "", salesEmail: "" },
  branding: { logoText: "Malek", accentHex: "#F2B84B" },
  billing: { vatRate: 0.15, invoicePrefix: "INV", billingDay: 27, defaultGraceDays: 5, reminderDaysBefore: 3 },
  licensing: { defaultValidityDays: 35, offlineMinHours: 168, offlineMaxHours: 360, verificationIntervalHours: 24, activityWriteMinutes: 5, checkIntervalMinutes: 3, selfRemovalsPer30Days: 3, clockToleranceMinutes: 1440, enforceDeviceSecret: false },
  notifications: { emailEnabled: false, sendReminders: true },
  releases: { requireChecksum: false },
  downloads: { requireLogin: false },
} as const;

/** What /setup shows until an admin writes their own version (Admin > Setup guide). */
export const DEFAULT_SETUP_GUIDE = {
  headline: "Get your shop running in six steps",
  intro: "From sign-up to your first sale usually takes under an hour. Follow the steps in order, and use the help list below if anything doesn't look right.",
  steps: [
    { title: "Create your account", body: "Sign in with Google, or create an account with your email. Add your name, shop name and phone number, then confirm your email address." },
    { title: "Choose a plan and pay", body: "Pick how many tills you need and how often you want to pay. You pay by card on a secure payment page, so we never see your card details. Your licence key appears in My account the moment the payment clears." },
    { title: "Download the installer", body: "Open the Download page and get the latest installer. Install it on the PC that will act as your shop server." },
    { title: "Enter your licence key", body: "Open My account, press Show key and copy it. Paste it into the app when it asks for your licence." },
    { title: "Add your tills", body: "Install the app on each till PC and connect it to your shop server. You can register as many tills as your plan allows." },
    { title: "Start trading", body: "Add your products and staff, then ring up your first sale. Your licence renews every billing period: pay the invoice from My account and it extends automatically." },
  ],
  help: [
    { question: "I paid, but I can't see my licence key", answer: "Confirmation usually takes a few seconds. Stay on the My account page, or refresh it after a minute. If it still isn't there, contact us and quote your invoice number." },
    { question: "My licence says it has expired", answer: "Open My account and press Renew now, or pay the open invoice. The licence extends as soon as the payment clears." },
    { question: "I need more tills", answer: "Open My account, scroll to Need more tills, choose a new number of tills and pay. Your licence updates automatically." },
    { question: "I lost my licence key", answer: "Sign in to My account and press Show key. It is always available there while your licence is not revoked." },
  ],
  contactNote: "",
  whatsapp: "",
  videoUrl: "",
} as const;
