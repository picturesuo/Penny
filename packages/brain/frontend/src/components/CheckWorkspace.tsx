import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { HelpCircle, RefreshCcw, Save, Send, Sparkles, X, Zap } from "lucide-react";
import {
  askPenny as askPennyQuestion,
  commitCheckCycle,
  createCheckCycle,
  createCheckSession,
  runCheckSprint,
  saveCheckToBrain,
} from "../api/brainClient";
import type {
  AskPennyResponse,
  BrainData,
  CheckCommitStance,
  CheckCycle,
  CheckRecommendation,
  CheckSession,
} from "../types/brain";
import { formatLabel } from "../lib/format";
import { AskPennyRenderedText } from "./AskPennyRenderedText";

interface CheckWorkspaceProps {
  data: BrainData | null;
  status: string;
  isThinking: boolean;
  initialSeedText?: string | null;
  onInitialSeedConsumed?: () => void;
  onStatusChange?: (status: string) => void;
  onThinkingChange?: (isThinking: boolean) => void;
  onOpenBrain?: () => void;
}

type RetryableCheckAction = "create_session" | "next_cycle";

type CheckFailure = {
  action: RetryableCheckAction;
  message: string;
};

type AskPennyMessage = {
  role: "user" | "penny" | "system";
  text: string;
  provider?: AskPennyResponse["data"]["provider"];
  model?: AskPennyResponse["data"]["model"];
};

const checkPathSteps = [
  "Define the north star",
  "State the core claim",
  "Gather evidence",
  "Surface assumptions",
  "Find tensions",
  "Choose the next move",
  "Save breakthrough",
];

const thinkingGraphNodes = ["North Star", "Claim", "Evidence", "Assumption", "Tension", "Next Move"];

