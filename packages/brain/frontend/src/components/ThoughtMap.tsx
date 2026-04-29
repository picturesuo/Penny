import type { BrainClaim } from "../types/brain";
import { placeholderProblems } from "../data/placeholders";

interface ThoughtMapProps {
  claims: BrainClaim[];
  focusedClaimId: string | null;
  suggestedClaimId: string | null;
  onClaimSelect: (claimId: string) => void;
}

export function ThoughtMap({ claims, focusedClaimId, suggestedClaimId, onClaimSelect }: ThoughtMapProps) {
  const seedClaim = claims.find((claim) => claim.seedId === "claim.seed") ?? claims[0];
  const visibleClaims = claims.filter((claim) => claim.id !== seedClaim?.id).slice(0, 14);

  return (
    <div className="thought-map-tree">
      {visibleClaims.length > 0 ? (
        <RuntimeTree
          seedText={seedClaim?.text ?? "Sentence Title"}
          claims={visibleClaims}
          focusedClaimId={focusedClaimId}
          suggestedClaimId={suggestedClaimId}
          onClaimSelect={onClaimSelect}
        />
      ) : (
        <PlaceholderTree />
      )}
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

function PlaceholderTree() {
  return (
    <div className="tree-line">
      {placeholderProblems.map((problem, index) => (
        <div key={`${problem.title}-${index}`} className="tree-group">
          <strong>{problem.title}</strong>
          {problem.children.map((child, childIndex) => (
            <span key={`${child}-${childIndex}`}>{child}</span>
          ))}
        </div>
      ))}
    </div>
  );
}
