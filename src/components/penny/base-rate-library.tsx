"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CoverageSummary, PersonalBaseRateLibrary, PersonalBaseRate } from "@/types/personal-base-rates";

function formatRate(rate: PersonalBaseRate) {
  return `${Math.round(rate.empiricalRate * 100)}%`;
}

function BaseRateCard({ rate }: { rate: PersonalBaseRate }) {
  return (
    <div className="rounded-[20px] border border-black/8 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-[var(--panel)] text-[var(--ink)]">{rate.domain}</Badge>
        <Badge className="bg-white text-[var(--muted-ink)]">{rate.claimType}</Badge>
        <Badge className={rate.useInReferenceClass ? "bg-[#d9ead8] text-[#355b32]" : "bg-[#fff6ed] text-[#8b4d1f]"}>
          {rate.useInReferenceClass ? "reliable" : "building"}
        </Badge>
      </div>
      <p className="mt-3 text-sm font-medium text-[var(--ink)]">{rate.confidenceBucket}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
        {rate.predictionCount} predictions · {rate.confirmedCount} confirmed · empirical rate {formatRate(rate)}
      </p>
      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
        CI {Math.round(rate.confidenceInterval[0] * 100)}% - {Math.round(rate.confidenceInterval[1] * 100)}%
      </p>
      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
        {rate.trend.replaceAll("_", " ")}
      </p>
    </div>
  );
}

function CoverageProgressRow({ coverage }: { coverage: CoverageSummary }) {
  return (
    <div className="rounded-[20px] border border-black/8 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--ink)]">
            {coverage.domain} - {coverage.claimType}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
            {coverage.currentCount} / {coverage.countNeededForReliability} predictions
          </p>
        </div>
        <Badge className="bg-[var(--panel)] text-[var(--ink)]">{coverage.percentToReliability}%</Badge>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/8">
        <div className="h-full rounded-full bg-[var(--ink)]" style={{ width: `${coverage.percentToReliability}%` }} />
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
        {coverage.estimatedWeeksToReach ? `~${coverage.estimatedWeeksToReach} weeks to unlock reliability` : "Start predicting to unlock this rate"}
      </p>
    </div>
  );
}

export function BaseRateLibraryView({ library }: { library: PersonalBaseRateLibrary }) {
  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Personal base rates</p>
          <h2 className="mt-2 text-3xl font-semibold text-[var(--ink)]">Your own reference classes.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-ink)]">
            These rates are derived from your resolved prediction history. They become useful only after enough data accumulates in a domain and claim type.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-[var(--panel)] text-[var(--ink)]">{library.baseRates.length} buckets</Badge>
          <Badge className="bg-[#d9ead8] text-[#355b32]">{library.reliableBaseRates.length} reliable</Badge>
          <Badge className="bg-white text-[var(--muted-ink)]">{library.domains.length} domains</Badge>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Reliable rates</p>
          <div className="mt-4 grid gap-3">
            {library.reliableBaseRates.length ? (
              library.reliableBaseRates.map((rate) => <BaseRateCard key={rate.id} rate={rate} />)
            ) : (
              <p className="text-sm leading-7 text-[var(--muted-ink)]">
                No bucket has reached reliability yet. That is expected early on.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Building toward reliability</p>
          <div className="mt-4 space-y-3">
            {library.coverageSummary.length ? (
              library.coverageSummary.map((coverage) => <CoverageProgressRow key={`${coverage.domain}:${coverage.claimType}`} coverage={coverage} />)
            ) : (
              <p className="text-sm leading-7 text-[var(--muted-ink)]">
                No personal base-rate buckets are available yet.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">When they&apos;ll become reliable</p>
        <div className="mt-4 space-y-3">
          {library.estimatedTimeToSignificance.length ? (
            library.estimatedTimeToSignificance.map((item) => (
              <div key={`${item.domain}:${item.claimType}`} className="rounded-[18px] border border-black/8 bg-white p-4">
                <p className="text-sm font-medium text-[var(--ink)]">
                  {item.domain} - {item.claimType}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.message}</p>
              </div>
            ))
          ) : (
            <p className="text-sm leading-7 text-[var(--muted-ink)]">No significance estimates yet.</p>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-[24px] border border-black/8 bg-white p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Why this matters</p>
        <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
          A personal base rate is a durable correction layer: once the sample is large enough, Penny can warn you when a new claim sits far above or below your own historical pattern.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge className="bg-[#e7defa] text-[#5c4c88]">Reference class forcing</Badge>
          <Badge className="bg-[#d9ead8] text-[#355b32]">Critique injection</Badge>
          <Badge className="bg-white text-[var(--muted-ink)]">Switching cost</Badge>
        </div>
      </section>
    </Card>
  );
}
