"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpenText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CLAIM_PROVENANCES,
  CLAIM_STATUSES,
  CLAIM_STAKES,
  type ClaimProvenance,
  type CalibrationCoaching,
  type ClaimStake,
  type ClaimStatus,
  type CreateThoughtMapInput,
  SOURCE_TRUST_LEVELS,
  type SourceTrustLevel,
} from "@/types/thought-map";
import { calibrationIndicatorForClaim } from "@/lib/calibration";
import { extractAssumptionSnapshot } from "@/lib/thought-map-generation";

const STARTER_IDEAS = [
  "Compliance teams at mid-sized fintechs need a faster way to turn regulatory changes into concrete action plans without hiring more analysts.",
  "Busy professionals need a simple accountability system that makes them follow through on workouts after the first two weeks.",
  "Local HVAC contractors need quoting and follow-up handled automatically so leads do not die between the first call and booked work.",
] as const;

const CAPTURE_STARTERS = [
  {
    label: "Claim",
    template: "Claim: [What do you currently believe is true?]\nWhy it matters: [Why this matters if the claim holds.]",
  },
  {
    label: "Assumption",
    template: "Assumption: [What must be true for this idea or plan to work?]\nDependency: [What is this assumption relying on?]",
  },
  {
    label: "Evidence",
    template: "Evidence: [What real signal supports this?]\nLimit: [What is still missing or weak about the evidence?]",
  },
  {
    label: "Counterargument",
    template: "Counterargument: [What is the strongest reason this could fail or be wrong?]\nWhat would change my mind: [What proof would settle it?]",
  },
  {
    label: "Open question",
    template: "Open question: [What do you need to learn next?]\nWhy this blocks progress: [What decision or action depends on the answer?]",
  },
] as const;

const STAKE_LABELS: Record<ClaimStake, string> = {
  reputation: "Reputation",
  money: "Money",
  time: "Time",
  relationship: "Relationship",
  self_image: "Self-image",
};

function prettyLabel(value: string) {
  return value.replaceAll("_", " ");
}

type ThoughtMapFormProps = {
  userId?: string;
};

