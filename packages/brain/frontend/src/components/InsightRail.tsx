import {
  type ClipboardEvent,
  type ComponentType,
  type DragEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BookOpen,
  Camera,
  CircleHelp,
  GitCompareArrows,
  List,
  Network,
  Save,
  Sparkles,
  type LucideProps,
} from "lucide-react";
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

type InsightActionId = "define" | "explain" | "examples" | "related" | "contrast" | "question";

type InsightAction = {
  id: Exclude<InsightActionId, "question">;
  label: string;
  description: string;
  icon: ComponentType<LucideProps>;
};

const insightActions: InsightAction[] = [
  {
    id: "define",
    label: "Define",
    description: "Give a tight contextual definition.",
    icon: BookOpen,
  },
  {
    id: "explain",
    label: "Explain",
    description: "Unpack the idea in plain language.",
    icon: CircleHelp,
  },
  {
    id: "examples",
    label: "Examples",
    description: "Show concrete local examples.",
    icon: List,
  },
  {
    id: "related",
    label: "Related",
    description: "Surface adjacent concepts.",
    icon: Network,
  },
  {
    id: "contrast",
    label: "Contrast",
    description: "Distinguish it from a nearby idea.",
    icon: GitCompareArrows,
  },
];

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
  const target =
    claims.find((claim) => claim.id === challenge?.targetClaimId) ??
    claims.find((claim) => claim.id === autopilotSuggestion?.targetClaimId) ??
    seedClaim;
  return (
    <aside className="insight-rail" aria-label="Penny side rail">
      <LearnPanel
        sessionId={sessionId ?? null}
        targetClaim={target}
        claims={claims}
        challenge={challenge}
        learnCandidates={learnCandidates}
        disabled={disabled}
      />
      <ChallengeLoop
        challenge={challenge}
        autopilotSuggestion={autopilotSuggestion}
        latestArtifact={latestArtifact}
        challengeResponse={challengeResponse}
        disabled={disabled}
        onIssueChallenge={onIssueChallenge}
        onRespondChallenge={onRespondChallenge}
        onCreateChallengeBrief={onCreateChallengeBrief}
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

function ChallengeLoop({
  challenge,
  autopilotSuggestion,
  latestArtifact,
  challengeResponse,
  disabled,
  onIssueChallenge,
  onRespondChallenge,
  onCreateChallengeBrief,
}: {
  challenge: ChallengeSuggestion | undefined;
  autopilotSuggestion: AutopilotSuggestion | null;
  latestArtifact: SessionCockpitData["latestArtifact"] | null;
  challengeResponse: RespondToChallengeResponse["data"] | null;
  disabled: boolean;
  onIssueChallenge: () => Promise<void>;
  onRespondChallenge: InsightRailProps["onRespondChallenge"];
  onCreateChallengeBrief: () => Promise<void>;
}) {
  const [response, setResponse] = useState<"defend" | "revise" | "absorb">("defend");
  const [reasoning, setReasoning] = useState("");
  const [revisedText, setRevisedText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const challengeText = challenge?.challenge ?? challenge?.critique ?? null;
  const challengeId = challenge?.id ?? null;
  const hasResponse = Boolean(challengeResponse || challenge?.response);
  const canIssue = Boolean(autopilotSuggestion?.action === "challenge") && !disabled && !isSubmitting;
  const canRespond =
    Boolean(challengeId) &&
    !hasResponse &&
    !disabled &&
    !isSubmitting &&
    (response === "revise" ? Boolean(revisedText.trim()) : response === "defend" ? Boolean(reasoning.trim()) : true);
  const canCreateBrief = hasResponse && !disabled && !isSubmitting;

  async function handleRespond(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!challengeId || !canRespond) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (response === "revise") {
        await onRespondChallenge(challengeId, {
          response,
          revisedText: revisedText.trim(),
          ...(reasoning.trim() ? { reasoning: reasoning.trim() } : {}),
        });
      } else if (response === "defend") {
        await onRespondChallenge(challengeId, {
          response,
          reasoning: reasoning.trim(),
        });
      } else {
        await onRespondChallenge(challengeId, {
          response,
          ...(reasoning.trim() ? { reasoning: reasoning.trim() } : {}),
        });
      }

      setReasoning("");
      setRevisedText("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="challenge-loop" aria-label="Challenge loop">
      <div className="rail-section-head">
        <h2>CHALLENGE</h2>
        <span>{hasResponse ? "Answered" : challengeText ? "Open" : "Waiting"}</span>
      </div>

      {challengeText ? (
        <div className="challenge-action-row">
          <span>
            <strong>{formatChallengeType(challenge?.failureType)}</strong>
            {challengeText}
          </span>
          {!challengeId ? (
            <button type="button" disabled={!canIssue} onClick={() => void onIssueChallenge()}>
              Issue
            </button>
          ) : null}
        </div>
      ) : (
        <div className="challenge-action-row">
          <span>
            <strong>{autopilotSuggestion?.primaryActionLabel ?? "No active challenge"}</strong>
            {autopilotSuggestion?.why ?? "Autopilot will surface a challenge after Penny has a pressure point."}
          </span>
          <button type="button" disabled={!canIssue} onClick={() => void onIssueChallenge()}>
            Issue
          </button>
        </div>
      )}

      {challengeId && !hasResponse ? (
        <form className="challenge-response-form" onSubmit={handleRespond}>
          <div className="challenge-mode-row" role="group" aria-label="Challenge response">
            {(["defend", "revise", "absorb"] as const).map((option) => (
              <button
                key={option}
                type="button"
                disabled={disabled || isSubmitting}
                aria-pressed={response === option}
                onClick={() => setResponse(option)}
              >
                {formatChallengeType(option)}
              </button>
            ))}
          </div>
          {response === "revise" ? (
            <label>
              Revised claim
              <textarea
                value={revisedText}
                disabled={disabled || isSubmitting}
                placeholder="Write the cleaner claim..."
                onChange={(event) => setRevisedText(event.target.value)}
              />
            </label>
          ) : null}
          <label>
            Reasoning
            <textarea
              value={reasoning}
              disabled={disabled || isSubmitting}
              placeholder={response === "absorb" ? "Optional note..." : "Why is this the right response?"}
              onChange={(event) => setReasoning(event.target.value)}
            />
          </label>
          <button type="submit" disabled={!canRespond}>
            Save response
          </button>
        </form>
      ) : null}

      {hasResponse ? (
        <div className="challenge-receipt">
          <span>
            <strong>{formatChallengeType(challengeResponse?.response ?? challenge?.response ?? "response")}</strong>
            {challengeResponse?.move.summary ?? "Challenge response recorded as a Move."}
          </span>
        </div>
      ) : null}

      <div className="challenge-brief-row">
        <span>
          <strong>{latestArtifact?.title ?? "Challenge Brief"}</strong>
          {latestArtifact?.summary ?? "Create the useful artifact after the challenge has a response."}
        </span>
        <button type="button" disabled={!canCreateBrief} onClick={() => void onCreateChallengeBrief()}>
          Brief
        </button>
      </div>
    </section>
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
  const [selectedTerm, setSelectedTerm] = useState(targetClaim?.text ?? "");
  const [activeAction, setActiveAction] = useState<InsightActionId>("define");
  const [shortQuestion, setShortQuestion] = useState("");
  const [status, setStatus] = useState("ready");
  const [isRunning, setIsRunning] = useState(false);
  const questionRef = useRef<HTMLInputElement>(null);
  const starterConcepts = uniqueStrings([
    ...learnCandidates.map((candidate) => candidate.term),
    ...claims.filter((claim) => claim.kind === "concept").map((claim) => claim.text),
    ...(challenge?.failureType ? [challenge.failureType] : []),
  ]).slice(0, 5);
  const relatedConcepts = definition?.relatedConcepts.length ? definition.relatedConcepts : starterConcepts;
  const activeTerm = selectedTerm || definition?.term || targetClaim?.text || "";

  useEffect(() => {
    setSelectedTerm(targetClaim?.text ?? "");
    setDefinition(null);
    setActiveAction("define");
    setStatus("ready");
  }, [targetClaim?.id, targetClaim?.text]);

  useEffect(() => {
    function handleSelectionChange() {
      if (disabled || textEntryTarget(document.activeElement)) {
        return;
      }

      const term = normalizeTerm(window.getSelection()?.toString() ?? "");

      if (!term) {
        return;
      }

      setSelectedTerm(term);
      setStatus("selected");
    }

    document.addEventListener("selectionchange", handleSelectionChange);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [disabled]);

  const runInsightAction = useCallback(
    async (
      rawTerm: string,
      action: InsightActionId,
      source: "chip" | "right_click" | "button" | "question",
      question?: string,
    ) => {
      const term = normalizeTerm(rawTerm);

      if (!term) {
        return;
      }

      if (!sessionId || !targetClaim) {
        setStatus("open a session");
        return;
      }

      setSelectedTerm(term);
      setActiveAction(action);
      setIsRunning(true);
      setStatus(insightActionStatus(action, source));

      try {
        const output = await createInlineLearn({
          term,
          currentClaimId: targetClaim.id,
          sessionId,
          localContext: pennyInsightContextForAction(claims, challenge, learnCandidates, screenshot, action, question),
        });

        setDefinition(output.data);
        setStatus(`${insightActionLabel(action)} ready`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setIsRunning(false);
      }
    },
    [challenge, claims, learnCandidates, screenshot, sessionId, targetClaim],
  );

  function handleAction(action: Exclude<InsightActionId, "question">) {
    void runInsightAction(activeTerm, action, "button");
  }

  async function handleShortQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = shortQuestion.trim();

    if (!question) {
      return;
    }

    await runInsightAction(activeTerm || question, "question", "question", question);
    setShortQuestion("");
  }

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
      void runInsightAction(term, "define", "right_click");
    }

    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [disabled, isRunning, runInsightAction]);

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
      <div className="penny-insight-head">
        <h2>PENNY INSIGHT</h2>
        <p>Right-click a word or select text.</p>
        <span>{isRunning ? "Working" : status}</span>
      </div>
      <div className="penny-insight-workbench">
        <div className="penny-insight-canvas" aria-live="polite">
          {definition ? (
            <InsightResult
              action={activeAction}
              definition={definition}
              relatedConcepts={relatedConcepts}
              disabled={disabled || isRunning}
              onConceptSelect={(concept) => runInsightAction(concept, "define", "chip")}
            />
          ) : (
            <PennyInsightReady selectedTerm={activeTerm} />
          )}
          {screenshot ? (
            <figure className="insight-screenshot">
              <img src={screenshot.dataUrl} alt="Captured screen reference" />
              <figcaption>{screenshot.width}x{screenshot.height}</figcaption>
            </figure>
          ) : null}
          <form className="penny-insight-question" onSubmit={handleShortQuestion}>
            <input
              ref={questionRef}
              value={shortQuestion}
              disabled={disabled || isRunning}
              placeholder="short question..."
              onChange={(event) => setShortQuestion(event.target.value)}
            />
            <button type="submit" disabled={disabled || isRunning || !shortQuestion.trim()}>
              Ask
            </button>
          </form>
          <div className="penny-insight-actions">
            <button type="button" disabled={disabled || isRunning} onClick={handleScreenshot}>
              <Camera size={14} strokeWidth={1.8} aria-hidden="true" />
              <span>Screenshot</span>
            </button>
            <button type="button" disabled={disabled || isRunning || !definition} onClick={handleSaveDefinition}>
              <Save size={14} strokeWidth={1.8} aria-hidden="true" />
              <span>Save</span>
            </button>
          </div>
        </div>
        <div className="penny-insight-toolbox" aria-label="Penny Insight actions">
          {insightActions.map((action) => (
            <InsightActionButton
              key={action.id}
              action={action}
              active={activeAction === action.id}
              disabled={disabled || isRunning || !activeTerm}
              onClick={() => handleAction(action.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function InsightActionButton({
  action,
  active,
  disabled,
  onClick,
}: {
  action: InsightAction;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = action.icon;

  return (
    <button type="button" className={active ? "is-active" : ""} disabled={disabled} title={action.description} onClick={onClick}>
      <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
      <span>{action.label}</span>
    </button>
  );
}

function formatChallengeType(value: string | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PennyInsightReady({ selectedTerm }: { selectedTerm: string }) {
  if (!selectedTerm) {
    return (
      <article className="penny-insight-empty">
        <BookOpen size={36} strokeWidth={1.6} aria-hidden="true" />
        <strong>Nothing here yet.</strong>
        <p>Right-click a word or select text in the page to look it up or explain an idea.</p>
      </article>
    );
  }

  return (
    <article className="penny-insight-ready">
      <Sparkles size={22} strokeWidth={1.7} aria-hidden="true" />
      <span>Selected idea</span>
      <strong title={selectedTerm}>{truncateWords(selectedTerm, 18)}</strong>
      <p>Choose Define, Explain, Examples, Related, or Contrast.</p>
    </article>
  );
}

function InsightResult({
  action,
  definition,
  relatedConcepts,
  disabled,
  onConceptSelect,
}: {
  action: InsightActionId;
  definition: InlineLearnOutput;
  relatedConcepts: string[];
  disabled: boolean;
  onConceptSelect: (concept: string) => void;
}) {
  return (
    <div className="penny-insight-result">
      <div className="insight-current-term">
        <span>{insightActionLabel(action)}</span>
        <strong title={definition.term}>{truncateWords(definition.term, 12)}</strong>
      </div>
      <InsightBlock title={insightPrimaryTitle(action)}>{definition.explanation}</InsightBlock>
      <InsightBlock title={action === "question" ? "ANSWER" : "WHY HERE"}>{definition.whyItMattersHere}</InsightBlock>
      <InsightBlock title={action === "contrast" ? "CONTRAST POINT" : "EXAMPLE"}>{definition.example}</InsightBlock>
      <article className="insight-block insight-concepts">
        <h3>RELATED</h3>
        <div className="concept-chip-list">
          {relatedConcepts.length > 0 ? (
            relatedConcepts.map((concept) => (
              <button key={concept} type="button" disabled={disabled} onClick={() => onConceptSelect(concept)}>
                {truncateWords(concept, 3)}
              </button>
            ))
          ) : (
            <span>No related concepts</span>
          )}
        </div>
      </article>
    </div>
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

function insightActionLabel(action: InsightActionId): string {
  switch (action) {
    case "define":
      return "Define";
    case "explain":
      return "Explain";
    case "examples":
      return "Examples";
    case "related":
      return "Related";
    case "contrast":
      return "Contrast";
    case "question":
      return "Question";
  }
}

function insightPrimaryTitle(action: InsightActionId): string {
  switch (action) {
    case "define":
      return "DEFINE";
    case "explain":
      return "EXPLAIN";
    case "examples":
      return "EXAMPLES";
    case "related":
      return "RELATED IDEA";
    case "contrast":
      return "CONTRAST";
    case "question":
      return "SHORT QUESTION";
  }
}

function insightActionStatus(action: InsightActionId, source: "chip" | "right_click" | "button" | "question"): string {
  if (source === "right_click") {
    return "defining selection";
  }

  switch (action) {
    case "define":
      return "defining";
    case "explain":
      return "explaining";
    case "examples":
      return "finding examples";
    case "related":
      return "finding related";
    case "contrast":
      return "contrasting";
    case "question":
      return "answering";
  }
}

type ScreenshotCapture = {
  dataUrl: string;
  width: number;
  height: number;
  capturedAt: string;
  name: string;
};

function LearnPanel({
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
  const [screenshots, setScreenshots] = useState<ScreenshotCapture[]>([]);
  const [isDraggingScreenshot, setIsDraggingScreenshot] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canAsk = Boolean(sessionId && targetClaim && prompt.trim()) && !disabled && !isRunning;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (disabled || event.metaKey || event.ctrlKey || event.altKey || event.key.toLowerCase() !== "q") {
        return;
      }

      if (textEntryTarget(event.target)) {
        return;
      }

      event.preventDefault();
      focusQuestionInput(inputRef.current);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [disabled]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await askLearn(prompt);
  }

  async function askLearn(rawPrompt: string) {
    const question = rawPrompt.trim();

    if (!question) {
      return;
    }

    if (!sessionId || !targetClaim) {
      return;
    }

    setIsRunning(true);
    setLastQuestion(question);

    try {
      const output = await createInlineLearn({
        term: question.slice(0, 120),
        currentClaimId: targetClaim.id,
        sessionId,
        localContext: learnPanelContext(claims, challenge, learnCandidates, screenshots),
      });

      setAnswer(output.data);
      setPrompt("");
    } catch (error) {
      setAnswer(errorAnswer(question, error));
    } finally {
      setIsRunning(false);
    }
  }

  async function handleScreenshotDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDraggingScreenshot(false);
    await addScreenshotFiles(event.dataTransfer.files);
    focusQuestionInput(inputRef.current);
  }

  function handleScreenshotDragOver(event: DragEvent<HTMLElement>) {
    if (hasImageFiles(event.dataTransfer.items)) {
      event.preventDefault();
      setIsDraggingScreenshot(true);
    }
  }

  function handleScreenshotDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingScreenshot(false);
    }
  }

  async function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    if (hasImageFiles(event.clipboardData.items)) {
      await addScreenshotFiles(event.clipboardData.files);
    }
  }

  async function addScreenshotFiles(files: FileList) {
    const imageFiles = [...files].filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      return;
    }

    const captures = await Promise.all(imageFiles.slice(0, 4).map(readScreenshotFile));
    setScreenshots((current) => [...current, ...captures].slice(-4));
  }

  return (
    <section
      className={`learn-panel${isDraggingScreenshot ? " is-dragging-screenshot" : ""}`}
      aria-label="Learn"
      onDrop={handleScreenshotDrop}
      onDragOver={handleScreenshotDragOver}
      onDragLeave={handleScreenshotDragLeave}
    >
      <div className="rail-section-head">
        <h2>LEARN</h2>
        <span>{isRunning ? "Thinking" : "Open"}</span>
      </div>
      <div className="learn-panel-terminal" role="log" aria-live="polite">
        <TerminalLine label="system">
          session-level Q&A active. Ask about any claim, challenge, assumption, or unclear term in the middle panel.
        </TerminalLine>
        {targetClaim ? <TerminalLine label="focus">{truncateWords(targetClaim.text, 22)}</TerminalLine> : null}
        {screenshots.length > 0 ? <ScreenshotStrip screenshots={screenshots} /> : null}
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
      <form className="learn-panel-form" onSubmit={handleSubmit}>
        <span aria-hidden="true">&gt;</span>
        <input
          ref={inputRef}
          value={prompt}
          disabled={disabled || isRunning}
          placeholder="ask about this session..."
          onChange={(event) => setPrompt(event.target.value)}
          onPaste={handlePaste}
        />
        <button type="submit" disabled={!canAsk} aria-label="Ask Learn">
          Run
        </button>
      </form>
    </section>
  );
}

function ScreenshotStrip({ screenshots }: { screenshots: ScreenshotCapture[] }) {
  return (
    <div className="terminal-screenshot-strip" aria-label="Attached screenshots">
      <span>image</span>
      <div>
        {screenshots.map((screenshot) => (
          <img key={screenshot.capturedAt} src={screenshot.dataUrl} alt={screenshot.name} title={screenshot.name} />
        ))}
      </div>
    </div>
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

function textEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, [contenteditable='true']"));
}

function focusQuestionInput(input: HTMLInputElement | null): void {
  input?.focus();
  input?.scrollIntoView({ block: "nearest" });
}

function hasImageFiles(items: DataTransferItemList): boolean {
  return [...items].some((item) => item.kind === "file" && item.type.startsWith("image/"));
}

async function readScreenshotFile(file: File): Promise<ScreenshotCapture> {
  const dataUrl = await readFileAsDataUrl(file);
  const dimensions = await imageDimensions(dataUrl);

  return {
    dataUrl,
    width: dimensions.width,
    height: dimensions.height,
    capturedAt: new Date().toISOString(),
    name: file.name || "screenshot",
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result ?? ""));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read screenshot."));
    };
    reader.readAsDataURL(file);
  });
}

function imageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      resolve({ width: 0, height: 0 });
    };
    image.src = src;
  });
}

