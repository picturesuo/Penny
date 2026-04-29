import type { BrainClaim, WorkStructure, WorkStructureStep } from "../types/brain";
import { Section } from "./Section";
import { ThoughtMap } from "./ThoughtMap";

interface LeftRailProps {
  claims: BrainClaim[];
  workStructure?: WorkStructure | null;
  savedPaths: string[];
  focusedClaimId: string | null;
  focusedWorkStructureStepId?: string | null;
  suggestedClaimId: string | null;
  onClaimSelect: (claimId: string) => void;
  onWorkStructureSelect?: (step: WorkStructureStep) => void;
}

export function LeftRail({
  claims,
  workStructure,
  savedPaths,
  focusedClaimId,
  focusedWorkStructureStepId,
  suggestedClaimId,
  onClaimSelect,
  onWorkStructureSelect,
}: LeftRailProps) {
  return (
    <aside className="left-rail" aria-label="Thought map">
      <Section title="THOUGHT MAP" className="thought-map-section">
        <ThoughtMap
          claims={claims}
          workStructure={workStructure ?? null}
          focusedClaimId={focusedClaimId}
          focusedWorkStructureStepId={focusedWorkStructureStepId ?? null}
          suggestedClaimId={suggestedClaimId}
          onClaimSelect={onClaimSelect}
          onWorkStructureSelect={onWorkStructureSelect ?? noopWorkStructureSelect}
        />
      </Section>
      <div className="left-bottom-grid">
        <Section title="LATER" className="later-section">
          {savedPaths.length > 0 ? (
            <ul>
              {savedPaths.slice(0, 3).map((path) => (
                <li key={path}>{path}</li>
              ))}
            </ul>
          ) : (
            <p>Exploration paths you save for later will appear here</p>
          )}
        </Section>
        <Section title="QUICK SELECT" className="quick-select-section">
          <div className="quick-select-grid" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </Section>
      </div>
    </aside>
  );
}

function noopWorkStructureSelect() {}
