import type { BrainClaim, BrainMove, ChallengeSuggestion, LearnCandidate } from "../types/brain";
import { placeholderMoves } from "../data/placeholders";
import { formatLabel } from "../lib/format";

interface InsightRailProps {
  challenge: ChallengeSuggestion | undefined;
  claims: BrainClaim[];
  learnCandidates: LearnCandidate[];
  moves: BrainMove[];
}

export function InsightRail({ challenge, claims, learnCandidates, moves }: InsightRailProps) {
  const target = claims.find((claim) => claim.id === challenge?.targetClaimId);
  const importantInsight = target?.text ?? challenge?.weakestPart ?? "Placeholder";
  const whyItMatters =
    challenge?.challenge ??
    learnCandidates[0]?.whyItMatters ??
    "Placeholder";

  return (
    <aside className="insight-rail" aria-label="Makes Cents">
      <section className="make-cents">
        <h2 className="section-label">MAKE CENTS</h2>
        <RailBlock title="MOST IMPORTANT INSIGHT">{importantInsight}</RailBlock>
        <RailBlock title="WHY IT MATTERS">{whyItMatters}</RailBlock>
        <RailBlock title="EXAMPLES">{learnCandidates[0]?.unblockExplanation ?? "Placeholder"}</RailBlock>
        <RailBlock title="RELATED CONCEPTS">
          {learnCandidates.length > 0
            ? learnCandidates
                .slice(0, 3)
                .map((candidate) => candidate.term)
                .join(", ")
            : "Placeholder"}
        </RailBlock>
      </section>
      <ThinkingHistory moves={moves.length > 0 ? moves : placeholderMoves} />
    </aside>
  );
}

function RailBlock({ title, children }: { title: string; children: string }) {
  return (
    <article className="rail-block">
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

function ThinkingHistory({ moves }: { moves: BrainMove[] }) {
  return (
    <section className="thinking-history">
      <h2 className="section-label">THINKING HISTORY</h2>
      <div className="history-list">
        {moves.slice(0, 6).map((move) => (
          <article key={move.id}>
            <span>{move.summary || formatLabel(move.type)}</span>
            <time>{move.createdAt ? formatHistoryTime(move.createdAt) : "Time"}</time>
          </article>
        ))}
      </div>
      <button type="button" className="history-link">
        View full history <span aria-hidden="true">-&gt;</span>
      </button>
    </section>
  );
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Time";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
