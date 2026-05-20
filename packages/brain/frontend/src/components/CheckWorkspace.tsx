import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, Info, RefreshCcw, Sparkles, X } from "lucide-react";
import { compareCreateProviders, createNext, exportCodingPrompt, submitCreateExportFeedback } from "../api/brainClient";
import type {
  BrainData,
  BrainMemoryProfileData,
  CandidateOption,
  CodingPromptArtifact,
  CreateExportFeedbackRating,
  CreateExportFeedbackReason,
  CreateObservability,
  CreateLens,
  CreateNextInput,
  CreateProviderComparisonResponse,
  JudgmentEvent,
  MemoryRef,
  OptionSet,
  PromptExport,
  SourceRef,
  VerificationSummary,
} from "../types/brain";

interface CheckWorkspaceProps {
  data: BrainData | null;
  status: string;
  isThinking: boolean;
  brainProfile?: BrainMemoryProfileData | null | undefined;
  initialSeedText?: string | null;
  onInitialSeedConsumed?: () => void;
  onStatusChange?: (status: string) => void;
  onThinkingChange?: (isThinking: boolean) => void;
  onOpenBrain?: () => void;
}

export const createLensOrder: CreateLens[] = ["Personal", "Practical", "Valuable", "Critical", "Weird"];

const createPathSteps = ["Rough idea", "Five directions", "Judgment", "Prompt artifact", "Verification", "Export"];
const createExportFeedbackReasons: Array<{ reason: CreateExportFeedbackReason; label: string }> = [
  { reason: "strong_output", label: "Strong output" },
  { reason: "too_generic", label: "Too generic" },
  { reason: "too_complex", label: "Too complex" },
  { reason: "not_personal_enough", label: "Not personal enough" },
  { reason: "wrong_memory", label: "Wrong memory" },
  { reason: "missing_constraints", label: "Missing constraints" },
  { reason: "ready_to_ship", label: "Ready to ship" },
];

