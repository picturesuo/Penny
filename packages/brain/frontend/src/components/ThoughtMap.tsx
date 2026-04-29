import type { BrainClaim, WorkStructure, WorkStructureStep } from "../types/brain";

interface ThoughtMapProps {
  claims: BrainClaim[];
  workStructure?: WorkStructure | null;
  focusedClaimId: string | null;
  focusedWorkStructureStepId?: string | null;
  suggestedClaimId: string | null;
  onClaimSelect: (claimId: string) => void;
  onWorkStructureSelect?: (step: WorkStructureStep) => void;
}

export function ThoughtMap({
  claims,
  workStructure,
  focusedClaimId,
  focusedWorkStructureStepId,
  suggestedClaimId,
  onClaimSelect,
  onWorkStructureSelect,
}: ThoughtMapProps) {
  const seedClaim = claims.find((claim) => claim.seedId === "claim.seed") ?? claims[0];
  const visibleClaims = claims.filter((claim) => claim.id !== seedClaim?.id).slice(0, 14);

  return (
    <div className="thought-map-tree">
      {workStructure?.steps.length ? (
        <WorkStructureTree
          workStructure={workStructure}
          focusedClaimId={focusedClaimId}
          focusedWorkStructureStepId={focusedWorkStructureStepId ?? null}
          suggestedClaimId={suggestedClaimId}
          onWorkStructureSelect={onWorkStructureSelect ?? noopWorkStructureSelect}
        />
      ) : seedClaim ? (
        <RuntimeTree
          seedText={seedClaim.text}
          claims={visibleClaims}
          focusedClaimId={focusedClaimId}
          suggestedClaimId={suggestedClaimId}
          onClaimSelect={onClaimSelect}
        />
      ) : (
        <EmptyTree />
      )}
    </div>
  );
}

function noopWorkStructureSelect() {}

function WorkStructureTree({
  workStructure,
  focusedClaimId,
  focusedWorkStructureStepId,
  suggestedClaimId,
  onWorkStructureSelect,
}: {
  workStructure: WorkStructure;
  focusedClaimId: string | null;
  focusedWorkStructureStepId: string | null;
  suggestedClaimId: string | null;
  onWorkStructureSelect: (step: WorkStructureStep) => void;
}) {
  return (
    <div className="tree-line work-structure-tree">
      <div className="tree-group">
        <strong>{workStructure.label}</strong>
        <span>{workStructure.description}</span>
        {workStructure.steps.map((step) => {
          const isFocused =
            step.id === focusedWorkStructureStepId ||
            step.id === workStructure.activeStepId ||
            Boolean(focusedClaimId && step.claimIds.includes(focusedClaimId));
          const isSuggested = Boolean(suggestedClaimId && step.claimIds.includes(suggestedClaimId));

          return (
            <button
              key={step.id}
              type="button"
              className={`tree-branch work-structure-step is-${step.status}${isFocused ? " is-focused" : ""}${
                isSuggested ? " is-suggested" : ""
              }`}
              onClick={() => onWorkStructureSelect(step)}
            >
              <small>#{step.rank} / fragile {step.fragility}</small>
              <strong>{step.title}</strong>
              <span>{step.purpose}</span>
              <em>{step.whyNow}</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RuntimeTree({
  seedText,
  claims,
  focusedClaimId,
  suggestedClaimId,
  onClaimSelect,
}: {
  seedText: string;
  claims: BrainClaim[];
  focusedClaimId: string | null;
  suggestedClaimId: string | null;
  onClaimSelect: (claimId: string) => void;
}) {
  return (
    <div className="tree-line">
      <div className="tree-group">
        <strong>{seedText}</strong>
        {claims.map((claim) => {
          const isFocused = claim.id === focusedClaimId;
          const isSuggested = claim.id === suggestedClaimId;

          return (
            <button
              key={claim.id}
              type="button"
              className={`tree-branch${isFocused ? " is-focused" : ""}${isSuggested ? " is-suggested" : ""}`}
              onClick={() => onClaimSelect(claim.id)}
            >
              <strong>{claim.kind === "assumption" ? "problem" : claim.kind}</strong>
              <span>{claim.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyTree() {
  return (
    <div className="tree-empty">
      <strong>No graph state</strong>
      <span>Awaiting session claims.</span>
    </div>
  );
}
