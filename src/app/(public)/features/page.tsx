import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Calculator,
  CalendarClock,
  ClipboardCheck,
  Coins,
  Database,
  FileCheck2,
  HardDriveDownload,
  KeyRound,
  Layers,
  Lock,
  MonitorSmartphone,
  PackageCheck,
  Percent,
  Printer,
  Receipt,
  Scale,
  ScanLine,
  Search,
  ServerCog,
  ShieldCheck,
  Split,
  Tag,
  Truck,
  Users,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { PageBand } from "@/components/marketing/PageBand";
import { Reveal } from "@/components/marketing/Reveal";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Features",
  description:
    "SARS Section 20 3-tier tax invoicing, 4-way split tenders, blind cash-up (Z-Report), Available-to-Sell stock, debtors & creditors 5-bucket aging, yard gate-passes, CPA Section 62 laybys, GRVs with landed WAC, and multi-till local LAN setup in Malek Enterprise POS.",
};

interface FeatureItem {
  icon: LucideIcon;
  title: string;
  badge?: string;
  text: string;
}

interface FeatureSection {
  id: string;
  tag: string;
  title: string;
  lede: string;
  calloutTitle: string;
  calloutLines: [string, string][];
  calloutFooter: string;
  items: FeatureItem[];
}

const sections: FeatureSection[] = [
  {
    id: "till-sars-checkout",
    tag: "Counter & SARS Compliance",
    title: "Till Point, Checkout & SARS Tax Compliance",
    lede: "Fast scanning and tender handling at the counter, backed by automatic South African VAT classification, 10c cash rounding, and fractional quantity support.",
    calloutTitle: "SARS SECTION 20 AUTO-CLASSIFICATION",
    calloutLines: [
      ["Sale <= R50.00", "Standard Till Slip"],
      ["R50.01 - R5,000.00", "Abridged Tax Invoice"],
      ["Sale > R5,000.00", "Full Tax Invoice + Buyer VAT"],
      ["Cash Tender Rounding", "SA 10c Floor Rounding"],
    ],
    calloutFooter: "Validates 10-digit buyer SARS VAT numbers starting with 4",
    items: [
      {
        icon: Receipt,
        title: "SARS Section 20 3-Tier Tax Invoicing",
        badge: "SARS Sec 20",
        text: "Automatically classifies every sale by value into a standard Till Slip (≤ R50), Abridged Tax Invoice (R50.01 – R5,000), or Full Tax Invoice (> R5,000 or triggered on demand), capturing Buyer Legal Name, Address, and validating 10-digit SARS VAT numbers (starting with 4).",
      },
      {
        icon: Percent,
        title: "Multi-Rate VAT Engine",
        badge: "15% · 0% · Exempt",
        text: "Native support for Standard-Rated (15% VAT), Zero-Rated (0%), and Exempt stock items with exact inclusive and exclusive tax extraction printed on every slip.",
      },
      {
        icon: Split,
        title: "SA 10c Cash Rounding & 4-Way Split Tenders",
        badge: "4 Tenders",
        text: "Automatic South African 10c cash floor rounding—even on the remaining cash balance of a split payment across Cash, Card, Customer Account (Debtor), and EFT / Bank Transfer.",
      },
      {
        icon: Coins,
        title: "Debit Card Cash-Back at the Till",
        text: "Let customers draw cash on card purchases; automatically deducts physical cash from the till drawer while excluding cash-back from taxable VAT turnover.",
      },
      {
        icon: Scale,
        title: "Fractional & Decimal Quantities",
        badge: "0.75 · 2.5 · 12.345",
        text: "Sell by 0.75, 2.5, or 12.345 units for electrical cable, timber, aggregates, liquids, or weighted goods with exact line-total math.",
      },
      {
        icon: ScanLine,
        title: "Instant Price-Check & Slip Reprints",
        text: "Check prices and live stock in two seconds without disturbing an active sale, and reprint any historical receipt or tax invoice on demand.",
      },
    ],
  },
  {
    id: "shift-cashup-safedrops",
    tag: "Cash Control & Z-Reports",
    title: "Shift Control, Blind Cash-Up (Z-Report) & Safe Drops",
    lede: "Keep cash in the drawer below your risk threshold during the day and run an honest, blind end-of-shift reconciliation at closing time.",
    calloutTitle: "EXPECTED DRAWER CASH FORMULA",
    calloutLines: [
      ["+ Opening Float & Cash Sales", "Included"],
      ["+ Debtor & Layby Cash Receipts", "Included"],
      ["- Cash Refunds & Card Cash-Back", "Deducted"],
      ["- Shift Safe Drops (Skims)", "Deducted"],
    ],
    calloutFooter: "Flags exact Over / Short variance only after blind count is submitted",
    items: [
      {
        icon: AlertTriangle,
        title: "Live Safe-Drop Warning Banner",
        badge: "Drawer Limit Alert",
        text: "Alerts cashiers and managers on screen the moment physical cash in the drawer exceeds your safety limit (e.g., R4,000) with a one-click \"Skim to Safe Now\" action.",
      },
      {
        icon: Calculator,
        title: "Blind Cash-Up & SA Denomination Counter",
        badge: "R200 down to 10c",
        text: "Cashiers count physical notes (R200 to R10) and coins (R5 to 10c) without seeing the system total first—eliminating forced balances at shift end.",
      },
      {
        icon: FileCheck2,
        title: "Complete Expected-Cash Reconciliation",
        text: "Automatically reconciles Opening Float + Net Cash Sales + Debtor & Layby Receipts − Cash Refunds − Debit Card Cash-Back − Safe Drops to flag exact Over/Short variances.",
      },
      {
        icon: ClipboardCheck,
        title: "Expense Recording & Stock Wastage Logging",
        text: "Log petty-cash shop expenses and damaged or expired stock wastage straight from the shift with mandatory reason codes and supervisor audit trails.",
      },
    ],
  },
  {
    id: "unified-enquiries-audit",
    tag: "Stock, Debtors & Creditors",
    title: "Unified Enquiries & Audit Hub (Stock, Creditors & Debtors)",
    lede: "One enquiry hub for live Available-to-Sell inventory, 12-month product profitability, supplier 5-bucket aging, and trade debtor accounts.",
    calloutTitle: "AVAILABLE-TO-SELL (ATS) ENGINE",
    calloutLines: [
      ["Physical Stock on Hand (SOH)", "120 Bags"],
      ["Less: Yard Held (Paid, Uncollected)", "- 35 Bags"],
      ["Less: Layby Locked Stock", "- 15 Bags"],
      ["Available to Sell at Till (ATS)", "= 70 Bags"],
    ],
    calloutFooter: "Prevents cashiers from selling stock already paid for or on layby",
    items: [
      {
        icon: Boxes,
        title: "Live Available-to-Sell (ATS) Stock Engine",
        badge: "SOH · Yard · Layby",
        text: "Real-time stock visibility separating Physical SOH, Yard Held (paid for, awaiting collection/delivery), and Layby Locked so cashiers never oversell committed stock.",
      },
      {
        icon: BarChart3,
        title: "12-Month Sales & GP Matrix + Bin Card",
        badge: "12-Mo Matrix",
        text: "Drill into any product to view a 12-month sales, VAT, cost-of-sales, and gross-profit matrix, compare all stock month-to-month, see \"Customers Who Bought It\" (with one-click slip reprint), and inspect the full Stock Movement Ledger (Bin Card) and Supplier GRV Cost History.",
      },
      {
        icon: Search,
        title: "Creditors (Suppliers) Enquiries & 5-Bucket Aging",
        badge: "0–30 to 120+ Days",
        text: "Full supplier ledger with running balances, 5-bucket aging (0–30, 31–60, 61–90, 91–120, 120+ Days), GRV line-item drill-downs, Returns to Supplier (RTS / Debit Notes), and payment tracking.",
      },
      {
        icon: Users,
        title: "Debtors (Customer Accounts) & Price Tiers",
        badge: "Retail & Trade Tiers",
        text: "Manage account customers with credit limits, custom Price Tiers (e.g., Retail vs. Trade/Contractor), 5-bucket debtor aging, full running-balance ledgers, multi-tender account payments (Cash/Card/EFT with live projected balance), statements, and instant invoice reprints.",
      },
    ],
  },
  {
    id: "yard-gatepass-delivery",
    tag: "Hardware & Building Supply",
    title: "Yard Retention, Gate-Passes & Delivery Note Management",
    lede: "Purpose-built for hardware, timber, and building supply yards where customers pay inside and collect or take delivery in stages.",
    calloutTitle: "DISPATCH & GATE-PASS LIFECYCLE",
    calloutLines: [
      ["1. Paid at Till", "Moves SOH -> Yard Held"],
      ["2. Partial Collect / Load", "Prints Gate-Pass (Qty Only)"],
      ["3. Status Tracker", "Pending · In Transit · Partial"],
      ["4. Final Dispatch", "Clears Yard Held Balance"],
    ],
    calloutFooter: "Priority tags: Normal, Urgent, and Express with driver notes",
    items: [
      {
        icon: Truck,
        title: "Delivery Note Generator & Live Tracker",
        badge: "Live Dispatch Status",
        text: "Track every delivery from Pending to In Transit, Partially Delivered, and Delivered with priority levels (Normal, Urgent, Express) and driver notes.",
      },
      {
        icon: PackageCheck,
        title: "Yard Gate-Passes & Partial Dispatch",
        badge: "Staged Collection",
        text: "Built for hardware and building supply stores—customers can pay at the till and collect stock in stages. Partial dispatches deduct from Yard Held item by item until the order is fulfilled.",
      },
      {
        icon: Printer,
        title: "Unpriced Driver & Security Gate Slips",
        text: "Prints clean delivery notes and yard gate-passes with quantities and units only (no prices shown) plus special delivery instructions for drivers and yard security.",
      },
    ],
  },
  {
    id: "cpa-layby-management",
    tag: "Consumer Protection Act",
    title: "CPA Section 62 Compliant Layby Management",
    lede: "Lock stock aside on structured installment plans with statutory South African Consumer Protection Act cancellation calculations built in.",
    calloutTitle: "CPA SECTION 62 CANCELLATION MATH",
    calloutLines: [
      ["Layby Goods Total", "R 2,400.00"],
      ["Customer Paid to Date", "R 600.00"],
      ["Max Legal Penalty (1% of Total)", "R 24.00"],
      ["Refund Due (or Manager Waiver)", "R 576.00 (or R 600.00)"],
    ],
    calloutFooter: "Penalty is automatically capped at deposit paid so refund never goes negative",
    items: [
      {
        icon: CalendarClock,
        title: "Flexible Layby Plans (1 to 12 Months)",
        badge: "1–12 Months",
        text: "Lock stock aside with an initial deposit, automatic monthly installment calculations, expiry tracking, payment receipts, and balance reminders.",
      },
      {
        icon: ShieldCheck,
        title: "Statutory CPA Section 62 Cancellation Math",
        badge: "1% Max Penalty Cap",
        text: "If a layby is cancelled, the system automatically calculates the maximum legal 1% cancellation penalty (capped at the customer's deposit so it never goes negative) with a one-click Manager Penalty Waiver and automatic stock return.",
      },
    ],
  },
  {
    id: "procurement-grv-wac-labels",
    tag: "Receiving, Costing & Labels",
    title: "Procurement (PO to GRV), Break-Bulk UOM, Landed WAC & Barcode Labels",
    lede: "Receive supplier deliveries accurately, break bulk cases into selling units, protect your margins with Landed Weighted Average Cost, and print shelf labels immediately.",
    calloutTitle: "LANDED WAC & MARGIN ENGINE",
    calloutLines: [
      ["Case Pack In (Break-Bulk)", "1 Case -> 24 × Each"],
      ["Costing Formula", "Landed Weighted Avg Cost"],
      ["Price Maintenance", "Markup % <-> Gross Profit %"],
      ["Post-GRV Output", "Shelf & Barcode Labels"],
    ],
    calloutFooter: "Includes negative-stock WAC reset protection and below-cost warnings",
    items: [
      {
        icon: ClipboardCheck,
        title: "Purchase Orders, GRVs & GRV Approvals",
        badge: "Pending vs Processed",
        text: "Capture supplier invoices or load from POs, apply line or document discounts, and review Pending vs. Processed vouchers in the dedicated GRV Approvals screen.",
      },
      {
        icon: Layers,
        title: "Break-Bulk Multi-UOM & BOM Kits",
        badge: "Cases -> Each / m / kg",
        text: "Receive stock in cases or boxes and automatically convert into individual selling units (Each, m, kg). Sell Bill-of-Materials (BOM) Kits that automatically deduct component items from inventory.",
      },
      {
        icon: Percent,
        title: "Landed Weighted Average Cost (WAC) & Price Maintenance",
        badge: "Markup % ↔ GP %",
        text: "Automatically recalculates WAC across stock batches (with negative-stock reset protection). Update retail prices live during or after GRV with bidirectional Markup % ↔ Gross Profit % fields and below-cost warnings.",
      },
      {
        icon: Tag,
        title: "Post-GRV Barcode & Shelf Label Printing",
        text: "Immediately after receiving a GRV, print shelf-edge or product barcode labels with customizable label sizes, sorting (by Document, Stock Code, or Description), and print preview.",
      },
    ],
  },
  {
    id: "lan-architecture-security",
    tag: "Local Server & Security",
    title: "Multi-Till Local LAN Architecture & Role-Based Security",
    lede: "Zero cloud lag and zero rogue devices. Your PostgreSQL database lives on your shop server, tills connect automatically over LAN, and every restricted action is protected.",
    calloutTitle: "LOCAL LAN & DEVICE SECURITY GATE",
    calloutLines: [
      ["Shop Server PC", "PostgreSQL + LAN Beacon"],
      ["Client Till Connection", "Auto-Discovery + Admin Gate"],
      ["Online Heartbeat", "Every 90 Seconds + Revoke"],
      ["Offline Licence Lease", "7 Days Full Trading Default"],
    ],
    calloutFooter: "BCrypt PIN authentication, Supervisor Overrides & Automated DB Backups",
    items: [
      {
        icon: ServerCog,
        title: "2-Step Local LAN Setup & Auto-Discovery",
        badge: "Zero Cloud Lag",
        text: "One PC runs as the Shop Server (hosting the local PostgreSQL database and broadcasting a LAN discovery beacon); Client Tills scan the network to find and connect to the Server automatically—trading at full speed even when the internet is down.",
      },
      {
        icon: MonitorSmartphone,
        title: "Admin Device Approval Gate",
        badge: "90s Live Heartbeat",
        text: "No rogue PC can connect to your shop database. New tills appear under Pending Device Requests on the Server and cannot trade until accepted by an Admin, with live 90-second online heartbeats and instant device revocation.",
      },
      {
        icon: Lock,
        title: "BCrypt PINs & Supervisor Overrides",
        badge: "Role-Based Access",
        text: "Fast cashier login via BCrypt-hashed PINs, instant Supervisor/Manager Override prompts for restricted actions (cancelling laybys, voids, refunds), User Login History, Expense Recording, and Stock Wastage Logging.",
      },
      {
        icon: HardDriveDownload,
        title: "Automated Database Backups, One-Click Restore & Signed Leases",
        text: "Scheduled local database backups with one-click restore, paired with cryptographically signed daily licence checks and a 7-day offline allowance for internet outages.",
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageBand
        title="Built around how a South African shop actually runs."
        lede="From SARS Section 20 tax invoices and 4-way split tenders at the till to blind cash-ups, yard gate-passes, CPA Section 62 laybys, 5-bucket debtor/creditor aging, and multi-till local LAN control."
      >
        <nav aria-label="Feature categories" className="mt-8 flex flex-wrap gap-2">
          {sections.map((s, idx) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-ink-100 transition hover:border-accent/60 hover:bg-white/10 hover:text-white"
            >
              <span className="grid h-4 w-4 place-items-center rounded-full bg-accent font-display text-[10px] font-extrabold text-accent-ink">
                {idx + 1}
              </span>
              {s.tag}
            </a>
          ))}
        </nav>
      </PageBand>

      <div className="bg-paper py-12">
        <div className="mx-auto max-w-6xl space-y-8 px-5">
          {sections.map((s, si) => (
            <Reveal key={s.id}>
              <section
                id={s.id}
                className="scroll-mt-24 grid gap-8 rounded-xl3 bg-surface p-7 shadow-card ring-1 ring-line md:p-10 lg:grid-cols-[0.76fr_1.24fr]"
              >
                <div className="flex flex-col justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent font-display text-sm font-extrabold text-accent-ink">
                        {si + 1}
                      </span>
                      <Badge tone="accent">{s.tag}</Badge>
                    </div>
                    <h2 className="display-wide mt-4 text-3xl font-bold text-ink-900 sm:text-4xl">{s.title}</h2>
                    <p className="mt-3 text-[15.5px] leading-relaxed text-muted">{s.lede}</p>
                  </div>

                  {/* Receipt-paper workflow summary panel */}
                  <div className="receipt-paper rounded-2xl border border-line p-4 font-receipt text-xs text-ink-900 shadow-sm">
                    <div className="flex items-center justify-between border-b border-dashed border-ink-300 pb-2">
                      <span className="font-bold tracking-wider text-ink-900">{s.calloutTitle}</span>
                      <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold text-accent">MODULE 0{si + 1}</span>
                    </div>
                    <dl className="my-2.5 space-y-1.5">
                      {s.calloutLines.map(([k, v]) => (
                        <div key={k} className="flex items-baseline justify-between gap-3">
                          <dt className="text-ink-600">{k}</dt>
                          <dd className="tabular font-bold text-ink-900">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="border-t border-dashed border-ink-300 pt-2 text-[11px] font-sans text-muted">
                      {s.calloutFooter}
                    </p>
                  </div>
                </div>

                <ul className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
                  {s.items.map(({ icon: Icon, title, badge, text }) => (
                    <li key={title} className="flex gap-4">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink-900 text-accent shadow-sm">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[17px] font-bold leading-snug text-ink-900">{title}</h3>
                          {badge && (
                            <span className="rounded-full bg-ink-100 px-2.5 py-0.5 font-receipt text-[11px] font-semibold text-ink-800">
                              {badge}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Hardware & Local Database Assurance Strip */}
      <section className="bg-paper pb-8 pt-2">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-4 rounded-xl3 border border-line bg-surface p-7 shadow-card sm:grid-cols-3 sm:p-8">
            <div className="flex gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ok/15 text-ok">
                <Database className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="font-display text-base font-bold text-ink-900">100% On-Premises PostgreSQL</h3>
                <p className="mt-1 text-sm text-muted">Your stock, debtors, creditors, and sales history stay on your shop server—never locked in a third-party cloud.</p>
              </div>
            </div>
            <div className="flex gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ok/15 text-ok">
                <WifiOff className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="font-display text-base font-bold text-ink-900">Load-Shedding & Outage Ready</h3>
                <p className="mt-1 text-sm text-muted">Tills talk over your local LAN in milliseconds and keep trading through internet outages with a 7-day offline allowance.</p>
              </div>
            </div>
            <div className="flex gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ok/15 text-ok">
                <KeyRound className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="font-display text-base font-bold text-ink-900">Every Module Included</h3>
                <p className="mt-1 text-sm text-muted">No paid add-ons for Debtors, Creditors, Laybys, Yard Gate-Passes, or Barcode Labels—every till gets the full POS.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-paper pb-20 pt-6">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-wrap items-center justify-between gap-6 rounded-xl3 bg-ink-900 px-8 py-10 text-white sm:px-12">
            <div>
              <h2 className="display-wide text-3xl font-bold">Ready to see how it fits your counter and yard?</h2>
              <p className="mt-2 max-w-xl text-[15px] text-ink-200">
                Download the Windows installer for your Shop Server and Client Tills, or see our 2-step local LAN setup guide.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/download" size="lg">Download installer</ButtonLink>
              <ButtonLink href="/setup" variant="onDark" size="lg">2-step LAN setup</ButtonLink>
              <ButtonLink href="/pricing" variant="onDark" size="lg">See pricing</ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
