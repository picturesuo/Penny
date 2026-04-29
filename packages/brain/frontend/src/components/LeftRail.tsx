import type { BrainClaim } from "../types/brain";
import { Section } from "./Section";
import { ThoughtMap } from "./ThoughtMap";

interface LeftRailProps {
  claims: BrainClaim[];
  savedPaths: string[];
  focusedClaimId: string | null;
  suggestedClaimId: string | null;
  onClaimSelect: (claimId: string) => void;
}

export function LeftRail({ claims, savedPaths, focusedClaimId, suggestedClaimId, onClaimSelect }: LeftRailProps) {
  return (
    <aside className="left-rail" aria-label="Thought map">
      <Section title="THOUGHT MAP" className="thought-map-section">
        <ThoughtMap
          claims={claims}
          focusedClaimId={focusedClaimId}
          suggestedClaimId={suggestedClaimId}
          onClaimSelect={onClaimSelect}
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