export function CheckWorkspace({
  data,
  status,
  isThinking,
  initialSeedText,
  onInitialSeedConsumed,
  onStatusChange,
  onThinkingChange,
  onOpenBrain,
}: CheckWorkspaceProps) {
  const [checkSession, setCheckSession] = useState<CheckSession | null>(null);
  const [draftText, setDraftText] = useState("");
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null);
  const [expandedRecommendationId, setExpandedRecommendationId] = useState<string | null>(null);
  const [commitmentText, setCommitmentText] = useState("");
  const [commitmentStance, setCommitmentStance] = useState<CheckCommitStance>("custom");
  const [sprintText, setSprintText] = useState("");
  const [askPennyOpen, setAskPennyOpen] = useState(false);
  const [checkFailure, setCheckFailure] = useState<CheckFailure | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState("Check ready");
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const commitmentRef = useRef<HTMLTextAreaElement | null>(null);
  const bootstrappedTextRef = useRef<string | null>(null);

  const busy = localBusy || isThinking;
  const displayStatus = busy ? "Thinking" : localStatus || status;
  const activeCycle = useMemo(() => activeCheckCycle(checkSession), [checkSession]);
  const normalRecommendations = activeCycle?.recommendations.slice(0, 5) ?? [];
  const allRecommendations = activeCycle ? [...normalRecommendations, activeCycle.curveball] : [];
  const selectedRecommendation =
    allRecommendations.find((recommendation) => recommendation.id === selectedRecommendationId) ??
    normalRecommendations[0] ??
    activeCycle?.curveball ??
    null;
  const sourceText = initialSeedText?.trim() || data?.source?.rawText?.trim() || "";
  const activePathIndex = checkPathIndex(checkSession, activeCycle);

  useEffect(() => {
    if (!activeCycle) {
      setSelectedRecommendationId(null);
      setExpandedRecommendationId(null);
      return;
    }

    const stillValid = selectedRecommendationId
      ? allRecommendations.some((recommendation) => recommendation.id === selectedRecommendationId)
      : false;

    if (!stillValid) {
      const firstRecommendation = normalRecommendations[0] ?? activeCycle.curveball;
      setSelectedRecommendationId(firstRecommendation.id);
      setExpandedRecommendationId(firstRecommendation.id);
    }
  }, [activeCycle, allRecommendations, normalRecommendations, selectedRecommendationId]);

  useEffect(() => {
    if (!sourceText || checkSession || bootstrappedTextRef.current === sourceText) {
      return;
    }

    bootstrappedTextRef.current = sourceText;
    setDraftText(sourceText);
    onInitialSeedConsumed?.();
    void handleCreateSession(sourceText);
  }, [checkSession, onInitialSeedConsumed, sourceText]);

  function setStatus(nextStatus: string) {
    setLocalStatus(nextStatus);
    onStatusChange?.(nextStatus);
  }

  function setBusy(nextBusy: boolean) {
    setLocalBusy(nextBusy);
    onThinkingChange?.(nextBusy);
  }

  async function runCheckAction<T>(
    nextStatus: string,
    action: () => Promise<T>,
    retryableAction?: RetryableCheckAction,
  ): Promise<T | null> {
    setBusy(true);
    setStatus(nextStatus);
    setCheckFailure(null);

    try {
      return await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);

      if (retryableAction) {
        setCheckFailure({ action: retryableAction, message });
      }

      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSession(textOverride?: string) {
    const text = (textOverride ?? draftText).trim();

    if (!text) {
      setStatus("Write the project seed first");
      sourceTextareaRef.current?.focus();
      return;
    }

    await runCheckAction(
      "Generating Check cycle",
      async () => {
        const payload = await createCheckSession({ rawText: text });

        setCheckSession(payload.data.session);
        setCommitmentText("");
        setSprintText("");
        setSelectedRecommendationId(payload.data.session.cycles[0]?.recommendations[0]?.id ?? null);
        setExpandedRecommendationId(payload.data.session.cycles[0]?.recommendations[0]?.id ?? null);
        setStatus("Check cycle ready");
      },
      "create_session",
    );
  }

  function handleRecommendationPick(recommendation: CheckRecommendation) {
    setSelectedRecommendationId(recommendation.id);
    setExpandedRecommendationId((current) => (current === recommendation.id ? null : recommendation.id));
  }

  function handleRecommendationStance(stance: CheckCommitStance) {
    setCommitmentStance(stance);

    if (!selectedRecommendation) {
      requestAnimationFrame(() => commitmentRef.current?.focus());
      return;
    }

    if (stance === "accept") {
      setCommitmentText(selectedRecommendation.action);
    } else if (stance === "modify") {
      setCommitmentText(`${selectedRecommendation.action} I will adjust it by: `);
    } else if (stance === "reject") {
      setCommitmentText(`I am not doing "${selectedRecommendation.action}" because `);
    } else {
      setCommitmentText("");
    }

    requestAnimationFrame(() => commitmentRef.current?.focus());
  }

  async function handleCommit() {
    if (!activeCycle) {
      return;
    }

    const commitment = commitmentText.trim();

    if (!commitment) {
      setStatus("Type your move or accept an authored recommendation before committing");
      commitmentRef.current?.focus();
      return;
    }

    await runCheckAction("Committing Check move", async () => {
      const payload = await commitCheckCycle(activeCycle.id, {
        commitment,
        stance: commitmentStance,
        recommendationId: commitmentStance === "custom" ? null : selectedRecommendation?.id ?? null,
      });

      setCheckSession(payload.data.session);
      setSprintText(commitment);
      setStatus(payload.data.breakthrough ? "Breakthrough candidate created" : "Work sprint ready");
    });
  }

  async function handleSprint() {
    if (!activeCycle) {
      return;
    }

    await runCheckAction("Synthesizing sprint", async () => {
      const payload = await runCheckSprint(activeCycle.id, {
        sprintText: sprintText.trim(),
      });

      setCheckSession(payload.data.session);
      setStatus("Synthesis ready");
    });
  }

  async function handleNextCycle() {
    if (!checkSession) {
      return;
    }

    await runCheckAction(
      "Generating next Check cycle",
      async () => {
        const payload = await createCheckCycle(checkSession.id);

        setCheckSession(payload.data.session);
        setCommitmentText("");
        setSprintText("");
        setSelectedRecommendationId(payload.data.cycle.recommendations[0]?.id ?? null);
        setExpandedRecommendationId(payload.data.cycle.recommendations[0]?.id ?? null);
        setStatus(payload.data.reusedActiveCycle ? "Active Check cycle resumed" : "Next Check cycle ready");
      },
      "next_cycle",
    );
  }

  async function handleSaveToBrain() {
    if (!checkSession) {
      return;
    }

    await runCheckAction("Saving Check to Brain", async () => {
      const payload = await saveCheckToBrain(checkSession.id);

      setCheckSession(payload.data.session);
      setStatus("Check saved to Brain");
      onOpenBrain?.();
    });
  }

  function handleRetryFailure() {
    if (checkFailure?.action === "next_cycle") {
      void handleNextCycle();
      return;
    }

    void handleCreateSession(draftText);
  }

  function handleEditProjectSeed() {
    setCheckFailure(null);
    setCheckSession(null);
    setCommitmentText("");
    setSprintText("");
    requestAnimationFrame(() => sourceTextareaRef.current?.focus());
  }

  const askPennyContext = checkSession && activeCycle
    ? [
        `Check focus: ${activeCycle.currentFocus}`,
        `Diagnosis: ${activeCycle.diagnosis}`,
        ...allRecommendations.map((recommendation) => `${formatSlotLabel(recommendation.slot)}: ${recommendation.action}`),
      ].join("\n")
    : draftText;

  return (
    <main className="check-workspace-shell" aria-label="Check creative breakthrough workspace">
      <CheckPathSidebar
        activeIndex={activePathIndex}
        status={displayStatus}
        onAskPennyToggle={() => setAskPennyOpen((isOpen) => !isOpen)}
      />

      <section className="check-center-stage" aria-label="Active Check cycle">
        {checkSession && activeCycle ? (
          <CheckMainCycle
            session={checkSession}
            cycle={activeCycle}
            selectedRecommendationId={selectedRecommendationId}
            expandedRecommendationId={expandedRecommendationId}
            commitmentText={commitmentText}
            commitmentStance={commitmentStance}
            sprintText={sprintText}
            busy={busy}
            failure={checkFailure}
            commitmentRef={commitmentRef}
            onRecommendationSelect={handleRecommendationPick}
            onCommitmentTextChange={setCommitmentText}
            onCommitmentStanceChange={setCommitmentStance}
            onRecommendationStance={handleRecommendationStance}
            onCommit={handleCommit}
            onSprintTextChange={setSprintText}
            onSprint={handleSprint}
            onNextCycle={handleNextCycle}
            onSaveToBrain={handleSaveToBrain}
            onRetryFailure={handleRetryFailure}
            onEditProjectSeed={handleEditProjectSeed}
          />
        ) : (
          <CheckEntryCard
            draftText={draftText}
            busy={busy}
            failure={checkFailure}
            textareaRef={sourceTextareaRef}
            onDraftTextChange={setDraftText}
            onCreateSession={() => handleCreateSession()}
            onRetryFailure={handleRetryFailure}
            onEditProjectSeed={handleEditProjectSeed}
          />
        )}
      </section>

      <AskPennyDrawer
        isOpen={askPennyOpen}
        disabled={busy}
        currentStepTitle={activeCycle?.currentFocus ?? "Project seed"}
        localContext={askPennyContext}
        onClose={() => setAskPennyOpen(false)}
      />
    </main>
  );
}

