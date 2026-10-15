import { BookOpen, Download, KeyRound, MessageCircle, PlayCircle } from "lucide-react";
import type { Metadata } from "next";
import { PageBand } from "@/components/marketing/PageBand";
import { ButtonLink } from "@/components/ui/Button";
import { fetchPublicSettings, fetchSetupGuide } from "@/lib/firebase/publicRest";

export const revalidate = 60;
export const metadata: Metadata = { title: "Setup guide", description: "How to get Malek Enterprise POS running in your shop: sign up, pay, download, enter your licence key and add your tills." };

/** Everything on this page is written by an admin under Admin > Setup guide; the built-in text is only a starting point. */
export default async function SetupPage() {
  const [guide, { supportEmail }] = await Promise.all([fetchSetupGuide(), fetchPublicSettings()]);

  return (
    <>
      <PageBand title={guide.headline} lede={guide.intro} />
      <div className="bg-paper py-14">
        <div className="mx-auto max-w-3xl space-y-14 px-5">
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
              <h2 id="help" className="mb-5 flex items-center gap-2 font-display text-2xl font-bold text-ink-900"><BookOpen className="h-6 w-6 text-accent-strong" aria-hidden />Help</h2>
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
