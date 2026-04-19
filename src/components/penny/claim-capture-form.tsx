'use client';

import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfidenceSlider } from "@/components/penny/confidence-slider";
import { LearningPromptBanner } from "@/components/penny/learning-prompt-banner";
import { generateLearningPrompt } from "@/lib/learning-prompts";
import type { LearningPromptClaim } from "@/lib/learning-prompts";

export type ClaimCaptureFormData = {
  text: string;
  confidence: number;
  provenance: "intuition" | "cited_source" | "inherited" | "derived";
  stakes: string[];
};

interface ClaimCaptureFormProps {
  mapId: string;
  onSubmit: (data: ClaimCaptureFormData) => Promise<void>;
  onCancel: () => void;
}

const PROVENANCE_OPTIONS: Array<{
  value: ClaimCaptureFormData["provenance"];
  label: string;
  description: string;
}> = [
  { value: "intuition", label: "Gut feeling", description: "No specific source." },
  { value: "cited_source", label: "Source", description: "A data point, article, or paper." },
  { value: "derived", label: "Derived", description: "Calculated or inferred from something else." },
  { value: "inherited", label: "Inherited", description: "Told to me or assumed from context." },
];

export function ClaimCaptureForm({ mapId, onSubmit, onCancel }: ClaimCaptureFormProps) {
  const [text, setText] = useState("");
  const [confidence, setConfidence] = useState(60);
  const [provenance, setProvenance] = useState<ClaimCaptureFormData["provenance"]>("intuition");
  const [showMetadata, setShowMetadata] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [learningPromptDismissed, setLearningPromptDismissed] = useState(false);
  const learningPrompt = useMemo(() => {
    const promptClaim: LearningPromptClaim = {
      id: `draft-${mapId}`,
      mapId,
      userId: "draft",
      text,
      confidence,
      structureKind: "assertion",
      provenance,
      stakes: [],
    };

    return generateLearningPrompt({
      claim: promptClaim,
      round: null,
      userResponse: null,
      triggerType: "high_confidence_entry",
    });
  }, [confidence, mapId, provenance, text]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        text: text.trim(),
        confidence,
        provenance,
        stakes: [],
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save claim");
      setSubmitting(false);
    }
  }

  const confidenceLabel =
    confidence <= 30 ? "Unlikely" : confidence <= 45 ? "Doubtful" : confidence <= 55 ? "Unsure" : confidence <= 70 ? "Probably" : confidence <= 85 ? "Likely" : "Almost certain";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor={`claim-text-${mapId}`} className="text-sm font-medium text-[var(--ink)]">
            What do you believe?
          </label>
          <p className="text-sm leading-6 text-[var(--muted-ink)]">
            Keep it specific. One claim. One thing that could be wrong.
          </p>
          <textarea
            id={`claim-text-${mapId}`}
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="e.g. We will hit 1,000 active users before runway ends."
            rows={4}
            maxLength={1000}
            minLength={10}
            required
            className="w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--muted-ink)] focus:border-black/20"
          />
          <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{text.length}/1000</div>
        </div>

        <div className="space-y-2">
          <label htmlFor={`confidence-slider-${mapId}`} className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--ink)]">
            How confident are you?
            <span className="rounded-full bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted-ink)]">{confidence}%</span>
            <span className="rounded-full bg-[#efe8fb] px-3 py-1 text-xs text-[#5c4c88]">{confidenceLabel}</span>
          </label>
          <p className="text-sm leading-6 text-[var(--muted-ink)]">60% means you think it is more likely than not, but you are not certain.</p>
        <ConfidenceSlider
          id={`confidence-slider-${mapId}`}
          value={confidence}
          onChange={setConfidence}
          calibrationHint={null}
        />
        {learningPrompt && !learningPromptDismissed ? (
          <div className="pt-2">
            <LearningPromptBanner
              prompt={learningPrompt}
              claimId={`draft-${mapId}`}
              onDismiss={() => setLearningPromptDismissed(true)}
            />
          </div>
        ) : null}
      </div>

        <button
          type="button"
          onClick={() => setShowMetadata((current) => !current)}
          className="text-sm font-medium text-[var(--ink)] underline decoration-black/20 underline-offset-4"
        >
          {showMetadata ? "Hide optional context" : "Add context (optional)"}
        </button>

        {showMetadata ? (
          <div className="space-y-3 rounded-[20px] border border-black/8 bg-[var(--panel)] p-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--ink)]">How do you know this?</p>
              <div className="grid gap-2 md:grid-cols-2">
                {PROVENANCE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-[18px] border p-3 transition ${
                      provenance === option.value ? "border-black/15 bg-white" : "border-black/8 bg-white/70 hover:border-black/12"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name={`provenance-${mapId}`}
                        value={option.value}
                        checked={provenance === option.value}
                        onChange={() => setProvenance(option.value)}
                        className="mt-1"
                      />
                      <div>
                        <div className="text-sm font-medium text-[var(--ink)]">{option.label}</div>
                        <div className="text-sm leading-6 text-[var(--muted-ink)]">{option.description}</div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {error ? <div className="rounded-[18px] border border-[#f0c0b7] bg-[#fff4f1] px-4 py-3 text-sm text-[#8b3d2f]">{error}</div> : null}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!text.trim() || text.length < 10 || submitting}>
            {submitting ? "Saving..." : "Save claim"}
          </Button>
        </div>
    </form>
  );
}
