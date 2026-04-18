"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClaimOutcomePair, ArtifactOutcome } from "@/types/thought-map";

type ClaimDecision = "correct" | "incorrect" | "unclear";

const QUALITY_DIMENSIONS = [
  "accuracy",
  "completeness",
  "persuasiveness",
  "actionability",
  "structure",
] as const;

export function ArtifactOutcomeFlow({
  artifactId,
  artifactTypeLabel,
  loadBearingClaims,
  onClose,
  onSaved,
}: {
  artifactId: string;
  artifactTypeLabel: string;
  loadBearingClaims: ClaimOutcomePair[];
  onClose: () => void;
  onSaved?: (outcome: ArtifactOutcome, retrospectivePrompt: string | null) => void;
}) {
  const [didAct, setDidAct] = useState<boolean | null>(null);
  const [reasonIfNo, setReasonIfNo] = useState("not_ready");
  const [actionTaken, setActionTaken] = useState("");
  const [outcomeType, setOutcomeType] = useState<ArtifactOutcome["outcomeType"]>("pending");
  const [outcomeDate, setOutcomeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [outcomeDescription, setOutcomeDescription] = useState("");
  const [wouldUseAgain, setWouldUseAgain] = useState(true);
  const [artifactQualityRating, setArtifactQualityRating] = useState(4);
  const [lessonsLearned, setLessonsLearned] = useState("");
  const [claimDecisions, setClaimDecisions] = useState<Record<string, ClaimDecision>>({});
  const [dimensionScores, setDimensionScores] = useState<Record<(typeof QUALITY_DIMENSIONS)[number], number>>({
    accuracy: 4,
    completeness: 4,
    persuasiveness: 4,
    actionability: 4,
    structure: 4,
  });
  const [dimensionComments, setDimensionComments] = useState<Record<(typeof QUALITY_DIMENSIONS)[number], string>>({
    accuracy: "",
    completeness: "",
    persuasiveness: "",
    actionability: "",
    structure: "",
  });
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const readyClaimCount = useMemo(
    () => loadBearingClaims.filter((claim) => claim.claimText.trim().length > 0).length,
    [loadBearingClaims],
  );

  async function submitOutcome() {
    setError(null);
    setPrompt(null);

    const response = await fetch(`/api/artifacts/${artifactId}/outcome`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: "demo-user",
        actionTaken:
          didAct === false ? `Did not use: ${reasonIfNo.replaceAll("_", " ")}` : actionTaken.trim(),
        outcomeDate,
        outcomeDescription:
          didAct === false
            ? `The artifact was not acted on because ${reasonIfNo.replaceAll("_", " ")}.`
            : outcomeDescription.trim(),
        outcomeType: didAct === false ? "pending" : outcomeType,
        loadBearingClaimResolutions: loadBearingClaims.map((claim) => ({
          ...claim,
          wasClaimCorrect: claimDecisions[claim.claimId] ?? "unclear",
        })),
        artifactQualityRating,
        qualityDimensions: QUALITY_DIMENSIONS.map((dimension) => ({
          dimension,
          score: dimensionScores[dimension],
          comment: dimensionComments[dimension].trim() || null,
        })),
        wouldUseAgain: didAct === false ? false : wouldUseAgain,
        lessonsLearned: lessonsLearned.trim() || null,
      }),
    });

    if (!response.ok) {
      throw new Error("Penny could not save the outcome.");
    }

    const payload = (await response.json()) as {
      outcome: ArtifactOutcome;
      retrospectivePrompt: string | null;
    };
    setPrompt(payload.retrospectivePrompt);
    onSaved?.(payload.outcome, payload.retrospectivePrompt);
  }

  return (
    <div className="rounded-[28px] border border-black/8 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Add outcome</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">{artifactTypeLabel}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Capture what happened so Penny can calibrate the claims that carried the artifact.
          </p>
        </div>
        <Button variant="ghost" className="h-9 w-9 p-0" onClick={onClose} aria-label="Close outcome flow">
          <X className="size-4" />
        </Button>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-[var(--ink)]">Did you act on this artifact?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant={didAct === true ? "primary" : "secondary"} onClick={() => setDidAct(true)}>
              Yes
            </Button>
            <Button variant={didAct === false ? "primary" : "secondary"} onClick={() => setDidAct(false)}>
              No
            </Button>
          </div>
        </div>

        {didAct === false ? (
          <div className="space-y-3 rounded-[24px] bg-[var(--panel)] p-4">
            <label className="block text-sm font-medium text-[var(--ink)]">
              Why not?
              <select
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
                value={reasonIfNo}
                onChange={(event) => setReasonIfNo(event.target.value)}
              >
                <option value="not_ready">Not ready</option>
                <option value="changed_direction">Changed direction</option>
                <option value="artifact_was_wrong">Artifact was wrong</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
        ) : null}

        {didAct !== false ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-[var(--ink)]">
                What happened?
                <textarea
                  className="mt-2 min-h-28 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
                  value={outcomeDescription}
                  onChange={(event) => setOutcomeDescription(event.target.value)}
                  placeholder="Summarize the outcome, result, or decision that followed."
                />
              </label>
              <label className="block text-sm font-medium text-[var(--ink)]">
                Action taken
                <input
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
                  value={actionTaken}
                  onChange={(event) => setActionTaken(event.target.value)}
                  placeholder="Sent memo, made pitch, executed decision..."
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="block text-sm font-medium text-[var(--ink)]">
                Outcome date
                <input
                  type="date"
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
                  value={outcomeDate}
                  onChange={(event) => setOutcomeDate(event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-[var(--ink)]">
                Outcome type
                <select
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
                  value={outcomeType}
                  onChange={(event) => setOutcomeType(event.target.value as ArtifactOutcome["outcomeType"])}
                >
                  <option value="success">Success</option>
                  <option value="partial_success">Partial success</option>
                  <option value="failure">Failure</option>
                  <option value="inconclusive">Inconclusive</option>
                  <option value="pending">Pending</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-[var(--ink)]">
                Would use again?
                <div className="mt-2 flex gap-2">
                  <Button variant={wouldUseAgain ? "primary" : "secondary"} onClick={() => setWouldUseAgain(true)}>
                    Yes
                  </Button>
                  <Button variant={!wouldUseAgain ? "primary" : "secondary"} onClick={() => setWouldUseAgain(false)}>
                    No
                  </Button>
                </div>
              </label>
            </div>

            <div className="rounded-[24px] bg-[var(--panel)] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[var(--ink)]">Which claims were correct?</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                    {readyClaimCount} load-bearing claims
                  </p>
                </div>
                <CheckCircle2 className="size-4 text-[var(--ink)]" />
              </div>
              <div className="mt-4 space-y-3">
                {loadBearingClaims.map((claim) => (
                  <div key={claim.claimId} className="rounded-[20px] bg-white p-4">
                    <p className="text-sm font-medium text-[var(--ink)]">{claim.claimText}</p>
                    <p className="mt-1 text-xs text-[var(--muted-ink)]">
                      Confidence at artifact time: {Math.round(claim.confidenceAtArtifactTime * 100)}%
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["correct", "incorrect", "unclear"] as const).map((decision) => (
                        <Button
                          key={decision}
                          variant={claimDecisions[claim.claimId] === decision ? "primary" : "secondary"}
                          onClick={() =>
                            setClaimDecisions((current) => ({
                              ...current,
                              [claim.claimId]: decision,
                            }))
                          }
                        >
                          {decision}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] bg-[var(--panel)] p-4">
              <p className="text-sm font-medium text-[var(--ink)]">How useful was this artifact?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <Button
                    key={rating}
                    variant={artifactQualityRating === rating ? "primary" : "secondary"}
                    onClick={() => setArtifactQualityRating(rating)}
                  >
                    <Star className="size-4" />
                    {rating}
                  </Button>
                ))}
              </div>
            </div>

            <details className="rounded-[24px] bg-[var(--panel)] p-4">
              <summary className="cursor-pointer text-sm font-medium text-[var(--ink)]">
                Optional quality dimensions
              </summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {QUALITY_DIMENSIONS.map((dimension) => (
                  <label key={dimension} className="block text-sm font-medium text-[var(--ink)]">
                    {dimension}
                    <select
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
                      value={dimensionScores[dimension]}
                      onChange={(event) =>
                        setDimensionScores((current) => ({
                          ...current,
                          [dimension]: Number(event.target.value),
                        }))
                      }
                    >
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <option key={rating} value={rating}>
                          {rating}
                        </option>
                      ))}
                    </select>
                    <textarea
                      className="mt-2 min-h-20 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
                      value={dimensionComments[dimension]}
                      onChange={(event) =>
                        setDimensionComments((current) => ({
                          ...current,
                          [dimension]: event.target.value,
                        }))
                      }
                      placeholder="Optional comment"
                    />
                  </label>
                ))}
              </div>
            </details>

            <label className="block text-sm font-medium text-[var(--ink)]">
              What would you tell yourself before making this decision again?
              <textarea
                className="mt-2 min-h-24 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
                value={lessonsLearned}
                onChange={(event) => setLessonsLearned(event.target.value)}
                placeholder="Write the lesson you want to preserve."
              />
            </label>
          </>
        ) : null}

        {prompt ? (
          <div className="rounded-[20px] border border-[#e4c87c] bg-[#fff8e5] px-4 py-3 text-sm text-[#8b4d1f]">
            <AlertCircle className="mr-2 inline size-4 align-[-2px]" />
            {prompt}
          </div>
        ) : null}
        {error ? <p className="text-sm leading-6 text-[#8b4d1f]">{error}</p> : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          className="gap-2"
          disabled={isPending}
          onClick={() =>
            startTransition(() => {
              void submitOutcome().catch((submitError) => {
                setError(submitError instanceof Error ? submitError.message : "Penny could not save the outcome.");
              });
            })
          }
        >
          <ChevronDown className="size-4" />
          Save outcome
        </Button>
        <Button variant="secondary" className="gap-2" onClick={onClose}>
          <ChevronUp className="size-4" />
          Close
        </Button>
      </div>
    </div>
  );
}
