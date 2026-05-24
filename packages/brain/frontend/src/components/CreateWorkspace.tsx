import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CheckCircle2, ChevronDown, ChevronRight, Download, Info, RefreshCcw, Sparkles, X } from "lucide-react";
import { compareCreateProviders, createNext, exportCodingPrompt, submitCreateExportFeedback } from "../api/brainClient";
import type {
  BrainData,
  BrainMemoryProfileData,
  CandidateOption,
  CanvasNode,
  CodingPromptArtifact,
  CreateExportFeedbackRating,
  CreateExportFeedbackReason,
  CreateObservability,
  CreateLens,
  CreateNextInput,
  CreateProviderComparisonResponse,
  JudgmentEvent,
  MemoryRef,
  NextBestMove,
  OptionSet,
  PromptExport,
  SourceRef,
  VerificationSummary,
} from "../types/brain";

interface CreateWorkspaceProps {
  data: BrainData | null;
  status: string;
  isThinking: boolean;
  brainProfile?: BrainMemoryProfileData | null | undefined;
  initialSeedText?: string | null;
  onInitialSeedConsumed?: () => void;
  onStatusChange?: (status: string) => void;
  onThinkingChange?: (isThinking: boolean) => void;
  onOpenBrain?: () => void;
  onLearnThis?: (node: CanvasNode) => void;
}

export const createLensOrder: CreateLens[] = ["Personal", "Practical", "Valuable", "Critical", "Weird"];
export const createLearnBridgeConcept = "Brain Ranker weights explicit judgment events over implicit behavior.";
export const CREATE_WORKSPACE_DRAFT_STORAGE_KEY = "penny.createWorkspaceDraft.v1";

const createPathSteps = ["Rough idea", "Five directions", "Judgment", "Idea Spec", "Verification", "Export"];
const ycFixtureLabels = [
  "Email fixture, not live Gmail",
  "LinkedIn-style context, not live LinkedIn",
  "Manual messages context for demo",
  "No live WhatsApp, iMessage, SMS, Slack, or social connectors",
  "Founder notes, manual/private",
  "trainingUse=false",
];
const ycArtifactOutlineTitles = [
  "Product thesis",
  "Target user",
  "Problem",
  "Why now",
  "Core loop",
  "Memory layer",
  "Create mode",
  "Learn bridge",
  "Data sources",
  "Moat",
  "Risks",
  "MVP scope",
  "Demo script",
  "Build prompt/export",
] as const;
const createExportFeedbackReasons: Array<{ reason: CreateExportFeedbackReason; label: string }> = [
  { reason: "strong_output", label: "Strong output" },
  { reason: "too_generic", label: "Too generic" },
  { reason: "too_complex", label: "Too complex" },
  { reason: "not_personal_enough", label: "Not personal enough" },
  { reason: "wrong_memory", label: "Wrong memory" },
  { reason: "missing_constraints", label: "Missing constraints" },
  { reason: "ready_to_ship", label: "Ready to ship" },
];

type PersistedCreateWorkspaceDraft = {
  version: 1;
  updatedAt: number;
  draftText: string;
  optionSet: OptionSet | null;
  selectedOptionIds: string[];
  rejectedOptionIds?: string[];
  userComment: string;
  artifact: CodingPromptArtifact | null;
  verification: VerificationSummary | null;
  judgmentEvent: JudgmentEvent | null;
  observability: CreateObservability | null;
  promptExport: PromptExport | null;
  localStatus: string;
};

export function clearCreateWorkspaceDraftStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(CREATE_WORKSPACE_DRAFT_STORAGE_KEY);
}