export function CheckPathSidebar({
  activeIndex,
  status,
  onAskPennyToggle,
}: {
  activeIndex: number;
  status: string;
  onAskPennyToggle: () => void;
}) {
  return (
    <aside className="check-path-sidebar" aria-label="Check Path">
      <div className="check-path-head">
        <div>
          <span>CHECK PATH</span>
          <strong>Creative breakthrough</strong>
        </div>
        <button type="button" className="check-ask-button" onClick={onAskPennyToggle}>
          <HelpCircle size={15} />
          Ask Penny
        </button>
      </div>

      <ol className="check-path-list">
        {checkPathSteps.map((step, index) => (
          <li key={step} className={index === activeIndex ? "is-active" : ""}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </li>
        ))}
      </ol>

      <section className="check-thinking-graph" aria-label="Thinking graph">
        <div className="check-thinking-graph-head">
          <span>CANVAS</span>
          <strong>Thinking graph</strong>
        </div>
        <div className="check-thinking-graph-board">
          {thinkingGraphNodes.map((node, index) => (
            <article key={node} className={index === activeIndex || (activeIndex >= 5 && index === 5) ? "is-active" : ""}>
              <span>{index + 1}</span>
              <strong>{node}</strong>
            </article>
          ))}
        </div>
      </section>

      <div className="check-path-status">
        <span>Status</span>
        <strong>{status}</strong>
      </div>
    </aside>
  );
}

