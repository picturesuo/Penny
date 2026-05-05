import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileUp,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Save,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  addCheckNode,
  commitCheckCycle,
  createCheckCycle,
  createCheckSession,
  runCheckSprint,
  saveCheckToBrain,
} from "../api/brainClient";
import type {
  AutopilotTickData,
  BrainData,
  BrainDocumentsData,
  ChallengeResponseKind,
  CheckCommitStance,
  CheckCycle,
  CheckNodeKind,
  CheckProjectNode,
  CheckRecommendation,
  CheckSession,
  RespondToChallengeResponse,
  SessionCockpitData,
  WorkStructureStep,
} from "../types/brain";
import { formatLabel } from "../lib/format";

interface CheckWorkspaceProps {
  documentsData: BrainDocumentsData | null;
  data: BrainData | null;
  autopilot?: AutopilotTickData | null;
  challengeResponse?: RespondToChallengeResponse["data"] | null;
  latestArtifact?: SessionCockpitData["latestArtifact"] | null;
  focusedClaimId?: string | null;
  focusedWorkStructureStepId?: string | null;
  status: string;
  isThinking: boolean;
  initialSeedText?: string | null;
  onInitialSeedConsumed?: () => void;
  onStatusChange?: (status: string) => void;
  onThinkingChange?: (isThinking: boolean) => void;
  onSeed?: (rawIdea: string) => Promise<void>;
  onSelectDocument?: (sessionId: string) => void;
  onGoThere?: (candidateId?: string) => Promise<void>;
  onOpenLearn?: () => void;
  onOpenBrain?: () => void;
  onOpenVerify?: () => void;
  onVerifyChanged?: () => Promise<void>;
  onClaimSelect?: (claimId: string) => void;
  onWorkStructureSelect?: (step: WorkStructureStep) => void;
  onIssueChallenge?: () => Promise<void>;
  onRespondChallenge?: (
    challengeId: string,
    draft:
      | { response: "defend"; reasoning: string }
      | { response: "revise"; revisedText: string; reasoning?: string }
      | { response: "absorb"; reasoning?: string },
  ) => Promise<void>;
  onCreateChallengeBrief?: () => Promise<void>;
}

const CHECK_NODE_KINDS: CheckNodeKind[] = [
  "claim",
  "evidence",
  "assumption",
  "counterargument",
  "tension",
  "question",
  "example",
  "experiment",
  "wild_idea",
  "decision",
  "task",
];

