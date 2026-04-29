import { type FormEvent, useEffect, useState } from "react";
import type {
  AutopilotSuggestion,
  BrainClaim,
  BrainMove,
  ChallengeResponseKind,
  ChallengeSuggestion,
  LearnCandidate,
  RespondToChallengeResponse,
  SessionCockpitData,
} from "../types/brain";
import { formatLabel, shortId } from "../lib/format";

interface InsightRailProps {
  challenge: ChallengeSuggestion | undefined;
  autopilotSuggestion: AutopilotSuggestion | null;
  claims: BrainClaim[];
  learnCandidates: LearnCandidate[];
  moves: BrainMove[];
  latestArtifact: SessionCockpitData["latestArtifact"] | null;
  challengeResponse: RespondToChallengeResponse["data"] | null;
  disabled: boolean;
  onIssueChallenge: () => Promise<void>;
  onRespondChallenge: (
    challengeId: string,
    draft:
      | { response: "defend"; reasoning: string }
      | { response: "revise"; revisedText: string; reasoning?: string }
      | { response: "absorb"; reasoning?: string },
  ) => Promise<void>;
  onCreateChallengeBrief: () => Promise<void>;
}

export function InsightRail({
  challenge,
  autopilotSuggestion,
  claims,
  learnCandidates,
  moves,
  latestArtifact,
  challengeResponse,
  disabled,
  onIssueChallenge,
  onRespondChallenge,
  onCreateChallengeBrief,
}: InsightRailProps) {
  const target = claims.find((claim) => claim.id === challenge?.targetClaimId);
  const importantInsight = target?.text ?? challenge?.weakestPart ?? "No active challenge";
  const whyItMatters = challenge?.challenge ?? learnCandidates[0]?.whyItMatters ?? "No challenge rationale";

  return (
    <aside className="insight-rail" aria-label="Makes Cents">
      <section className="make-cents">
        <h2 className="section-label">MAKE CENTS</h2>
        <RailBlock title="MOST IMPORTANT INSIGHT">{importantInsight}</RailBlock>
        <RailBlock title="WHY IT MATTERS">{whyItMatters}</RailBlock>
        <RailBlock title="EXAMPLES">{learnCandidates[0]?.unblockExplanation ?? "No example returned"}</RailBlock>
        <RailBlock title="RELATED CONCEPTS">
          {learnCandidates.length > 0
            ? learnCandidates
                .slice(0, 3)
                .map((candidate) => candidate.term)
                .join(", ")
            : "No related concepts"}
        </RailBlock>
      </section>
      <ChallengeLoop
        challenge={challenge}
        suggestion={autopilotSuggestion}
        response={challengeResponse}
        latestArtifact={latestArtifact}
        disabled={disabled}
        onIssueChallenge={onIssueChallenge}
        onRespondChallenge={onRespondChallenge}
        onCreateChallengeBrief={onCreateChallengeBrief}
      />
      <ThinkingHistory moves={moves} />
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
        {moves.length > 0 ? (
          moves.slice(0, 6).map((move) => (
            <article key={move.id}>
              <span>{move.summary || formatLabel(move.type)}</span>
              <time>{move.createdAt ? formatHistoryTime(move.createdAt) : "Time"}</time>
            </article>
          ))
        ) : (
          <article>
            <span>No moves recorded</span>
            <time>-</time>
          </article>
        )}
      </div>
      <button type="button" className="history-link">
        View full history <span aria-hidden="true">-&gt;</span>
      </button>
    </section>
  );
}