export function CheckMainCycle({
  session,
  cycle,
  selectedRecommendationId,
  expandedRecommendationId,
  commitmentText,
  commitmentStance,
  sprintText,
  busy,
  failure,
  commitmentRef,
  onRecommendationSelect,
  onCommitmentTextChange,
  onCommitmentStanceChange,
  onRecommendationStance,
  onCommit,
  onSprintTextChange,
  onSprint,
  onNextCycle,
  onSaveToBrain,
  onRetryFailure,
  onEditProjectSeed,
}: {
  session: CheckSession;
  cycle: CheckCycle;
  selectedRecommendationId: string | null;
  expandedRecommendationId: string | null;
  commitmentText: string;
  commitmentStance: CheckCommitStance;
  sprintText: string;
  busy: boolean;
  failure: CheckFailure | null;
  commitmentRef: RefObject<HTMLTextAreaElement | null>;
  onRecommendationSelect: (recommendation: CheckRecommendation) => void;
  onCommitmentTextChange: (value: string) => void;
  onCommitmentStanceChange: (value: CheckCommitStance) => void;
  onRecommendationStance: (stance: CheckCommitStance) => void;
  onCommit: () => Promise<void>;
  onSprintTextChange: (value: string) => void;
  onSprint: () => Promise<void>;
  onNextCycle: () => Promise<void>;
  onSaveToBrain: () => Promise<void>;
  onRetryFailure: () => void;
  onEditProjectSeed: () => void;
}) {
  const cycleIndex = Math.max(
    0,
    session.cycles.findIndex((item) => item.id === cycle.id),
  );
  const cycleNumber = cycleIndex + 1;
  const cycleTotal = Math.max(session.cycles.length, cycleNumber);
  const selectedRecommendation =
    [...cycle.recommendations.slice(0, 5), cycle.curveball].find((recommendation) => recommendation.id === selectedRecommendationId) ??
    cycle.recommendations[0] ??
    cycle.curveball;

  return (
    <article className="check-main-cycle">
      <header className="check-cycle-hero">
        <span>
          CHECK {cycleNumber} / {cycleTotal}
        </span>
        <h1>{cycle.currentFocus}</h1>
        <p>{cycle.diagnosis}</p>
      </header>

      {failure ? <CheckFailurePanel failure={failure} onRetry={onRetryFailure} onEditProjectSeed={onEditProjectSeed} /> : null}

      {cycle.synthesis ? (
        <SynthesisCard session={session} cycle={cycle} busy={busy} onNextCycle={onNextCycle} onSaveToBrain={onSaveToBrain} />
      ) : cycle.status === "committed" && cycle.workSprint ? (
        <WorkSprintCard
          cycle={cycle}
          sprintText={sprintText}
          busy={busy}
          onSprintTextChange={onSprintTextChange}
          onSprint={onSprint}
        />
      ) : (
        <>
          <RecommendationBoard
            recommendations={cycle.recommendations.slice(0, 5)}
            curveball={cycle.curveball}
            selectedRecommendationId={selectedRecommendationId}
            expandedRecommendationId={expandedRecommendationId}
            onRecommendationSelect={onRecommendationSelect}
          />

          <YourMoveBox
            selectedRecommendation={selectedRecommendation}
            commitmentText={commitmentText}
            commitmentStance={commitmentStance}
            busy={busy}
            commitmentRef={commitmentRef}
            onCommitmentTextChange={onCommitmentTextChange}
            onCommitmentStanceChange={onCommitmentStanceChange}
            onRecommendationStance={onRecommendationStance}
            onCommit={onCommit}
          />
        </>
      )}
    </article>
  );
}

