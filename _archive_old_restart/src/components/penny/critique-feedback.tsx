"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const DIMENSIONS = [
  { key: "relevance", label: "Relevant" },
  { key: "novelty", label: "New" },
  { key: "strength", label: "Challenge level" },
  { key: "specificity", label: "Specific" },
  { key: "actionability", label: "Actionable" },
  { key: "timing", label: "Timed well" },
] as const;

type RatingState = Record<(typeof DIMENSIONS)[number]["key"], number>;

const DEFAULT_RATINGS: RatingState = {
  relevance: 3,
  novelty: 3,
  strength: 3,
  specificity: 3,
  actionability: 3,
  timing: 3,
};

const CORRECTION_TYPES = [
  "factual_error",
  "wrong_target",
  "wrong_tone",
  "missing_context",
  "already_addressed",
  "other",
] as const;

export function CritiqueFeedback({
  roundLabel,
  critiqueText,
  critiqueMode,
  voiceLabel,
  failureTypes,
  shapeId = null,
  manualOnly = false,
  submitted = false,
  onSubmit,
  onDismiss,
}: {
  roundLabel: string;
  critiqueText: string;
  critiqueMode: string | null;
  voiceLabel: string | null;
  failureTypes: string[];
  shapeId?: string | null;
  manualOnly?: boolean;
  submitted?: boolean;
  onSubmit: (payload: {
    ratings: Array<{ dimension: (typeof DIMENSIONS)[number]["key"]; score: number; comment: string | null }>;
    overallUsefulness: number;
    freeTextFeedback: string | null;
    correctionText: string | null;
    correctionType: (typeof CORRECTION_TYPES)[number];
    isCorrectionFlagged: boolean;
    dismissed: boolean;
    shapeId: string | null;
  }) => void;
  onDismiss: () => void;
}) {
  const [ratings, setRatings] = useState<RatingState>(DEFAULT_RATINGS);
  const [freeTextFeedback, setFreeTextFeedback] = useState("");
  const [correctionText, setCorrectionText] = useState("");
  const [isCorrectionFlagged, setIsCorrectionFlagged] = useState(false);
  const [correctionType, setCorrectionType] = useState<(typeof CORRECTION_TYPES)[number]>("other");

  const overallUsefulness = useMemo(() => {
    const values = Object.values(ratings);
    return Math.max(1, Math.min(5, Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)));
  }, [ratings]);

  if (submitted) {
    return (
      <div className="rounded-[20px] border border-[#d9ead8] bg-[#f6fbf5] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-white text-[var(--ink)]">feedback saved</Badge>
          {critiqueMode ? <Badge className="bg-white text-[var(--ink)]">{critiqueMode.replaceAll("_", " ")}</Badge> : null}
          {voiceLabel ? <Badge className="bg-white text-[var(--ink)]">{voiceLabel}</Badge> : null}
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
          Penny will use this signal to tune the next critique pass and the critique-quality profile.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-black/8 bg-[var(--panel)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Critique feedback</p>
          <h4 className="mt-1 text-lg font-semibold text-[var(--ink)]">How was this critique?</h4>
        </div>
        <div className="flex flex-wrap gap-2">
          {critiqueMode ? <Badge className="bg-white text-[var(--ink)]">{critiqueMode.replaceAll("_", " ")}</Badge> : null}
          {voiceLabel ? <Badge className="bg-white text-[var(--ink)]">{voiceLabel}</Badge> : null}
          {failureTypes.length ? <Badge className="bg-white text-[var(--ink)]">{failureTypes.join(" · ")}</Badge> : null}
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
        Rate what landed. A low score is useful signal, not failure.
      </p>
      <div className="mt-4 space-y-3">
        {DIMENSIONS.map((dimension) => (
          <div key={dimension.key} className="rounded-[18px] bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-[var(--ink)]">{dimension.label}</p>
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button
                    key={`${dimension.key}-${score}`}
                    type="button"
                    className={`h-8 w-8 rounded-full border text-xs transition ${
                      ratings[dimension.key] === score
                        ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                        : "border-black/10 bg-[var(--panel)] text-[var(--muted-ink)]"
                    }`}
                    onClick={() =>
                      setRatings((current) => ({
                        ...current,
                        [dimension.key]: score,
                      }))
                    }
                    aria-label={`${dimension.label} ${score}`}
                  >
                    {score}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-[18px] bg-white p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Penny is wrong</p>
        <textarea
          className="mt-3 min-h-[92px] w-full rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
          placeholder="Tell Penny what it got wrong, or what context it missed."
          value={correctionText}
          onChange={(event) => setCorrectionText(event.target.value)}
        />
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--muted-ink)]">
          <input
            type="checkbox"
            checked={isCorrectionFlagged}
            onChange={(event) => setIsCorrectionFlagged(event.target.checked)}
          />
          Treat this as a correction Penny should learn from.
        </label>
        <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Correction type</label>
        <select
          className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
          value={correctionType}
          onChange={(event) => setCorrectionType(event.target.value as (typeof CORRECTION_TYPES)[number])}
        >
          {CORRECTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <textarea
          className="mt-3 min-h-[72px] w-full rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
          placeholder="Optional: anything else Penny should know?"
          value={freeTextFeedback}
          onChange={(event) => setFreeTextFeedback(event.target.value)}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          className="px-3 py-2 text-xs"
          onClick={() =>
            onSubmit({
              ratings: DIMENSIONS.map((dimension) => ({
                dimension: dimension.key,
                score: ratings[dimension.key],
                comment: null,
              })),
              overallUsefulness,
              freeTextFeedback: freeTextFeedback.trim().length ? freeTextFeedback.trim() : null,
              correctionText: correctionText.trim().length ? correctionText.trim() : null,
              correctionType,
              isCorrectionFlagged,
              dismissed: false,
              shapeId,
            })
          }
        >
          Save feedback
        </Button>
        <Button variant="ghost" className="px-3 py-2 text-xs" onClick={onDismiss}>
          {manualOnly ? "Keep manual rating only" : "Dismiss"}
        </Button>
      </div>
      {manualOnly ? (
        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
          Auto-prompt is off for now. Use the manual button when you want to rate a critique.
        </p>
      ) : null}
      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
        Round {roundLabel}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{critiqueText}</p>
    </div>
  );
}
