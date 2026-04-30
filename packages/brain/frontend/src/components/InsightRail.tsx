import { type FormEvent, useCallback, useEffect, useState } from "react";
import type {
  AutopilotSuggestion,
  BrainClaim,
  ChallengeSuggestion,
  InlineLearnOutput,
  LearnCandidate,
  RespondToChallengeResponse,
  SessionCockpitData,
} from "../types/brain";
import { createInlineLearn, saveInlineLearn } from "../api/brainClient";
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
  return (
    <aside className="insight-rail" aria-label="Penny side rail">
      <MakesCentsPanel
        sessionId={sessionId ?? null}
        targetClaim={target}
        claims={claims}
        challenge={challenge}
        learnCandidates={learnCandidates}
        disabled={disabled}
      />
      <PennyInsight
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
  sessionId,
  targetClaim,
  claims,
  challenge,
  learnCandidates,
  disabled,
}: {
  sessionId: string | null;
  targetClaim: BrainClaim | null;
  claims: BrainClaim[];
  challenge: ChallengeSuggestion | undefined;
  learnCandidates: LearnCandidate[];
  disabled: boolean;
}) {
  const [definition, setDefinition] = useState<InlineLearnOutput | null>(null);
  const [screenshot, setScreenshot] = useState<ScreenshotCapture | null>(null);
  const [status, setStatus] = useState("ready");
  const [isRunning, setIsRunning] = useState(false);
  const starterConcepts = uniqueStrings([
    ...learnCandidates.map((candidate) => candidate.term),
    ...claims.filter((claim) => claim.kind === "concept").map((claim) => claim.text),
    ...(challenge?.failureType ? [challenge.failureType] : []),
  ]).slice(0, 5);
  const relatedConcepts = definition?.relatedConcepts.length ? definition.relatedConcepts : starterConcepts;

  const defineTerm = useCallback(
    async (rawTerm: string, source: "chip" | "right_click" | "manual") => {
      const term = normalizeTerm(rawTerm);

      if (!term) {
        return;
      }

      if (!sessionId || !targetClaim) {
        setStatus("open a session");
        return;
      }

      setIsRunning(true);
      setStatus(source === "right_click" ? "defining selection" : "defining term");

      try {
        const output = await createInlineLearn({
          term,
          currentClaimId: targetClaim.id,
          sessionId,
          localContext: pennyInsightContext(claims, challenge, learnCandidates, screenshot),
        });

        setDefinition(output.data);
        setStatus("definition ready");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setIsRunning(false);
      }
    },
    [challenge, claims, learnCandidates, screenshot, sessionId, targetClaim],
  );

  useEffect(() => {
    function handleContextMenu(event: MouseEvent) {
      if (disabled || isRunning || editableContextTarget(event.target)) {
        return;
      }

      const term = termFromContextMenu(event);

      if (!term) {
        return;
      }

      event.preventDefault();
      void defineTerm(term, "right_click");
    }

    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [defineTerm, disabled, isRunning]);

  async function handleScreenshot() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setStatus("screenshot unavailable");
      return;
    }

    setIsRunning(true);
    setStatus("capturing screen");

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const capture = await captureStreamFrame(stream);
      setScreenshot(capture);
      setStatus("screenshot captured");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  }

  async function handleSaveDefinition() {
    if (!sessionId || !targetClaim || !definition) {
      return;
    }

    setIsRunning(true);
    setStatus("saving definition");

    try {
      await saveInlineLearn({
        ...definition,
        currentClaimId: targetClaim.id,
        sessionId,
      });
      setStatus("definition saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="penny-insight">
      <div className="rail-section-head">
        <h2>PENNY INSIGHT</h2>
        <span>{isRunning ? "Working" : status}</span>
      </div>
      {definition ? (
        <>
          <InsightBlock title={definition.term}>{definition.explanation}</InsightBlock>
          <InsightBlock title="WHY HERE">{definition.whyItMattersHere}</InsightBlock>
          <InsightBlock title="EXAMPLE">{definition.example}</InsightBlock>
        </>
      ) : (
        <InsightBlock title="TERM">{targetClaim?.text ?? "Select a term"}</InsightBlock>
      )}
      {screenshot ? (
        <figure className="insight-screenshot">
          <img src={screenshot.dataUrl} alt="Captured screen reference" />
          <figcaption>{screenshot.width}x{screenshot.height}</figcaption>
        </figure>
      ) : null}
      <article className="insight-block insight-concepts">
        <h3>RELATED</h3>
        <div className="concept-chip-list">
          {relatedConcepts.length > 0 ? (
            relatedConcepts.map((concept) => (
              <button key={concept} type="button" disabled={disabled || isRunning} onClick={() => defineTerm(concept, "chip")}>
                {truncateWords(concept, 3)}
              </button>
            ))
          ) : (
            <span>No related concepts</span>
          )}
        </div>
      </article>
      <div className="penny-insight-actions">
        <button type="button" disabled={disabled || isRunning} onClick={handleScreenshot}>
          Screenshot
        </button>
        <button type="button" disabled={disabled || isRunning || !definition} onClick={handleSaveDefinition}>
          Save
        </button>
      </div>
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

type ScreenshotCapture = {
  dataUrl: string;
  width: number;
  height: number;
  capturedAt: string;
};

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

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const normalized = normalizeTerm(value);

    if (normalized && !seen.has(normalized.toLowerCase())) {
      seen.add(normalized.toLowerCase());
      unique.push(normalized);
    }
  }

  return unique;
}

function normalizeTerm(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[^\w'"]+|[^\w'"]+$/g, "")
    .trim()
    .slice(0, 120);
}

function editableContextTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, button, a, [contenteditable='true']"));
}

function termFromContextMenu(event: MouseEvent): string | null {
  const selected = normalizeTerm(window.getSelection()?.toString() ?? "");

  if (selected) {
    return selected;
  }

  return termAtPoint(event.clientX, event.clientY);
}

function termAtPoint(x: number, y: number): string | null {
  const caretDocument = document as Document & {
    caretPositionFromPoint?: (left: number, top: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (left: number, top: number) => Range | null;
  };
  const position = caretDocument.caretPositionFromPoint?.(x, y);

  if (position?.offsetNode.nodeType === Node.TEXT_NODE) {
    return wordAtOffset(position.offsetNode.textContent ?? "", position.offset);
  }

  const range = caretDocument.caretRangeFromPoint?.(x, y);

  if (range?.startContainer.nodeType === Node.TEXT_NODE) {
    return wordAtOffset(range.startContainer.textContent ?? "", range.startOffset);
  }

  return null;
}

function wordAtOffset(text: string, offset: number): string | null {
  const matches = text.matchAll(/[A-Za-z0-9][A-Za-z0-9'/-]*/g);

  for (const match of matches) {
    const word = match[0];
    const index = match.index ?? 0;

    if (offset >= index && offset <= index + word.length) {
      return normalizeTerm(word);
    }
  }

  return null;
}

async function captureStreamFrame(stream: MediaStream): Promise<ScreenshotCapture> {
  const video = document.createElement("video");

  try {
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not capture screenshot.");
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);

    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.72),
      width,
      height,
      capturedAt: new Date().toISOString(),
    };
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
}

function pennyInsightContext(
  claims: BrainClaim[],
  challenge: ChallengeSuggestion | undefined,
  learnCandidates: LearnCandidate[],
  screenshot: ScreenshotCapture | null,
): string {
  const claimLines = claims
    .slice(0, 6)
    .map((claim) => `- ${claim.kind}: ${truncateWords(claim.text, 14)}`)
    .join("\n");
  const conceptLines = learnCandidates
    .slice(0, 5)
    .map((candidate) => `- ${candidate.term}: ${truncateWords(candidate.unblockExplanation, 14)}`)
    .join("\n");
  const challengeLine = challenge?.challenge ? `Challenge context: ${truncateWords(challenge.challenge, 24)}` : "";
  const screenshotLine = screenshot
    ? `Screenshot captured: ${screenshot.width}x${screenshot.height} at ${screenshot.capturedAt}. Use only text/session context unless the user describes the screenshot.`
    : "";

  return [
    claimLines ? `Claims:\n${claimLines}` : "",
    challengeLine,
    conceptLines ? `Nearby concepts:\n${conceptLines}` : "",
    screenshotLine,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2_000);
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
