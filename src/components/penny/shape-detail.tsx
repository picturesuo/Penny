"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PennyShape } from "@/lib/penny-insights";

export function ShapeDetail({
  shape,
  falsificationDraft,
  onFalsificationDraftChange,
  onSaveFalsificationCondition,
}: {
  shape: PennyShape | null;
  falsificationDraft: string;
  onFalsificationDraftChange: (value: string) => void;
  onSaveFalsificationCondition: () => void;
}) {
  if (!shape || !shape.derivation) {
    return (
      <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Shape derivation</p>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">Select a shape to see which moves produced it and what would change it.</p>
      </div>
    );
  }

  const confirmingMoves = shape.derivation.contributingMoves.filter((move) => move.direction === "confirms_shape");
  const disconfirmingMoves = shape.derivation.contributingMoves.filter((move) => move.direction === "disconfirms_shape");
  const confirmScore = confirmingMoves.reduce((sum, move) => sum + move.weight, 0);
  const disconfirmScore = disconfirmingMoves.reduce((sum, move) => sum + move.weight, 0);

  return (
    <div className="rounded-[24px] border border-black/8 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-[var(--panel)] text-[var(--ink)]">{shape.kind}</Badge>
        <Badge className="bg-[#e7defa] text-[#5c4c88]">{shape.confidence}% confidence</Badge>
        <Badge className="bg-[#d9ead8] text-[#355b32]">
          {shape.derivation.thresholdMet.thresholdMet ? "threshold met" : "provisional"}
        </Badge>
      </div>
      <h3 className="mt-3 text-2xl font-semibold text-[var(--ink)]">{shape.label}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{shape.summary}</p>

      <div className="mt-4 rounded-[20px] bg-[var(--panel)] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Derivation formula</p>
        <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{shape.derivation.derivationFormula}</p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[22px] bg-[var(--panel)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">What made this shape</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Total confirmation score {confirmScore.toFixed(2)} vs disconfirmation score {disconfirmScore.toFixed(2)}.
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Required confidence {shape.derivation.thresholdMet.requiredConfidence}% and {shape.derivation.thresholdMet.evidenceCountRequired} evidence moves.
          </p>
          <div className="mt-4 space-y-3">
            {shape.derivation.contributingMoves.map((move) => (
              <div key={move.moveId} className="rounded-[18px] bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={move.direction === "confirms_shape" ? "bg-[#d9ead8] text-[#355b32]" : "bg-[#fff6ed] text-[#8b4d1f]"}>
                    {move.direction === "confirms_shape" ? "confirms" : "disconfirms"}
                  </Badge>
                  <Badge className="bg-[var(--panel)] text-[var(--ink)]">{Math.round(move.weight * 100)} weight</Badge>
                  <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                    {move.timestamp.toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-[var(--ink)]">{move.claimContext}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">{move.eventDescription}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{move.includeReason}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] bg-[var(--panel)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">What would change it</p>
          <p className="mt-2 text-sm leading-7 text-[var(--ink)]">{shape.derivation.counterfactual.description}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Minimum changes to retire the shape: {shape.derivation.counterfactual.minimumChangesToRetire}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {shape.derivation.counterfactual.movesToRemove.length ? (
              shape.derivation.counterfactual.movesToRemove.map((moveId) => (
                <Badge key={moveId} className="bg-white text-[var(--ink)]">
                  remove {moveId.slice(0, 8)}
                </Badge>
              ))
            ) : (
              <Badge className="bg-white text-[var(--ink)]">No moves marked for removal yet</Badge>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {shape.derivation.counterfactual.movesNeededToNegate.length ? (
              shape.derivation.counterfactual.movesNeededToNegate.map((moveId) => (
                <Badge key={moveId} className="bg-[#fff6ed] text-[#8b4d1f]">
                  negate {moveId.slice(0, 8)}
                </Badge>
              ))
            ) : (
              <Badge className="bg-[#fff6ed] text-[#8b4d1f]">No negating moves identified yet</Badge>
            )}
          </div>
          <div className="mt-4 rounded-[18px] bg-white p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Alternative shapes</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {shape.derivation.alternativeShapes.length ? (
                shape.derivation.alternativeShapes.map((candidate) => (
                  <Badge key={candidate} className="bg-[var(--panel)] text-[var(--ink)]">
                    {candidate}
                  </Badge>
                ))
              ) : (
                <Badge className="bg-[var(--panel)] text-[var(--ink)]">No close alternative yet</Badge>
              )}
            </div>
          </div>
          <div className="mt-4 rounded-[18px] bg-white p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">How to prove this wrong</p>
            <textarea
              className="mt-3 min-h-[108px] w-full rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
              placeholder="Write the evidence or behavior that would make you dispute this shape."
              value={falsificationDraft}
              onChange={(event) => onFalsificationDraftChange(event.target.value)}
            />
            <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
              Penny will treat this as a falsifiability commitment and resurface it if later behavior matches your own condition.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" className="px-3 py-2 text-xs" disabled={falsificationDraft.trim().length < 8} onClick={onSaveFalsificationCondition}>
                Save falsification condition
              </Button>
            </div>
          </div>
          <div className="mt-4 rounded-[18px] bg-white p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Plain language derivation</p>
            <p className="mt-2 text-sm leading-7 text-[var(--ink)]">
              This shape was detected after {shape.derivation.contributingMoves.length} supporting moves. The recurring pattern became strong enough to confirm at{" "}
              {shape.derivation.thresholdMet.requiredConfidence}% confidence, and Penny can show exactly which moves confirmed it versus pushed against it.
            </p>
          </div>
          {shape.falsificationCondition ? (
            <div className="mt-4 rounded-[18px] bg-[#fff6ed] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#8b4d1f]">Your falsification condition</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{shape.falsificationCondition}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