export function RecommendationBoard({
  recommendations,
  curveball,
  selectedRecommendationId,
  expandedRecommendationId,
  onRecommendationSelect,
}: {
  recommendations: CheckRecommendation[];
  curveball: CheckRecommendation;
  selectedRecommendationId: string | null;
  expandedRecommendationId: string | null;
  onRecommendationSelect: (recommendation: CheckRecommendation) => void;
}) {
  return (
    <section className="check-recommendation-board" aria-label="Recommended moves">
      <header>
        <span>Recommended moves</span>
        <strong>5 moves + 1 curveball</strong>
      </header>
      <div className="check-recommendation-list">
        {recommendations.slice(0, 5).map((recommendation, index) => (
          <RecommendationRow
            key={recommendation.id}
            recommendation={recommendation}
            index={index + 1}
            selected={recommendation.id === selectedRecommendationId}
            expanded={recommendation.id === expandedRecommendationId}
            onSelect={onRecommendationSelect}
          />
        ))}
        <RecommendationRow
          recommendation={curveball}
          index="C"
          selected={curveball.id === selectedRecommendationId}
          expanded={curveball.id === expandedRecommendationId}
          onSelect={onRecommendationSelect}
          curveball
        />
      </div>
    </section>
  );
}

export function RecommendationRow({
  recommendation,
  index,
  selected,
  expanded,
  curveball = false,
  onSelect,
}: {
  recommendation: CheckRecommendation;
  index: number | "C";
  selected: boolean;
  expanded: boolean;
  curveball?: boolean;
  onSelect: (recommendation: CheckRecommendation) => void;
}) {
  return (
    <article className={`check-recommendation-row${selected ? " is-selected" : ""}${curveball ? " is-curveball" : ""}`}>
      <button type="button" onClick={() => onSelect(recommendation)} aria-expanded={expanded}>
        <span className="check-row-number">{index}</span>
        <span className="check-row-lens">{curveball ? "Curveball" : formatSlotLabel(recommendation.slot)}</span>
        <strong>{recommendation.action}</strong>
        <span className="check-row-expand">{expanded ? "Close" : "Expand"}</span>
      </button>
      {expanded ? (
        <div className="check-row-detail">
          <p>{recommendation.whyItMatters}</p>
          <span>{recommendation.effort} effort</span>
        </div>
      ) : null}
    </article>
  );
}

