import React, { useEffect, useMemo, useState } from "react";
import type { AutopilotSuggestion, BrainClaim } from "../types/brain";
import { formatLabel } from "../lib/format";
import { truncateWords } from "../lib/text";

type NextMoveMode = "learn" | "check" | "verify" | "save_to_brain";

interface NextMoveCardProps {
  suggestion: AutopilotSuggestion | null;
  candidates?: AutopilotSuggestion[];
  claims: BrainClaim[];
  focusedClaim: BrainClaim | null;
  disabled?: boolean;
  onAccept: (candidateId?: string) => Promise<void>;
  onOpenLearn?: () => void;
  onOpenCheck?: () => void;
  onOpenVerify?: () => void;
  onOpenSave?: () => void;
}

const modeActions: Record<NextMoveMode, string[]> = {
  learn: ["learn"],
  check: ["check", "challenge", "clarify", "resume_open_challenge"],
  verify: ["verify"],
  save_to_brain: ["save_to_brain", "save"],
};

const modeLabels: Record<NextMoveMode, string> = {
  learn: "Learn",
  check: "Check",
  verify: "Verify",
  save_to_brain: "Save",
};

const modeOrder: NextMoveMode[] = ["learn", "check", "verify", "save_to_brain"];

export function NextMoveCard({
  suggestion,
  candidates = [],
  claims,
  focusedClaim,
  disabled = false,
  onAccept,
  onOpenLearn,
  onOpenCheck,
  onOpenVerify,
  onOpenSave,
}: NextMoveCardProps) {
  const candidateOptions = useMemo(() => uniqueCandidates([suggestion, ...candidates]), [suggestion, candidates]);
  const candidateKey = candidateOptions.map((candidate) => candidate.candidateId).join("|");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    suggestion?.candidateId ?? candidateOptions[0]?.candidateId ?? null,
  );
  const [isAccepting, setIsAccepting] = useState(false);
  const selectedCandidate =
    candidateOptions.find((candidate) => candidate.candidateId === selectedCandidateId) ??
    suggestion ??
    candidateOptions[0] ??
    null;
  const targetClaim = targetClaimFor(selectedCandidate, claims, focusedClaim);
  const acceptLabel = selectedCandidate?.primaryActionLabel ?? "Accept next move";

  useEffect(() => {
    setSelectedCandidateId(suggestion?.candidateId ?? candidateOptions[0]?.candidateId ?? null);
  }, [suggestion?.candidateId, candidateKey]);

  async function handleAccept() {
    if (!selectedCandidate || disabled || isAccepting) {
      return;
    }

    setIsAccepting(true);

    try {
      await onAccept(selectedCandidate.candidateId);
    } finally {
      setIsAccepting(false);
    }
  }

  function handleModeSelect(mode: NextMoveMode) {
    const candidate = candidateForMode(candidateOptions, mode);

    if (candidate) {
      setSelectedCandidateId(candidate.candidateId);
      return;
    }

    fallbackForMode(mode, onOpenLearn, onOpenCheck, onOpenVerify, onOpenSave);
  }

  return (
    <article className="next-move-card" aria-label="Autopilot next move">
      <div className="next-move-head">
        <span>Autopilot</span>
        <strong>{selectedCandidate ? selectedCandidate.primaryActionLabel : "No move selected"}</strong>
      </div>

      <div className="next-move-body">
        <p>
          {selectedCandidate?.why ??
            "Penny needs a saved graph slice before it can choose the next Learn, Check, Verify, or Save move."}
        </p>
        {targetClaim ? <small>Target: {truncateWords(targetClaim.text, 20)}</small> : null}
        {selectedCandidate?.exitCriteria.label ? <small>Done when: {selectedCandidate.exitCriteria.label}</small> : null}
      </div>

      <div className="next-move-cta-row" aria-label="Move modes">
        {modeOrder.map((mode) => {
          const candidate = candidateForMode(candidateOptions, mode);
          const isSelected = Boolean(candidate && candidate.candidateId === selectedCandidate?.candidateId);

          return (
            <button
              key={mode}
              type="button"
              className={`next-move-mode${isSelected ? " is-selected" : ""}`}
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => handleModeSelect(mode)}
            >
              {modeLabels[mode]}
            </button>
          );
        })}
      </div>

      <div className="next-move-accept-row">
        <button
          type="button"
          className="primary-command"
          aria-label={`Go There: ${acceptLabel}`}
          disabled={disabled || isAccepting || !selectedCandidate}
          onClick={handleAccept}
        >
          {isAccepting ? "Starting" : acceptLabel}
        </button>
        <span>{selectedCandidate ? `${formatLabel(selectedCandidate.action)} / ${Math.round(selectedCandidate.score * 100)} score` : "Awaiting Autopilot"}</span>
      </div>

      {candidateOptions.length > 1 ? (
        <div className="next-move-choice-list" aria-label="Choose another move">
          {candidateOptions.map((candidate) => (
            <button
              key={candidate.candidateId}
              type="button"
              className={candidate.candidateId === selectedCandidate?.candidateId ? "is-selected" : ""}
              disabled={disabled}
              onClick={() => setSelectedCandidateId(candidate.candidateId)}
            >
              <strong>{candidate.primaryActionLabel}</strong>
              <span>{truncateWords(candidate.why, 16)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function uniqueCandidates(values: Array<AutopilotSuggestion | null | undefined>): AutopilotSuggestion[] {
  const seen = new Set<string>();
  const output: AutopilotSuggestion[] = [];

  for (const value of values) {
    if (!value || seen.has(value.candidateId)) {
      continue;
    }

    seen.add(value.candidateId);
    output.push(value);
  }

  return output;
}

function candidateForMode(candidates: AutopilotSuggestion[], mode: NextMoveMode): AutopilotSuggestion | null {
  const actions = modeActions[mode];

  return candidates.find((candidate) => actions.includes(candidate.action) || actions.includes(candidate.mode)) ?? null;
}

function targetClaimFor(
  candidate: AutopilotSuggestion | null,
  claims: BrainClaim[],
  focusedClaim: BrainClaim | null,
): BrainClaim | null {
  if (!candidate?.targetClaimId) {
    return focusedClaim;
  }

  return claims.find((claim) => claim.id === candidate.targetClaimId) ?? focusedClaim;
}

function fallbackForMode(
  mode: NextMoveMode,
  onOpenLearn: (() => void) | undefined,
  onOpenCheck: (() => void) | undefined,
  onOpenVerify: (() => void) | undefined,
  onOpenSave: (() => void) | undefined,
): void {
  switch (mode) {
    case "learn":
      onOpenLearn?.();
      return;
    case "check":
      onOpenCheck?.();
      return;
    case "verify":
      onOpenVerify?.();
      return;
    case "save_to_brain":
      onOpenSave?.();
      return;
  }
}
