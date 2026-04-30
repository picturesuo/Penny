import { type FormEvent, useEffect, useState } from "react";
import type {
  AutopilotSuggestion,
  BrainClaim,
  ChallengeBriefPayload,
  ChallengeBriefSections,
  ChallengeResponseKind,
  ChallengeSuggestion,
  InlineLearnOutput,
  LearnCandidate,
  RespondToChallengeResponse,
  SessionCockpitData,
} from "../types/brain";
import { createInlineLearn, saveInlineLearn } from "../api/brainClient";
import { formatLabel, shortId } from "../lib/format";
import { truncateWords } from "../lib/text";

interface InsightRailProps {
  sessionId?: string | null;
  challenge: ChallengeSuggestion | undefined;
  autopilotSuggestion: AutopilotSuggestion | null;
  claims: BrainClaim[];
  learnCandidates: LearnCandidate[];
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
  sessionId,
  challenge,
  autopilotSuggestion,
  claims,
  learnCandidates,
  latestArtifact,
  challengeResponse,
  disabled,
  onIssueChallenge,
  onRespondChallenge,
  onCreateChallengeBrief,
}: InsightRailProps) {
  const seedClaim = claims.find((claim) => claim.seedId === "claim.seed") ?? claims[0] ?? null;
  const target = claims.find((claim) => claim.id === challenge?.targetClaimId) ?? seedClaim;
  const importantInsight = target?.text ?? challenge?.weakestPart ?? "No active challenge";
  const whyItMatters = challenge?.challenge ?? learnCandidates[0]?.whyItMatters ?? "No challenge rationale";
  const example = learnCandidates[0]?.unblockExplanation ?? challenge?.whatWouldResolveIt ?? "No example returned";
  const relatedConcepts = learnCandidates.map((candidate) => candidate.term).slice(0, 5);

  return (
    <aside className="insight-rail" aria-label="Penny side rail">
      <PennyInsight
        keyInsight={importantInsight}
        whyItMatters={whyItMatters}
        example={example}
        relatedConcepts={relatedConcepts}
      />
      <MakesCentsPanel
        sessionId={sessionId ?? null}
        targetClaim={target}
        claims={claims}
        challenge={challenge}
        learnCandidates={learnCandidates}
        disabled={disabled}
      />
    </aside>
  );
}

function PennyInsight({
  keyInsight,
  whyItMatters,
  example,
  relatedConcepts,
}: {
  keyInsight: string;
  whyItMatters: string;
  example: string;
  relatedConcepts: string[];
}) {
  return (
    <section className="penny-insight">
      <div className="rail-section-head">
        <h2>PENNY INSIGHT</h2>
        <button type="button" aria-label="Save insight">
          <span />
        </button>
      </div>
      <InsightBlock title="KEY INSIGHT">{keyInsight}</InsightBlock>
      <InsightBlock title="WHY IT MATTERS">{whyItMatters}</InsightBlock>
      <InsightBlock title="EXAMPLES">{example}</InsightBlock>
      <article className="insight-block">
        <h3>RELATED CONCEPTS</h3>
        <div className="concept-chip-list">
          {relatedConcepts.length > 0 ? (
            relatedConcepts.map((concept) => <span key={concept}>{truncateWords(concept, 3)}</span>)
          ) : (
            <span>No related concepts</span>
          )}
        </div>
      </article>
    </section>
  );
}

function InsightBlock({ title, children }: { title: string; children: string }) {
  return (
    <article className="insight-block">
      <h3>{title}</h3>
      <p title={children}>{truncateWords(children, 16)}</p>
    </article>
  );
}

