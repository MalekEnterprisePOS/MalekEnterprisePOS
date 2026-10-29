import {
  ArrowRight,
  Boxes,
  Calculator,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileWarning,
  Hourglass,
  KeyRound,
  Lock,
  Receipt,
  ServerCog,
  ShieldCheck,
  TrendingDown,
  Truck,
  WifiOff,
  ZapOff,
  type LucideIcon,
} from "lucide-react";
import { Faq } from "@/components/marketing/Faq";
import { GrvCard, PriceLab, ReportCard, StockCard, TillLink } from "@/components/marketing/Bento";
import { InteractiveTill } from "@/components/marketing/InteractiveTill";
import { LeaseTimeline } from "@/components/marketing/LeaseTimeline";
import { NetworkDiagram } from "@/components/marketing/NetworkDiagram";
import { Reveal } from "@/components/marketing/Reveal";
import { Spotlight } from "@/components/marketing/Spotlight";
import { TearEdge } from "@/components/marketing/TearEdge";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { fetchLatestRelease } from "@/lib/firebase/publicRest";
import { formatDate } from "@/lib/utils";
import { PRODUCT_NAME, SITE_URL } from "@/lib/constants";

export const revalidate = 60;

const steps = [
  ["Install Shop Server", "Run the installer on your main shop PC. It sets up the local PostgreSQL database and broadcasts a LAN discovery beacon."],
  ["Auto-Discover & Approve Tills", "Client tills scan the local network to find the Server automatically and wait in Pending Device Requests until approved by an Admin."],
  ["Trade Online or Offline", "Ring up SARS Section 20 tax invoices, split tenders, yard gate-passes, and laybys on your local LAN—even when the internet is down."],
  ["Blind Cash-Up & Auto Backup", "Count SA notes and coins blind at shift end, reconcile expected drawer cash, and rely on automated scheduled local database backups."],
];

const problems = [
  {
    icon: Hourglass,
    title: "Overselling stock that's already paid for in the yard or locked on layby.",
    text: "Without a live Available-to-Sell (ATS) engine separating Physical SOH, Yard Held, and Layby Locked stock, cashiers accidentally sell goods promised to another customer.",
  },
  {
    icon: FileWarning,
    title: "Cash-ups forced to match, and too much cash sitting in the till drawer.",
    text: "When cashiers see the system total before counting—or when drawers exceed R4,000 without a live safe-drop skim warning—shortages and security risks multiply.",
  },
  {
    icon: TrendingDown,
    title: "Supplier costs climb on a delivery, and retail margins quietly erode.",
    text: "Receiving cases without Break-Bulk UOM conversion, Landed Weighted Average Cost (WAC), and live Markup % ↔ GP % updates turns supplier price hikes into silent losses.",
  },
  {
    icon: ZapOff,
    title: "The internet drops during load-shedding, and cloud tills stop trading.",
    text: "Browser-based POS systems stall when the line goes down—right when a queue of trade contractors and retail customers is waiting for tax invoices and gate-passes.",
  },
];

