"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  calculateBrierScore,
  calculateLogScore,
  outcomeProbability,
} from "@/lib/calibration";
import type {
  ClaimResolutionType,
  PostMortem,
  PropagationResult,
  ResolutionEvidence,
  ThoughtNodeModel,
} from "@/types/thought-map";

export interface ResolutionDownstreamClaim {
  claimId: string;
  claimText: string;
  relation: "direct" | "transitive";
  currentConfidence: number | null;
  suggestedConfidence: number | null;
  downstreamArtifacts: string[];
}

export interface ResolutionSubmission {
  resolutionType: ClaimResolutionType;
  actualOutcome: string;
  resolutionEvidence: ResolutionEvidence[];
  postMortem: PostMortem | null;
  propagationTriggered: boolean;
  lessonsCaptured: string[];
  propagationResults: PropagationResult[];
}

export interface ResolutionFlowProps {
  open: boolean;
  claim: ThoughtNodeModel | null;
  resolutionDate: string | null;
  predictedConfidence: number;
  steelManText: string | null;
  activeShapes: string[];
  activeBiases: string[];
  downstreamClaims: ResolutionDownstreamClaim[];
  onClose: () => void;
  onSubmit: (submission: ResolutionSubmission) => void;
  isSubmitting?: boolean;
}

const RESOLUTION_TYPES: Array<{
  value: ClaimResolutionType;
  label: string;
  note: string;
}> = [
  { value: "confirmed", label: "Confirmed", note: "The claim held up as written." },
  { value: "disconfirmed", label: "Disconfirmed", note: "Reality pushed back hard enough to reject it." },
  { value: "partially_confirmed", label: "Partially confirmed", note: "Some of the claim held, but not all of it." },
  { value: "inconclusive", label: "Inconclusive", note: "The evidence never got decisive." },
  { value: "reframed", label: "Reframed", note: "The claim changed shape rather than simply winning or losing." },
  { value: "superseded", label: "Superseded", note: "A better claim replaced this one." },
];

type DownstreamDecision = {
  decision: "accept" | "override" | "decouple";
  suggestedConfidence: string;
  reason: string;
};

function defaultDecision(claim: ResolutionDownstreamClaim): DownstreamDecision {
  return {
    decision: "accept",
    suggestedConfidence:
      claim.suggestedConfidence != null
        ? String(claim.suggestedConfidence)
        : claim.currentConfidence != null
          ? String(claim.currentConfidence)
          : "",
    reason: "",
  };
}

