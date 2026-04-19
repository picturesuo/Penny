import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDemoThoughtUserId } from "@/lib/thought-map";
import { listThoughtMaps } from "@/server/thought-map";
import { getIntellectualBiography } from "@/server/intellectual-biography";
import { getCognitiveFingerprint } from "@/server/cognitive-fingerprint";
import { IntellectualBiographyView } from "@/components/penny/intellectual-biography";
import { CognitiveFingerprintView } from "@/components/penny/cognitive-fingerprint";

export default async function IdentityPage() {
  const maps = await listThoughtMaps();
  const userId = maps[0]?.userId ?? getDemoThoughtUserId();
  const [biography, fingerprint] = await Promise.all([getIntellectualBiography(userId), getCognitiveFingerprint(userId)]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Identity</p>
          <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)] sm:text-5xl">
            The archive of how your thinking changed.
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted-ink)]">
            The intellectual biography and cognitive fingerprint are the two long-lived surfaces that become expensive to lose.
          </p>
        </div>
        <Link href="/app">
          <Button variant="secondary" className="gap-2">
            <ArrowLeft className="size-4" />
            Back to home
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <a href="#biography">
          <Button>Biography</Button>
        </a>
        <a href="#fingerprint">
          <Button variant="secondary">Fingerprint</Button>
        </a>
      </div>

      <section id="biography" className="scroll-mt-24">
        <IntellectualBiographyView biography={biography} />
      </section>

      <section id="fingerprint" className="scroll-mt-24">
        <CognitiveFingerprintView fingerprint={fingerprint} />
      </section>
    </div>
  );
}