const workflowPillars: {
  step: string;
  tag: string;
  icon: LucideIcon;
  title: string;
  text: string;
  href: string;
}[] = [
  {
    step: "01",
    tag: "SARS Section 20",
    icon: Receipt,
    title: "Till Point, 4-Way Split Tenders & SARS Tax Invoicing",
    text: "Auto-classifies Till Slips (≤ R50), Abridged (R50.01–R5,000), and Full Tax Invoices (> R5,000) with 10-digit VAT validation, 15%/0%/Exempt VAT, SA 10c cash rounding, card cash-back, and decimal quantities.",
    href: "/features#till-sars-checkout",
  },
  {
    step: "02",
    tag: "Z-Report & Skims",
    icon: Calculator,
    title: "Shift Control, Blind Cash-Up & Live Safe Drops",
    text: "On-screen Safe-Drop warning banner with one-click 'Skim to Safe Now', blind SA denomination counter (R200 to 10c), and full Expected-Cash reconciliation.",
    href: "/features#shift-cashup-safedrops",
  },
  {
    step: "03",
    tag: "ATS · 5-Bucket Aging",
    icon: Boxes,
    title: "Unified Stock, Creditors & Debtors Enquiries Hub",
    text: "Live Available-to-Sell (ATS) stock, 12-month sales & GP matrix, Bin Cards, 'Customers Who Bought It', and 5-bucket aging (0–30 to 120+ Days) for Suppliers and Debtors with Retail/Trade tiers.",
    href: "/features#unified-enquiries-audit",
  },
  {
    step: "04",
    tag: "Hardware & Yard",
    icon: Truck,
    title: "Yard Retention, Gate-Passes & Delivery Tracker",
    text: "Hold paid stock in Yard Held, dispatch in stages with partial gate-passes, print unpriced driver slips, and track deliveries from Pending to In Transit and Delivered.",
    href: "/features#yard-gatepass-delivery",
  },
  {
    step: "05",
    tag: "CPA Sec 62",
    icon: CalendarClock,
    title: "CPA Section 62 Compliant Layby Management",
    text: "1 to 12-month layby plans with locked stock, installment tracking, and statutory CPA Section 62 1% maximum cancellation penalty math (with one-click Manager Waiver).",
    href: "/features#cpa-layby-management",
  },
  {
    step: "06",
    tag: "WAC · Break-Bulk",
    icon: ClipboardCheck,
    title: "PO to GRV, Break-Bulk UOM, Landed WAC & Labels",
    text: "Receive against POs, approve Pending GRVs, break bulk cases into selling units (Each, m, kg) or BOM Kits, recalculate Landed WAC, and print shelf/barcode labels.",
    href: "/features#procurement-grv-wac-labels",
  },
  {
    step: "07",
    tag: "LAN · BCrypt PINs",
    icon: ServerCog,
    title: "Multi-Till Local LAN, Device Gate & Supervisor Security",
    text: "2-step LAN auto-discovery, Admin Device Approval Gate with 90s heartbeats, BCrypt cashier PINs, Supervisor Overrides, and automated scheduled database backups.",
    href: "/features#lan-architecture-security",
  },
];

const faq = [
  {
    q: "Do I need the internet to trade?",
    a: "No. Sales, stock, debtors, creditors, laybys, and yard gate-passes run on your shop's local PostgreSQL server over your LAN. The server checks your licence online about once a day, and if the line is down it keeps working through a 7-day offline allowance.",
  },
  {
    q: "How does SARS Section 20 tax invoicing work at the till?",
    a: "Every sale is automatically classified by value into a standard Till Slip (≤ R50), Abridged Tax Invoice (R50.01 – R5,000), or Full Tax Invoice (> R5,000 or triggered on demand), capturing the buyer's legal name, address, and validating 10-digit SARS VAT numbers starting with 4.",
  },
  {
    q: "Can it handle hardware & building supply workflows like yard collections and fractional quantities?",
    a: "Yes. You can sell decimal quantities (0.75, 2.5, 12.345m/kg), break bulk cases into individual units, hold paid stock in Yard Held, issue unpriced Yard Gate-Passes for staged collections, and track deliveries from Pending to Delivered.",
  },
  {
    q: "How do new tills connect, and can an unauthorised PC access my database?",
    a: "Client tills scan your local network and find the Shop Server automatically, but no rogue PC can trade. Every new device waits in Pending Device Requests on the Server until an Admin approves it, and approved tills maintain a live 90-second heartbeat.",
  },
  {
    q: "Are Debtors, Creditors, Laybys, and Barcode Label printing included?",
    a: "Yes. Every till licence includes the full suite: Debtors & Creditors with 5-bucket aging (0–30 to 120+ days), Retail vs. Trade price tiers, CPA Section 62 laybys, Blind Cash-Ups (Z-Reports), PO-to-GRV with Landed WAC, and post-GRV barcode label printing.",
  },
];