function errorAnswer(term: string, error: unknown): InlineLearnOutput {
  const message = error instanceof Error ? error.message : String(error);

  return {
    term: truncateWords(term, 8),
    explanation: message,
    whyItMattersHere: "The session question could not be answered yet.",
    example: "Try again after the session is available.",
    relatedConcepts: [],
    saveSuggestion: "Do not save this error response.",
  };
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
      name: "screen capture",
    };
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
}

function pennyInsightContextForAction(
  claims: BrainClaim[],
  challenge: ChallengeSuggestion | undefined,
  learnCandidates: LearnCandidate[],
  screenshot: ScreenshotCapture | null,
  action: InsightActionId,
  question?: string,
): string {
  return [
    pennyInsightActionInstruction(action, question),
    pennyInsightContext(claims, challenge, learnCandidates, screenshot),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2_000);
}

function pennyInsightActionInstruction(action: InsightActionId, question?: string): string {
  const base = "Penny Insight is a small vocab and idea explainer, not the Learn conversation panel.";

  switch (action) {
    case "define":
      return `${base} Give a tight contextual definition of the selected term.`;
    case "explain":
      return `${base} Explain the selected idea in plain language within the current claim.`;
    case "examples":
      return `${base} Prioritize concrete examples and keep the definition short.`;
    case "related":
      return `${base} Prioritize adjacent concepts; make relatedConcepts especially useful and specific.`;
    case "contrast":
      return `${base} Contrast the selected idea with a nearby idea it might be confused with.`;
    case "question":
      return `${base} Answer this short question inside the current context: ${question ?? ""}`;
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

function learnPanelContext(
  claims: BrainClaim[],
  challenge: ChallengeSuggestion | undefined,
  learnCandidates: LearnCandidate[],
  screenshots: ScreenshotCapture[],
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
  const screenshotLines = screenshots
    .map((screenshot) => `- ${screenshot.name}: ${screenshot.width}x${screenshot.height} at ${screenshot.capturedAt}`)
    .join("\n");

  return [
    claimLines ? `Claims:\n${claimLines}` : "",
    challengeLine,
    conceptLines ? `Concepts:\n${conceptLines}` : "",
    screenshotLines
      ? `Attached screenshots:\n${screenshotLines}\nUse the user's question and any visible description they provide; do not invent unseen image details.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2_000);
}
