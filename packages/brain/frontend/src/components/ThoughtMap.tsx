import type { BrainClaim } from "../types/brain";
import { placeholderProblems } from "../data/placeholders";

interface ThoughtMapProps {
  claims: BrainClaim[];
}

export function ThoughtMap({ claims }: ThoughtMapProps) {
  const seedClaim = claims.find((claim) => claim.seedId === "claim.seed") ?? claims[0];
  const visibleClaims = claims.filter((claim) => claim.id !== seedClaim?.id).slice(0, 14);

  return (
    <div className="thought-map-tree">
      {visibleClaims.length > 0 ? (
        <RuntimeTree seedText={seedClaim?.text ?? "Sentence Title"} claims={visibleClaims} />
      ) : (
        <PlaceholderTree />
      )}
    </div>
  );
}

function RuntimeTree({ seedText, claims }: { seedText: string; claims: BrainClaim[] }) {
  return (
    <div className="tree-line">
      <div className="tree-group">
        <strong>{seedText}</strong>
        {claims.map((claim) => (
          <div key={claim.id} className="tree-branch">
            <strong>{claim.kind === "assumption" ? "problem" : claim.kind}</strong>
            <span>{claim.text}</span>
          </div>
        ))}
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
