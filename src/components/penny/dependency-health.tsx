"use client";

import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildDependencyHealthReport, summarizeDependencyHealth } from "@/lib/dependency-health";
import type { DependencyHealth, ThoughtMapModel } from "@/types/thought-map";

export function DependencyHealthBar({
  health,
  label = "Dependency health",
  interactive = false,
  onClick,
}: {
  health: DependencyHealth | null;
  label?: string;
  interactive?: boolean;
  onClick?: () => void;
}) {
  const score = health?.healthScore ?? 0;
  const tone = score >= 75 ? "bg-[#d9ead8]" : score >= 55 ? "bg-[#fff6ed]" : "bg-[#f8d9c9]";
  const fill = score >= 75 ? "bg-[#2f7d32]" : score >= 55 ? "bg-[#c97d39]" : "bg-[#b45b2d]";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-ink)]">{label}</p>
        <div className="flex items-center gap-2">
          <Badge className={tone}>{score}/100</Badge>
          {interactive ? (
            <button
              className="text-xs font-medium text-[var(--ink)] underline decoration-black/20 underline-offset-4"
              type="button"
              onClick={onClick}
            >
              Open
            </button>
          ) : null}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/8">
        <div className={cn("h-full rounded-full transition-all", fill)} style={{ width: `${score}%` }} />
      </div>
      {health?.weakestLink ? (
        <p className="text-xs leading-5 text-[var(--muted-ink)]">
          Weakest link: <span className="font-medium text-[var(--ink)]">{health.weakestLink.claimText}</span>
        </p>
      ) : null}
    </div>
  );
}

export function DependencyHealthPanel({
  map,
  claimId,
  onClose,
  onRunCritiqueWeakestLink,
}: {
  map: ThoughtMapModel;
  claimId: string;
  onClose?: () => void;
  onRunCritiqueWeakestLink?: (claimId: string) => void;
}) {
  const report = useMemo(() => buildDependencyHealthReport(map, claimId), [map, claimId]);
  const summary = summarizeDependencyHealth(report.health);

  return (
    <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Dependency panel</p>
          <h4 className="mt-1 text-lg font-semibold text-[var(--ink)]">How strong is this chain?</h4>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={report.health.healthScore >= 75 ? "bg-[#d9ead8] text-[#2f5f34]" : report.health.healthScore >= 55 ? "bg-[#fff6ed] text-[#8b4d1f]" : "bg-[#f8d9c9] text-[#8b4d1f]"}>
            {report.health.healthScore}/100
          </Badge>
          {onClose ? (
            <button
              className="text-xs font-medium text-[var(--muted-ink)] underline decoration-black/20 underline-offset-4"
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {report.health.healthComponents.map((component) => (
          <div key={component.dimension} className="rounded-[18px] bg-white p-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-ink)]">{component.dimension.replaceAll("_", " ")}</p>
            <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{component.score}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{component.explanation}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[18px] bg-white p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Weakest link</p>
        <p className="mt-2 text-sm font-medium text-[var(--ink)]">{report.health.weakestLink.claimText}</p>
        <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">{report.health.weakestLink.riskReason}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge className="bg-[var(--panel)] text-[var(--ink)]">risk {report.health.weakestLink.riskScore}</Badge>
          <Badge className="bg-[var(--panel)] text-[var(--ink)]">{report.health.weakestLink.dialecticRoundCount} rounds</Badge>
          <Badge className="bg-[var(--panel)] text-[var(--ink)]">{report.health.weakestLink.downstreamImpact} downstream</Badge>
        </div>
        {onRunCritiqueWeakestLink ? (
          <Button className="mt-4 gap-2" variant="secondary" onClick={() => onRunCritiqueWeakestLink(report.health.weakestLink.claimId)}>
            <ArrowRight className="size-4" />
            Run a critique round on the weakest link now
          </Button>
        ) : null}
      </div>

      <div className="mt-4 rounded-[18px] bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Upstream chain</p>
          {summary ? <Badge className="bg-[var(--panel)] text-[var(--ink)]">{summary.score}/100 average</Badge> : null}
        </div>
        <div className="mt-3 space-y-2">
          {report.chain.map((entry) => {
            const entryHealth = entry.node.dependencyHealth ?? null;
            const entryScore = entryHealth?.healthScore ?? 0;
            const depthStyle = { marginLeft: `${entry.depth * 14}px` };
            const tone = entryScore >= 75 ? "border-[#d9ead8] bg-[#f4faf1]" : entryScore >= 55 ? "border-[#fff0dc] bg-[#fffbf4]" : "border-[#f1d1c3] bg-[#fff7f3]";

            return (
              <div key={entry.node.id} className={cn("rounded-[16px] border p-3", tone)} style={depthStyle}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                      {entry.depth === 0 ? "current claim" : `ancestor depth ${entry.depth}`}
                    </p>
                    <p className="mt-1 text-sm font-medium text-[var(--ink)]">{entry.node.content}</p>
                  </div>
                  <Badge className="bg-white text-[var(--ink)]">{entryScore}/100</Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
                  Confidence {Math.round((entry.node.scores?.confidence ?? 0) * 100)}% · {entry.node.kind.replaceAll("_", " ")}
                </p>
                {entryHealth ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/8">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        entryScore >= 75 ? "bg-[#2f7d32]" : entryScore >= 55 ? "bg-[#c97d39]" : "bg-[#b45b2d]",
                      )}
                      style={{ width: `${entryScore}%` }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-ink)]">
        <Badge className="bg-white text-[var(--ink)]">depth {report.health.chainDepth}</Badge>
        <Badge className="bg-white text-[var(--ink)]">{report.health.totalDependencies} total</Badge>
        <Badge className="bg-white text-[var(--ink)]">{report.health.untestedDependencies} untested</Badge>
        <Badge className="bg-white text-[var(--ink)]">{report.health.staleDependencies} stale</Badge>
      </div>
      {summary ? (
        <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">{summary.weakestLinkReason}</p>
      ) : null}
    </div>
  );
}
