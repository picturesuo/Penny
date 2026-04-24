"use client";

import type { KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Claim } from "@/types/mvp-core";

interface ClaimCardProps {
  claim: Claim;
  isSelected: boolean;
  onSelect: () => void;
  onChallenge: () => void;
}

type ClaimHealthSignals = {
  daysOld: number;
  daysSinceChallenge: number | null;
  isUntested: boolean;
  isStale: boolean;
  isHighConfidenceUntested: boolean;
  hasConcerns: boolean;
};

export function ClaimCard({ claim, isSelected, onSelect, onChallenge }: ClaimCardProps) {
  const healthSignals = computeClaimHealthSignals(claim);
  const confidenceHistoryCount = claim.confidenceHistory.length;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        "group rounded-[24px] border border-black/8 bg-[linear-gradient(180deg,#fffdf8_0%,#f7f2e9_100%)] p-5 text-left shadow-[0_18px_50px_rgba(35,31,23,0.06)] outline-none transition",
        "hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(35,31,23,0.08)] focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2",
        isSelected && "border-[var(--ink)] ring-2 ring-[var(--ink)] ring-offset-2",
        healthSignals.hasConcerns && "bg-[linear-gradient(180deg,#fffaf2_0%,#fff3e8_100%)]",
        healthSignals.isStale && !healthSignals.isHighConfidenceUntested && "opacity-[0.98]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className="text-white"
            style={{ background: getConfidenceBackground(claim.confidence) }}
          >
            {claim.confidence}%
          </Badge>
          {claim.dialecticRoundCount > 0 ? (
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">
              {claim.dialecticRoundCount} round{claim.dialecticRoundCount > 1 ? "s" : ""}
            </Badge>
          ) : (
            <Badge className="bg-[#fff6ed] text-[#8b4d1f]">Not yet challenged</Badge>
          )}
          <Badge className={statusTone(claim.status)}>{formatClaimStatus(claim.status)}</Badge>
          {claim.nodeStatus !== "active" ? (
            <Badge className="bg-white text-[var(--ink)]">{formatNodeStatus(claim.nodeStatus)}</Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {claim.stakes.length > 0 ? (
            <Badge className="bg-[#f3ead8] text-[#7a5a20]" title="Claim stakes">
              {claim.stakes.map(formatStake).join(" · ")}
            </Badge>
          ) : null}
          {healthSignals.isHighConfidenceUntested ? (
            <Badge className="bg-[#f8d9c9] text-[#8b3d2f]" title="High confidence but no critique rounds yet">
              Load-bearing
            </Badge>
          ) : null}
        </div>
      </div>

      <p className="mt-4 text-[15px] leading-7 text-[var(--ink)]">
        {truncateClaim(claim.text, 120)}
      </p>

      {claim.note ? (
        <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">{truncateClaim(claim.note, 140)}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge className="bg-white text-[var(--ink)]">{formatProvenance(claim.provenance)}</Badge>
        <Badge className="bg-white text-[var(--ink)]">{formatKind(claim.kind)}</Badge>
        {claim.structureKind ? <Badge className="bg-white text-[var(--ink)]">{formatStructureKind(claim.structureKind)}</Badge> : null}
        {confidenceHistoryCount > 0 ? (
          <Badge className="bg-white text-[var(--ink)]">
            {confidenceHistoryCount} update{confidenceHistoryCount > 1 ? "s" : ""}
          </Badge>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/6 pt-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-ink)]">
          <span>{formatAge(healthSignals.daysOld)} old</span>
          {healthSignals.daysSinceChallenge != null ? <span>· last challenged {formatAgo(healthSignals.daysSinceChallenge)}</span> : null}
          {healthSignals.isUntested ? <span>· no challenge history</span> : null}
          {healthSignals.isStale ? <span>· stale</span> : null}
        </div>

        <Button
          type="button"
          variant="secondary"
          className="gap-2"
          onClick={(event) => {
            event.stopPropagation();
            onChallenge();
          }}
          title="Start a challenge round"
        >
          Challenge
          <span aria-hidden="true">→</span>
        </Button>
      </div>
    </div>
  );
}

function computeClaimHealthSignals(claim: Claim): ClaimHealthSignals {
  const now = Date.now();
  const createdAt = new Date(claim.createdAt).getTime();
  const lastChallengedAt = claim.lastChallengedAt ? new Date(claim.lastChallengedAt).getTime() : null;
  const daysOld = Number.isFinite(createdAt) ? Math.max(0, Math.floor((now - createdAt) / (1000 * 60 * 60 * 24))) : 0;
  const daysSinceChallenge =
    lastChallengedAt != null && Number.isFinite(lastChallengedAt)
      ? Math.max(0, Math.floor((now - lastChallengedAt) / (1000 * 60 * 60 * 24)))
      : null;
  const isUntested = claim.dialecticRoundCount === 0;
  const isStale = daysOld > 30 && isUntested;
  const isHighConfidenceUntested = claim.confidence > 75 && isUntested;

  return {
    daysOld,
    daysSinceChallenge,
    isUntested,
    isStale,
    isHighConfidenceUntested,
    hasConcerns: isHighConfidenceUntested || isStale,
  };
}

function formatClaimStatus(status: Claim["status"]): string {
  return status.replaceAll("_", " ");
}

function formatNodeStatus(status: Claim["nodeStatus"]): string {
  return status.replaceAll("_", " ");
}

function formatKind(kind: Claim["kind"]): string {
  return kind.replaceAll("_", " ");
}

function formatStructureKind(structureKind: NonNullable<Claim["structureKind"]>): string {
  return structureKind.replaceAll("_", " ");
}

function formatStake(stake: Claim["stakes"][number]): string {
  return stake.replaceAll("_", " ");
}

function formatProvenance(provenance: Claim["provenance"]): string {
  const labels: Record<Claim["provenance"], string> = {
    intuition: "Intuition",
    cited_source: "Source",
    inherited: "Inherited",
    derived: "Derived",
  };

  return labels[provenance];
}

function truncateClaim(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}…`;
}

function formatAge(days: number): string {
  if (days <= 0) {
    return "today";
  }

  if (days === 1) {
    return "1 day";
  }

  return `${days} days`;
}

function formatAgo(days: number): string {
  if (days <= 0) {
    return "today";
  }

  if (days === 1) {
    return "1 day ago";
  }

  return `${days} days ago`;
}

function getConfidenceBackground(confidence: number): string {
  if (confidence < 40) return "var(--color-low-confidence)";
  if (confidence < 65) return "var(--color-mid-confidence)";
  return "var(--color-high-confidence)";
}

function statusTone(status: Claim["status"]): string {
  if (status === "resolved") {
    return "bg-[#d9ead8] text-[#355b32]";
  }

  if (status === "stress_tested") {
    return "bg-[#e7defa] text-[#5c4c88]";
  }

  if (status === "stale" || status === "abandoned") {
    return "bg-[#f8d9c9] text-[#8b3d2f]";
  }

  return "bg-white text-[var(--ink)]";
}
