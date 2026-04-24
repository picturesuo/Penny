"use client";

import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CalibrationCoaching } from "@/types/thought-map";

type CalibrationCoachingProps = {
  coaching: CalibrationCoaching | null;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
};

function trendLabel(trend: CalibrationCoaching["overallTrend"]) {
  if (trend === "improving") {
    return "improving";
  }

  if (trend === "degrading") {
    return "degrading";
  }

  return "stable";
}

function claimTypeLabel(claimType: string) {
  return claimType.replaceAll("_", " ");
}

export function CalibrationCoachingView({ coaching, loading = false, refreshing = false, onRefresh }: CalibrationCoachingProps) {
  return (
    <Card className="border border-black/8 bg-[var(--panel)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Calibration coaching</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">What to do differently by domain and claim type.</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Penny turns calibration into specific coaching so the same user can get different guidance for market, technical, and claim-structure patterns.
          </p>
        </div>
        {onRefresh ? (
          <Button variant="secondary" className="gap-2" onClick={onRefresh} disabled={loading || refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        ) : null}
      </div>

      {!coaching ? (
        <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">No calibration coaching is available yet.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge className="bg-white text-[var(--ink)]">Trend: {trendLabel(coaching.overallTrend)}</Badge>
            <Badge className="bg-[#e7defa] text-[#5c4c88]">Domains: {coaching.domainProfiles.length}</Badge>
            <Badge className="bg-[#d9ead8] text-[#355b32]">Claim types: {coaching.claimTypeProfiles.length}</Badge>
            <Badge className="bg-white text-[var(--muted-ink)]">Updated {coaching.generatedAt.toLocaleDateString()}</Badge>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Coaching recommendations</p>
              <div className="mt-3 space-y-3">
                {coaching.coachingRecommendations.length ? (
                  coaching.coachingRecommendations.slice(0, 4).map((recommendation) => (
                    <div key={recommendation.id} className="rounded-[18px] border border-black/8 bg-white/80 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{recommendation.priority}</Badge>
                        <Badge className="bg-white text-[var(--muted-ink)]">{recommendation.recommendationType.replaceAll("_", " ")}</Badge>
                        <Badge className="bg-[#e7defa] text-[#5c4c88]">±{recommendation.magnitude} points</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{recommendation.recommendationText}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                        {recommendation.domain ?? claimTypeLabel(recommendation.claimType ?? "general")}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-[18px] bg-white/80 p-4 text-sm leading-6 text-[var(--muted-ink)]">
                    No coaching recommendations yet. Once enough claims resolve, Penny will start tailoring advice to the user&apos;s calibration pattern.
                  </p>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Domain profiles</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {coaching.domainProfiles.length ? (
                  coaching.domainProfiles.map((profile) => (
                    <div key={profile.domain} className="rounded-[18px] border border-black/8 bg-white/80 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-white text-[var(--ink)]">{profile.domain}</Badge>
                        <Badge className="bg-[#e7defa] text-[#5c4c88]">{profile.systematicError.replaceAll("_", " ")}</Badge>
                        {profile.bestDomain ? <Badge className="bg-[#d9ead8] text-[#355b32]">best</Badge> : null}
                        {profile.worstDomain ? <Badge className="bg-[#fff6ed] text-[#8b4d1f]">worst</Badge> : null}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{profile.coachingNote}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                        {profile.resolvedClaimCount}/{profile.claimCount} resolved · Brier {profile.averageBrierScore.toFixed(3)} · error {profile.errorMagnitude.toFixed(1)} points
                      </p>
                      <div className="mt-3 space-y-1">
                        {profile.calibrationCurve.slice(0, 3).map((point) => (
                          <div key={point.confidenceBucket} className="flex items-center justify-between rounded-xl bg-[var(--panel)] px-3 py-2 text-xs text-[var(--muted-ink)]">
                            <span>{point.confidenceBucket}</span>
                            <span>
                              predicted {point.predictedRate}% · actual {point.actualRate}% · n={point.sampleSize}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-[18px] bg-white/80 p-4 text-sm leading-6 text-[var(--muted-ink)]">
                    No domain profile yet.
                  </p>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Claim-type profiles</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {coaching.claimTypeProfiles.length ? (
                  coaching.claimTypeProfiles.map((profile) => (
                    <div key={profile.claimType} className="rounded-[18px] border border-black/8 bg-white/80 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-white text-[var(--ink)]">{claimTypeLabel(profile.claimType)}</Badge>
                        <Badge className="bg-[#e7defa] text-[#5c4c88]">{profile.systematicError.replaceAll("_", " ")}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{profile.coachingNote}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                        {profile.resolvedCount} resolved · Brier {profile.averageBrierScore.toFixed(3)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-[18px] bg-white/80 p-4 text-sm leading-6 text-[var(--muted-ink)]">
                    No claim-type profile yet.
                  </p>
                )}
              </div>
            </div>

            {coaching.rejectionHistory.length ? (
              <div className="rounded-[18px] border border-black/8 bg-white/80 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Rejected coaching prompts</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                  {coaching.rejectionHistory.length} coaching prompt{coaching.rejectionHistory.length === 1 ? "" : "s"} were dismissed instead of followed.
                </p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}