export function YourMoveBox({
  selectedRecommendation,
  commitmentText,
  commitmentStance,
  busy,
  commitmentRef,
  onCommitmentTextChange,
  onCommitmentStanceChange,
  onRecommendationStance,
  onCommit,
}: {
  selectedRecommendation: CheckRecommendation | null;
  commitmentText: string;
  commitmentStance: CheckCommitStance;
  busy: boolean;
  commitmentRef: RefObject<HTMLTextAreaElement | null>;
  onCommitmentTextChange: (value: string) => void;
  onCommitmentStanceChange: (value: CheckCommitStance) => void;
  onRecommendationStance: (stance: CheckCommitStance) => void;
  onCommit: () => Promise<void>;
}) {
  return (
    <section className="check-your-move" aria-label="Your move">
      <header>
        <span>Your move</span>
        <strong>{selectedRecommendation ? selectedRecommendation.action : "Write a custom move."}</strong>
      </header>
      <label>
        <span>Author the move you will commit</span>
        <textarea
          ref={commitmentRef}
          value={commitmentText}
          onChange={(event) => {
            onCommitmentTextChange(event.target.value);
            onCommitmentStanceChange("custom");
          }}
        />
      </label>
      <div className="check-move-actions">
        {(["accept", "modify", "reject", "custom"] as CheckCommitStance[]).map((stance) => (
          <button
            key={stance}
            type="button"
            className={commitmentStance === stance ? "is-active" : ""}
            onClick={() => onRecommendationStance(stance)}
            disabled={busy}
          >
            {formatLabel(stance)}
          </button>
        ))}
        <button type="button" className="check-primary-button" onClick={onCommit} disabled={busy}>
          <Send size={15} />
          Commit move
        </button>
      </div>
    </section>
  );
}

export function AskPennyDrawer({
  isOpen,
  disabled,
  currentStepTitle,
  localContext,
  onClose,
}: {
  isOpen: boolean;
  disabled: boolean;
  currentStepTitle: string;
  localContext: string;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<AskPennyMessage[]>([
    {
      role: "system",
      text: "context loaded: current Check cycle",
    },
  ]);
  const [asking, setAsking] = useState(false);

  async function handleAsk() {
    const trimmed = question.trim();

    if (!trimmed) {
      return;
    }

    setQuestion("");
    setAsking(true);
    setMessages((current) => [...current, { role: "user", text: trimmed }]);

    try {
      const response = await askPennyQuestion({
        question: trimmed,
        currentStepTitle,
        localContext,
      });

      setMessages((current) => [
        ...current,
        {
          role: "penny",
          text: response.data.answer,
          provider: response.data.provider,
          model: response.data.model,
        },
      ]);
    } catch (error) {
      setMessages((current) => [...current, { role: "system", text: error instanceof Error ? error.message : String(error) }]);
    } finally {
      setAsking(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <section className="check-ask-drawer" aria-label="Ask Penny">
      <header>
        <div>
          <span>Ask Penny</span>
          <p>{currentStepTitle}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Ask Penny">
          <X size={18} />
        </button>
      </header>
      <div className="check-ask-thread">
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`check-ask-message is-${message.role}`}>
            <span>{message.role === "penny" ? "penny" : message.role}</span>
            {message.role === "penny" ? <AskPennyRenderedText text={message.text} /> : <p>{message.text}</p>}
            {message.provider ? <small>{message.model ? `${message.provider} ${message.model}` : message.provider}</small> : null}
          </article>
        ))}
      </div>
      <div className="check-ask-input">
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} />
        <button type="button" onClick={handleAsk} disabled={disabled || asking || !question.trim()} aria-label="Ask Penny">
          <Send size={16} />
        </button>
      </div>
    </section>
  );
}

function CheckEntryCard({
  draftText,
  busy,
  failure,
  textareaRef,
  onDraftTextChange,
  onCreateSession,
  onRetryFailure,
  onEditProjectSeed,
}: {
  draftText: string;
  busy: boolean;
  failure: CheckFailure | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onDraftTextChange: (value: string) => void;
  onCreateSession: () => Promise<void>;
  onRetryFailure: () => void;
  onEditProjectSeed: () => void;
}) {
  return (
    <article className="check-entry-card-v3">
      <header>
        <span>CHECK 0 / 1</span>
        <h1>Start with the project seed.</h1>
        <p>Check will generate the focus, diagnosis, recommended moves, and curveball from the seed.</p>
      </header>
      {failure ? <CheckFailurePanel failure={failure} onRetry={onRetryFailure} onEditProjectSeed={onEditProjectSeed} /> : null}
      <label>
        <span>Project seed</span>
        <textarea ref={textareaRef} value={draftText} onChange={(event) => onDraftTextChange(event.target.value)} />
      </label>
      <button type="button" className="check-primary-button" onClick={onCreateSession} disabled={busy}>
        <Sparkles size={15} />
        Generate Check cycle
      </button>
    </article>
  );
}

