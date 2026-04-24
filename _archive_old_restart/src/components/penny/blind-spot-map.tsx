"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  BlindSpotDomain,
  BlindSpotMap,
  ClaimTypeGap,
} from "@/types/thought-map";
import { cn } from "@/lib/utils";

type BlindSpotPriorityItem =
  | {
      kind: "claim";
      score: number;
      title: string;
      summary: string;
      neglectLabel: string;
      actionLabel: string;
      claimId: string;
      badge: string;
    }
  | {
      kind: "domain";
      score: number;
      title: string;
      summary: string;
      neglectLabel: string;
      actionLabel: string;
      claimId: string | null;
      badge: string;
    }
  | {
      kind: "assumption";
      score: number;
      title: string;
      summary: string;
      neglectLabel: string;
      actionLabel: string;
      claimId: string;
      badge: string;
    }
  | {
      kind: "load-bearing";
      score: number;
      title: string;
      summary: string;
      neglectLabel: string;
      actionLabel: string;
      claimId: string;
      badge: string;
    }
  | {
      kind: "claim-type";
      score: number;
      title: string;
      summary: string;
      neglectLabel: string;
      actionLabel: string;
      claimId: string | null;
      badge: string;
    };

type BlindSpotMapProps = {
  blindSpotMap: BlindSpotMap | null;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onOpenClaim?: (claimId: string) => void;
};

function formatPercent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function formatDays(days: number) {
  if (days <= 0) {
    return "today";
  }

  if (days === 1) {
    return "1 day";
  }

  return `${days} days`;
}