export function CheckWorkspace({
  data,
  status,
  isThinking,
  brainProfile,
  initialSeedText,
  onInitialSeedConsumed,
  onStatusChange,
  onThinkingChange,
  onOpenBrain,
}: CheckWorkspaceProps) {
  const sourceText = initialSeedText?.trim() || data?.source?.rawText?.trim() || "";
  const [draftText, setDraftText] = useState(sourceText);
  const [optionSet, setOptionSet] = useState<OptionSet | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [userComment, setUserComment] = useState("");
  const [artifact, setArtifact] = useState<CodingPromptArtifact | null>(null);
  const [verification, setVerification] = useState<VerificationSummary | null>(null);
  const [judgmentEvent, setJudgmentEvent] = useState<JudgmentEvent | null>(null);
  const [observability, setObservability] = useState<CreateObservability | null>(null);
  const [providerComparison, setProviderComparison] = useState<CreateProviderComparisonResponse["data"] | null>(null);
  const [promptExport, setPromptExport] = useState<PromptExport | null>(null);
  const [exportFeedbackRating, setExportFeedbackRating] = useState<CreateExportFeedbackRating | null>(null);
  const [exportFeedbackReasons, setExportFeedbackReasons] = useState<CreateExportFeedbackReason[]>([]);
  const [exportFeedbackComment, setExportFeedbackComment] = useState("");
  const [exportFeedbackStatus, setExportFeedbackStatus] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState("Create ready");
  const [failure, setFailure] = useState<string | null>(null);
  const seedRef = useRef<HTMLTextAreaElement | null>(null);
  const bootstrappedTextRef = useRef<string | null>(null);

  const busy = localBusy || isThinking;
  const displayStatus = busy ? "Thinking" : localStatus || status;
  const options = useMemo(() => sortCreateOptions(optionSet?.options ?? []), [optionSet]);
  const selectedOptions = useMemo(
    () => options.filter((option) => selectedOptionIds.includes(option.id)),
    [options, selectedOptionIds],
  );
  const activeStepIndex = createActiveStepIndex({ optionSet, judgmentEvent, artifact, verification, promptExport });

  useEffect(() => {
    if (!sourceText || bootstrappedTextRef.current === sourceText) {
      return;
    }

    bootstrappedTextRef.current = sourceText;
    setDraftText(sourceText);
    onInitialSeedConsumed?.();
    void handleGenerateDirections(sourceText);
  }, [sourceText, onInitialSeedConsumed]);

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

    if (!selectedOptionIds.length && !userComment.trim()) {
      setStatus("Select one or more directions or add a comment first");
      return;
    }

    await runCreateAction("Updating coding prompt artifact", async () => {
      const payload = await createNext(
        buildCreateNextInput({
          rawIdea,
          data,
          brainProfile,
          optionSet,
          selectedOptionIds,
          userComment,
          artifact,
        }),
      );
      applyCreatePayload(payload.data);
      setPromptExport(null);
      resetExportFeedback();
      setStatus(payload.data.judgmentEvent ? "Judgment recorded; artifact verified" : "Artifact verified");
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
      setStatus("Generate the artifact before exporting");
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
    setSelectedOptionIds((current) =>
      current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId],
    );
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
    <main className="check-workspace-shell" aria-label="Create workspace">
      <CreatePathSidebar activeIndex={activeStepIndex} status={displayStatus} onOpenBrain={onOpenBrain} />

      <section className="check-center-stage" aria-label="Penny Create flow">
        <article className="check-main-cycle create-workspace-card">
          <header className="check-cycle-hero">
            <span>CREATE KERNEL</span>
            <h1>Options -&gt; judgment -&gt; artifact.</h1>
            <p>
              Turn a rough idea into five directions, select the strongest mix, and export a verified prompt for Codex,
              Claude Code, or Cursor.
            </p>
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

          <CreateOptionBoard options={options} selectedOptionIds={selectedOptionIds} busy={busy} onToggleOption={toggleOption} />

          {isCreateComparisonDevMode() ? (
            <CreateComparisonPanel comparison={providerComparison} busy={busy} onCompare={() => void handleCompareProviders()} />
          ) : null}

          <section className="create-judgment-panel" aria-label="Create judgment">
            <header>
              <span>Judgment</span>
              <strong>{selectedOptions.length ? selectedOptions.map((option) => option.lens).join(" + ") : "Select one or more cards"}</strong>
            </header>
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
                Update artifact
              </button>
              {judgmentEvent ? <span>JudgmentEvent: {judgmentEvent.inferredSignals.join(", ") || "recorded"}</span> : null}
            </div>
          </section>

          <div className="create-output-grid">
            <CreateArtifactPanel artifact={artifact} />
            <CreateVerificationPanel verification={verification} />
          </div>

          <section className="create-export-panel" aria-label="Export coding prompt">
            <header>
              <span>Export</span>
              <strong>{promptExport ? promptExport.fileName : "Coding-agent prompt"}</strong>
            </header>
            <button type="button" className="check-primary-button" onClick={() => void handleExportPrompt()} disabled={busy || !artifact}>
              <Download size={15} />
              Export prompt
            </button>
            {promptExport ? <textarea readOnly value={promptExport.text} aria-label="Exported coding-agent prompt" /> : null}
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
  onOpenBrain,
}: {
  activeIndex: number;
  status: string;
  onOpenBrain?: (() => void) | undefined;
}) {
  return (
    <aside className="check-path-sidebar" aria-label="Create path">
      <div className="check-path-head">
        <div>
          <span>CREATE PATH</span>
          <strong>Prompt artifact kernel</strong>
        </div>
        {onOpenBrain ? (
          <button type="button" className="check-ask-button" onClick={onOpenBrain}>
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

      <div className="check-path-status">
        <span>Status</span>
        <strong>{status}</strong>
      </div>
    </aside>
  );
}

export function CreateBrainOnboardingPanel({ profile }: { profile: BrainMemoryProfileData | null }) {
  const memoryCount = profile?.stats.memoryNodeCount ?? 0;
  const sourceCount = profile?.stats.sourceCount ?? 0;
  const topSignals = profile ? topBrainProfileSignals(profile).slice(0, 3) : [];

  if (!memoryCount) {
    return (
      <section className="create-brain-panel is-context-light" aria-label="Create Brain context">
        <div>
          <span>Context-light</span>
          <strong>No imported Brain memories yet</strong>
        </div>
        <p>Create will use the rough idea and any open session context until private memory is imported.</p>
      </section>
    );
  }

  return (
    <section className="create-brain-panel is-using-brain" aria-label="Create Brain context">
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
    </section>
  );
}

export function CreateProviderStatusPanel({ observability }: { observability: CreateObservability | null }) {
  if (!observability) {
    return (
      <section className="create-provider-status" aria-label="Create provider status">
        <div>
          <span>Provider</span>
          <strong>Not run yet</strong>
        </div>
        <p>Create will report whether the generated directions came from deterministic, model-backed, or fallback output.</p>
      </section>
    );
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
  selectedOptionIds,
  busy,
  onToggleOption,
}: {
  options: CandidateOption[];
  selectedOptionIds: string[];
  busy: boolean;
  onToggleOption: (optionId: string) => void;
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
      <section className="create-option-board is-empty" aria-label="Create directions">
        <header>
          <span>Directions</span>
          <strong>Personal / Practical / Valuable / Critical / Weird</strong>
        </header>
        <p>Enter a rough idea to generate the five Create cards.</p>
      </section>
    );
  }

  return (
    <section className="create-option-board" aria-label="Create directions">
      <header>
        <span>Directions</span>
        <strong>Choose the mix Penny should build from</strong>
      </header>
      <div className="create-option-grid">
        {options.map((option) => (
          <article key={option.id} className={`create-option-card${selectedOptionIds.includes(option.id) ? " is-selected" : ""}`}>
            <button
              type="button"
              className="create-option-select-button"
              aria-pressed={selectedOptionIds.includes(option.id)}
              onClick={() => onToggleOption(option.id)}
              disabled={busy}
            >
              <span>{option.lens}</span>
              <strong>{option.title}</strong>
              <p>{option.oneLine}</p>
            </button>
            <div className="create-option-memory-meta" aria-label={`${option.lens} memory grounding`}>
              <span>{option.memoryUsed.length} memories</span>
              <span>{uniqueSourceCount(option)} sources</span>
              {isContextLightOption(option) ? <span>Context-light</span> : null}
            </div>
            <div>
              <p>{option.rationale}</p>
              <small>{option.nextMove}</small>
            </div>
            <button type="button" className="create-option-detail-button" onClick={() => setDetailOptionId(option.id)}>
              <Info size={14} />
              Details
            </button>
          </article>
        ))}
      </div>
      {activeDetailOption ? <CreateOptionDetailsDrawer option={activeDetailOption} onClose={() => setDetailOptionId(null)} /> : null}
    </section>
  );
}

export function CreateOptionDetailsDrawer({ option, onClose }: { option: CandidateOption; onClose: () => void }) {
  const sourceRefs = uniqueById(option.sourcesUsed);
  const memoryRefs = uniqueById(option.memoryUsed);
  const importedSourceRefs = sourceRefs.filter((source) => source.kind === "source");
  const groundedClaims = [
    ...memoryRefs.map((memory) => memory.summary),
    ...importedSourceRefs.map((source) => source.excerpt),
  ].filter(Boolean);
  const inferredClaims = [option.rationale, ...option.risks].filter(Boolean);

  return (
    <aside className="create-option-detail-drawer" aria-label={`${option.lens} option details`}>
      <header>
        <div>
          <span>{option.lens} details</span>
          <strong>{option.title}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close option details">
          <X size={16} />
        </button>
      </header>

      <section>
        <span>Why suggested</span>
        <p>{option.rationale}</p>
        <small>{option.nextMove}</small>
      </section>

      <section>
        <span>Memories used</span>
        {memoryRefs.length ? (
          <ul>
            {memoryRefs.map((memory) => (
              <li key={memory.id}>
                <strong>{memory.label}</strong>
                <p>{memory.summary}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>Context-light: no strong imported memory matched this direction.</p>
        )}
      </section>

      <section>
        <span>Sources used</span>
        <ul>
          {sourceRefs.map((source) => (
            <li key={source.id}>
              <strong>{source.label}</strong>
              <p>{source.excerpt}</p>
              {source.sourceRange ? <small>{source.sourceRange}</small> : null}
            </li>
          ))}
        </ul>
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
    </aside>
  );
}

export function CreateArtifactPanel({ artifact }: { artifact: CodingPromptArtifact | null }) {
  if (!artifact) {
    return (
      <section className="create-artifact-panel" aria-label="Coding prompt artifact">
        <header>
          <span>Artifact</span>
          <strong>CodingPromptArtifact</strong>
        </header>
        <p className="create-panel-empty">Generate directions to start the prompt artifact.</p>
      </section>
    );
  }

  return (
    <section className="create-artifact-panel" aria-label="Coding prompt artifact">
      <header>
        <span>Artifact v{artifact.version}</span>
        <strong>{artifact.title}</strong>
      </header>
      <div className="create-artifact-sections">
        {artifact.sections.map((section) => (
          <article key={section.id} className={section.status === "updated" ? "is-updated" : ""}>
            <span>{section.title}</span>
            <p>{section.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CreateVerificationPanel({ verification }: { verification: VerificationSummary | null }) {
  if (!verification) {
    return (
      <section className="create-verification-panel" aria-label="Verification summary">
        <header>
          <span>Verification</span>
          <strong>Waiting on artifact</strong>
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
    excerpt: `Imported ${source.kind} with ${source.memoryNodeCount} memories and ${source.chunkCount} chunks.`,
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

function sortCreateOptions(options: CandidateOption[]): CandidateOption[] {
  return [...options].sort((left, right) => createLensOrder.indexOf(left.lens) - createLensOrder.indexOf(right.lens));
}

function isContextLightOption(option: CandidateOption): boolean {
  return option.memoryUsed.length === 0;
}

function uniqueSourceCount(option: CandidateOption): number {
  return uniqueById(option.sourcesUsed).length;
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
