import type { Metadata } from "next";
import { PageBand } from "@/components/marketing/PageBand";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "About", description: "Why Malek Enterprise POS keeps its database in your shop and builds around real South African retail and hardware workflows." };

const principles = [
  ["Your data stays yours", "Sales, stock, debtors, and creditors live on a PostgreSQL server in your shop. Reports are instant, and nothing is locked inside a third-party cloud."],
  ["The counter and yard come first", "From SARS Section 20 3-tier tax invoicing and blind cash-ups to yard gate-passes, CPA Section 62 laybys, and 5-bucket aging—every screen is built around daily store operations."],
  ["Fair and simple pricing", "You pay per till, month to month, in rand, with every module included out of the box and no surprise add-on fees."],
];

export default function AboutPage() {
  return (
    <>
      <PageBand title="Software for shops that need the till to work." lede="Built around the real counter, cash office, and yard workflows of South African retail and hardware stores." />
      <div className="bg-paper py-16">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-10 md:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6 text-[19px] leading-relaxed text-ink-800">
              <p>Malek Enterprise POS started as software for a working South African store, written around what that business needed every day: fast sales with SARS Section 20 tax compliance, blind cash-ups with safe-drop alerts, accurate Available-to-Sell stock across the yard and layby room, proper goods received vouchers with Landed WAC, and 5-bucket debtor and creditor ledgers.</p>
              <p>Most modern point-of-sale products live in someone else&apos;s cloud. That works until load-shedding hits or the fibre line drops, the till freezes, and there&apos;s a queue of customers and contractors at the counter. We took the opposite approach: the PostgreSQL database runs on your own shop server, client tills discover it automatically over your local LAN behind an Admin Device Approval Gate, and the internet is only used for a brief daily licence check.</p>
            </div>
            <ul className="space-y-4">
              {principles.map(([t, d], i) => (
                <li key={t} className="rounded-xl3 bg-surface p-6 shadow-card ring-1 ring-line">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-accent font-display text-sm font-extrabold text-accent-ink">{i + 1}</span>
                  <h2 className="mt-3 text-lg font-bold">{t}</h2><p className="mt-1 text-[15px] text-muted">{d}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-12 flex flex-wrap gap-3">
            <ButtonLink href="/features" variant="dark" size="lg">Explore all features</ButtonLink>
            <ButtonLink href="/setup" variant="secondary" size="lg">See 2-step LAN setup</ButtonLink>
            <ButtonLink href="/contact" variant="secondary" size="lg">Get in touch</ButtonLink>
          </div>
        </div>
      </div>
    </>
  );
}