function severityRank(severity: ClaimTypeGap["gapSeverity"]) {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function domainHue(stressTestedPercent: number) {
  const normalized = Math.max(0, Math.min(1, stressTestedPercent / 20));
  return Math.round(20 + normalized * 90);
}

function domainLabel(domain: BlindSpotDomain) {
  return domain.replaceAll("_", " ");
}

function blindSpotDigest(blindSpotMap: BlindSpotMap): BlindSpotPriorityItem[] {
  const items: BlindSpotPriorityItem[] = [
    ...blindSpotMap.untestedHighConfidenceClaims.map((entry) => ({
      kind: "claim" as const,
      score: entry.urgencyScore,
      title: entry.claimText,
      summary: `Untested high-confidence claim · ${formatPercent(entry.confidence)} confidence · ${entry.dialecticRoundCount} rounds`,
      neglectLabel: `${formatDays(entry.daysSinceCreation)} untouched`,
      actionLabel: "Start critique round",
      claimId: entry.claimId,
      badge: entry.stakeLevel === "none" ? "untested claim" : `${entry.stakeLevel} stake`,
    })),
    ...blindSpotMap.unexaminedDomains.map((entry) => ({
      kind: "domain" as const,
      score: Math.max(20, 100 - entry.stressTestedPercent + Math.min(20, entry.claimCount * 2)),
      title: `${domainLabel(entry.domain)} domain`,
      summary: `${entry.stressTestedPercent}% of ${entry.claimCount} claims have been stress-tested. Average confidence ${formatPercent(entry.averageConfidence)}.`,
      neglectLabel: `Oldest untested claim: ${formatDays(Math.max(0, Math.floor((Date.now() - entry.oldestUntestedClaim.getTime()) / (1000 * 60 * 60 * 24))))} ago`,
      actionLabel: entry.sampleClaimId ? "Review this domain now" : "Review domain",
      claimId: entry.sampleClaimId,
      badge: `${entry.claimCount} claims`,
    })),
    ...blindSpotMap.unchallengedAssumptions.map((entry) => ({
      kind: "assumption" as const,
      score: Math.max(20, 35 + entry.parentClaimCount * 12 + (entry.daysSinceCreation > 90 ? 20 : 0)),
      title: entry.assumptionText,
      summary: `Supports ${entry.parentClaimCount} claims and has not been questioned.`,
      neglectLabel: `${formatDays(entry.daysSinceCreation)} untouched`,
      actionLabel: "Promote to critique",
      claimId: entry.assumptionId,
      badge: `${entry.parentClaimCount} dependents`,
    })),
    ...blindSpotMap.loadBearingUntestedNodes.map((entry) => ({
      kind: "load-bearing" as const,
      score: entry.riskScore,
      title: entry.claimText,
      summary: `${entry.downstreamClaimCount} downstream claims and ${entry.dialecticRoundCount} critique rounds.`,
      neglectLabel: `${formatDays(entry.daysSinceCreation)} old`,
      actionLabel: "Stress-test now",
      claimId: entry.claimId,
      badge: `${entry.downstreamClaimCount} dependents`,
    })),
    ...blindSpotMap.claimTypeGaps.map((entry) => ({
      kind: "claim-type" as const,
      score: severityRank(entry.gapSeverity) * 24 + Math.max(0, 20 - entry.testedClaims * 4),
      title: `${entry.claimType.replaceAll("_", " ")} claims`,
      summary: `${entry.testedClaims}/${entry.totalClaims} have been stress-tested.`,
      neglectLabel: entry.testedClaims === 0 ? "No critique rounds yet" : `${formatPercent((entry.testedClaims / Math.max(1, entry.totalClaims)) * 100)} tested`,
      actionLabel: entry.sampleClaimId ? "Review this claim type" : "Review a sample claim",
      claimId: entry.sampleClaimId,
      badge: entry.gapSeverity,
    })),
  ];

  return items.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export function BlindSpotMapView({
  blindSpotMap,
  loading = false,
  refreshing = false,
  onRefresh,
  onOpenClaim,
}: BlindSpotMapProps) {
  const [renderedAt] = useState(() => Date.now());
  const [selectedDomain, setSelectedDomain] = useState<BlindSpotDomain | null>(blindSpotMap?.unexaminedDomains[0]?.domain ?? null);

  const priorityItems = useMemo(() => (blindSpotMap ? blindSpotDigest(blindSpotMap) : []), [blindSpotMap]);
  const weeklyDigest = priorityItems.slice(0, 3);
  const selectedDomainEntry = selectedDomain
    ? blindSpotMap?.unexaminedDomains.find((entry) => entry.domain === selectedDomain) ?? null
    : blindSpotMap?.unexaminedDomains[0] ?? null;

  if (loading && !blindSpotMap) {
    return (
      <div className="rounded-[24px] border border-black/8 bg-white p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Blind spot map</p>
        <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Looking for untouched structure</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
          Penny is computing the domains, assumptions, and load-bearing claims that have not yet been examined.
        </p>
      </div>
    );
  }

  if (!blindSpotMap) {
    return (
      <div className="rounded-[24px] border border-black/8 bg-white p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Blind spot map</p>
        <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">No blind spot cache yet</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
          Penny will surface the first digest after it has enough map history to detect the gaps.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-[24px] border border-black/8 bg-[linear-gradient(180deg,#fffdf8_0%,#f8f4eb_100%)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Blind spot map</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">What this map has not examined yet</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Penny highlights domains, claims, assumptions, and structural types that have stayed outside the stress-test
            loop.
          </p>
        </div>
        {onRefresh ? (
          <Button variant="secondary" className="px-3 py-2 text-xs" disabled={refreshing} onClick={onRefresh}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        ) : null}
      </div>

      <div className="rounded-[20px] border border-black/8 bg-white p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Weekly digest</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {weeklyDigest.map((item) => (
            <div key={`${item.kind}:${item.title}`} className="rounded-[18px] bg-[var(--panel)] p-4">
              <div className="flex items-center justify-between gap-2">
                <Badge className="bg-white text-[var(--ink)]">{item.badge}</Badge>
                <Badge className={item.kind === "claim" ? "bg-[#fde7e4] text-[#8c3d33]" : "bg-[#e7defa] text-[#5c4c88]"}>
                  {formatPercent(item.score)}
                </Badge>
              </div>
              <p className="mt-3 text-sm font-medium leading-6 text-[var(--ink)]">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.summary}</p>
            </div>
          ))}
          {!weeklyDigest.length ? (
            <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)] md:col-span-3">
              No top blind spots yet. Penny has enough coverage to avoid surfacing a digest right now.
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[20px] border border-black/8 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Domain heat map</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {blindSpotMap.unexaminedDomains.map((domain) => {
              const isSelected = selectedDomain === domain.domain;
              const hue = domainHue(domain.stressTestedPercent);
              return (
                <button
                  key={domain.domain}
                  type="button"
                  className={cn(
                    "rounded-[18px] border p-4 text-left transition",
                    isSelected ? "border-[var(--ink)] shadow-sm" : "border-black/8 hover:border-black/20",
                  )}
                  style={{ backgroundColor: `hsl(${hue} 52% 92%)` }}
                  onClick={() => setSelectedDomain(domain.domain)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold capitalize text-[var(--ink)]">{domainLabel(domain.domain)}</p>
                    <Badge className="bg-white text-[var(--ink)]">{domain.claimCount} claims</Badge>
                  </div>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                    {domain.stressTestedPercent}% stress-tested
                  </p>
                  <div className="mt-3 h-2 rounded-full bg-white/60">
                    <div
                      className="h-2 rounded-full bg-[var(--ink)]"
                      style={{ width: `${Math.max(4, Math.min(100, domain.stressTestedPercent))}%` }}
                    />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
                    Avg confidence {formatPercent(domain.averageConfidence)} · oldest untouched {formatDays(
                      Math.max(0, Math.floor((renderedAt - domain.oldestUntestedClaim.getTime()) / (1000 * 60 * 60 * 24))),
                    )} ago
                  </p>
                </button>
              );
            })}
            {!blindSpotMap.unexaminedDomains.length ? (
              <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)] sm:col-span-2">
                No domain blind spots are currently below the testing threshold.
              </p>
            ) : null}
          </div>

          {selectedDomainEntry ? (
            <div className="mt-4 rounded-[18px] bg-[var(--panel)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Selected domain</p>
                  <h4 className="mt-1 text-lg font-semibold capitalize text-[var(--ink)]">
                    {domainLabel(selectedDomainEntry.domain)}
                  </h4>
                </div>
                {selectedDomainEntry.sampleClaimId && onOpenClaim ? (
                  <Button
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    onClick={() => onOpenClaim(selectedDomainEntry.sampleClaimId ?? "")}
                  >
                    Review this claim now
                  </Button>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{selectedDomainEntry.suggestedAction}</p>
            </div>
          ) : null}
        </div>

        <div className="rounded-[20px] border border-black/8 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Priority list</p>
          <div className="mt-3 space-y-3">
            {priorityItems.map((item) => (
              <div key={`${item.kind}:${item.title}`} className="rounded-[18px] bg-[var(--panel)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge className="bg-white text-[var(--ink)]">{item.badge}</Badge>
                  <Badge className="bg-[#e7defa] text-[#5c4c88]">{formatPercent(item.score)}</Badge>
                </div>
                <p className="mt-3 text-sm font-medium leading-6 text-[var(--ink)]">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.summary}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{item.neglectLabel}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    disabled={!item.claimId || !onOpenClaim}
                    onClick={() => {
                      if (item.claimId && onOpenClaim) {
                        onOpenClaim(item.claimId);
                      }
                    }}
                  >
                    {item.actionLabel}
                  </Button>
                </div>
              </div>
            ))}
            {!priorityItems.length ? (
              <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                Penny has not found a blind spot worth prioritizing yet.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
