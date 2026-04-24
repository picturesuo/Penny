"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TrackRecordCard } from "@/components/penny/track-record-card";
import {
  formatShapeVerdict,
  type CalibrationDashboardSnapshot,
  type PennyShape,
  type PennyShapeFeedback,
} from "@/lib/penny-insights";
import type { ShareableTrackRecord } from "@/types/calibration-record";

export function ShapeDashboard({
  shapes,
  calibration,
  initialFeedback,
  trackRecord,
}: {
  shapes: PennyShape[];
  calibration: CalibrationDashboardSnapshot;
  initialFeedback: Record<string, PennyShapeFeedback>;
  trackRecord: ShareableTrackRecord;
}) {
  const [feedback, setFeedback] = useState<Record<string, PennyShapeFeedback>>(initialFeedback);
  const [feedbackReasons, setFeedbackReasons] = useState<Record<string, string>>({});
  const [activePrivateBets, setActivePrivateBets] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();

  const brierTrajectory = useMemo(() => {
    const scores = calibration.resolvedClaims
      .map((claim) => claim.brierScore)
      .filter((score): score is number => score != null);

    if (scores.length < 2) {
      return null;
    }

    const midpoint = Math.max(1, Math.floor(scores.length / 2));
    const recent = scores.slice(0, midpoint);
    const earlier = scores.slice(midpoint);
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const recentAverage = average(recent);
    const earlierAverage = earlier.length ? average(earlier) : null;

    if (earlierAverage == null) {
      return null;
    }

    const delta = earlierAverage - recentAverage;

    return {
      label:
        delta > 0.02 ? "Improving" : delta < -0.02 ? "Worsening" : "Flat",
      detail: `Recent Brier ${recentAverage.toFixed(3)} vs earlier ${earlierAverage.toFixed(3)}`,
    };
  }, [calibration.resolvedClaims]);

  function recordFeedback(shape: PennyShape, verdict: PennyShapeFeedback, reasoning: string) {
    const mapId = shape.primaryMapId;
    const previousVerdict = feedback[shape.id];
    const trimmedReasoning = reasoning.trim();
    const restoreFeedback = () =>
      setFeedback((current) => {
        const next = { ...current };

        if (previousVerdict) {
          next[shape.id] = previousVerdict;
        } else {
          delete next[shape.id];
        }

        return next;
      });

    setFeedback((current) => ({ ...current, [shape.id]: verdict }));

    if (!mapId) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${mapId}/shape-feedback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shapeId: shape.id,
            verdict,
            shapeLabel: shape.label,
            source: "dashboard",
            reasoning: trimmedReasoning,
          }),
        });

        if (!response.ok) {
          restoreFeedback();
          return;
        }
        setFeedbackReasons((current) => ({ ...current, [shape.id]: "" }));
      } catch {
        restoreFeedback();
        return;
      }
    });
  }

  function togglePrivateBet(mapId: string) {
    setActivePrivateBets((current) => ({
      ...current,
      [mapId]: !current[mapId],
    }));
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Shapes dashboard</p>
          <h2 className="mt-2 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
            What Penny thinks about how you think.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-ink)]">
            These patterns are derived from moves, overrides, confidence shifts, and repeated failures. They are confirmable, rejectable, and refinable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-[var(--panel)] text-[var(--ink)]">Periodic surface</Badge>
          <Badge className="bg-[var(--panel)] text-[var(--ink)]">Metacognition visible</Badge>
        </div>
      </div>

      <div className="mt-6 rounded-[28px] border border-black/8 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Calibration & forecasting</p>
            <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Train probability, not just critique style.</h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-ink)]">
              Penny keeps a visible trajectory by scoring resolved claims, nudging confidence in small increments, and showing where your forecast discipline is strongest or weakest by domain.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">Brier scoring</Badge>
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">Private bets</Badge>
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">Bayesian updates</Badge>
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">Post-mortems</Badge>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <div className="rounded-[24px] bg-[var(--panel)] p-5 xl:col-span-1">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Living cognitive fingerprint</p>
            <h4 className="mt-2 text-xl font-semibold text-[var(--ink)]">
              {brierTrajectory ? brierTrajectory.label : "Not enough scored claims yet"}
            </h4>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
              {brierTrajectory
                ? brierTrajectory.detail
                : "Once a few claims are resolved or abandoned, Penny will show whether forecast quality is trending up or down."}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Resolved claims</p>
                <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{calibration.resolvedClaims.length}</p>
              </div>
              <div className="rounded-[18px] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Private bets</p>
                <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{calibration.privateBets.length}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] bg-[var(--panel)] p-5 xl:col-span-2">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Domain calibration feedback</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {calibration.domains.map((domain) => (
                <div key={domain.domain} className="rounded-[18px] bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-[var(--panel)] text-[var(--ink)]">{domain.domain}</Badge>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">{domain.sampleSize} maps</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
                    You average {domain.averageConfidence}% confidence here.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                    {domain.averageOutcomeRate != null
                      ? `Actual resolution rate: ${domain.averageOutcomeRate}%.`
                      : "No resolved claims in this domain yet."}
                    {domain.calibrationGap != null ? ` Gap: ${domain.calibrationGap > 0 ? "+" : ""}${domain.calibrationGap} points.` : ""}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{domain.note}</p>
                  {domain.averageBrierScore != null ? (
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                      Mean Brier {domain.averageBrierScore}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[24px] bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Resolved claims</p>
            <div className="mt-4 space-y-3">
              {calibration.resolvedClaims.length ? (
                calibration.resolvedClaims.slice(0, 4).map((claim) => {
                  const betActive = activePrivateBets[claim.mapId] === true;

                  return (
                    <div key={claim.mapId} className="rounded-[18px] bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-[var(--panel)] text-[var(--ink)]">{claim.domain}</Badge>
                        <Badge className="bg-[#d9ead8] text-[#355b32]">{claim.status}</Badge>
                        <Badge className="bg-[#e7defa] text-[#5c4c88]">Brier {claim.brierScore?.toFixed(3)}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{claim.title}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                        Confidence {claim.confidence}% · outcome {claim.outcome === 1 ? "resolved" : "not resolved"} · {claim.updatePrompt}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {claim.stakes.map((stake) => (
                          <Badge key={`${claim.mapId}-${stake}`} className="bg-white text-[var(--ink)]">
                            {stake.replaceAll("_", " ")}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => togglePrivateBet(claim.mapId)}>
                          {betActive ? "Bet marked" : "Take private bet"}
                        </Button>
                        {betActive ? (
                          <Badge className="bg-[#f5d6b3] text-[#8b4d1f]">Credibility stake on</Badge>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-[18px] bg-white p-4 text-sm leading-6 text-[var(--muted-ink)]">
                  No resolved claims yet. Once claims close, Penny will score them and show your calibration trajectory.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Private bets</p>
            <div className="mt-4 space-y-3">
              {calibration.privateBets.length ? (
                calibration.privateBets.map((bet) => {
                  const betActive = activePrivateBets[bet.mapId] === true;

                  return (
                    <div key={bet.mapId} className="rounded-[18px] bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-[var(--panel)] text-[var(--ink)]">{bet.domain}</Badge>
                        <Badge className="bg-[#e7defa] text-[#5c4c88]">{bet.credibilityLabel} stake</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{bet.title}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                        {bet.prompt} Confidence {bet.confidence}% · revisit {bet.resolutionDate ?? "later"}.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {bet.stakes.map((stake) => (
                          <Badge key={`${bet.mapId}-${stake}`} className="bg-white text-[var(--ink)]">
                            {stake.replaceAll("_", " ")}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => togglePrivateBet(bet.mapId)}>
                          {betActive ? "Bet recorded" : "Record bet"}
                        </Button>
                        {betActive ? <Badge className="bg-[#d9ead8] text-[#355b32]">Session bet active</Badge> : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-[18px] bg-white p-4 text-sm leading-6 text-[var(--muted-ink)]">
                  No private bets are active yet. Give a claim a resolution date and Penny will turn it into a personal-credibility stake.
                </p>
              )}
            </div>
        </div>
      </div>

      <div className="mt-6">
        <TrackRecordCard record={trackRecord} />
      </div>

      <div className="mt-6 rounded-[24px] border border-black/8 bg-white p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Counterfactual engine</p>
        <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Make resolved claims into calibration artifacts.</h3>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-ink)]">
          When a claim resolves, Penny turns the outcome into a structured post-mortem so the miss, the lesson, and the next confidence cue become part of the record instead of disappearing into history.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {calibration.postMortems.length ? (
            calibration.postMortems.slice(0, 4).map((postMortem) => (
              <div key={postMortem.mapId} className="rounded-[18px] bg-[var(--panel)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-white text-[var(--ink)]">{postMortem.domain}</Badge>
                  <Badge className="bg-[#e7defa] text-[#5c4c88]">{postMortem.missType}</Badge>
                  <Badge className="bg-[#d9ead8] text-[#355b32]">Brier {postMortem.brierScore.toFixed(3)}</Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{postMortem.title}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{postMortem.lesson}</p>
                <div className="mt-3 rounded-[16px] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Shape input</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{postMortem.shapeSignal}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{postMortem.reviewPrompt}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
              No resolved claims yet. Once outcomes arrive, Penny will generate structured post-mortems from the resolved claim trail.
            </p>
          )}
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <div className="rounded-[18px] bg-[var(--panel)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">What you would lose</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
              If the archive vanished, you would lose {calibration.resolvedClaims.length} resolved claims, {shapes.length} active shapes, and the path that explains why those numbers moved.
            </p>
          </div>
          <div className="rounded-[18px] bg-[var(--panel)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Cascading forget with audit</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
              Forget-like behavior should leave a trail: what was removed, what was preserved, and why the system decided to keep or hide it.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[24px] bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Bayesian update prompts</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {calibration.prompts.length ? (
              calibration.prompts.slice(0, 4).map((prompt) => (
                <div key={prompt.mapId} className="rounded-[18px] bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-[var(--panel)] text-[var(--ink)]">{prompt.domain}</Badge>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">shift {prompt.suggestedShift > 0 ? `+${prompt.suggestedShift}` : prompt.suggestedShift}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{prompt.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{prompt.prompt}</p>
                </div>
              ))
            ) : (
              <p className="rounded-[18px] bg-white p-4 text-sm leading-6 text-[var(--muted-ink)]">
                No update prompts yet. Once evidence shifts enough to matter, Penny will nudge confidence in small increments instead of big swings.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {shapes.length ? (
          shapes.map((shape) => {
            const currentFeedback = feedback[shape.id];

            return (
              <div key={shape.id} className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-white text-[var(--ink)]">{shape.kind}</Badge>
                  <Badge className="bg-[#e7defa] text-[#5c4c88]">
                    {formatShapeVerdict(shape.verdict)} · {shape.confidence}%
                  </Badge>
                  <Badge className="bg-[#d9ead8] text-[#355b32]">{shape.evidenceNodeIds.length} claims</Badge>
                </div>

                <h3 className="mt-3 text-xl font-semibold text-[var(--ink)]">{shape.label}</h3>
                <p className="mt-2 text-sm leading-7 text-[var(--ink)]">{shape.summary}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{shape.explanation}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {shape.supportingNodes.slice(0, 3).map((node) => (
                    <Badge key={node.id} className="bg-white text-[var(--ink)]">
                      {node.kind.replaceAll("_", " ")}
                    </Badge>
                  ))}
                </div>

                <div className="mt-4 space-y-3">
                  <textarea
                    value={feedbackReasons[shape.id] ?? ""}
                    onChange={(event) =>
                      setFeedbackReasons((current) => ({
                        ...current,
                        [shape.id]: event.target.value,
                      }))
                    }
                    placeholder="Why do you disagree with this shape?"
                    className="min-h-24 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none ring-0 placeholder:text-[var(--muted-ink)] focus:border-[var(--ink)]"
                  />
                  <Button
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    disabled={isPending || !(feedbackReasons[shape.id]?.trim().length)}
                    onClick={() => recordFeedback(shape, "confirmed", feedbackReasons[shape.id] ?? "")}
                  >
                    Confirm with note
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    disabled={isPending || !(feedbackReasons[shape.id]?.trim().length)}
                    onClick={() => recordFeedback(shape, "rejected", feedbackReasons[shape.id] ?? "")}
                  >
                    Reject with note
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    disabled={isPending || !(feedbackReasons[shape.id]?.trim().length)}
                    onClick={() => recordFeedback(shape, "refined", feedbackReasons[shape.id] ?? "")}
                  >
                    Refine with note
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className="bg-white text-[var(--ink)]">
                    The note is stored with the verdict as shape-feedback reasoning.
                  </Badge>
                </div>

                {currentFeedback ? (
                  <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                    Marked as {currentFeedback}
                  </p>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5 lg:col-span-2">
            <p className="text-sm leading-7 text-[var(--muted-ink)]">
              Penny will surface metacognitive patterns here once enough claims, overrides, and revisits have accumulated.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