function parseLessons(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function ResolutionFlow({
  open,
  claim,
  resolutionDate,
  predictedConfidence,
  steelManText,
  activeShapes,
  activeBiases,
  downstreamClaims,
  onClose,
  onSubmit,
  isSubmitting = false,
}: ResolutionFlowProps) {
  const [resolutionType, setResolutionType] = useState<ClaimResolutionType>("confirmed");
  const [actualOutcome, setActualOutcome] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [whatWasMissed, setWhatWasMissed] = useState("");
  const [whatToDoNextTime, setWhatToDoNextTime] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [wrongAssumptions, setWrongAssumptions] = useState("");
  const [emotionalAssessment, setEmotionalAssessment] = useState<PostMortem["emotionalAssessment"]>(null);
  const [lessonDraft, setLessonDraft] = useState("");
  const [decisions, setDecisions] = useState<Record<string, DownstreamDecision>>({});

  const predictedBrierScore = useMemo(
    () => calculateBrierScore(predictedConfidence / 100, outcomeProbability(resolutionType)),
    [predictedConfidence, resolutionType],
  );
  const predictedLogScore = useMemo(
    () => calculateLogScore(predictedConfidence / 100, outcomeProbability(resolutionType)),
    [predictedConfidence, resolutionType],
  );
  const requiresPostMortem = predictedBrierScore >= 0.15;
  const lessonItems = parseLessons(lessonDraft);

  if (!open) {
    return null;
  }

  function updateDecision(claimId: string, patch: Partial<DownstreamDecision>) {
    setDecisions((current) => ({
      ...current,
      [claimId]: {
        ...defaultDecision(downstreamClaims.find((item) => item.claimId === claimId) ?? downstreamClaims[0] ?? {
          claimId,
          claimText: "",
          relation: "direct",
          currentConfidence: null,
          suggestedConfidence: null,
          downstreamArtifacts: [],
        }),
        ...(current[claimId] ?? defaultDecision(downstreamClaims.find((item) => item.claimId === claimId) ?? downstreamClaims[0] ?? {
          claimId,
          claimText: "",
          relation: "direct",
          currentConfidence: null,
          suggestedConfidence: null,
          downstreamArtifacts: [],
        })),
        ...patch,
      },
    }));
  }

  function submit() {
    const evidence: ResolutionEvidence[] = [];
    if (evidenceText.trim()) {
      evidence.push({
        evidenceText: evidenceText.trim(),
        sourceType: "observation",
        sourceUrl: evidenceUrl.trim() ? evidenceUrl.trim() : null,
        addedAt: new Date(),
      });
    }

    const propagationResults: PropagationResult[] = downstreamClaims.map((claim) => {
      const decision = decisions[claim.claimId] ?? defaultDecision(claim);
      const suggestedConfidence =
        decision.decision === "decouple"
          ? null
          : decision.suggestedConfidence.trim().length
            ? Number(decision.suggestedConfidence)
            : claim.suggestedConfidence;
      const currentConfidence = claim.currentConfidence;

      return {
        claimId: claim.claimId,
        claimText: claim.claimText,
        relation: claim.relation,
        currentConfidence,
        suggestedConfidence: Number.isFinite(suggestedConfidence ?? NaN) ? Number(suggestedConfidence) : null,
        decision: decision.decision,
        confidenceDelta:
          currentConfidence != null && suggestedConfidence != null && Number.isFinite(suggestedConfidence)
            ? Number((suggestedConfidence - currentConfidence).toFixed(1))
            : null,
        downstreamArtifacts: claim.downstreamArtifacts,
      };
    });

    onSubmit({
      resolutionType,
      actualOutcome: actualOutcome.trim(),
      resolutionEvidence: evidence,
      postMortem:
        requiresPostMortem || whatHappened.trim() || whatWasMissed.trim() || whatToDoNextTime.trim() || wrongAssumptions.trim()
          ? {
              whatHappened: whatHappened.trim(),
              whatWasMissed: whatWasMissed.trim(),
              shapesActiveAtPrediction: activeShapes,
              biasesActiveAtPrediction: activeBiases,
              keyAssumptionsThatWereWrong: parseLessons(wrongAssumptions),
              whatToDoNextTime: whatToDoNextTime.trim(),
              emotionalAssessment,
              createdAt: new Date(),
            }
          : null,
      propagationTriggered: true,
      lessonsCaptured: lessonItems,
      propagationResults,
    });
  }

  const canSubmit =
    actualOutcome.trim().length > 0 &&
    (!requiresPostMortem || (whatHappened.trim().length > 0 && whatWasMissed.trim().length > 0 && whatToDoNextTime.trim().length > 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[30px] border border-black/8 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-black/6 px-6 py-5">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Resolution flow</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">
              Resolve {claim?.content.slice(0, 84) ?? "this claim"}
              {claim && claim.content.length > 84 ? "…" : ""}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              {resolutionDate ? `Resolution date: ${resolutionDate}.` : "No resolution date was set, but you can resolve manually."}
              {" "}
              Penny will score the outcome, capture the miss, and show what changes downstream.
            </p>
          </div>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Close
          </Button>
        </div>

        <div className="grid gap-4 p-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Badge className="bg-[var(--panel)] text-[var(--ink)]">Step 1</Badge>
                <h3 className="text-lg font-semibold text-[var(--ink)]">Outcome capture</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Record what happened, classify the result, and attach any evidence that actually moved the claim.
              </p>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">What actually happened?</label>
                  <textarea
                    className="mt-2 min-h-[120px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--ink)]"
                    value={actualOutcome}
                    onChange={(event) => setActualOutcome(event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Outcome class</label>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {RESOLUTION_TYPES.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`rounded-[18px] border px-4 py-3 text-left transition ${
                          resolutionType === option.value
                            ? "border-[var(--ink)] bg-[var(--panel)]"
                            : "border-black/10 bg-white hover:border-black/20"
                        }`}
                        onClick={() => setResolutionType(option.value)}
                      >
                        <p className="text-sm font-medium text-[var(--ink)]">{option.label}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{option.note}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Evidence text</label>
                    <textarea
                      className="mt-2 min-h-[96px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--ink)]"
                      value={evidenceText}
                      onChange={(event) => setEvidenceText(event.target.value)}
                    />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Evidence URL</label>
                      <input
                        className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink)]"
                        value={evidenceUrl}
                        onChange={(event) => setEvidenceUrl(event.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                    <div className="rounded-[18px] bg-[var(--panel)] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Live scoring</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                        Predicted confidence {predictedConfidence}% · Brier {predictedBrierScore.toFixed(3)} · Log {predictedLogScore.toFixed(3)}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
                        {predictedBrierScore >= 0.15
                          ? "This outcome is likely to deserve a post-mortem."
                          : "This outcome can keep the post-mortem optional unless you want to capture one."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Badge className="bg-[var(--panel)] text-[var(--ink)]">Step 2</Badge>
                <h3 className="text-lg font-semibold text-[var(--ink)]">Post-mortem</h3>
                {requiresPostMortem ? <Badge className="bg-[#fff6ed] text-[#8b4d1f]">required</Badge> : <Badge>optional</Badge>}
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Explain the miss, note which assumptions were wrong, and capture the next lesson while the outcome is still fresh.
              </p>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">What happened?</label>
                  <textarea
                    className="mt-2 min-h-[96px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--ink)]"
                    value={whatHappened}
                    onChange={(event) => setWhatHappened(event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">What did you miss?</label>
                  <textarea
                    className="mt-2 min-h-[96px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--ink)]"
                    value={whatWasMissed}
                    onChange={(event) => setWhatWasMissed(event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Wrong assumptions</label>
                  <textarea
                    className="mt-2 min-h-[96px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--ink)]"
                    value={wrongAssumptions}
                    onChange={(event) => setWrongAssumptions(event.target.value)}
                    placeholder="One per line."
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">What would you do differently?</label>
                  <textarea
                    className="mt-2 min-h-[96px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--ink)]"
                    value={whatToDoNextTime}
                    onChange={(event) => setWhatToDoNextTime(event.target.value)}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-[1fr_0.8fr]">
                  <div>
                    <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Lesson(s)</label>
                    <textarea
                      className="mt-2 min-h-[96px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--ink)]"
                      value={lessonDraft}
                      onChange={(event) => setLessonDraft(event.target.value)}
                      placeholder="One lesson per line."
                    />
                  </div>
                  <div className="rounded-[18px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Active context</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {activeShapes.length ? (
                        activeShapes.slice(0, 4).map((shape) => (
                          <Badge key={shape} className="bg-white text-[var(--ink)]">
                            {shape}
                          </Badge>
                        ))
                      ) : (
                        <Badge className="bg-white text-[var(--ink)]">No shape signal</Badge>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activeBiases.length ? (
                        activeBiases.slice(0, 4).map((bias) => (
                          <Badge key={bias} className="bg-[#e7defa] text-[#5c4c88]">
                            {bias}
                          </Badge>
                        ))
                      ) : (
                        <Badge className="bg-[#e7defa] text-[#5c4c88]">No bias signal</Badge>
                      )}
                    </div>
                    {steelManText ? (
                      <p className="mt-3 rounded-[16px] bg-white px-3 py-3 text-sm leading-6 text-[var(--ink)]">
                        Steel man: {steelManText}
                      </p>
                    ) : (
                      <p className="mt-3 rounded-[16px] bg-white px-3 py-3 text-sm leading-6 text-[var(--muted-ink)]">
                        No steel man is available for this claim yet.
                      </p>
                    )}
                    <div className="mt-3">
                      <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Emotional assessment</label>
                      <select
                        className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
                        value={emotionalAssessment ?? ""}
                        onChange={(event) =>
                          setEmotionalAssessment(
                            event.target.value === "" ? null : (event.target.value as PostMortem["emotionalAssessment"]),
                          )
                        }
                      >
                        <option value="">Not set</option>
                        <option value="relieved">relieved</option>
                        <option value="unsurprised">unsurprised</option>
                        <option value="surprised">surprised</option>
                        <option value="frustrated">frustrated</option>
                        <option value="uncertain">uncertain</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Badge className="bg-[var(--panel)] text-[var(--ink)]">Step 3</Badge>
                <h3 className="text-lg font-semibold text-[var(--ink)]">Propagation review</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Review downstream claims and decide whether the resolution should be accepted, overridden, or decoupled.
              </p>
              <div className="mt-4 space-y-3">
                {downstreamClaims.length ? (
                  downstreamClaims.map((item) => {
                    const decision = decisions[item.claimId] ?? defaultDecision(item);

                    return (
                      <div key={item.claimId} className="rounded-[20px] border border-black/8 bg-[var(--panel)] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-white text-[var(--ink)]">{item.relation}</Badge>
                          <Badge className="bg-[#d9ead8] text-[#355b32]">
                            {item.currentConfidence != null ? `${Math.round(item.currentConfidence)}%` : "n/a"}
                          </Badge>
                          <Badge className="bg-[#e7defa] text-[#5c4c88]">
                            {item.suggestedConfidence != null ? `${Math.round(item.suggestedConfidence)}%` : "no suggestion"}
                          </Badge>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{item.claimText}</p>
                        {item.downstreamArtifacts.length ? (
                          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                            Artifacts: {item.downstreamArtifacts.join(", ")}
                          </p>
                        ) : null}
                        <div className="mt-3 grid gap-3 sm:grid-cols-[0.7fr_0.8fr]">
                          <select
                            className="w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
                            value={decision.decision}
                            onChange={(event) => updateDecision(item.claimId, { decision: event.target.value as DownstreamDecision["decision"] })}
                          >
                            <option value="accept">accept</option>
                            <option value="override">override</option>
                            <option value="decouple">decouple</option>
                          </select>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            className="w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
                            value={decision.suggestedConfidence}
                            onChange={(event) => updateDecision(item.claimId, { suggestedConfidence: event.target.value })}
                            placeholder="confidence"
                          />
                        </div>
                        <textarea
                          className="mt-3 min-h-[80px] w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none"
                          value={decision.reason}
                          onChange={(event) => updateDecision(item.claimId, { reason: event.target.value })}
                          placeholder="Why this downstream update should change or stay decoupled."
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[20px] border border-dashed border-black/10 bg-[var(--panel)] p-4">
                    <p className="text-sm leading-6 text-[var(--muted-ink)]">
                      No downstream claims were found, so there is nothing to propagate.
                    </p>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Badge className="bg-[var(--panel)] text-[var(--ink)]">Scoring</Badge>
                <h3 className="text-lg font-semibold text-[var(--ink)]">Immediate calibration effect</h3>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Brier</p>
                  <p className="mt-2 text-xl font-semibold text-[var(--ink)]">{predictedBrierScore.toFixed(3)}</p>
                </div>
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Log score</p>
                  <p className="mt-2 text-xl font-semibold text-[var(--ink)]">{predictedLogScore.toFixed(3)}</p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                {predictedBrierScore >= 0.15
                  ? "The score is high enough that the post-mortem will stay front and center."
                  : "The score is moderate, so the post-mortem remains optional unless you want to write one."}
              </p>
            </Card>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/6 px-6 py-5">
          <div className="flex items-center gap-2 text-sm text-[var(--muted-ink)]">
            <AlertCircle className="size-4" />
            <span>
              Resolution readiness is based on outcome capture and, when needed, a post-mortem. This flow keeps the
              scoring visible instead of hiding it after submission.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button className="gap-2" onClick={submit} disabled={!canSubmit || isSubmitting}>
              Record resolution
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