export function ThoughtMapForm({ userId }: ThoughtMapFormProps) {
  const router = useRouter();
  const [rawThought, setRawThought] = useState("");
  const [claim, setClaim] = useState<{
    confidence: number;
    resolutionDate: string;
    provenance: ClaimProvenance;
    provenanceDetail: string;
    sourceCitation: string;
    sourceTrustLevel: SourceTrustLevel;
    stakes: ClaimStake[];
    dependencyNotes: string;
    status: ClaimStatus;
    temporalScope: string;
    conditionalStatement: string;
    structureKind: "assertion" | "conditional" | "compound" | "temporal" | "merged_candidate" | "split_candidate";
  }>({
    confidence: 60,
    resolutionDate: "",
    provenance: "intuition",
    provenanceDetail: "",
    sourceCitation: "",
    sourceTrustLevel: "self",
    stakes: [],
    dependencyNotes: "",
    status: "open",
    temporalScope: "",
    conditionalStatement: "",
    structureKind: "assertion",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [calibrationCoaching, setCalibrationCoaching] = useState<CalibrationCoaching | null>(null);
  const [calibrationLoading, setCalibrationLoading] = useState(Boolean(userId));
  const [calibrationDismissed, setCalibrationDismissed] = useState(false);
  const calibrationConfidenceAnchor = useRef<number | null>(null);
  const [assumptionVerdicts, setAssumptionVerdicts] = useState<Record<string, "accepted" | "rejected" | "refined">>({});
  const [assumptionCorrections, setAssumptionCorrections] = useState<Record<string, string>>({});
  const [focusedAssumptionId, setFocusedAssumptionId] = useState<string | null>(null);
  const assumptionSnapshot = useMemo(() => extractAssumptionSnapshot(rawThought), [rawThought]);
  const weakestAssumption = useMemo(
    () => [...assumptionSnapshot.assumptions].sort((a, b) => a.confidence - b.confidence)[0] ?? null,
    [assumptionSnapshot.assumptions],
  );
  const confidenceChallenge =
    claim.confidence > 90
      ? "You’re committing to a very high confidence. What specifically would have to be true for you to revise down to 70%?"
      : claim.confidence < 25
        ? "Very low confidence is fine, but Penny will treat this as a provisional claim until it gets more structure."
        : null;
  const calibrationIndicator = useMemo(
    () =>
      calibrationIndicatorForClaim({
        coaching: calibrationCoaching,
        claimText: rawThought,
        claimType: claim.structureKind,
        confidence: claim.confidence,
      }),
    [calibrationCoaching, rawThought, claim.structureKind, claim.confidence],
  );

  useEffect(() => {
    if (!userId) {
      return;
    }

    let active = true;

    fetch(`/api/users/${userId}/calibration`)
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as { coaching?: CalibrationCoaching | null };
      })
      .then((payload) => {
        if (!active || !payload) {
          return;
        }

        setCalibrationCoaching(payload.coaching ?? null);
      })
      .catch(() => {
        if (active) {
          setCalibrationCoaching(null);
        }
      })
      .finally(() => {
        if (active) {
          setCalibrationLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (calibrationIndicator && !calibrationDismissed && calibrationConfidenceAnchor.current == null) {
      calibrationConfidenceAnchor.current = claim.confidence;
    }

    if (!calibrationIndicator) {
      calibrationConfidenceAnchor.current = null;
    }
  }, [calibrationIndicator, calibrationDismissed, claim.confidence]);

  function toggleStake(stake: ClaimStake) {
    setClaim((current) => ({
      ...current,
      stakes: current.stakes.includes(stake)
        ? current.stakes.filter((existing) => existing !== stake)
        : [...current.stakes, stake],
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const payload: CreateThoughtMapInput = {
        rawThought,
        claim: {
          confidence: claim.confidence,
          resolutionDate: claim.resolutionDate || null,
          provenance: claim.provenance,
          provenanceDetail: claim.provenanceDetail.trim(),
          sourceCitation: claim.sourceCitation.trim(),
          sourceTrustLevel: claim.sourceTrustLevel,
          stakes: claim.stakes,
          dependencyNotes: claim.dependencyNotes.trim(),
          status: claim.status,
          temporalScope: claim.temporalScope.trim() || undefined,
          conditionalStatement: claim.conditionalStatement.trim() || undefined,
          structureKind: claim.structureKind,
        },
      };

      const response = await fetch("/api/maps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const payload = (await response.json()) as {
          details?: { fieldErrors?: Record<string, string[]> };
        };
        const message =
          payload.details?.fieldErrors?.rawThought?.[0] ??
          payload.details?.fieldErrors?.claim?.[0] ??
          "Penny needs one real thought to start the map.";
        setError(message);
        return;
      }

      const responsePayload = (await response.json()) as { map: { id: string } };

      if (
        userId &&
        calibrationIndicator &&
        !calibrationDismissed &&
        calibrationConfidenceAnchor.current != null &&
        calibrationConfidenceAnchor.current === claim.confidence
      ) {
        void fetch(`/api/users/${userId}/calibration`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "reject",
            domain: calibrationIndicator.domain,
            claimType: calibrationIndicator.claimType,
            originalConfidence: claim.confidence,
            suggestedAdjustment: calibrationIndicator.adjustment,
            recommendationText: calibrationIndicator.recommendationText,
          }),
        });
      }

      router.push(`/app/maps/${responsePayload.map.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="rawThought" className="text-sm font-medium text-[var(--ink)]">
          What should Penny map first?
        </label>
        <p className="text-sm leading-6 text-[var(--muted-ink)]">
          Start with one wiki-style claim. The capture form below records confidence, provenance, stakes, dependencies, and claim status so Penny can score and revisit it later.
        </p>
        <div className="rounded-[24px] border border-black/8 bg-white p-4">
          <div className="flex items-center gap-2">
            <BookOpenText className="size-4 text-[var(--muted-ink)]" />
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Idea wiki starters</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {CAPTURE_STARTERS.map((starter) => (
              <button
                key={starter.label}
                type="button"
                className="rounded-full border border-black/10 bg-[var(--panel)] px-3 py-2 text-left text-sm leading-6 text-[var(--muted-ink)] transition hover:border-black/20 hover:text-[var(--ink)]"
                onClick={() => {
                  setRawThought(starter.template);
                  setError(null);
                }}
              >
                {starter.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {STARTER_IDEAS.map((idea, index) => (
            <button
              key={idea}
              type="button"
              className="rounded-full border border-black/10 bg-white px-3 py-2 text-left text-sm leading-6 text-[var(--muted-ink)] transition hover:border-black/20 hover:text-[var(--ink)]"
              onClick={() => {
                setRawThought(idea);
                setError(null);
              }}
            >
              Try idea {index + 1}
            </button>
          ))}
        </div>

        <div className="rounded-[28px] border border-black/10 bg-white p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Claim metadata</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--ink)]">Probability</span>
                <span className="text-sm text-[var(--muted-ink)]">{claim.confidence}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={claim.confidence}
                onChange={(event) =>
                  setClaim((current) => ({ ...current, confidence: Number(event.target.value) }))
                }
                className="w-full accent-[var(--ink)]"
              />
              {confidenceChallenge ? (
                <p className="text-xs leading-5 text-[#8b4d1f]">{confidenceChallenge}</p>
              ) : (
                <p className="text-xs leading-5 text-[var(--muted-ink)]">
                  Every claim gets a probability so Penny can score it later and challenge overconfidence early.
                </p>
              )}
              {calibrationIndicator && !calibrationDismissed ? (
                <div className="rounded-[18px] border border-[#d7c06c] bg-[#fff8df] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[#6f5612]">Calibration coaching</p>
                      <p className="mt-1 text-sm leading-6 text-[#5a460d]">
                        {calibrationIndicator.adjustment > 0
                          ? `⚠ Your calibration in ${calibrationIndicator.domain} suggests adjusting up by ~${Math.abs(calibrationIndicator.adjustment)} points.`
                          : `⚠ Your calibration in ${calibrationIndicator.domain} suggests adjusting down by ~${Math.abs(calibrationIndicator.adjustment)} points.`}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#6f5612]">{calibrationIndicator.recommendationText}</p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-3 py-2 text-xs"
                      onClick={() => {
                        setCalibrationDismissed(true);
                        calibrationConfidenceAnchor.current = null;
                      }}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ) : calibrationLoading ? (
                <p className="text-xs leading-5 text-[var(--muted-ink)]">Loading calibration coaching...</p>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--ink)]">Resolution date</span>
              <input
                type="date"
                value={claim.resolutionDate}
                onChange={(event) =>
                  setClaim((current) => ({ ...current, resolutionDate: event.target.value }))
                }
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--ink)]">Provenance</span>
              <select
                value={claim.provenance}
                onChange={(event) =>
                  setClaim((current) => ({
                    ...current,
                    provenance: event.target.value as ClaimProvenance,
                  }))
                }
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
              >
                {CLAIM_PROVENANCES.map((option) => (
                  <option key={option} value={option}>
                    {prettyLabel(option)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--ink)]">Claim status</span>
              <select
                value={claim.status}
                onChange={(event) =>
                  setClaim((current) => ({
                    ...current,
                    status: event.target.value as ClaimStatus,
                  }))
                }
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
              >
                {CLAIM_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {prettyLabel(option)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm font-medium text-[var(--ink)]">Provenance detail</span>
              <input
                type="text"
                value={claim.provenanceDetail}
                onChange={(event) =>
                  setClaim((current) => ({ ...current, provenanceDetail: event.target.value }))
                }
                placeholder="Intuition, cited source, inherited from a person, or derived from another claim"
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
              />
            </label>

            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm font-medium text-[var(--ink)]">Source citation</span>
              <input
                type="text"
                value={claim.sourceCitation}
                onChange={(event) =>
                  setClaim((current) => ({ ...current, sourceCitation: event.target.value }))
                }
                placeholder="Article title, paper, URL, book chapter, transcript, or pasted source"
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
              />
              <p className="text-xs leading-5 text-[var(--muted-ink)]">
                Penny will attach this citation to any claims that emerge from the pasted or imported material.
              </p>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--ink)]">Source reliability</span>
              <select
                value={claim.sourceTrustLevel}
                onChange={(event) =>
                  setClaim((current) => ({
                    ...current,
                    sourceTrustLevel: event.target.value as SourceTrustLevel,
                  }))
                }
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
              >
                {SOURCE_TRUST_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level === "self" ? "Self / intuition" : prettyLabel(level)}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-5 text-[var(--muted-ink)]">
                Peer-reviewed research should usually outweigh interviews, tweets, and intuition by default.
              </p>
            </label>

            <div className="space-y-2 lg:col-span-2">
              <span className="text-sm font-medium text-[var(--ink)]">Stakes tags</span>
              <div className="flex flex-wrap gap-2">
                {CLAIM_STAKES.map((stake) => {
                  const active = claim.stakes.includes(stake);

                  return (
                    <button
                      key={stake}
                      type="button"
                      className={[
                        "rounded-full border px-3 py-2 text-sm transition",
                        active
                          ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                          : "border-black/10 bg-[var(--panel)] text-[var(--muted-ink)] hover:border-black/20 hover:text-[var(--ink)]",
                      ].join(" ")}
                      onClick={() => toggleStake(stake)}
                    >
                      {STAKE_LABELS[stake]}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm font-medium text-[var(--ink)]">Dependency notes</span>
              <textarea
                rows={3}
                value={claim.dependencyNotes}
                onChange={(event) =>
                  setClaim((current) => ({ ...current, dependencyNotes: event.target.value }))
                }
                placeholder="What other claims must be true for this one to hold?"
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
              />
              <div className="flex flex-wrap gap-2">
                {assumptionSnapshot.assumptions.map((assumption) => (
                  <button
                    key={assumption.text}
                    type="button"
                    className="rounded-full border border-[#d7c06c] bg-[#fff6d8] px-3 py-2 text-left text-xs leading-5 text-[#6f5612] transition hover:border-[#b79412] hover:bg-[#fff1b8]"
                    onClick={() =>
                      setClaim((current) => ({
                        ...current,
                        dependencyNotes: current.dependencyNotes
                          ? `${current.dependencyNotes}\n${assumption.text}`
                          : assumption.text,
                      }))
                    }
                    title={assumption.explanation}
                  >
                    {assumption.category} · {assumption.confidence}%
                  </button>
                ))}
              </div>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--ink)]">Temporal scope</span>
              <input
                type="text"
                value={claim.temporalScope}
                onChange={(event) =>
                  setClaim((current) => ({ ...current, temporalScope: event.target.value }))
                }
                placeholder="e.g. 5-year claim, this quarter, long-run"
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--ink)]">Claim structure</span>
              <select
                value={claim.structureKind}
                onChange={(event) =>
                  setClaim((current) => ({
                    ...current,
                    structureKind: event.target.value as typeof claim.structureKind,
                  }))
                }
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
              >
                <option value="assertion">Assertion</option>
                <option value="conditional">Conditional</option>
                <option value="compound">Compound</option>
                <option value="temporal">Temporal</option>
                <option value="merged_candidate">Merged candidate</option>
                <option value="split_candidate">Split candidate</option>
              </select>
            </label>

            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm font-medium text-[var(--ink)]">Conditional statement</span>
              <textarea
                rows={2}
                value={claim.conditionalStatement}
                onChange={(event) =>
                  setClaim((current) => ({ ...current, conditionalStatement: event.target.value }))
                }
                placeholder="If X, then Y"
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
              />
            </label>
          </div>
        </div>

        <textarea
          id="rawThought"
          name="rawThought"
          rows={7}
          value={rawThought}
          onChange={(event) => setRawThought(event.target.value)}
          placeholder="Example: Founders will keep using a personal idea wiki only if it pressure-tests their notes instead of just storing them."
          className="w-full rounded-[28px] border border-black/10 bg-[var(--panel)] px-5 py-5 text-base leading-7 text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
        />

        {rawThought.trim() ? (
            <div className="rounded-[28px] border border-[#d7c06c] bg-[#fff9df] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#6f5612]">Assumption extraction</p>
                <h3 className="mt-1 text-xl font-semibold text-[#5a460d]">
                  Penny thinks this is a {assumptionSnapshot.claimType} claim
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#6f5612]">
                  Sharp extraction means specific assumptions, not generic ones. Penny is surfacing the scaffolding it thinks you were carrying implicitly.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-white text-[#5a460d]">
                  {assumptionSnapshot.claimTypeConfidence}% type confidence
                </Badge>
                <Badge className="bg-white text-[#5a460d]">
                  {assumptionSnapshot.assumptions.length + 1} commitments
                </Badge>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full border border-[#d7c06c] bg-white px-3 py-2 text-xs uppercase tracking-[0.18em] text-[#6f5612] transition hover:border-[#b79412]"
                onClick={() => {
                  if (weakestAssumption) {
                    setFocusedAssumptionId(weakestAssumption.text);
                  }
                }}
              >
                See weakest
              </button>
              <p className="text-sm leading-6 text-[#6f5612]">
                You stated one claim. You are actually committing to {assumptionSnapshot.assumptions.length} unstated assumptions.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {assumptionSnapshot.assumptions.map((assumption, index) => {
                const verdict = assumptionVerdicts[assumption.text];
                const correction = assumptionCorrections[assumption.text] ?? "";
                const focused = focusedAssumptionId === assumption.text || (!focusedAssumptionId && weakestAssumption?.text === assumption.text);

                return (
                  <div
                    key={`${assumption.category}-${index}`}
                    className={[
                      "rounded-[22px] border px-4 py-4 transition-all duration-200",
                      focused ? "border-[#b79412] bg-white shadow-[0_10px_30px_rgba(183,148,18,0.12)]" : "border-[#e0ca7a] bg-[#fffef5]",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-[#fff1b8] text-[#6f5612]">{assumption.category}</Badge>
                      <Badge className="bg-white text-[#5a460d]">{assumption.confidence}% confident</Badge>
                      <Badge className="bg-white text-[#5a460d]">{assumption.sharpness}</Badge>
                      {verdict ? <Badge className="bg-white text-[#355b32]">{verdict}</Badge> : null}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#5a460d]">{assumption.text}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#6f5612]">{assumption.explanation}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        onClick={() =>
                          setAssumptionVerdicts((current) => ({
                            ...current,
                            [assumption.text]: "accepted",
                          }))
                        }
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        onClick={() =>
                          setAssumptionVerdicts((current) => ({
                            ...current,
                            [assumption.text]: "rejected",
                          }))
                        }
                      >
                        Reject
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        onClick={() =>
                          setAssumptionVerdicts((current) => ({
                            ...current,
                            [assumption.text]: "refined",
                          }))
                        }
                      >
                        Refine
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        onClick={() => setFocusedAssumptionId(assumption.text)}
                      >
                        Focus
                      </Button>
                    </div>
                    {verdict === "refined" ? (
                      <textarea
                        rows={2}
                        value={correction}
                        onChange={(event) =>
                          setAssumptionCorrections((current) => ({
                            ...current,
                            [assumption.text]: event.target.value,
                          }))
                        }
                        placeholder="Write the sharper version of this assumption."
                        className="mt-4 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            {claim.temporalScope.trim() || claim.conditionalStatement.trim() || claim.structureKind !== "assertion" ? (
              <div className="mt-4 rounded-[24px] border border-[#d7c06c] bg-[#fffdf0] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6f5612]">Claim structure</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {claim.temporalScope.trim() ? <Badge className="bg-white text-[#5a460d]">{claim.temporalScope.trim()}</Badge> : null}
                  <Badge className="bg-white text-[#5a460d]">{claim.structureKind.replaceAll("_", " ")}</Badge>
                  {claim.conditionalStatement.trim() ? (
                    <Badge className="bg-white text-[#5a460d]">conditional present</Badge>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-[#6f5612]">
                  Temporal scope and conditional wording make the claim easier to split, merge, and stress-test later.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-[#8b3d33]">{error}</p> : null}

      <Button type="submit" className="gap-2 px-6 py-3 text-base" disabled={isPending || rawThought.trim().length < 12}>
        {isPending ? "Starting map..." : "Start idea-wiki map"}
        <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}