export function CheckWorkspace({
  documentsData,
  data,
  status,
  isThinking,
  initialSeedText,
  onInitialSeedConsumed,
  onStatusChange,
  onThinkingChange,
  onSelectDocument,
  onOpenBrain,
}: CheckWorkspaceProps) {
  const [checkSession, setCheckSession] = useState<CheckSession | null>(null);
  const [draftText, setDraftText] = useState("");
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null);
  const [commitmentText, setCommitmentText] = useState("");
  const [commitmentStance, setCommitmentStance] = useState<CheckCommitStance>("custom");
  const [sprintText, setSprintText] = useState("");
  const [mapCollapsed, setMapCollapsed] = useState(false);
  const [customNodeOpen, setCustomNodeOpen] = useState(false);
  const [customNodeKind, setCustomNodeKind] = useState<CheckNodeKind>("question");
  const [customNodeTitle, setCustomNodeTitle] = useState("");
  const [customNodeBody, setCustomNodeBody] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState("Check ready");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const commitmentRef = useRef<HTMLTextAreaElement | null>(null);
  const bootstrappedTextRef = useRef<string | null>(null);

  const busy = localBusy || isThinking;
  const displayStatus = busy ? "Thinking" : localStatus || status;
  const activeCycle = useMemo(() => activeCheckCycle(checkSession), [checkSession]);
  const recommendations = activeCycle ? [...activeCycle.recommendations, activeCycle.curveball] : [];
  const selectedRecommendation =
    recommendations.find((recommendation) => recommendation.id === selectedRecommendationId) ?? recommendations[0] ?? null;
  const sourceText = initialSeedText?.trim() || data?.source?.rawText?.trim() || "";
  const groupedNodes = useMemo(() => groupNodesByKind(checkSession?.project.nodes ?? []), [checkSession]);

  useEffect(() => {
    if (!activeCycle) {
      setSelectedRecommendationId(null);
      return;
    }

    const allRecommendations = [...activeCycle.recommendations, activeCycle.curveball];
    const stillValid = selectedRecommendationId
      ? allRecommendations.some((recommendation) => recommendation.id === selectedRecommendationId)
      : false;

    if (!stillValid) {
      setSelectedRecommendationId(allRecommendations[0]?.id ?? null);
    }
  }, [activeCycle, selectedRecommendationId]);

  useEffect(() => {
    if (!sourceText || checkSession || bootstrappedTextRef.current === sourceText) {
      return;
    }

    bootstrappedTextRef.current = sourceText;
    setDraftText(sourceText);
    onInitialSeedConsumed?.();
    void handleCreateSession(sourceText, null);
  }, [checkSession, onInitialSeedConsumed, sourceText]);

  function setStatus(nextStatus: string) {
    setLocalStatus(nextStatus);
    onStatusChange?.(nextStatus);
  }

  function setBusy(nextBusy: boolean) {
    setLocalBusy(nextBusy);
    onThinkingChange?.(nextBusy);
  }

  async function runCheckAction<T>(nextStatus: string, action: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setStatus(nextStatus);

    try {
      return await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSession(textOverride?: string, fileNameOverride: string | null = attachedFileName) {
    const text = (textOverride ?? draftText).trim();

    if (!text) {
      setStatus("Add text, a file, or a project description first");
      sourceTextareaRef.current?.focus();
      return;
    }

    await runCheckAction("Structuring Check project", async () => {
      const payload = await createCheckSession(
        fileNameOverride
          ? {
              rawText: text,
              sourceMaterial: {
                kind: fileKind(fileNameOverride),
                fileName: fileNameOverride,
                extractedText: text,
              },
            }
          : { rawText: text },
      );

      setCheckSession(payload.data.session);
      setCommitmentText("");
      setSprintText("");
      setSelectedRecommendationId(payload.data.session.cycles[0]?.recommendations[0]?.id ?? null);
      setStatus("Check project ready");
    });
  }

  async function handleFileChange(file: File | null) {
    if (!file) {
      return;
    }

    const text = await file.text();
    setAttachedFileName(file.name);
    setDraftText(text);
    setStatus(`${file.name} loaded`);
  }

  function handleRecommendationPick(recommendation: CheckRecommendation) {
    setSelectedRecommendationId(recommendation.id);
    setCommitmentText(recommendation.action);
    setCommitmentStance("accept");
    requestAnimationFrame(() => commitmentRef.current?.focus());
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
    }

    requestAnimationFrame(() => commitmentRef.current?.focus());
  }

  async function handleCommit() {
    if (!activeCycle) {
      return;
    }

    const commitment = commitmentText.trim();

    if (!commitment) {
      setStatus("Type your own move before committing");
      commitmentRef.current?.focus();
      return;
    }

    await runCheckAction("Committing Check move", async () => {
      const payload = await commitCheckCycle(activeCycle.id, {
        commitment,
        stance: commitmentStance,
        recommendationId: selectedRecommendation?.id ?? null,
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

    await runCheckAction("Creating next Check cycle", async () => {
      const payload = await createCheckCycle(checkSession.id);

      setCheckSession(payload.data.session);
      setCommitmentText("");
      setSprintText("");
      setSelectedRecommendationId(payload.data.cycle.recommendations[0]?.id ?? null);
      setStatus(payload.data.reusedActiveCycle ? "Active Check cycle resumed" : "Next Check cycle ready");
    });
  }

  async function handleCustomNodeSubmit() {
    if (!checkSession) {
      setStatus("Create a Check project before adding nodes");
      return;
    }

    const title = customNodeTitle.trim();

    if (!title) {
      setStatus("Custom node needs a title");
      return;
    }

    await runCheckAction("Adding custom node", async () => {
      const payload = await addCheckNode(checkSession.id, {
        kind: customNodeKind,
        title,
        body: customNodeBody.trim(),
      });

      setCheckSession(payload.data.session);
      setCustomNodeTitle("");
      setCustomNodeBody("");
      setCustomNodeOpen(false);
      setStatus(`${formatNodeKind(payload.data.node.kind)} added`);
    });
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

  function handleWorkspaceKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const editing = target?.tagName === "TEXTAREA" || target?.tagName === "INPUT" || target?.tagName === "SELECT";

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setCustomNodeOpen(true);
      return;
    }

    if (editing) {
      return;
    }

    if (event.key === "Tab" && recommendations.length > 0) {
      event.preventDefault();
      selectAdjacentRecommendation(event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key.toLowerCase() === "c" && activeCycle) {
      event.preventDefault();
      setSelectedRecommendationId(activeCycle.curveball.id);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (customNodeOpen) {
        setCustomNodeOpen(false);
      } else if (activeCycle?.status === "committed") {
        commitmentRef.current?.focus();
      } else {
        sourceTextareaRef.current?.focus();
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (!checkSession) {
        void handleCreateSession();
      } else if (activeCycle?.status === "committed") {
        void handleSprint();
      } else {
        commitmentRef.current?.focus();
      }
    }
  }

  function selectAdjacentRecommendation(direction: number) {
    if (!recommendations.length) {
      return;
    }

    const currentIndex = recommendations.findIndex((recommendation) => recommendation.id === selectedRecommendationId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + recommendations.length) % recommendations.length;
    const nextRecommendation = recommendations[nextIndex];

    if (nextRecommendation) {
      setSelectedRecommendationId(nextRecommendation.id);
    }
  }

  return (
    <main className="check-v2-shell" onKeyDown={handleWorkspaceKeyDown}>
      <section className={`check-project-map${mapCollapsed ? " is-collapsed" : ""}`} aria-label="Project Map">
        <div className="check-map-head">
          <button
            type="button"
            className="check-icon-button"
            title={mapCollapsed ? "Open Project Map" : "Collapse Project Map"}
            aria-label={mapCollapsed ? "Open Project Map" : "Collapse Project Map"}
            onClick={() => setMapCollapsed((current) => !current)}
          >
            {mapCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          {!mapCollapsed ? (
            <>
              <span>Project Map</span>
              <button
                type="button"
                className="check-icon-button"
                title="Add custom node"
                aria-label="Add custom node"
                onClick={() => setCustomNodeOpen(true)}
              >
                <Plus size={16} />
              </button>
            </>
          ) : null}
        </div>

        {!mapCollapsed ? (
          checkSession ? (
            <div className="check-map-body">
              <div className="check-map-north-star">
                <span>North Star</span>
                <strong>{checkSession.project.northStar}</strong>
              </div>
              <div className="check-map-meta">
                <span>{checkSession.project.audienceOrJudge}</span>
                <span>{checkSession.project.successCriteria.length} criteria</span>
                <span>{checkSession.project.nodes.length} nodes</span>
              </div>
              <div className="check-node-groups">
                {CHECK_NODE_KINDS.map((kind) => (
                  <CheckNodeGroup
                    key={kind}
                    kind={kind}
                    nodes={groupedNodes.get(kind) ?? []}
                    selectedRecommendation={selectedRecommendation}
                  />
                ))}
              </div>
            </div>
          ) : (
            <CheckRecentIdeas
              documentsData={documentsData}
              {...(onSelectDocument ? { onSelectDocument } : {})}
            />
          )
        ) : null}
      </section>

      <section className="check-active-stage" aria-label="Active Check">
        <div className="check-stage-status">
          <span>Check</span>
          <strong>{displayStatus}</strong>
        </div>

        {checkSession && activeCycle ? (
          <ActiveCheckCard
            session={checkSession}
            cycle={activeCycle}
            selectedRecommendation={selectedRecommendation}
            commitmentText={commitmentText}
            commitmentStance={commitmentStance}
            sprintText={sprintText}
            busy={busy}
            commitmentRef={commitmentRef}
            onCommitmentTextChange={setCommitmentText}
            onCommitmentStanceChange={setCommitmentStance}
            onCommit={handleCommit}
            onSprintTextChange={setSprintText}
            onSprint={handleSprint}
            onNextCycle={handleNextCycle}
            onSaveToBrain={handleSaveToBrain}
          />
        ) : (
          <CheckEntryCard
            draftText={draftText}
            attachedFileName={attachedFileName}
            busy={busy}
            textareaRef={sourceTextareaRef}
            fileInputRef={fileInputRef}
            onDraftTextChange={setDraftText}
            onFileChange={handleFileChange}
            onCreateSession={() => handleCreateSession()}
          />
        )}
      </section>

      <aside className="check-recommendation-rail" aria-label="Recommendation Stack">
        {activeCycle ? (
          <>
            <div className="check-rec-head">
              <span>Recommendation Stack</span>
              <strong>5 + curveball</strong>
            </div>
            <div className="check-rec-list">
              {activeCycle.recommendations.map((recommendation, index) => (
                <RecommendationButton
                  key={recommendation.id}
                  recommendation={recommendation}
                  index={index + 1}
                  selected={selectedRecommendation?.id === recommendation.id}
                  onSelect={handleRecommendationPick}
                />
              ))}
              <RecommendationButton
                recommendation={activeCycle.curveball}
                index="C"
                selected={selectedRecommendation?.id === activeCycle.curveball.id}
                onSelect={handleRecommendationPick}
                curveball
              />
            </div>
            <div className="check-rec-actions" aria-label="Recommendation actions">
              <button type="button" onClick={() => handleRecommendationStance("accept")} disabled={busy}>
                Accept
              </button>
              <button type="button" onClick={() => handleRecommendationStance("modify")} disabled={busy}>
                Modify
              </button>
              <button type="button" onClick={() => handleRecommendationStance("reject")} disabled={busy}>
                Reject
              </button>
            </div>
          </>
        ) : (
          <div className="check-rec-empty">
            <Sparkles size={18} />
            <strong>One focus at a time</strong>
            <span>Start a Check project to get five moves and one curveball.</span>
          </div>
        )}
      </aside>

      {customNodeOpen ? (
        <section className="check-custom-node" aria-label="Add custom node">
          <div className="check-custom-node-panel">
            <header>
              <span>Add Node</span>
              <button type="button" className="check-icon-button" onClick={() => setCustomNodeOpen(false)} aria-label="Close add node">
                <ChevronRight size={16} />
              </button>
            </header>
            <label>
              <span>Kind</span>
              <select value={customNodeKind} onChange={(event) => setCustomNodeKind(event.target.value as CheckNodeKind)}>
                {CHECK_NODE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {formatNodeKind(kind)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Title</span>
              <input value={customNodeTitle} onChange={(event) => setCustomNodeTitle(event.target.value)} />
            </label>
            <label>
              <span>Body</span>
              <textarea value={customNodeBody} onChange={(event) => setCustomNodeBody(event.target.value)} />
            </label>
            <button type="button" className="check-primary-button" onClick={handleCustomNodeSubmit} disabled={busy}>
              <Plus size={15} />
              Add node
            </button>
          </div>
        </section>
      ) : null}

      <footer className="check-command-bar" aria-label="Check keyboard command bar">
        <span>
          <kbd>Enter</kbd> reveal / select / submit
        </span>
        <span>
          <kbd>Tab</kbd> switch recommendations
        </span>
        <span>
          <kbd>C</kbd> curveball
        </span>
        <span>
          <kbd>Cmd/Ctrl K</kbd> add node
        </span>
        <span>
          <kbd>Esc</kbd> previous
        </span>
      </footer>
    </main>
  );
}

function ActiveCheckCard({
  session,
  cycle,
  selectedRecommendation,
  commitmentText,
  commitmentStance,
  sprintText,
  busy,
  commitmentRef,
  onCommitmentTextChange,
  onCommitmentStanceChange,
  onCommit,
  onSprintTextChange,
  onSprint,
  onNextCycle,
  onSaveToBrain,
}: {
  session: CheckSession;
  cycle: CheckCycle;
  selectedRecommendation: CheckRecommendation | null;
  commitmentText: string;
  commitmentStance: CheckCommitStance;
  sprintText: string;
  busy: boolean;
  commitmentRef: React.RefObject<HTMLTextAreaElement | null>;
  onCommitmentTextChange: (value: string) => void;
  onCommitmentStanceChange: (value: CheckCommitStance) => void;
  onCommit: () => Promise<void>;
  onSprintTextChange: (value: string) => void;
  onSprint: () => Promise<void>;
  onNextCycle: () => Promise<void>;
  onSaveToBrain: () => Promise<void>;
}) {
  return (
    <article className="check-card">
      <header className="check-card-head">
        <span>Active Focus</span>
        <h1>{cycle.currentFocus}</h1>
        <p>{cycle.diagnosis}</p>
      </header>

      <div className="check-project-brief">
        <div>
          <span>Current artifact</span>
          <p>{session.project.currentArtifactSummary}</p>
        </div>
        <div>
          <span>Success criteria</span>
          <ul>
            {session.project.successCriteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </div>
      </div>

      {cycle.synthesis ? (
        <SynthesisCard session={session} cycle={cycle} busy={busy} onNextCycle={onNextCycle} onSaveToBrain={onSaveToBrain} />
      ) : cycle.status === "committed" && cycle.workSprint ? (
        <section className="check-work-sprint">
          <header>
            <span>Work Sprint</span>
            <strong>{cycle.workSprint.prompt}</strong>
          </header>
          <ol>
            {cycle.workSprint.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <label>
            <span>Sprint result</span>
            <textarea
              value={sprintText}
              onChange={(event) => onSprintTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void onSprint();
                }
              }}
              placeholder="Write what changed in the artifact, argument, plan, or next action."
            />
          </label>
          <button type="button" className="check-primary-button" onClick={onSprint} disabled={busy}>
            <Zap size={15} />
            Finish sprint
          </button>
        </section>
      ) : (
        <section className="check-commitment">
          <div className="check-selected-rec">
            <span>{selectedRecommendation ? formatNodeKind(selectedRecommendation.slot) : "Own move"}</span>
            <strong>{selectedRecommendation?.action ?? "Write your own move."}</strong>
            {selectedRecommendation ? <p>{selectedRecommendation.whyItMatters}</p> : null}
          </div>
          <label>
            <span>What do you want to do next?</span>
            <textarea
              ref={commitmentRef}
              value={commitmentText}
              onChange={(event) => {
                onCommitmentTextChange(event.target.value);
                onCommitmentStanceChange("custom");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void onCommit();
                }
              }}
              placeholder="Accept, modify, reject, or write your own move."
            />
          </label>
          <div className="check-commitment-actions">
            <div className="check-stance-pills">
              {(["accept", "modify", "reject", "custom"] as CheckCommitStance[]).map((stance) => (
                <button
                  key={stance}
                  type="button"
                  className={commitmentStance === stance ? "is-active" : ""}
                  onClick={() => onCommitmentStanceChange(stance)}
                >
                  {formatLabel(stance)}
                </button>
              ))}
            </div>
            <button type="button" className="check-primary-button" onClick={onCommit} disabled={busy}>
              <Send size={15} />
              Commit move
            </button>
          </div>
        </section>
      )}
    </article>
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
    <section className="check-synthesis">
      <header>
        <span>Synthesis</span>
        <strong>{synthesis.possibleBreakthrough ? synthesis.possibleBreakthrough.title : "Cycle changed the graph"}</strong>
      </header>
      <div className="check-synthesis-grid">
        <div>
          <span>What changed</span>
          <ul>
            {synthesis.whatChanged.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </div>
        <div>
          <span>Possible breakthrough</span>
          <p>{synthesis.possibleBreakthrough?.summary ?? "No breakthrough yet. The project still gained a clearer next move."}</p>
        </div>
        <div>
          <span>Next suggested check</span>
          <p>{synthesis.nextSuggestedCheck}</p>
        </div>
      </div>
      <div className="check-synthesis-actions">
        <button type="button" className="check-secondary-button" onClick={onNextCycle} disabled={busy}>
          <ChevronRight size={15} />
          Next check
        </button>
        <button type="button" className="check-primary-button" onClick={onSaveToBrain} disabled={busy || session.status === "saved"}>
          <Save size={15} />
          {session.status === "saved" ? "Saved" : synthesis.saveToBrain.label}
        </button>
      </div>
    </section>
  );
}

function CheckEntryCard({
  draftText,
  attachedFileName,
  busy,
  textareaRef,
  fileInputRef,
  onDraftTextChange,
  onFileChange,
  onCreateSession,
}: {
  draftText: string;
  attachedFileName: string | null;
  busy: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDraftTextChange: (value: string) => void;
  onFileChange: (file: File | null) => Promise<void>;
  onCreateSession: () => Promise<void>;
}) {
  return (
    <article className="check-entry-card">
      <header>
        <span>Creative Breakthrough Workspace</span>
        <h1>Drop in the messy work.</h1>
      </header>
      <textarea
        ref={textareaRef}
        value={draftText}
        onChange={(event) => onDraftTextChange(event.target.value)}
        placeholder="Paste an argument, draft, research question, product idea, code plan, creative concept, or strategy."
      />
      <div className="check-entry-actions">
        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={(event) => void onFileChange(event.target.files?.[0] ?? null)}
        />
        <button type="button" className="check-secondary-button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          <FileUp size={15} />
          {attachedFileName ?? "Upload file"}
        </button>
        <button type="button" className="check-primary-button" onClick={onCreateSession} disabled={busy}>
          <Sparkles size={15} />
          Start Check
        </button>
      </div>
    </article>
  );
}

function RecommendationButton({
  recommendation,
  index,
  selected,
  curveball = false,
  onSelect,
}: {
  recommendation: CheckRecommendation;
  index: number | string;
  selected: boolean;
  curveball?: boolean;
  onSelect: (recommendation: CheckRecommendation) => void;
}) {
  return (
    <button
      type="button"
      className={`check-rec-card${selected ? " is-selected" : ""}${curveball ? " is-curveball" : ""}`}
      onClick={() => onSelect(recommendation)}
    >
      <span className="check-rec-index">{index}</span>
      <span className="check-rec-copy">
        <strong>{formatNodeKind(recommendation.slot)}</strong>
        <small>{recommendation.action}</small>
        <em>{recommendation.whyItMatters}</em>
      </span>
      <span className="check-effort">{recommendation.effort}</span>
    </button>
  );
}

function CheckNodeGroup({
  kind,
  nodes,
  selectedRecommendation,
}: {
  kind: CheckNodeKind;
  nodes: CheckProjectNode[];
  selectedRecommendation: CheckRecommendation | null;
}) {
  const visibleNodes = nodes.slice(0, 4);

  return (
    <section className="check-node-group">
      <header>
        <span>{formatNodeKind(kind)}</span>
        <strong>{nodes.length}</strong>
      </header>
      {visibleNodes.length ? (
        visibleNodes.map((node) => (
          <article
            key={node.id}
            className={`check-node-row${node.id === selectedRecommendation?.targetNodeId ? " is-targeted" : ""}`}
          >
            <strong>{node.title}</strong>
            <small>{node.body}</small>
          </article>
        ))
      ) : (
        <p>Empty</p>
      )}
    </section>
  );
}

function CheckRecentIdeas({
  documentsData,
  onSelectDocument,
}: {
  documentsData: BrainDocumentsData | null;
  onSelectDocument?: (sessionId: string) => void;
}) {
  const documents = documentsData?.documents.slice(0, 5) ?? [];

  return (
    <div className="check-recent-ideas">
      <span>Recent Brain docs</span>
      {documents.length ? (
        documents.map((document) => (
          <button key={document.id} type="button" onClick={() => onSelectDocument?.(document.sessionId)}>
            <strong>{document.title}</strong>
            <small>{document.counts.claims} claims</small>
          </button>
        ))
      ) : (
        <p>No saved ideas yet.</p>
      )}
    </div>
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

function groupNodesByKind(nodes: CheckProjectNode[]): Map<CheckNodeKind, CheckProjectNode[]> {
  const grouped = new Map<CheckNodeKind, CheckProjectNode[]>();

  for (const kind of CHECK_NODE_KINDS) {
    grouped.set(kind, []);
  }

  for (const node of nodes) {
    grouped.get(node.kind)?.push(node);
  }

  return grouped;
}

function formatNodeKind(kind: string): string {
  return kind
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fileKind(fileName: string): "text" | "pdf" | "slides" | "document" {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".pdf")) {
    return "pdf";
  }

  if (lower.endsWith(".ppt") || lower.endsWith(".pptx") || lower.endsWith(".key")) {
    return "slides";
  }

  if (lower.endsWith(".doc") || lower.endsWith(".docx")) {
    return "document";
  }

  return "text";
}
