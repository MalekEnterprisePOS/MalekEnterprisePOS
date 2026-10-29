import { BookOpen, Check, Download, KeyRound, MessageCircle, PlayCircle } from "lucide-react";
import type { Metadata } from "next";
import { LeaseTimeline } from "@/components/marketing/LeaseTimeline";
import { NetworkDiagram } from "@/components/marketing/NetworkDiagram";
import { PageBand } from "@/components/marketing/PageBand";
import { Reveal } from "@/components/marketing/Reveal";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { fetchPublicSettings, fetchSetupGuide } from "@/lib/firebase/publicRest";

export const revalidate = 60;
export const metadata: Metadata = {
  title: "Setup Guide & Local LAN Architecture",
  description:
    "How to get Malek Enterprise POS running in your shop: Shop Server setup, 2-step client till LAN auto-discovery, Admin Device Approval Gate, and offline lease resilience.",
};

export default async function SetupPage() {
  const [guide, { supportEmail }] = await Promise.all([fetchSetupGuide(), fetchPublicSettings()]);

  return (
    <>
      <PageBand
        title={guide.headline || "Up and trading on your local network in minutes."}
        lede={guide.intro || "One PC runs as your Shop Server. Every other till discovers it automatically over your LAN, passes through the Admin Device Approval Gate, and trades without relying on the internet."}
      />

      {/* Local LAN Architecture Visual */}
      <section className="bg-ink-950 py-16 text-white">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid items-center gap-12 lg:grid-cols-[0.88fr_1.12fr]">
            <Reveal>
              <Badge tone="accent">Local-First LAN Architecture</Badge>
              <h2 className="display-wide mt-4 text-3xl font-bold sm:text-4xl">
                How the Shop Server and Client Tills work together.
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-ink-200">
                Your sales, stock levels, debtor balances, and supplier GRVs live on a PostgreSQL database inside your shop. Tills communicate over your local router or network switch in milliseconds, while the Server performs a brief, signed licence check once a day.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-ink-100">
                <li className="flex items-center gap-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-live/20 text-live">
                    <Check className="h-3 w-3" aria-hidden />
                  </span>
                  2-step LAN auto-discovery—no static IP configuration needed
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-live/20 text-live">
                    <Check className="h-3 w-3" aria-hidden />
                  </span>
                  Admin Device Approval Gate blocks unapproved PCs from connecting
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-live/20 text-live">
                    <Check className="h-3 w-3" aria-hidden />
                  </span>
                  7-day default offline allowance keeps every till trading through outages
                </li>
              </ul>
            </Reveal>
            <Reveal delay={0.08}>
              <div className="rounded-xl3 bg-white/[0.05] p-5 ring-1 ring-white/10 sm:p-8">
                <NetworkDiagram />
                <div className="mt-8 border-t border-white/10 pt-7">
                  <LeaseTimeline />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Step-by-Step Guide */}
      <div className="bg-paper py-14">
        <div className="mx-auto max-w-4xl space-y-12 px-5">
          <ol className="space-y-5">
            {guide.steps.map((step, i) => (
              <li key={`${i}-${step.title}`} className="flex gap-5 rounded-xl3 border border-line bg-surface p-6 shadow-card">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink-900 font-display text-lg font-bold text-accent" aria-hidden>{i + 1}</span>
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-bold text-ink-900">{step.title}</h2>
                  <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/account" size="lg"><KeyRound className="h-5 w-5" aria-hidden />My account and licence key</ButtonLink>
            <ButtonLink href="/download" variant="secondary" size="lg"><Download className="h-5 w-5" aria-hidden />Download installer</ButtonLink>
            {guide.videoUrl && <ButtonLink href={guide.videoUrl} variant="secondary" size="lg" target="_blank" rel="noopener noreferrer"><PlayCircle className="h-5 w-5" aria-hidden />Watch the video</ButtonLink>}
          </div>

          {guide.help.length > 0 && (
            <section aria-labelledby="help">
              <h2 id="help" className="mb-5 flex items-center gap-2 font-display text-2xl font-bold text-ink-900"><BookOpen className="h-6 w-6 text-accent-strong" aria-hidden />Help &amp; Troubleshooting</h2>
              <div className="divide-y divide-line overflow-hidden rounded-xl3 border border-line bg-surface shadow-card">
                {guide.help.map((h) => (
                  <details key={h.question} className="group p-5">
                    <summary className="cursor-pointer list-none font-semibold text-ink-900 marker:hidden">{h.question}</summary>
                    <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-muted">{h.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl3 bg-ink-900 p-8 text-[15px] text-ink-200 shadow-lift">
            <h2 className="font-display text-xl font-bold text-white">Still stuck?</h2>
            {guide.contactNote && <p className="mt-2 whitespace-pre-line">{guide.contactNote}</p>}
            <div className="mt-5 flex flex-wrap gap-3">
              {guide.whatsapp && <ButtonLink href={`https://wa.me/${guide.whatsapp}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" aria-hidden />Chat on WhatsApp</ButtonLink>}
              {supportEmail && <ButtonLink href={`mailto:${supportEmail}`} variant="onDark">{supportEmail}</ButtonLink>}
              <ButtonLink href="/contact" variant="onDark">Send us a message</ButtonLink>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