function ChallengeLoop({
  challenge,
  suggestion,
  response,
  latestArtifact,
  disabled,
  onIssueChallenge,
  onRespondChallenge,
  onCreateChallengeBrief,
}: {
  challenge: ChallengeSuggestion | undefined;
  suggestion: AutopilotSuggestion | null;
  response: RespondToChallengeResponse["data"] | null;
  latestArtifact: SessionCockpitData["latestArtifact"] | null;
  disabled: boolean;
  onIssueChallenge: () => Promise<void>;
  onRespondChallenge: InsightRailProps["onRespondChallenge"];
  onCreateChallengeBrief: () => Promise<void>;
}) {
  return (
    <section className="challenge-loop" aria-label="Challenge loop">
      <h2 className="section-label">CHALLENGE LOOP</h2>
      {challenge?.id ? (
        <ChallengeResponseForm challenge={challenge} disabled={disabled} onRespondChallenge={onRespondChallenge} />
      ) : (
        <div className="challenge-action-row">
          <span>{suggestion?.primaryActionLabel ?? "No selected action"}</span>
          <button type="button" disabled={disabled || !suggestion?.candidateId} onClick={onIssueChallenge}>
            Issue challenge
          </button>
        </div>
      )}
      {response ? <ChallengeReceipt response={response} /> : null}
      <div className="challenge-brief-row">
        <div>
          <strong>{latestArtifact?.title ?? "Challenge Brief"}</strong>
          <span>{latestArtifact?.summary ?? "No brief yet"}</span>
        </div>
        <button type="button" disabled={disabled || !response} onClick={onCreateChallengeBrief}>
          Create brief
        </button>
      </div>
    </section>
  );
}

function ChallengeResponseForm({
  challenge,
  disabled,
  onRespondChallenge,
}: {
  challenge: ChallengeSuggestion;
  disabled: boolean;
  onRespondChallenge: InsightRailProps["onRespondChallenge"];
}) {
  const [response, setResponse] = useState<ChallengeResponseKind>("defend");
  const [reasoning, setReasoning] = useState("");
  const [revisedText, setRevisedText] = useState(challenge.targetClaim?.text ?? challenge.weakestPart ?? "");
  const challengeId = challenge.id;

  useEffect(() => {
    setReasoning("");
    setRevisedText(challenge.targetClaim?.text ?? challenge.weakestPart ?? "");
    setResponse("defend");
  }, [challenge.id, challenge.targetClaim?.text, challenge.weakestPart]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!challengeId) {
      return;
    }

    if (response === "defend") {
      if (!reasoning.trim()) {
        return;
      }

      await onRespondChallenge(challengeId, { response, reasoning: reasoning.trim() });
      return;
    }

    if (response === "revise") {
      if (!revisedText.trim()) {
        return;
      }

      await onRespondChallenge(challengeId, {
        response,
        revisedText: revisedText.trim(),
        ...(reasoning.trim() ? { reasoning: reasoning.trim() } : {}),
      });
      return;
    }

    await onRespondChallenge(challengeId, {
      response,
      ...(reasoning.trim() ? { reasoning: reasoning.trim() } : {}),
    });
  }

  return (
    <form className="challenge-response-form" onSubmit={handleSubmit}>
      <div className="challenge-mode-row" role="group" aria-label="Challenge response">
        {(["defend", "revise", "absorb"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={response === option}
            disabled={disabled}
            onClick={() => setResponse(option)}
          >
            {formatResponse(option)}
          </button>
        ))}
      </div>
      {response === "revise" ? (
        <label>
          <span>Revision</span>
          <textarea value={revisedText} disabled={disabled} onChange={(event) => setRevisedText(event.target.value)} />
        </label>
      ) : null}
      <label>
        <span>{response === "defend" ? "Reasoning" : "Note"}</span>
        <textarea value={reasoning} disabled={disabled} onChange={(event) => setReasoning(event.target.value)} />
      </label>
      <button
        type="submit"
        disabled={disabled || (response === "defend" && !reasoning.trim()) || (response === "revise" && !revisedText.trim())}
      >
        Save {formatResponse(response)}
      </button>
    </form>
  );
}

function ChallengeReceipt({ response }: { response: RespondToChallengeResponse["data"] }) {
  const receipt = response.receipt;

  return (
    <article className="challenge-receipt">
      <strong>{formatLabel(response.move.kind)}</strong>
      <span>focus completed</span>
      <span>{receipt.claimTextChanged ? `old ${shortId(receipt.previousClaimVersionId ?? "")}` : "claim unchanged"}</span>
      <span>{receipt.unresolvedRisk ? "risk carried forward" : `current ${shortId(receipt.currentClaimVersionId)}`}</span>
      <span>{response.derivedEffects.length > 0 ? response.derivedEffects.map((effect) => effect.title).join(", ") : "no shape effect"}</span>
    </article>
  );
}

function formatResponse(response: ChallengeResponseKind): string {
  return response.charAt(0).toUpperCase() + response.slice(1);
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Time";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