function MakesCentsPanel({
  sessionId,
  targetClaim,
  claims,
  challenge,
  learnCandidates,
  disabled,
}: {
  sessionId?: string | null;
  targetClaim: BrainClaim | null;
  claims: BrainClaim[];
  challenge: ChallengeSuggestion | undefined;
  learnCandidates: LearnCandidate[];
  disabled: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<InlineLearnOutput | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("session terminal ready");
  const canAsk = Boolean(sessionId && targetClaim && prompt.trim()) && !disabled && !isRunning;
  const canEnter = Boolean(sessionId && targetClaim && answer) && !disabled && !isRunning;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await askMakesCents(prompt);
  }

  async function askMakesCents(rawPrompt: string) {
    const question = rawPrompt.trim();

    if (!question) {
      return;
    }

    if (!sessionId || !targetClaim) {
      setStatus("Open a session before asking Makes Cents.");
      return;
    }

    setIsRunning(true);
    setLastQuestion(question);
    setStatus("running session query");

    try {
      const output = await createInlineLearn({
        term: question.slice(0, 120),
        currentClaimId: targetClaim.id,
        sessionId,
        localContext: makesCentsContext(claims, challenge, learnCandidates),
      });

      setAnswer(output.data);
      setPrompt("");
      setStatus("answer ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  }

  async function handleEnterThis() {
    if (!sessionId || !targetClaim || !answer) {
      return;
    }

    setIsRunning(true);
    setStatus("entering answer");

    try {
      await saveInlineLearn({
        ...answer,
        currentClaimId: targetClaim.id,
        sessionId,
      });
      setStatus("entered as learn");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="makes-cents-panel" aria-label="Makes Cents">
      <div className="rail-section-head">
        <h2>MAKES CENTS</h2>
        <span>{isRunning ? "Thinking" : "Open"}</span>
      </div>
      <div className="makes-cents-terminal" role="log" aria-live="polite">
        <TerminalLine label="system">
          session-level Q&A active. Ask about any claim, challenge, assumption, or unclear term in the middle panel.
        </TerminalLine>
        {targetClaim ? <TerminalLine label="focus">{truncateWords(targetClaim.text, 22)}</TerminalLine> : null}
        {lastQuestion ? <TerminalLine label="you">{lastQuestion}</TerminalLine> : null}
        {answer ? (
          <>
            <TerminalLine label="penny">{answer.explanation}</TerminalLine>
            <TerminalLine label="why">{answer.whyItMattersHere}</TerminalLine>
            <TerminalLine label="example">{answer.example}</TerminalLine>
          </>
        ) : (
          <TerminalLine label="penny">
            Type a question or run a quick command. Answers can be entered into the graph when they are useful.
          </TerminalLine>
        )}
      </div>
      <form className="makes-cents-form" onSubmit={handleSubmit}>
        <span aria-hidden="true">&gt;</span>
        <input
          value={prompt}
          disabled={disabled || isRunning}
          placeholder="ask about this session..."
          onChange={(event) => setPrompt(event.target.value)}
        />
        <button type="submit" disabled={!canAsk} aria-label="Ask Makes Cents">
          Run
        </button>
      </form>
      <div className="makes-cents-actions">
        <button type="button" disabled={disabled || isRunning} onClick={() => askMakesCents("Give me an example")}>
          Give me an example
        </button>
        <button type="button" disabled={disabled || isRunning} onClick={() => askMakesCents("Explain simpler")}>
          Explain simpler
        </button>
        <button type="button" disabled={disabled || isRunning} onClick={() => askMakesCents("What if this is wrong?")}>
          What if?
        </button>
      </div>
      <div className="makes-cents-enter-row">
        <span>{truncateWords(status, 8)}</span>
        <button type="button" disabled={!canEnter} onClick={handleEnterThis}>
          Enter this
        </button>
      </div>
    </section>
  );
}

function TerminalLine({ label, children }: { label: string; children: string }) {
  return (
    <p className="terminal-line">
      <span>{label}</span>
      <strong title={children}>{truncateWords(children, 34)}</strong>
    </p>
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
  const canIssueChallenge = suggestion?.action === "challenge" && Boolean(suggestion.candidateId);

  return (
    <section className="challenge-loop" aria-label="Challenge loop">
      <h2 className="section-label">CHALLENGE LOOP</h2>
      {challenge?.id ? (
        <ChallengeResponseForm challenge={challenge} disabled={disabled} onRespondChallenge={onRespondChallenge} />
      ) : (
        <div className="challenge-action-row">
          <span title={suggestion?.primaryActionLabel ?? "No selected action"}>
            {truncateWords(suggestion?.primaryActionLabel ?? "No selected action", 5)}
          </span>
          <button type="button" disabled={disabled || !canIssueChallenge} onClick={onIssueChallenge}>
            {suggestion?.action === "challenge" ? "Issue challenge" : "Not a challenge"}
          </button>
        </div>
      )}
      {response ? <ChallengeReceipt response={response} /> : null}
      <div className="challenge-brief-row">
        <div>
          <strong title={latestArtifact?.title ?? "Challenge Brief"}>
            {truncateWords(latestArtifact?.title ?? "Challenge Brief", 6)}
          </strong>
          <span title={latestArtifact?.summary ?? "No brief yet"}>
            {truncateWords(latestArtifact?.summary ?? "No brief yet", 10)}
          </span>
        </div>
        <button type="button" disabled={disabled || !response} onClick={onCreateChallengeBrief}>
          Create brief
        </button>
      </div>
      <ChallengeBriefPreview artifact={latestArtifact} />
    </section>
  );
}

function ChallengeBriefPreview({ artifact }: { artifact: SessionCockpitData["latestArtifact"] | null }) {
  const sections = challengeBriefSections(artifact?.payload);

  if (!sections) {
    return null;
  }

  return (
    <div className="challenge-brief-sections" aria-label="Challenge Brief sections">
      {briefSectionRows(sections).map((row) => (
        <article key={row.title}>
          <h3>{row.title}</h3>
          <p title={row.text}>{truncateWords(row.text, 12)}</p>
        </article>
      ))}
    </div>
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
      <span title={response.derivedEffects.length > 0 ? response.derivedEffects.map((effect) => effect.title).join(", ") : "no shape effect"}>
        {truncateWords(response.derivedEffects.length > 0 ? response.derivedEffects.map((effect) => effect.title).join(", ") : "no shape effect", 8)}
      </span>
    </article>
  );
}

function challengeBriefSections(payload: unknown): ChallengeBriefSections | null {
  if (!isChallengeBriefPayload(payload)) {
    return null;
  }

  return payload.sections;
}

function isChallengeBriefPayload(payload: unknown): payload is ChallengeBriefPayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "kind" in payload &&
      payload.kind === "challenge_brief" &&
      "sections" in payload &&
      payload.sections &&
      typeof payload.sections === "object",
  );
}

function briefSectionRows(sections: ChallengeBriefSections): Array<{ title: string; text: string }> {
  return [
    { title: "Original Idea", text: sections.originalSeedIdea.text },
    {
      title: "Current Claim",
      text: `${sections.currentPrimaryClaim.text} (${sections.currentPrimaryClaim.confidence}% confidence)`,
    },
    {
      title: "Key Assumptions",
      text: listText(
        sections.keyAssumptions.map((assumption) => `${assumption.text} (${assumption.confidence}% confidence)`),
        "No key assumptions recorded.",
      ),
    },
    {
      title: "Pressure Point",
      text: compactText([sections.selectedPressurePoint.failureType, sections.selectedPressurePoint.text]),
    },
    {
      title: "Why Penny Chose It",
      text: listText(sections.whyPennyChoseIt, "No selection rationale recorded."),
    },
    {
      title: "Challenge",
      text: compactText([sections.challengeIssued.strength, sections.challengeIssued.text, sections.challengeIssued.whatWouldResolveIt]),
    },
    {
      title: "Response",
      text: compactText([sections.userResponse.response, sections.userResponse.text, sections.userResponse.reasoning]),
    },
    {
      title: "What Changed",
      text: listText(
        sections.whatChanged.map((change) => change.text),
        "No claim text changed.",
      ),
    },
    {
      title: "Open Risks",
      text: listText(
        sections.openRisks.map((risk) => compactText([risk.kind, risk.text, risk.reason])),
        "No open risks recorded.",
      ),
    },
    {
      title: "Recommended Next Move",
      text: compactText([
        formatLabel(sections.recommendedNextMove.action),
        sections.recommendedNextMove.why,
        sections.recommendedNextMove.expectedCompletionMove
          ? `Completes with ${formatLabel(sections.recommendedNextMove.expectedCompletionMove)}`
          : null,
      ]),
    },
    {
      title: "Move Timeline",
      text: listText(
        sections.moveTimelineSummary.map((move) => `${formatLabel(move.kind)}: ${move.summary}`),
        "No move timeline recorded.",
      ),
    },
  ];
}

function listText(values: string[], emptyText: string): string {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(" / ") : emptyText;
}

function compactText(values: Array<string | null | undefined>): string {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(": ");
}

function formatResponse(response: ChallengeResponseKind): string {
  return response.charAt(0).toUpperCase() + response.slice(1);
}

function makesCentsContext(
  claims: BrainClaim[],
  challenge: ChallengeSuggestion | undefined,
  learnCandidates: LearnCandidate[],
): string {
  const claimLines = claims
    .slice(0, 8)
    .map((claim) => `- ${claim.kind}: ${truncateWords(claim.text, 18)}`)
    .join("\n");
  const conceptLines = learnCandidates
    .slice(0, 5)
    .map((candidate) => `- ${candidate.term}: ${truncateWords(candidate.whyItMatters, 18)}`)
    .join("\n");
  const challengeLine = challenge?.challenge ? `Challenge: ${truncateWords(challenge.challenge, 32)}` : "";

  return [claimLines ? `Claims:\n${claimLines}` : "", challengeLine, conceptLines ? `Concepts:\n${conceptLines}` : ""]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2_000);
}
