"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ShareableTrackRecord } from "@/types/calibration-record";

type TrackRecordCardProps = {
  record: ShareableTrackRecord;
};

function formatScore(value: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "n/a";
  }

  return value.toFixed(3);
}

function formatPercentile(value: number | null) {
  if (value == null || Number.isNaN(value)) {
    return "n/a";
  }

  return `top ${100 - value}%`;
}

export function TrackRecordCard({ record }: TrackRecordCardProps) {
  return (
    <Card className="border border-black/8 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Calibration track record</p>
          <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">{record.displayName}&apos;s timestamped proof of mind</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-ink)]">
            This snapshot is generated from resolved claims and timed predictions. It shows the aggregate record, not the specific private claims behind it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-[#d9ead8] text-[#355b32]">Tamper-evident snapshot</Badge>
          <Badge className="bg-[#e7defa] text-[#5c4c88]">Generated {new Date(record.generatedAt).toLocaleDateString()}</Badge>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="rounded-[24px] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Core stats</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[18px] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Brier</p>
              <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{formatScore(record.overallBrierScore)}</p>
            </div>
            <div className="rounded-[18px] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Percentile</p>
              <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{formatPercentile(record.brierPercentile)}</p>
            </div>
            <div className="rounded-[18px] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Resolved</p>
              <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{record.resolvedPredictions}/{record.totalPredictions}</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">
            Track record age: {record.trackRecordAge}
          </p>
        </div>

        <div className="rounded-[24px] bg-[var(--panel)] p-5 xl:col-span-2">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Domain breakdown</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {record.domainBreakdown.map((domain) => (
              <div key={domain.domain} className="rounded-[18px] bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-[var(--panel)] text-[var(--ink)]">{domain.domain}</Badge>
                  <Badge className="bg-[#e7defa] text-[#5c4c88]">{domain.trend}</Badge>
                  <Badge className="bg-[#d9ead8] text-[#355b32]">{domain.predictionCount} predictions</Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
                  Brier {formatScore(domain.brierScore)} · {domain.resolvedCount} resolved
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                  {domain.systematicError.replaceAll("_", " ")} · error magnitude {domain.errorMagnitude.toFixed(3)}
                </p>
                {domain.bestPrediction ? (
                  <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
                    Best: {domain.bestPrediction.claimText}
                  </p>
                ) : null}
                {domain.worstPrediction ? (
                  <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">
                    Worst: {domain.worstPrediction.claimText}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Notable achievements</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {record.notableAchievements.length ? (
              record.notableAchievements.map((achievement) => (
                <Badge key={achievement.id} className="bg-white text-[var(--ink)]">
                  {achievement.label}
                </Badge>
              ))
            ) : (
              <p className="text-sm leading-6 text-[var(--muted-ink)]">No milestones yet. The record becomes valuable by continuing to run.</p>
            )}
          </div>
        </div>

        <div className="rounded-[24px] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Record details</p>
          <div className="mt-4 space-y-3">
            <p className="text-sm leading-6 text-[var(--ink)]">
              Generated from {record.totalPredictions} timestamped prediction{record.totalPredictions === 1 ? "" : "s"}.
            </p>
            <p className="text-sm leading-6 text-[var(--muted-ink)]">
              Claims stay private; this surface exposes only aggregate calibration data and a tamper-evident signature.
            </p>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Signature</p>
            <p className="font-mono text-xs leading-5 text-[var(--ink)]">{record.signature.slice(0, 16)}...</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