export default async function HomePage() {
  const latest = await fetchLatestRelease();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: PRODUCT_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Windows",
    url: SITE_URL,
    description:
      "South African retail and hardware point-of-sale software that runs on a local shop server: SARS Section 20 tax invoicing, 4-way split tenders, blind cash-ups, Available-to-Sell stock, debtors & creditors 5-bucket aging, yard gate-passes, CPA Section 62 laybys, GRVs with landed WAC, and barcode labels.",
    ...(latest ? { softwareVersion: latest.version } : {}),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-900 text-white">
        <div aria-hidden className="bg-dots pointer-events-none absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute -left-40 top-20 h-[420px] w-[420px] rounded-full bg-ink-600/40 blur-[120px]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-28 pt-14 md:pt-20 lg:grid-cols-[1.02fr_1fr] lg:pb-32">
          <div>
            {latest && (
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 py-1 pl-1 pr-3.5 text-[13px] text-ink-100">
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-ink">v{latest.version}</span>
                Released {formatDate(latest.releaseDate)}
              </p>
            )}
            <h1 className="display text-[54px] text-balance sm:text-7xl xl:text-[84px]">Point of sale that runs on your own server.</h1>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-ink-200">
              Built for South African retail, hardware, and building supply stores. SARS Section 20 tax invoicing, Available-to-Sell stock, blind cash-ups, debtors &amp; creditors, yard gate-passes, CPA laybys, and GRVs—all running locally on your shop network.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/download" size="lg">Download for Windows</ButtonLink>
              <ButtonLink href="/features" size="lg" variant="onDark">Explore all 7 modules</ButtonLink>
              <ButtonLink href="/pricing" size="lg" variant="onDark">See pricing</ButtonLink>
            </div>
            <ul className="mt-9 space-y-2.5 text-[15px] text-ink-100">
              {[
                "SARS Section 20 3-tier tax invoicing, 10c rounding & 4-way split tenders",
                "Live Available-to-Sell (ATS) stock, Yard Gate-Passes, Laybys & 5-bucket aging",
                "Local PostgreSQL server keeps tills trading at full speed through internet outages",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2.5"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-live/20 text-live"><Check className="h-3 w-3" aria-hidden /></span>{t}</li>
              ))}
            </ul>
          </div>
          <InteractiveTill />
        </div>
        <TearEdge className="absolute inset-x-0 -bottom-px" />
      </section>

      {/* Problem */}
      <section className="bg-surface py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-signal">The way most shops still do this</p>
            <h2 className="display-wide mt-3 max-w-3xl text-[32px] font-bold text-balance sm:text-[40px]">Four ways a busy shop quietly loses money every day.</h2>
          </Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            {problems.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 0.06}>
                <div className="flex h-full gap-4 rounded-xl3 border border-line bg-paper p-6">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-bad/10 text-bad">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-[17px] font-bold leading-snug text-ink-900">{title}</h3>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.2}>
            <p className="mt-10 text-[17px] font-semibold text-ink-900">This is exactly what Malek Enterprise POS is built to fix — from the counter and cash drawer to the yard gate and back office.</p>
          </Reveal>
        </div>
      </section>

      {/* Features Bento + 7-Module Suite */}
      <section className="bg-paper py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <Badge tone="accent">Complete Retail &amp; Hardware Suite</Badge>
            <h2 className="display-wide mt-3 max-w-3xl text-[32px] font-bold text-balance sm:text-[40px]">Everything a busy shop touches in a day, in one place.</h2>
            <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted">
              No stripped-down web screens and no bolted-on third-party modules. Every workflow is built into the desktop application and backed by your local PostgreSQL database.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-4 lg:grid-cols-12">
            <Reveal className="lg:col-span-7"><Spotlight className="h-full rounded-xl3"><PriceLab /></Spotlight></Reveal>
            <Reveal delay={0.06} className="lg:col-span-5"><Spotlight className="h-full rounded-xl3" tone="rgb(12 26 61 / 0.07)"><TillLink /></Spotlight></Reveal>
            <Reveal className="lg:col-span-4"><Spotlight className="h-full rounded-xl3" tone="rgb(255 255 255 / 0.45)"><GrvCard /></Spotlight></Reveal>
            <Reveal delay={0.06} className="lg:col-span-4"><Spotlight className="h-full rounded-xl3" tone="rgb(255 199 44 / 0.14)"><StockCard /></Spotlight></Reveal>
            <Reveal delay={0.12} className="lg:col-span-4"><Spotlight className="h-full rounded-xl3"><ReportCard /></Spotlight></Reveal>
          </div>

          {/* 7-Pillar Workflow Grid */}
          <div className="mt-14">
            <Reveal>
              <h3 className="display-wide text-2xl font-bold text-ink-900 sm:text-3xl">Seven complete operational modules in every licence.</h3>
            </Reveal>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workflowPillars.map(({ step, tag, icon: Icon, title, text, href }, i) => (
                <Reveal key={step} delay={i * 0.04} className={i === 6 ? "sm:col-span-2 lg:col-span-3" : ""}>
                  <a
                    href={href}
                    className="group flex h-full flex-col justify-between rounded-xl3 bg-surface p-6 shadow-card ring-1 ring-line transition hover:-translate-y-0.5 hover:ring-ink-300"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-ink-900 text-accent">
                          <Icon className="h-5 w-5" aria-hidden />
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-ink-100 px-2.5 py-0.5 font-receipt text-[11px] font-semibold text-ink-800">{tag}</span>
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-accent font-display text-xs font-extrabold text-accent-ink">{step}</span>
                        </div>
                      </div>
                      <h4 className="mt-4 text-[17px] font-bold leading-snug text-ink-900 group-hover:text-ink-700">{title}</h4>
                      <p className="mt-2 text-[14px] leading-relaxed text-muted">{text}</p>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-ink-900">
                      See full module details <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </a>
                </Reveal>
              ))}
            </div>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <ButtonLink href="/features" variant="dark" size="lg">See every feature in detail <ArrowRight className="h-4 w-4" aria-hidden /></ButtonLink>
            <ButtonLink href="/setup" variant="secondary" size="lg">How local LAN setup works</ButtonLink>
          </div>
        </div>
      </section>

      {/* Local first */}
      <section className="relative overflow-hidden bg-ink-900 py-24 text-white">
        <div aria-hidden className="bg-dots pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[0.85fr_1.15fr]">
          <Reveal>
            <h2 className="display-wide text-[32px] font-bold text-balance sm:text-[40px]">Fast at the till, because the database is in the shop.</h2>
            <p className="mt-6 text-[17px] leading-relaxed text-ink-200">
              One PC runs as the Shop Server hosting PostgreSQL and broadcasting a LAN discovery beacon. Client tills discover it automatically, pass through the Admin Device Approval Gate, and trade at local-network speed.
            </p>
            <ul className="mt-7 space-y-4 text-[15px] text-ink-100">
              <li className="flex gap-3"><WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />Internet down? Trading carries on at full speed for the length of the offline allowance.</li>
              <li className="flex gap-3"><Lock className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />Admin Device Approval Gate blocks rogue PCs, with live 90-second heartbeats and BCrypt PINs.</li>
              <li className="flex gap-3"><KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />Licence keys are checked online once a day and never stored in plain text.</li>
              <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />Licence answers are digitally signed, and scheduled database backups protect your ledger locally.</li>
            </ul>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-xl3 bg-white/[0.05] p-5 ring-1 ring-white/10 sm:p-8">
              <NetworkDiagram />
              <div className="mt-8 border-t border-white/10 pt-7"><LeaseTimeline /></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Steps */}
      <section className="bg-surface py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <h2 className="display-wide max-w-2xl text-[32px] font-bold text-balance sm:text-[40px]">From download to first sale in four steps.</h2>
          </Reveal>
          <ol className="mt-14 grid gap-x-8 gap-y-10 md:grid-cols-4">
            {steps.map(([title, text], i) => (
              <Reveal key={title} delay={i * 0.07}>
                <li className="relative border-t-2 border-ink-900 pt-5">
                  <span className="absolute -top-[13px] left-0 grid h-6 w-6 place-items-center rounded-full bg-accent font-display text-xs font-extrabold text-accent-ink ring-4 ring-surface">{i + 1}</span>
                  <h3 className="text-xl font-bold">{title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-paper py-24">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[0.6fr_1.4fr]">
          <Reveal>
            <h2 className="display-wide text-[32px] font-bold text-balance sm:text-[40px]">Questions shop owners ask.</h2>
            <p className="mt-5 text-muted">Something else? <a href="/contact" className="font-semibold text-ink-900 underline decoration-accent decoration-2 underline-offset-4">Ask us.</a></p>
          </Reveal>
          <Reveal delay={0.08}><Faq items={faq} /></Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-paper pb-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="ticket-notch relative overflow-hidden rounded-xl3 bg-accent px-8 py-14 text-accent-ink sm:px-14" style={{ ["--notch-y" as string]: "50%" }}>
            <div aria-hidden className="absolute inset-y-0 right-24 hidden w-px border-l-2 border-dashed border-ink-900/25 md:block" />
            <div className="flex flex-wrap items-center justify-between gap-8">
              <div>
                <h2 className="display text-4xl text-balance sm:text-6xl">Ready to see it in your shop?</h2>
                <p className="mt-4 max-w-md text-[17px] text-ink-800">Download the installer today, or tell us about your shop and we&apos;ll help you set up your Server and Client Tills.</p>
              </div>
              <div className="flex flex-wrap gap-3 md:pr-16">
                <ButtonLink href="/download" variant="dark" size="lg">Download</ButtonLink>
                <ButtonLink href="/contact" variant="secondary" size="lg" className="border-ink-900/20 bg-white/60">Talk to us</ButtonLink>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