function WorkSprintCard({
  cycle,
  sprintText,
  busy,
  onSprintTextChange,
  onSprint,
}: {
  cycle: CheckCycle;
  sprintText: string;
  busy: boolean;
  onSprintTextChange: (value: string) => void;
  onSprint: () => Promise<void>;
}) {
  return (
    <section className="check-work-sprint-v3">
      <header>
        <span>Work sprint</span>
        <strong>{cycle.workSprint?.prompt}</strong>
      </header>
      <ol>
        {cycle.workSprint?.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <label>
        <span>Sprint result</span>
        <textarea value={sprintText} onChange={(event) => onSprintTextChange(event.target.value)} />
      </label>
      <button type="button" className="check-primary-button" onClick={onSprint} disabled={busy}>
        <Zap size={15} />
        Finish sprint
      </button>
    </section>
  );
}

function SynthesisCard({
  session,
  cycle,
  busy,
  onNextCycle,
  onSaveToBrain,
}: {
  session: CheckSession;
  cycle: CheckCycle;
  busy: boolean;
  onNextCycle: () => Promise<void>;
  onSaveToBrain: () => Promise<void>;
}) {
  const synthesis = cycle.synthesis;

  if (!synthesis) {
    return null;
  }

  return (
    <section className="check-synthesis-v3">
      <header>
        <span>Synthesis</span>
        <strong>{synthesis.possibleBreakthrough?.title ?? "Cycle changed the work"}</strong>
      </header>
      <div>
        <span>What changed</span>
        <ul>
          {synthesis.whatChanged.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      </div>
      <div>
        <span>Next suggested check</span>
        <p>{synthesis.nextSuggestedCheck}</p>
      </div>
      <div className="check-synthesis-actions">
        <button type="button" className="check-secondary-button" onClick={onNextCycle} disabled={busy}>
          <RefreshCcw size={15} />
          Next Check
        </button>
        <button type="button" className="check-primary-button" onClick={onSaveToBrain} disabled={busy || session.status === "saved"}>
          <Save size={15} />
          {session.status === "saved" ? "Saved" : synthesis.saveToBrain.label}
        </button>
      </div>
    </section>
  );
}

function CheckFailurePanel({
  failure,
  onRetry,
  onEditProjectSeed,
}: {
  failure: CheckFailure;
  onRetry: () => void;
  onEditProjectSeed: () => void;
}) {
  return (
    <section className="check-ai-failure" aria-label="Check AI failure">
      <div>
        <span>AI required</span>
        <strong>{failure.message}</strong>
      </div>
      <div>
        <button type="button" className="check-secondary-button" onClick={onRetry}>
          <RefreshCcw size={15} />
          Retry
        </button>
        <button type="button" className="check-secondary-button" onClick={onEditProjectSeed}>
          Edit project seed
        </button>
      </div>
    </section>
  );
}

function activeCheckCycle(session: CheckSession | null): CheckCycle | null {
  if (!session) {
    return null;
  }

  return (
    (session.activeCycleId ? session.cycles.find((cycle) => cycle.id === session.activeCycleId) ?? null : null) ??
    session.cycles.at(-1) ??
    null
  );
}

function checkPathIndex(session: CheckSession | null, cycle: CheckCycle | null): number {
  if (!session || !cycle) {
    return 0;
  }

  if (session.status === "saved") {
    return 6;
  }

  if (cycle.synthesis) {
    return 5;
  }

  if (cycle.status === "committed") {
    return 5;
  }

  return 1;
}

function formatSlotLabel(slot: string): string {
  if (slot === "curveball") {
    return "Curveball";
  }

  return slot.charAt(0).toUpperCase() + slot.slice(1);
}