export function CreateWorkspace({
  data,
  status,
  isThinking,
  brainProfile,
  initialSeedText,
  onInitialSeedConsumed,
  onStatusChange,
  onThinkingChange,
  onOpenBrain,
  onLearnThis,
}: CreateWorkspaceProps) {
  const sourceText = initialSeedText?.trim() || data?.source?.rawText?.trim() || "";
  const [restoredDraft] = useState(() => readCreateWorkspaceDraft());
  const [draftText, setDraftText] = useState(restoredDraft?.draftText ?? sourceText);
  const [optionSet, setOptionSet] = useState<OptionSet | null>(restoredDraft?.optionSet ?? null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(restoredDraft?.selectedOptionIds ?? []);
  const [rejectedOptionIds, setRejectedOptionIds] = useState<string[]>(restoredDraft?.rejectedOptionIds ?? []);
  const [userComment, setUserComment] = useState(restoredDraft?.userComment ?? "");
  const [artifact, setArtifact] = useState<CodingPromptArtifact | null>(restoredDraft?.artifact ?? null);
  const [verification, setVerification] = useState<VerificationSummary | null>(restoredDraft?.verification ?? null);
  const [judgmentEvent, setJudgmentEvent] = useState<JudgmentEvent | null>(restoredDraft?.judgmentEvent ?? null);
  const [observability, setObservability] = useState<CreateObservability | null>(restoredDraft?.observability ?? null);
  const [providerComparison, setProviderComparison] = useState<CreateProviderComparisonResponse["data"] | null>(null);
  const [promptExport, setPromptExport] = useState<PromptExport | null>(restoredDraft?.promptExport ?? null);
  const [exportFeedbackRating, setExportFeedbackRating] = useState<CreateExportFeedbackRating | null>(null);
  const [exportFeedbackReasons, setExportFeedbackReasons] = useState<CreateExportFeedbackReason[]>([]);
  const [exportFeedbackComment, setExportFeedbackComment] = useState("");
  const [exportFeedbackStatus, setExportFeedbackStatus] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState(restoredDraft?.localStatus ?? "Create ready");
  const [failure, setFailure] = useState<string | null>(null);
  const seedRef = useRef<HTMLTextAreaElement | null>(null);
  const bootstrappedTextRef = useRef<string | null>(null);
  const restoredDraftRef = useRef(Boolean(restoredDraft));

  const busy = localBusy || isThinking;
  const displayStatus = busy ? "Thinking" : localStatus || status;
  const options = useMemo(() => sortCreateOptions(optionSet?.options ?? []), [optionSet]);
  const selectedOptions = useMemo(
    () => options.filter((option) => selectedOptionIds.includes(option.id)),
    [options, selectedOptionIds],
  );
  const canvasNodes = useMemo(
    () =>
      createCanvasNodes({
        brainProfile: brainProfile ?? null,
        options,
        selectedOptions,
        artifact,
        promptExport,
      }),
    [artifact, brainProfile, options, promptExport, selectedOptions],
  );
  const activeStepIndex = createActiveStepIndex({ optionSet, judgmentEvent, artifact, verification, promptExport });

  useEffect(() => {
    if (!sourceText || bootstrappedTextRef.current === sourceText) {
      return;
    }

    if (restoredDraftRef.current && restoredDraft?.draftText) {
      bootstrappedTextRef.current = sourceText;
      restoredDraftRef.current = false;
      onInitialSeedConsumed?.();
      return;
    }

    bootstrappedTextRef.current = sourceText;
    setDraftText(sourceText);
    onInitialSeedConsumed?.();
    void handleGenerateDirections(sourceText);
  }, [restoredDraft?.draftText, sourceText, onInitialSeedConsumed]);

  useEffect(() => {
    persistCreateWorkspaceDraft({
      version: 1,
      updatedAt: Date.now(),
      draftText,
      optionSet,
      selectedOptionIds,
      rejectedOptionIds,
      userComment,
      artifact,
      verification,
      judgmentEvent,
      observability,
      promptExport,
      localStatus,
    });
  }, [
    artifact,
    draftText,
    judgmentEvent,
    localStatus,
    observability,
    optionSet,
    promptExport,
    rejectedOptionIds,
    selectedOptionIds,
    userComment,
    verification,
  ]);

  function setStatus(nextStatus: string) {
    setLocalStatus(nextStatus);
    onStatusChange?.(nextStatus);
  }

  function setBusy(nextBusy: boolean) {
    setLocalBusy(nextBusy);
    onThinkingChange?.(nextBusy);
  }

  async function runCreateAction<T>(nextStatus: string, action: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setStatus(nextStatus);
    setFailure(null);

    try {
      return await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFailure(message);
      setStatus(message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateDirections(textOverride?: string) {
    const rawIdea = (textOverride ?? draftText).trim();

    if (!rawIdea) {
      setStatus("Write the rough idea first");
      seedRef.current?.focus();
      return;
    }

    await runCreateAction("Generating Create directions", async () => {
      const payload = await createNext(buildCreateNextInput({ rawIdea, data, brainProfile }));
      applyCreatePayload(payload.data);
      setSelectedOptionIds([]);
      setRejectedOptionIds([]);
      setUserComment("");
      setJudgmentEvent(null);
      setProviderComparison(null);
      setPromptExport(null);
      resetExportFeedback();
      setStatus("Create directions ready");
    });
  }

  async function handleUpdateArtifact() {
    const rawIdea = draftText.trim() || optionSet?.rawIdea.trim() || "";

    if (!rawIdea) {
      setStatus("Write the rough idea first");
      seedRef.current?.focus();
      return;
    }

    if (!optionSet) {
      await handleGenerateDirections(rawIdea);
      return;
    }

    if (!selectedOptionIds.length && !rejectedOptionIds.length && !userComment.trim()) {
      setStatus("Select, reject, or comment on at least one direction first");
      return;
    }

    await runCreateAction("Updating Idea Spec", async () => {
      const payload = await createNext(
        buildCreateNextInput({
          rawIdea,
          data,
          brainProfile,
          optionSet,
          selectedOptionIds,
          userComment: judgmentCommentWithRejected(userComment, rejectedOptionIds, options),
          artifact,
        }),
      );
      applyCreatePayload(payload.data);
      setPromptExport(null);
      resetExportFeedback();
      setStatus(payload.data.judgmentEvent ? "Judgment recorded; Idea Spec verified" : "Idea Spec verified");
    });
  }

  async function handleCompareProviders() {
    const rawIdea = draftText.trim() || optionSet?.rawIdea.trim() || "";

    if (!rawIdea) {
      setStatus("Write the rough idea first");
      seedRef.current?.focus();
      return;
    }

    await runCreateAction("Comparing deterministic and model-backed Create", async () => {
      const payload = await compareCreateProviders(buildCreateNextInput({ rawIdea, data, brainProfile }));
      setProviderComparison(payload.data);
      setStatus(
        payload.data.modelBacked.fallbackReason
          ? "Provider comparison ready with fallback"
          : "Provider comparison ready",
      );
    });
  }

  async function handleExportPrompt() {
    if (!artifact) {
      setStatus("Generate the Idea Spec before exporting");
      return;
    }

    await runCreateAction("Exporting coding-agent prompt", async () => {
      const exportInput = { artifact };

      if (verification) {
        Object.assign(exportInput, { verification });
      }

      if (judgmentEvent) {
        Object.assign(exportInput, { judgmentEvent });
      }

      const payload = await exportCodingPrompt(exportInput);
      setPromptExport(payload.data.export);
      resetExportFeedback();
      setStatus("Coding-agent prompt exported");
    });
  }

  async function handleSubmitExportFeedback() {
    if (!artifact || !promptExport) {
      setExportFeedbackStatus("Export the prompt first");
      return;
    }

    if (!exportFeedbackRating) {
      setExportFeedbackStatus("Choose useful or not useful first");
      return;
    }

    await runCreateAction("Saving export feedback", async () => {
      await submitCreateExportFeedback({
        projectId: artifact.projectId,
        sessionId: artifact.sessionId,
        artifactId: artifact.id,
        exportId: promptExport.id,
        rating: exportFeedbackRating,
        reasons: exportFeedbackReasons,
        comment: exportFeedbackComment,
        promptCompletenessScore: promptExport.qualitySignals.promptCompletenessScore,
      });
      setExportFeedbackStatus("Feedback saved");
      setStatus("Export feedback saved");
    });
  }

  function applyCreatePayload(payload: {
    optionSet: OptionSet;
    artifact: CodingPromptArtifact;
    verification: VerificationSummary;
    judgmentEvent: JudgmentEvent | null;
    observability?: CreateObservability;
  }) {
    setOptionSet(payload.optionSet);
    setArtifact(payload.artifact);
    setVerification(payload.verification);
    setJudgmentEvent(payload.judgmentEvent ?? judgmentEvent);
    setObservability(payload.observability ?? null);
  }

  function toggleOption(optionId: string) {
    setSelectedOptionIds((current) => {
      const isSelected = current.includes(optionId);

      if (!isSelected) {
        setRejectedOptionIds((rejected) => rejected.filter((id) => id !== optionId));
      }

      return isSelected ? current.filter((id) => id !== optionId) : [...current, optionId];
    });
  }

  function toggleRejectedOption(optionId: string) {
    setRejectedOptionIds((current) => {
      const isRejected = current.includes(optionId);

      if (!isRejected) {
        setSelectedOptionIds((selected) => selected.filter((id) => id !== optionId));
      }

      return isRejected ? current.filter((id) => id !== optionId) : [...current, optionId];
    });
  }

  function toggleExportFeedbackReason(reason: CreateExportFeedbackReason) {
    setExportFeedbackReasons((current) =>
      current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason],
    );
  }

  function resetExportFeedback() {
    setExportFeedbackRating(null);
    setExportFeedbackReasons([]);
    setExportFeedbackComment("");
    setExportFeedbackStatus(null);
  }

  return (
    <main className="check-workspace-shell" aria-label="Create workspace" data-testid="create-workspace">
      <CreatePathSidebar activeIndex={activeStepIndex} status={displayStatus} canvasNodes={canvasNodes} onOpenBrain={onOpenBrain} />

      <section className="check-center-stage" aria-label="Penny Create flow">
        <article className="check-main-cycle create-workspace-card">
          <header className="check-cycle-hero">
            <span>CREATE KERNEL</span>
            <h1>Five directions. One buildable spec.</h1>
            <p>Use Brain context, keep judgment human, and export the shape when it is ready.</p>
          </header>

          {failure ? <CreateFailurePanel failure={failure} onRetry={() => void handleGenerateDirections()} /> : null}

          <CreateBrainOnboardingPanel profile={brainProfile ?? null} />
          <CreateProviderStatusPanel observability={observability} />

          <section className="create-seed-panel" aria-label="Rough idea input">
            <label>
              <span>Rough idea</span>
              <textarea
                ref={seedRef}
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                placeholder="Sketch the product or feature you want Penny to turn into a buildable coding prompt."
              />
            </label>
            <button type="button" className="check-primary-button" onClick={() => void handleGenerateDirections()} disabled={busy}>
              <Sparkles size={15} />
              Show 5 directions
            </button>
          </section>

          <CreateOptionBoard
            options={options}
            nextBestMove={optionSet?.nextBestMove ?? null}
            selectedOptionIds={selectedOptionIds}
            rejectedOptionIds={rejectedOptionIds}
            busy={busy}
            onToggleOption={toggleOption}
            onRejectOption={toggleRejectedOption}
            onLearnThis={onLearnThis ? (option) => onLearnThis(buildCreateOptionLearnNode(option, artifact)) : undefined}
          />
          <CreateEvidenceLedgerPanel options={options} selectedOptionIds={selectedOptionIds} />

          <CreateLearnBridgePanel artifact={artifact} onLearnThis={onLearnThis} />

          {isCreateComparisonDevMode() ? (
            <CreateComparisonPanel comparison={providerComparison} busy={busy} onCompare={() => void handleCompareProviders()} />
          ) : null}

          <section className="create-judgment-panel" aria-label="Create judgment">
            <header>
              <span>Judgment</span>
              <strong>{selectedOptions.length ? selectedOptions.map((option) => option.lens).join(" + ") : "Select one or more cards"}</strong>
            </header>
            <CreateJudgmentNextPlace
              selectedOptions={selectedOptions}
              rejectedOptions={options.filter((option) => rejectedOptionIds.includes(option.id))}
              userComment={userComment}
              nextBestMove={optionSet?.nextBestMove ?? null}
              artifact={artifact}
              promptExport={promptExport}
            />
            <label>
              <span>Comment</span>
              <textarea
                value={userComment}
                onChange={(event) => setUserComment(event.target.value)}
                placeholder="Tell Penny what to keep, combine, cut, or sharpen."
              />
            </label>
            <div className="create-action-row">
              <button type="button" className="check-primary-button" onClick={() => void handleUpdateArtifact()} disabled={busy || !optionSet}>
                <CheckCircle2 size={15} />
                Update Idea Spec
              </button>
              {judgmentEvent ? <span>Judgment recorded</span> : null}
            </div>
          </section>

          <div className="create-output-grid">
            <CreateArtifactPanel artifact={artifact} selectedOptions={selectedOptions} userComment={userComment} />
            <CreateVerificationPanel verification={verification} />
          </div>

          <section className="create-export-panel" aria-label="Export coding prompt" data-testid="create-export-panel">
            <header>
              <span>Export</span>
              <strong>{promptExport ? promptExport.fileName : "Coding-agent prompt"}</strong>
            </header>
            <button type="button" className="check-primary-button" onClick={() => void handleExportPrompt()} disabled={busy || !artifact}>
              <Download size={15} />
              Export prompt
            </button>
            {promptExport ? (
              <textarea readOnly value={promptExport.text} aria-label="Exported coding-agent prompt" data-testid="create-export-prompt" />
            ) : null}
            <CreateExportFeedbackPanel
              artifact={artifact}
              promptExport={promptExport}
              busy={busy}
              rating={exportFeedbackRating}
              reasons={exportFeedbackReasons}
              comment={exportFeedbackComment}
              status={exportFeedbackStatus}
              onRatingChange={setExportFeedbackRating}
              onReasonToggle={toggleExportFeedbackReason}
              onCommentChange={setExportFeedbackComment}
              onSubmit={() => void handleSubmitExportFeedback()}
            />
          </section>
        </article>
      </section>
    </main>
  );
}

export function CreateLearnBridgePanel({
  artifact,
  onLearnThis,
}: {
  artifact: CodingPromptArtifact | null;
  onLearnThis?: ((node: CanvasNode) => void) | undefined;
}) {
  if (!onLearnThis) {
    return null;
  }

  return (
    <section className="create-learn-bridge-panel" aria-label="Create Learn bridge" data-testid="create-learn-bridge">
      <div>
        <span>Learn bridge</span>
        <strong>{createLearnBridgeConcept}</strong>
        <p>Explain simply. Show a worked example. Apply to my Idea Spec.</p>
      </div>
      <button
        type="button"
        className="check-secondary-button"
        data-testid="create-learn-this-button"
        onClick={() => onLearnThis(buildCreateLearnBridgeNode(artifact))}
      >
        <BookOpen size={15} />
        Learn this
      </button>
    </section>
  );
}

export function buildCreateLearnBridgeNode(artifact: CodingPromptArtifact | null): CanvasNode {
  const artifactTitle = artifact?.title ?? "the current Idea Spec";

  return {
    id: "create-learn:brain-ranker-judgment-events",
    kind: "concept",
    title: "Brain Ranker judgment weighting",
    summary: [
      createLearnBridgeConcept,
      "Explain simply: explicit selections, comments, and export feedback are stronger evidence than passive behavior.",
      "Show worked example: selecting Personal + Valuable + Critical should outweigh merely viewing Practical.",
      `Apply to my Idea Spec: use the recorded judgment to shape ${artifactTitle}.`,
    ].join(" "),
    ...(artifact ? { refs: { artifactId: artifact.id } } : {}),
    actions: ["learn", "check", "related"],
  };
}

export function CreateJudgmentNextPlace({
  selectedOptions,
  rejectedOptions,
  userComment,
  nextBestMove,
  artifact,
  promptExport,
}: {
  selectedOptions: CandidateOption[];
  rejectedOptions: CandidateOption[];
  userComment: string;
  nextBestMove?: NextBestMove | null;
  artifact: CodingPromptArtifact | null;
  promptExport?: PromptExport | null;
}) {
  const hasJudgment = selectedOptions.length || rejectedOptions.length || userComment.trim();
  const selectedLabel = selectedOptions.length ? selectedOptions.map((option) => option.lens).join(" + ") : "No selected cards yet";
  const rejectedLabel = rejectedOptions.length ? rejectedOptions.map((option) => option.lens).join(" + ") : "No rejected cards yet";
  const commentLabel = userComment.trim() ? clipDisplayText(userComment, 120) : "No comment yet";
  const nextPlace = createJudgmentNextPlaceCopy({ hasJudgment: Boolean(hasJudgment), artifact, promptExport, nextBestMove });

  return (
    <section className="create-judgment-next-place" aria-label="Next best place">
      <div>
        <span>Next place</span>
        <strong>{nextPlace.title}</strong>
        <p>{nextPlace.detail}</p>
      </div>
      <dl>
        <div>
          <dt>Selected</dt>
          <dd>{selectedLabel}</dd>
        </div>
        <div>
          <dt>Rejected</dt>
          <dd>{rejectedLabel}</dd>
        </div>
        <div>
          <dt>Comment</dt>
          <dd>{commentLabel}</dd>
        </div>
      </dl>
    </section>
  );
}

export function createJudgmentNextPlaceCopy({
  hasJudgment,
  artifact,
  promptExport,
  nextBestMove,
}: {
  hasJudgment: boolean;
  artifact: CodingPromptArtifact | null;
  promptExport?: PromptExport | null | undefined;
  nextBestMove?: NextBestMove | null | undefined;
}) {
  if (promptExport) {
    return {
      title: "Review the exported prompt",
      detail: "Rate it, tighten comments, or export again after one more judgment.",
    };
  }

  if (artifact) {
    return {
      title: "Learn a fuzzy point or export",
      detail: "The Idea Spec has your judgment. Use Learn this for confusion, or Export prompt when the structure is right.",
    };
  }

  if (hasJudgment) {
    return {
      title: "Record the first judgment into an Idea Spec",
      detail: "Selections, rejections, and notes will shape the Idea Spec.",
    };
  }

  return {
    title: nextBestMove?.title ?? "Pick the card with the most creative energy",
    detail: nextBestMove?.action ?? "Select, reject, or comment. The next step will stay visible without making one card the boss.",
  };
}

export function buildCreateOptionLearnNode(option: CandidateOption, artifact: CodingPromptArtifact | null): CanvasNode {
  const sourceLabels = uniqueById(option.sourcesUsed)
    .filter((source) => source.kind !== "rough_idea")
    .slice(0, 3)
    .map((source) => source.label);

  return {
    id: `create-option-learn:${option.id}`,
    kind: "concept",
    title: `${option.lens}: ${option.title}`,
    summary: [
      `What this option means: ${option.oneLine}`,
      `Why Penny suggested it: ${option.topReason} ${option.rationale}`,
      `Worked example: apply ${option.lens} by taking the next move "${option.nextMove}" and checking it against the Idea Spec.`,
      `Next smallest concept: understand how ${option.lens} changes the selected option mix without taking judgment away from the user.`,
      sourceLabels.length ? `Source evidence: ${sourceLabels.join(", ")}.` : "Source evidence: rough idea only.",
    ].join(" "),
    ...(artifact ? { refs: { artifactId: artifact.id } } : {}),
    actions: ["learn", "check", "related"],
  };
}

export function CreateExportFeedbackPanel({
  artifact,
  promptExport,
  busy,
  rating,
  reasons,
  comment,
  status,
  onRatingChange,
  onReasonToggle,
  onCommentChange,
  onSubmit,
}: {
  artifact: CodingPromptArtifact | null;
  promptExport: PromptExport | null;
  busy: boolean;
  rating: CreateExportFeedbackRating | null;
  reasons: CreateExportFeedbackReason[];
  comment: string;
  status: string | null;
  onRatingChange: (rating: CreateExportFeedbackRating) => void;
  onReasonToggle: (reason: CreateExportFeedbackReason) => void;
  onCommentChange: (comment: string) => void;
  onSubmit: () => void;
}) {
  if (!artifact || !promptExport) {
    return null;
  }

  return (
    <div className="create-export-feedback" aria-label="Export feedback">
      <div className="create-export-feedback-rating" role="group" aria-label="Export usefulness">
        <button
          type="button"
          className={rating === "useful" ? "is-selected" : ""}
          onClick={() => onRatingChange("useful")}
          disabled={busy}
        >
          <CheckCircle2 size={15} />
          Useful
        </button>
        <button
          type="button"
          className={rating === "not_useful" ? "is-selected" : ""}
          onClick={() => onRatingChange("not_useful")}
          disabled={busy}
        >
          <X size={15} />
          Not useful
        </button>
      </div>
      <div className="create-export-feedback-reasons" aria-label="Feedback reasons">
        {createExportFeedbackReasons.map((item) => (
          <label key={item.reason}>
            <input
              type="checkbox"
              checked={reasons.includes(item.reason)}
              onChange={() => onReasonToggle(item.reason)}
              disabled={busy}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      <label className="create-export-feedback-comment">
        <span>Note</span>
        <textarea
          value={comment}
          onChange={(event) => onCommentChange(event.target.value)}
          maxLength={1000}
          placeholder="What should change before the next export?"
          disabled={busy}
        />
      </label>
      <div className="create-action-row">
        <button type="button" className="check-secondary-button" onClick={onSubmit} disabled={busy || !rating}>
          Save feedback
        </button>
        {status ? <span>{status}</span> : null}
      </div>
    </div>
  );
}

export function CreatePathSidebar({
  activeIndex,
  status,
  canvasNodes,
  onOpenBrain,
}: {
  activeIndex: number;
  status: string;
  canvasNodes: CreateCanvasNode[];
  onOpenBrain?: (() => void) | undefined;
}) {
  return (
    <aside className="check-path-sidebar" aria-label="Create path">
      <div className="check-path-head">
        <div>
          <span>CREATE PATH</span>
          <strong>Idea Spec kernel</strong>
        </div>
        {onOpenBrain ? (
          <button type="button" className="check-ask-button" aria-label="Open Brain from Create" onClick={onOpenBrain}>
            Brain
          </button>
        ) : null}
      </div>

      <ol className="check-path-list">
        {createPathSteps.map((step, index) => (
          <li key={step} className={index === activeIndex ? "is-active" : ""}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </li>
        ))}
      </ol>

      <section className="check-thinking-graph" aria-label="Create graph">
        <div className="check-thinking-graph-head">
          <span>LOOP</span>
          <strong>Memory-native Create</strong>
        </div>
        <div className="check-thinking-graph-board">
          {createLensOrder.map((lens, index) => (
            <article key={lens} className={index + 1 <= activeIndex ? "is-active" : ""}>
              <span>{index + 1}</span>
              <strong>{lens}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="yc-demo-canvas" aria-label="YC demo Canvas" data-testid="yc-demo-canvas">
        <div className="check-thinking-graph-head">
          <span>Canvas</span>
          <strong>Visual outline</strong>
        </div>
        <p className="yc-demo-canvas-flow">Penny -&gt; Brain -&gt; Create -&gt; Learn -&gt; Export</p>
        <ol>
          {canvasNodes.map((node, index) => (
            <li key={node.id} data-edge-label={index < canvasNodes.length - 1 ? node.edgeToNext : undefined}>
              <strong>{node.label}</strong>
              <span>{node.detail}</span>
              {node.note ? <small>{node.note}</small> : null}
            </li>
          ))}
        </ol>
      </section>

      <div className="check-path-status">
        <span>Status</span>
        <strong>{status}</strong>
      </div>
    </aside>
  );
}

type CreateCanvasNode = {
  id: string;
  label: string;
  detail: string;
  note?: string;
  edgeToNext: string;
};

function createCanvasNodes(input: {
  brainProfile: BrainMemoryProfileData | null;
  options: CandidateOption[];
  selectedOptions: CandidateOption[];
  artifact: CodingPromptArtifact | null;
  promptExport: PromptExport | null;
}): CreateCanvasNode[] {
  const sourceLabels = input.brainProfile?.sources.slice(0, 4).map((source) => source.label).filter(Boolean) ?? [];
  const selectedLenses = input.selectedOptions.map((option) => option.lens);
  const generatedLenses = input.options.map((option) => option.lens);

  return [
    {
      id: "penny-workbench",
      label: "Penny",
      detail: "Memory-native creativity workbench",
      note: "Judgment stays human.",
      edgeToNext: "grounds",
    },
    {
      id: "brain-sources",
      label: "Brain",
      detail: sourceLabels.length
        ? `${input.brainProfile?.stats.memoryNodeCount ?? 0} memories from ${sourceLabels.join(", ")}`
        : "Context-light until Brain imports are attached",
      note: "Fixture/manual only.",
      edgeToNext: "suggests",
    },
    {
      id: "create-options",
      label: "Create",
      detail: selectedLenses.length
        ? `Selected ${selectedLenses.join(" + ")}`
        : generatedLenses.length
          ? `Generated ${generatedLenses.join(" / ")}`
          : "Waiting for five directions",
      note: "Five equal cards.",
      edgeToNext: "explains",
    },
    {
      id: "learn-explanation",
      label: "Learn",
      detail: createLearnBridgeConcept,
      note: "State stays put.",
      edgeToNext: "returns",
    },
    {
      id: "artifact-export",
      label: "Export",
      detail: input.promptExport?.fileName ?? input.artifact?.title ?? "Idea Spec not generated yet",
      note: "Spec plus evidence.",
      edgeToNext: "ships",
    },
  ];
}

function readCreateWorkspaceDraft(): PersistedCreateWorkspaceDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(CREATE_WORKSPACE_DRAFT_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isCreateWorkspaceDraft(parsed)) {
      window.localStorage.removeItem(CREATE_WORKSPACE_DRAFT_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(CREATE_WORKSPACE_DRAFT_STORAGE_KEY);
    return null;
  }
}

function persistCreateWorkspaceDraft(draft: PersistedCreateWorkspaceDraft): void {
  if (typeof window === "undefined") {
    return;
  }

  const hasCreateState =
    draft.draftText.trim() ||
    draft.optionSet ||
    draft.selectedOptionIds.length ||
    draft.userComment.trim() ||
    draft.artifact ||
    draft.promptExport;

  if (!hasCreateState) {
    window.localStorage.removeItem(CREATE_WORKSPACE_DRAFT_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(CREATE_WORKSPACE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

function isCreateWorkspaceDraft(value: unknown): value is PersistedCreateWorkspaceDraft {
  if (!isRecord(value) || value.version !== 1 || typeof value.updatedAt !== "number") {
    return false;
  }

  return (
    typeof value.draftText === "string" &&
    Array.isArray(value.selectedOptionIds) &&
    value.selectedOptionIds.every((optionId) => typeof optionId === "string") &&
    (value.rejectedOptionIds === undefined ||
      (Array.isArray(value.rejectedOptionIds) && value.rejectedOptionIds.every((optionId) => typeof optionId === "string"))) &&
    typeof value.userComment === "string" &&
    (value.optionSet === null || isRecord(value.optionSet)) &&
    (value.artifact === null || isRecord(value.artifact)) &&
    (value.verification === null || isRecord(value.verification)) &&
    (value.judgmentEvent === null || isRecord(value.judgmentEvent)) &&
    (value.observability === null || isRecord(value.observability)) &&
    (value.promptExport === null || isRecord(value.promptExport)) &&
    typeof value.localStatus === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function CreateBrainOnboardingPanel({ profile }: { profile: BrainMemoryProfileData | null }) {
  const memoryCount = profile?.stats.memoryNodeCount ?? 0;
  const sourceCount = profile?.stats.sourceCount ?? 0;
  const fixtureLabels = isYcFounderFixtureProfile(profile) ? ycFixtureLabels : [];
  const topSignals = profile && !fixtureLabels.length ? topBrainProfileSignals(profile).slice(0, 3).map((signal) => compactBrainSignal(signal)) : [];
  const sourceLabels = !fixtureLabels.length ? profile?.sources.slice(0, 3).map((source) => source.label) ?? [] : [];

  if (!memoryCount) {
    return (
      <section className="create-brain-panel is-context-light" aria-label="Create Brain context" data-testid="create-brain-context" data-create-context="context-light">
        <div>
          <span>Context-light</span>
          <strong>No imported Brain memories yet</strong>
        </div>
        <p>Using the rough idea for now.</p>
      </section>
    );
  }

  return (
    <section className="create-brain-panel is-using-brain" aria-label="Create Brain context" data-testid="create-brain-context" data-create-context="using-brain">
      <div>
        <span>Using your Brain</span>
        <strong>
          {memoryCount} memories · {sourceCount} sources
        </strong>
      </div>
      <ul>
        {topSignals.map((signal) => (
          <li key={signal}>{signal}</li>
        ))}
      </ul>
      {fixtureLabels.length ? (
        <div className="create-demo-fixture-labels" aria-label="YC fixture labels" data-testid="yc-fixture-labels">
          {fixtureLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      ) : null}
      {sourceLabels.length ? (
        <div className="create-demo-fixture-labels" aria-label="Brain source privacy">
          {sourceLabels.map((label) => (
            <span key={label} title={label}>
              {compactBrainSignal(label)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function CreateProviderStatusPanel({ observability }: { observability: CreateObservability | null }) {
  if (!observability) {
    return null;
  }

  return (
    <section className={`create-provider-status is-${observability.providerMode}`} aria-label="Create provider status">
      <div>
        <span>Provider</span>
        <strong>{providerModeLabel(observability.providerMode)}</strong>
      </div>
      <dl>
        <div>
          <dt>Schema</dt>
          <dd>{observability.schemaValidation}</dd>
        </div>
        <div>
          <dt>Memory</dt>
          <dd>{observability.memoryCountUsed}</dd>
        </div>
        <div>
          <dt>Sources</dt>
          <dd>{observability.sourceCountUsed}</dd>
        </div>
        <div>
          <dt>Prompt</dt>
          <dd>{observability.exportQualitySignals.promptCompletenessScore}%</dd>
        </div>
      </dl>
      {observability.fallbackReason ? <p>{observability.fallbackReason}</p> : null}
      {observability.schemaValidationErrors.length ? <p>{observability.schemaValidationErrors.join(" ")}</p> : null}
    </section>
  );
}

export function CreateComparisonPanel({
  comparison,
  busy,
  onCompare,
}: {
  comparison: CreateProviderComparisonResponse["data"] | null;
  busy: boolean;
  onCompare: () => void;
}) {
  return (
    <section className="create-comparison-panel" aria-label="Dev Create provider comparison">
      <header>
        <div>
          <span>DEV COMPARISON</span>
          <strong>Deterministic vs model-backed</strong>
        </div>
        <button type="button" className="check-secondary-button" onClick={onCompare} disabled={busy}>
          Compare providers
        </button>
      </header>
      {!comparison ? (
        <p className="create-panel-empty">
          Runs the same rough idea and Brain context through deterministic Create and the gated model-backed provider.
        </p>
      ) : (
        <div className="create-comparison-grid">
          <CreateComparisonArmPanel title="Deterministic" arm={comparison.deterministic} />
          <CreateComparisonArmPanel title="Model-backed" arm={comparison.modelBacked} />
        </div>
      )}
    </section>
  );
}

function CreateComparisonArmPanel({
  title,
  arm,
}: {
  title: string;
  arm: CreateProviderComparisonResponse["data"]["deterministic"];
}) {
  return (
    <article className={`create-comparison-arm is-${arm.providerUsed}`}>
      <header>
        <span>{title}</span>
        <strong>{providerModeLabel(arm.providerUsed)}</strong>
      </header>
      <dl>
        <div>
          <dt>Schema</dt>
          <dd>{arm.observability.schemaValidation}</dd>
        </div>
        <div>
          <dt>Memory</dt>
          <dd>{arm.observability.memoryCountUsed}</dd>
        </div>
        <div>
          <dt>Sources</dt>
          <dd>{arm.observability.sourceCountUsed}</dd>
        </div>
        <div>
          <dt>Prompt</dt>
          <dd>{arm.promptExport.qualitySignals.promptCompletenessScore}%</dd>
        </div>
      </dl>
      {arm.fallbackReason ? <p className="create-comparison-fallback">{arm.fallbackReason}</p> : null}
      <div className="create-comparison-scores" aria-label={`${title} verification scores`}>
        {Object.entries(arm.verification.scores).map(([key, score]) => (
          <span key={key}>
            {scoreLabel(key)} {score}
          </span>
        ))}
      </div>
      <div className="create-comparison-options">
        {sortCreateOptions(arm.optionSet.options).map((option) => (
          <section key={option.id}>
            <span>{option.lens}</span>
            <strong>{option.title}</strong>
            <p>{option.oneLine}</p>
          </section>
        ))}
      </div>
      <small>
        Missing prompt signals: {arm.promptExport.qualitySignals.missing.length ? arm.promptExport.qualitySignals.missing.join(", ") : "none"}
      </small>
    </article>
  );
}

export function CreateOptionBoard({
  options,
  nextBestMove,
  selectedOptionIds,
  rejectedOptionIds = [],
  busy,
  onToggleOption,
  onRejectOption,
  onLearnThis,
}: {
  options: CandidateOption[];
  nextBestMove?: NextBestMove | null;
  selectedOptionIds: string[];
  rejectedOptionIds?: string[];
  busy: boolean;
  onToggleOption: (optionId: string) => void;
  onRejectOption?: ((optionId: string) => void) | undefined;
  onLearnThis?: ((option: CandidateOption) => void) | undefined;
}) {
  const [detailOptionId, setDetailOptionId] = useState<string | null>(null);
  const activeDetailOption = detailOptionId ? options.find((option) => option.id === detailOptionId) ?? null : null;

  useEffect(() => {
    if (!options.length || (detailOptionId && !options.some((option) => option.id === detailOptionId))) {
      setDetailOptionId(null);
    }
  }, [detailOptionId, options]);

  if (!options.length) {
    return (
      <section className="create-option-board is-empty" aria-label="Create directions" data-testid="create-option-board">
        <header>
          <span>Directions</span>
          <strong>Personal / Practical / Valuable / Critical / Weird</strong>
        </header>
        <p>Write the rough idea, then generate five cards.</p>
      </section>
    );
  }

  return (
    <section className="create-option-board" aria-label="Create directions" data-testid="create-option-board">
      <header>
        <span>Directions</span>
        <strong>Five equal options</strong>
      </header>
      {nextBestMove ? (
        <section
          className={`create-next-best-move${nextBestMove.grounded ? " is-grounded" : " is-context-light"}`}
          title={nextBestMove.whyItMatters}
        >
          <span>Possible move</span>
          <strong>{nextBestMove.title}</strong>
          <p>{nextBestMove.action}</p>
        </section>
      ) : null}
      <div className="create-option-grid">
        {options.map((option) => {
          const selected = selectedOptionIds.includes(option.id);
          const rejected = rejectedOptionIds.includes(option.id);

          return (
            <article
              key={option.id}
              className={`create-option-card${selected ? " is-selected" : ""}${rejected ? " is-rejected" : ""}`}
              data-testid="create-option-card"
              data-create-lens={option.lens}
            >
              <button
                type="button"
                className="create-option-select-button"
                aria-pressed={selected}
                onClick={() => onToggleOption(option.id)}
                disabled={busy}
              >
                <span>{option.lens}</span>
                <strong>{option.title}</strong>
                <p>{option.oneLine}</p>
              </button>
              <div className="create-option-memory-meta" aria-label={`${option.lens} evidence and taste grounding`}>
                <span>Past evidence {createEvidenceCount(option)}</span>
                <span>Taste {createTasteCount(option)}</span>
                <span>{option.contextLabel}</span>
              </div>
              <div className="create-option-source-chips" aria-label={`${option.lens} source chips`}>
                {uniqueById(option.sourcesUsed)
                  .filter((source) => source.kind !== "rough_idea")
                  .slice(0, 3)
                  .map((source) => (
                    <span key={source.id} title={sourceChipTitle(source)}>
                      {sourceChipDisplayLabel(source)}
                    </span>
                  ))}
              </div>
              <div>
                <p>{option.topReason}</p>
                <small>{option.nextMove}</small>
              </div>
              <div className="create-option-judgment-state" aria-label={`${option.lens} judgment state`}>
                <span>{rejected ? "Rejected" : selected ? "Selected" : "Available"}</span>
              </div>
              <div className="create-option-card-actions">
                <button
                  type="button"
                  className="create-option-detail-button"
                  onClick={() => setDetailOptionId(option.id)}
                  data-testid="create-option-details-button"
                >
                  <Info size={14} />
                  Details
                </button>
                {onRejectOption ? (
                  <button
                    type="button"
                    className="create-option-detail-button"
                    aria-pressed={rejected}
                    onClick={() => onRejectOption(option.id)}
                    disabled={busy}
                    data-testid="create-option-reject-button"
                  >
                    <X size={14} />
                    Reject
                  </button>
                ) : null}
                {onLearnThis ? (
                  <button
                    type="button"
                    className="create-option-detail-button"
                    onClick={() => onLearnThis(option)}
                    data-testid="create-option-learn-this-button"
                  >
                    <BookOpen size={14} />
                    Learn this
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {activeDetailOption ? (
        <CreateOptionDetailsDrawer
          option={activeDetailOption}
          onClose={() => setDetailOptionId(null)}
          onLearnThis={onLearnThis}
        />
      ) : null}
    </section>
  );
}

type CreateEvidenceLedgerRow = {
  id: string;
  label: string;
  detail: string;
  lensLabels: string[];
};

export function CreateEvidenceLedgerPanel({
  options,
  selectedOptionIds,
}: {
  options: CandidateOption[];
  selectedOptionIds: string[];
}) {
  if (!options.length) {
    return null;
  }

  const selectedOptions = options.filter((option) => selectedOptionIds.includes(option.id));
  const visibleOptions = selectedOptions.length ? selectedOptions : options;
  const scopeLabel = selectedOptions.length
    ? `Selected ${selectedOptions.map((option) => option.lens).join(" + ")}`
    : "All five options before selection";
  const evidenceRows = createEvidenceLedgerRows(visibleOptions, "evidence");
  const tasteRows = createEvidenceLedgerRows(visibleOptions, "taste");

  return (
    <section className="create-evidence-ledger" aria-label="Create evidence visibility" data-testid="create-evidence-ledger">
      <header>
        <span>Evidence visibility</span>
        <strong>{scopeLabel}</strong>
      </header>
      <div className="create-evidence-ledger-grid">
        <CreateEvidenceLedgerColumn
          title="Evidence from past"
          emptyCopy="No imported evidence is attached to these cards yet."
          rows={evidenceRows}
        />
        <CreateEvidenceLedgerColumn
          title="Taste interpreted"
          emptyCopy="No explicit taste signal is attached to these cards yet."
          rows={tasteRows}
        />
      </div>
    </section>
  );
}

function CreateEvidenceLedgerColumn({
  title,
  emptyCopy,
  rows,
}: {
  title: string;
  emptyCopy: string;
  rows: CreateEvidenceLedgerRow[];
}) {
  return (
    <section aria-label={title}>
      <span>{title}</span>
      {rows.length ? (
        <ul>
          {rows.slice(0, 5).map((row) => (
            <li key={row.id}>
              <strong>{row.label}</strong>
              <p>{row.detail}</p>
              <small>{row.lensLabels.join(" + ")}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyCopy}</p>
      )}
    </section>
  );
}

function createEvidenceLedgerRows(options: CandidateOption[], kind: "evidence" | "taste"): CreateEvidenceLedgerRow[] {
  const rows = new Map<string, CreateEvidenceLedgerRow>();

  for (const option of options) {
    const refs =
      kind === "evidence"
        ? [
            ...option.memoryUsed
              .filter((memory) => memory.kind !== "preference")
              .map((memory) => ({ id: `memory:${memory.id}`, label: memory.label, detail: memory.summary })),
            ...option.sourcesUsed
              .filter((source) => source.kind !== "rough_idea")
              .map((source) => ({
                id: `source:${source.id}`,
                label: source.label,
                detail: [source.excerpt, source.sourceRange].filter(Boolean).join(" "),
              })),
          ]
        : option.memoryUsed
            .filter((memory) => memory.kind === "preference")
            .map((memory) => ({ id: `taste:${memory.id}`, label: memory.label, detail: memory.summary }));

    for (const ref of refs) {
      const existing = rows.get(ref.id);

      if (existing) {
        if (!existing.lensLabels.includes(option.lens)) {
          existing.lensLabels.push(option.lens);
        }
        continue;
      }

      rows.set(ref.id, {
        id: ref.id,
        label: ref.label,
        detail: ref.detail,
        lensLabels: [option.lens],
      });
    }
  }

  return [...rows.values()];
}

export function CreateOptionDetailsDrawer({
  option,
  onClose,
  onLearnThis,
}: {
  option: CandidateOption;
  onClose: () => void;
  onLearnThis?: ((option: CandidateOption) => void) | undefined;
}) {
  const sourceRefs = uniqueById(option.sourcesUsed);
  const memoryRefs = uniqueById(option.memoryUsed);
  const tasteRefs = memoryRefs.filter((memory) => memory.kind === "preference");
  const evidenceRefs = memoryRefs.filter((memory) => memory.kind !== "preference");
  const importedSourceRefs = sourceRefs.filter((source) => source.kind === "source");
  const roughIdeaRefs = sourceRefs.filter((source) => source.kind === "rough_idea");
  const safeFixtureSourceNote =
    importedSourceRefs.length > 0 && importedSourceRefs.every((source) => isSafeFixtureManualSourceRef(source));
  const groundedClaims = [
    ...evidenceRefs.map((memory) => memory.summary),
    ...importedSourceRefs.map((source) => source.excerpt),
  ].filter(Boolean);
  const inferredClaims = [...tasteRefs.map((memory) => memory.summary), option.rationale, ...option.risks].filter(Boolean);

  return (
    <aside
      className="create-option-detail-drawer"
      aria-label={`${option.lens} option details`}
      data-testid="create-evidence-drawer"
      data-create-lens={option.lens}
    >
      <header>
        <div>
          <span>{option.lens} details</span>
          <strong>{option.title}</strong>
        </div>
        <div className="create-option-detail-actions">
          {onLearnThis ? (
            <button type="button" onClick={() => onLearnThis(option)} data-testid="create-detail-learn-this-button">
              <BookOpen size={15} />
              Learn this
            </button>
          ) : null}
          <button type="button" onClick={onClose} aria-label="Close option details">
            <X size={16} />
          </button>
        </div>
      </header>

      <section>
        <span>Why suggested</span>
        <p>{option.topReason}</p>
        <p>{option.rationale}</p>
        <small>{option.nextMove}</small>
      </section>

      <section>
        <span>Rank reasons</span>
        <ul>
          {(option.rankReasons.length ? option.rankReasons : [option.topReason]).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <small>{option.contextLabel}</small>
      </section>

      <section>
        <span>Evidence used (provenance)</span>
        {safeFixtureSourceNote ? (
          <small>
            Fixture/manual source evidence only. trainingUse=false; no live Gmail, LinkedIn, WhatsApp, iMessage, SMS,
            Slack, social, or OAuth access is claimed.
          </small>
        ) : null}
        {evidenceRefs.length || importedSourceRefs.length ? (
          <ul>
            {evidenceRefs.map((memory) => (
              <li key={memory.id}>
                <strong>{memory.label}</strong>
                <p>{memory.summary}</p>
              </li>
            ))}
            {importedSourceRefs.map((source) => (
              <li key={source.id}>
                <strong>{source.label}</strong>
                <p>{source.excerpt}</p>
                {source.sourceRange ? <small>{source.sourceRange}</small> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>Context-light: no concrete imported evidence matched this direction.</p>
        )}
        {roughIdeaRefs.length ? (
          <div className="create-option-seed-grounding">
            <strong>Seed thought</strong>
            {roughIdeaRefs.map((source) => (
              <p key={source.id}>{source.excerpt}</p>
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <span>Taste interpreted (pattern)</span>
        {tasteRefs.length ? (
          <ul>
            {tasteRefs.map((memory) => (
              <li key={memory.id}>
                <strong>{memory.label}</strong>
                <p>{memory.summary}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No explicit taste memory was used; this direction is inferred from the rough idea and available context.</p>
        )}
      </section>

      <section className="create-option-claim-grounding">
        <span>Grounding</span>
        <div>
          <strong>Grounded</strong>
          {groundedClaims.length ? (
            <ul>
              {groundedClaims.slice(0, 4).map((claim) => (
                <li key={claim}>{claim}</li>
              ))}
            </ul>
          ) : (
            <p>Only the rough idea is grounded.</p>
          )}
        </div>
        <div>
          <strong>Inferred</strong>
          <ul>
            {inferredClaims.slice(0, 4).map((claim) => (
              <li key={claim}>{claim}</li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <span>Uncertainty</span>
        <ul>
          {(option.uncertainty.length ? option.uncertainty : ["No major missing Brain context detected for this lens."]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

export function CreateArtifactPanel({
  artifact,
  selectedOptions = [],
  userComment = "",
}: {
  artifact: CodingPromptArtifact | null;
  selectedOptions?: CandidateOption[];
  userComment?: string;
}) {
  const [expandedSectionIds, setExpandedSectionIds] = useState<string[]>([]);
  const [refinedSectionIds, setRefinedSectionIds] = useState<string[]>([]);
  const [commentSectionIds, setCommentSectionIds] = useState<string[]>([]);
  const [fullSectionsVisible, setFullSectionsVisible] = useState(false);
  const [sectionComments, setSectionComments] = useState<Record<string, string>>({});

  if (!artifact) {
    return (
      <section className="create-artifact-panel" aria-label="Idea Spec" data-testid="create-artifact-panel">
        <header>
          <span>Idea Spec</span>
          <strong>Waiting for Create directions</strong>
        </header>
        <p className="create-panel-empty">Generate directions to start the living Idea Spec.</p>
      </section>
    );
  }

  const selectedLensLabel = selectedOptions.length ? selectedOptions.map((option) => option.lens).join(" + ") : "the current selected option mix";
  const artifactEvidenceCount = createEvidenceLedgerRows(selectedOptions, "evidence").length;
  const artifactTasteCount = createEvidenceLedgerRows(selectedOptions, "taste").length;

  function toggleValue(values: string[], value: string): string[] {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  }

  return (
    <section className="create-artifact-panel" aria-label="Idea Spec" data-testid="create-artifact-panel">
      <header>
        <span>Idea Spec v{artifact.version}</span>
        <strong>{artifact.title}</strong>
      </header>
      {selectedOptions.length ? (
        <div className="create-artifact-selected-lenses" aria-label="Selected Create directions">
          {selectedOptions.map((option) => (
            <span key={option.id}>{option.lens}</span>
          ))}
        </div>
      ) : null}
      <div className="create-artifact-inputs" aria-label="Idea Spec inputs">
        <article>
          <span>Seed thought</span>
          <p>{clipDisplayText(artifact.rawIdea, 140)}</p>
        </article>
        <article>
          <span>Selected history</span>
          <p>{selectedOptions.length ? selectedLensLabel : "No selected option history recorded yet."}</p>
        </article>
        <article>
          <span>User comment</span>
          <p>{userComment.trim() ? clipDisplayText(userComment, 140) : "No user comment recorded yet."}</p>
        </article>
        <article>
          <span>Grounding</span>
          <p>
            {artifactEvidenceCount} past evidence refs · {artifactTasteCount} taste signals kept separate.
          </p>
        </article>
      </div>
      <div className="yc-artifact-outline" aria-label="YC artifact outline" data-testid="yc-artifact-outline">
        {ycArtifactOutline(artifact).map((section) => {
          const expanded = expandedSectionIds.includes(section.title);

          return (
            <article key={section.title} className={section.status === "updated" ? "is-updated" : ""} data-testid="yc-artifact-section">
              <div className="yc-artifact-section-head">
                <div>
                  <span>{section.title}</span>
                  <p className="yc-artifact-section-preview">{artifactOutlinePreview(section.body)}</p>
                </div>
                <button
                  type="button"
                  className="yc-artifact-section-toggle"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${section.title}`}
                  title={expanded ? "Collapse section" : "Expand section"}
                  onClick={() => setExpandedSectionIds((current) => toggleValue(current, section.title))}
                >
                  {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
              </div>
              {expanded ? (
                <div className="yc-artifact-section-expanded">
                  <p className="yc-artifact-section-body">{section.body}</p>
                  <div className="yc-artifact-section-actions" aria-label={`${section.title} section actions`}>
                    <button type="button" onClick={() => setRefinedSectionIds((current) => toggleValue(current, section.title))}>
                      Use selected mix
                    </button>
                    <button type="button" onClick={() => setCommentSectionIds((current) => toggleValue(current, section.title))}>
                      Add comment
                    </button>
                  </div>
                  <p className="yc-artifact-section-note">
                    Expanded demo note: keep {section.title.toLowerCase()} tied to {selectedLensLabel}, source evidence, and the current rough idea.
                  </p>
                  {refinedSectionIds.includes(section.title) ? (
                    <p className="yc-artifact-section-note">
                      Selected mix applied: {selectedLensLabel} is now the working pressure for this section.
                    </p>
                  ) : null}
                  {commentSectionIds.includes(section.title) ? (
                    <label className="yc-artifact-section-comment">
                      <span>Section comment</span>
                      <textarea
                        value={sectionComments[section.title] ?? ""}
                        onChange={(event) =>
                          setSectionComments((current) => ({
                            ...current,
                            [section.title]: event.target.value,
                          }))
                        }
                        placeholder={`Add a note for ${section.title.toLowerCase()}.`}
                        rows={2}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      <div className="create-artifact-full-toggle">
        <button type="button" onClick={() => setFullSectionsVisible((visible) => !visible)}>
          {fullSectionsVisible ? "Hide full section text" : "Show full section text"}
        </button>
        <span>{artifact.sections.length} sections available</span>
      </div>
      {fullSectionsVisible ? (
        <div className="create-artifact-sections">
          {artifact.sections.map((section) => (
            <article key={section.id} className={section.status === "updated" ? "is-updated" : ""}>
              <span>{section.title}</span>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function artifactOutlinePreview(body: string): string {
  const userComment = body.match(/\bUser comment:\s*([^\n]+)/i)?.[1]?.trim();

  if (userComment && !/^no user comment supplied\.?$/i.test(userComment)) {
    return clipDisplayText(`User comment: ${userComment}`, 150);
  }

  return clipDisplayText(stripArtifactPreviewMarkup(body), 150);
}

function stripArtifactPreviewMarkup(body: string): string {
  return body
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/`{1,3}/g, "")
    .trim();
}

export function CreateVerificationPanel({ verification }: { verification: VerificationSummary | null }) {
  if (!verification) {
    return (
      <section className="create-verification-panel" aria-label="Verification summary">
        <header>
          <span>Verification</span>
          <strong>Waiting on Idea Spec</strong>
        </header>
        <p className="create-panel-empty">Verification will check intent, buildability, grounding, generic risk, missing info, and risks.</p>
      </section>
    );
  }

  return (
    <section className="create-verification-panel" aria-label="Verification summary">
      <header>
        <span>Verification</span>
        <strong>{verification.verdict === "ready" ? "Ready" : "Needs revision"}</strong>
      </header>
      <div className="create-verification-list">
        {verification.checks.map((check) => (
          <article key={check.key} className={`is-${check.status}`}>
            <span>{check.status}</span>
            <strong>{check.label}</strong>
            <p>{check.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CreateFailurePanel({ failure, onRetry }: { failure: string; onRetry: () => void }) {
  return (
    <section className="check-ai-failure" aria-label="Create failure">
      <div>
        <span>Create needs attention</span>
        <strong>{failure}</strong>
      </div>
      <div>
        <button type="button" className="check-secondary-button" onClick={onRetry}>
          <RefreshCcw size={15} />
          Retry
        </button>
      </div>
    </section>
  );
}

export function buildCreateNextInput(input: {
  rawIdea: string;
  data: BrainData | null;
  brainProfile?: BrainMemoryProfileData | null | undefined;
  optionSet?: OptionSet | null;
  selectedOptionIds?: string[];
  userComment?: string;
  artifact?: CodingPromptArtifact | null;
}): CreateNextInput {
  const body: CreateNextInput = { rawIdea: input.rawIdea };
  const context = createContextFromData(input.data);
  const brainContext = createBrainProfileCreateContext(input.brainProfile ?? null);
  const sessionId = input.optionSet?.sessionId ?? input.artifact?.sessionId ?? input.data?.session?.id ?? null;
  const projectId = input.optionSet?.projectId ?? input.artifact?.projectId ?? null;

  if (projectId) {
    body.projectId = projectId;
  }

  if (sessionId) {
    body.sessionId = sessionId;
  }

  if (input.optionSet?.id) {
    body.optionSetId = input.optionSet.id;
  }

  if (input.selectedOptionIds?.length) {
    body.selectedOptionIds = input.selectedOptionIds;
  }

  if (input.userComment?.trim()) {
    body.userComment = input.userComment.trim();
  }

  if (input.artifact) {
    body.artifact = input.artifact;
  }

  if (brainContext.memory.length) {
    body.memory = brainContext.memory;
  }

  if (brainContext.sources.length) {
    body.sources = brainContext.sources;
  }

  if (context) {
    body.context = {
      ...context,
      ...(brainContext.summary
        ? { summary: [context.summary, brainContext.summary].filter(Boolean).join(" ") }
        : context.summary
          ? { summary: context.summary }
          : {}),
    };
  } else if (brainContext.summary) {
    body.context = { summary: brainContext.summary };
  }

  return body;
}

function createContextFromData(data: BrainData | null): CreateNextInput["context"] | undefined {
  if (!data) {
    return undefined;
  }

  const context: NonNullable<CreateNextInput["context"]> = {};
  const summary = data.ideaMap?.keyInsight?.trim();
  const activeClaim = data.ideaMap?.claims?.[0]?.text?.trim();
  const sourceText = data.source?.rawText?.trim();

  if (summary) {
    context.summary = summary;
  }

  if (activeClaim) {
    context.activeClaim = activeClaim;
  }

  if (sourceText) {
    context.sourceText = sourceText;
  }

  return Object.keys(context).length ? context : undefined;
}

function createBrainProfileCreateContext(profile: BrainMemoryProfileData | null): {
  summary: string | null;
  memory: MemoryRef[];
  sources: SourceRef[];
} {
  if (!profile || profile.stats.memoryNodeCount === 0) {
    return { summary: null, memory: [], sources: [] };
  }

  const topSignals = topBrainProfileSignals(profile).slice(0, 3);
  const summary = [
    `Using imported Brain context with ${profile.stats.memoryNodeCount} memories from ${profile.stats.sourceCount} sources.`,
    topSignals.length ? `Top profile signals: ${topSignals.join("; ")}.` : profile.profile.privacySafeSummary,
  ].join(" ");
  const memory = profile.recentMemoryNodes.slice(0, 6).map<MemoryRef>((node) => ({
    id: node.id,
    label: node.title,
    kind: memoryKindFromNodeType(node.type),
    summary: node.summary,
  }));
  const sources = profile.sources.slice(0, 6).map<SourceRef>((source) => ({
    id: source.id,
    label: source.label,
    kind: "source",
    excerpt: `${sourceImportEvidenceLabel(source.kind)} with ${source.memoryNodeCount} memories and ${source.chunkCount} chunks.`,
    sourceRange: source.fileName ?? `source ${source.id.slice(0, 8)}`,
  }));

  return { summary, memory, sources };
}

export function topBrainProfileSignals(profile: BrainMemoryProfileData): string[] {
  return uniqueStrings([
    ...profile.profile.preferredBuildStyle.map((signal) => signal.label),
    ...profile.profile.tasteSignals.map((signal) => signal.label),
    ...profile.profile.recurringInterests.map((signal) => signal.label),
    ...profile.profile.activeIdeaClusters.map((signal) => signal.label),
    ...profile.profile.commonFrustrations.map((signal) => signal.label),
    ...(profile.profile.repeatedRejectedDirections ?? []).map((signal) => signal.label),
    ...profile.recentMemoryNodes
      .filter((node) => node.type === "preference" || node.type === "project" || node.type === "goal")
      .map((node) => node.title),
  ]);
}

function memoryKindFromNodeType(type: BrainMemoryProfileData["recentMemoryNodes"][number]["type"]): MemoryRef["kind"] {
  if (type === "preference") {
    return "preference";
  }

  if (type === "source_fact") {
    return "context";
  }

  return "brain";
}

function sourceImportEvidenceLabel(kind: string): string {
  switch (kind) {
    case "email_fixture":
      return "Email fixture: safe demo data; no Gmail OAuth; trainingUse=false.";
    case "linkedin_context":
      return "LinkedIn-style context: fixture only; no OAuth; trainingUse=false.";
    case "manual_messages_transcript":
      return "Manual messages context for demo: pasted demo text; no live WhatsApp, iMessage, SMS, Slack, or social connectors; trainingUse=false.";
    case "founder_notes":
      return "Founder notes: manual private source; trainingUse=false.";
    default:
      return `Private Brain source (${kind}).`;
  }
}

export function isCreateComparisonDevMode(env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env): boolean {
  return env?.DEV === true || env?.MODE === "test" || env?.VITE_PENNY_CREATE_COMPARE === "true";
}

function providerModeLabel(mode: CreateObservability["providerMode"]): string {
  switch (mode) {
    case "model_backed":
      return "Model-backed";
    case "deterministic_fallback":
      return "Fallback";
    case "deterministic":
      return "Deterministic";
  }
}

function scoreLabel(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase());
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = value.replace(/\s+/g, " ").trim();
    const key = cleaned.toLowerCase();

    if (!cleaned || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function isYcFounderFixtureProfile(profile: BrainMemoryProfileData | null): boolean {
  if (!profile) {
    return false;
  }

  const haystack = [
    ...profile.sources.map((source) => `${source.label} ${source.fileName ?? ""}`),
    ...profile.recentMemoryNodes.map((node) => `${node.title} ${node.summary}`),
  ].join(" ");

  return /penny-yc-founder-fixture|Email fixture|LinkedIn-style founder context|Manual WhatsApp-style transcript|Manual messages transcript|Manual messages context for demo|Founder notes/i.test(haystack);
}

function sourceChipDisplayLabel(source: SourceRef): string {
  const haystack = sourceRefText(source);

  if (/manual messages context|manual messages transcript|whatsapp-style transcript/i.test(haystack)) {
    return "Manual messages context";
  }

  if (/email fixture|gmail-style/i.test(haystack)) {
    return "Email fixture";
  }

  if (/linkedin-style/i.test(haystack)) {
    return "LinkedIn-style fixture";
  }

  if (/founder notes/i.test(haystack)) {
    return "Founder notes";
  }

  return source.label;
}

function sourceChipTitle(source: SourceRef): string {
  return [source.label, source.excerpt, source.sourceRange].filter(Boolean).join(" - ");
}

function isSafeFixtureManualSourceRef(source: SourceRef): boolean {
  return /email fixture|linkedin-style|manual messages context|manual messages transcript|whatsapp-style transcript|founder notes|safe demo data|fixture only|pasted demo text/i.test(
    sourceRefText(source),
  );
}

function sourceRefText(source: SourceRef): string {
  return [source.label, source.excerpt, source.sourceRange].filter(Boolean).join(" ");
}

function ycArtifactOutline(artifact: CodingPromptArtifact): Array<{
  title: (typeof ycArtifactOutlineTitles)[number];
  body: string;
  status: "ready" | "updated" | "needs_input";
}> {
  const section = (title: string): string => artifact.sections.find((item) => item.title === title)?.body ?? "";
  const userIntent = section("User intent");
  const memoryOrchestration = section("AI/memory orchestration");
  const selectedText = selectedArtifactText(userIntent);
  const userJudgment = userJudgmentText(userIntent);
  const dataSources = namedBlock(userIntent, "Personal context used") || namedBlock(memoryOrchestration, "Personal context used in this artifact") || memoryOrchestration;
  const updated = artifact.sections.some((item) => item.status === "updated");
  const status = updated ? "updated" : "ready";

  return [
    {
      title: "Product thesis",
      body: clipDisplayText(
        [section("Product goal"), userJudgment ? `User comment: ${userJudgment}` : "", selectedText].filter(Boolean).join("\n\n"),
        560,
      ),
      status,
    },
    {
      title: "Target user",
      body: section("Target user"),
      status,
    },
    {
      title: "Problem",
      body: "Founders and builders reach coding agents with vague ideas before the thinking has become explicit enough to implement.",
      status,
    },
    {
      title: "Why now",
      body: "Coding agents make building faster, so the bottleneck moves upstream to context, assumptions, judgment, and spec quality.",
      status,
    },
    {
      title: "Core loop",
      body: section("Core loop"),
      status,
    },
    {
      title: "Memory layer",
      body: clipDisplayText(memoryOrchestration, 560),
      status,
    },
    {
      title: "Create mode",
      body: clipDisplayText(section("UX requirements"), 420),
      status,
    },
    {
      title: "Learn bridge",
      body: `${createLearnBridgeConcept} Learn explains simply, shows a worked example, and applies the concept back to this Idea Spec.`,
      status,
    },
    {
      title: "Data sources",
      body: clipDisplayText(dataSources, 560),
      status,
    },
    {
      title: "Moat",
      body: "Reusable memory, explicit human judgment, and rejected-direction history make Penny more than a generic prompt or chatbot wrapper.",
      status,
    },
    {
      title: "Risks",
      body: clipDisplayText(section("Verification constraints"), 420),
      status,
    },
    {
      title: "MVP scope",
      body: clipDisplayText(`${section("Implementation plan")}\n\n${section("Do-not-break list")}`, 560),
      status,
    },
    {
      title: "Demo script",
      body: "Landing -> Create -> fixture-backed Create -> evidence drawer -> Personal + Valuable + Critical judgment -> Idea Spec -> Learn this -> Back to Create -> Canvas -> Export.",
      status,
    },
    {
      title: "Build prompt/export",
      body: clipDisplayText(
        section("Final coding-agent prompt") || "Export prompt turns this Idea Spec into a copyable coding-agent spec.",
        520,
      ),
      status,
    },
  ];
}

function selectedArtifactText(userIntent: string): string {
  return namedBlock(userIntent, "Selected option history") || "No selected Create directions yet.";
}

function userJudgmentText(userIntent: string): string {
  return userIntent.match(/\bUser judgment\/comment:\s*([^\n]+)/i)?.[1]?.trim() ?? "";
}

function clipDisplayText(text: string, maxLength: number): string {
  const clean = text.replace(/\s+/g, " ").trim();

  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function compactBrainSignal(signal: string): string {
  const clean = signal.replace(/\s+/g, " ").trim();
  const withoutPrefix = clean.includes(" - ") ? clean.split(" - ").pop() ?? clean : clean;

  return clipDisplayText(withoutPrefix, 44);
}

function namedBlock(text: string, label: string): string {
  const start = text.toLowerCase().indexOf(`${label.toLowerCase()}:`);

  if (start < 0) {
    return "";
  }

  const bodyStart = start + label.length + 1;
  const rest = text.slice(bodyStart).trim();
  const nextHeading = rest.search(/\n\n[A-Z][A-Za-z /-]+:\n/u);

  return (nextHeading >= 0 ? rest.slice(0, nextHeading) : rest).trim();
}

function sortCreateOptions(options: CandidateOption[]): CandidateOption[] {
  return [...options].sort((left, right) => createLensOrder.indexOf(left.lens) - createLensOrder.indexOf(right.lens));
}

function createEvidenceCount(option: CandidateOption): number {
  return uniqueById([
    ...option.memoryUsed.filter((memory) => memory.kind !== "preference"),
    ...option.sourcesUsed.filter((source) => source.kind !== "rough_idea"),
  ]).length;
}

function createTasteCount(option: CandidateOption): number {
  return uniqueById(option.memoryUsed.filter((memory) => memory.kind === "preference")).length;
}

function judgmentCommentWithRejected(comment: string, rejectedOptionIds: string[], options: CandidateOption[]): string {
  const rejectedLenses = options.filter((option) => rejectedOptionIds.includes(option.id)).map((option) => option.lens);
  const cleanComment = comment.trim();

  if (!rejectedLenses.length) {
    return cleanComment;
  }

  return [cleanComment, `Rejected directions: ${rejectedLenses.join(", ")}.`].filter(Boolean).join("\n\n");
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    if (seen.has(value.id)) {
      continue;
    }

    seen.add(value.id);
    result.push(value);
  }

  return result;
}

function createActiveStepIndex(input: {
  optionSet: OptionSet | null;
  judgmentEvent: JudgmentEvent | null;
  artifact: CodingPromptArtifact | null;
  verification: VerificationSummary | null;
  promptExport: PromptExport | null;
}): number {
  if (input.promptExport) {
    return 5;
  }

  if (input.judgmentEvent && input.verification) {
    return 4;
  }

  if (input.judgmentEvent && input.artifact) {
    return 3;
  }

  if (input.judgmentEvent) {
    return 2;
  }

  if (input.optionSet) {
    return 1;
  }

  return 0;
}
