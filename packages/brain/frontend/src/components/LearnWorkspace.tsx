import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  AutopilotTickData,
  BrainClaim,
  BrainData,
  BrainDocumentSummary,
  BrainHybridSearchResponse,
  BrainRecentIdea,
  CanvasNode,
  LearnPageV2,
  LearnSessionV2,
  LearnVisualType,
  LearningPlan,
  AskPennyResponse,
  LearnSessionOutput,
} from "../types/brain";
import { askPenny as askPennyQuestion } from "../api/brainClient";
import { truncateWords } from "../lib/text";
import { AskPennyRenderedText } from "./AskPennyRenderedText";

interface LearnWorkspaceProps {
  selectedDocument: BrainDocumentSummary | null;
  data: BrainData | null;
  autopilot: AutopilotTickData | null;
  focusedClaimId: string | null;
  focusNode: CanvasNode | null;
  isThinking: boolean;
  onSearchBrainRelated: (query: string, claimId?: string | null) => Promise<BrainHybridSearchResponse["data"]>;
  onBackToCreate?: () => void;
}

export function LearnWorkspace({
  selectedDocument,
  data,
  autopilot,
  focusedClaimId,
  focusNode,
  isThinking,
  onSearchBrainRelated,
  onBackToCreate,
}: LearnWorkspaceProps) {
  const output = useMemo(
    () => buildLearnSessionOutput(data, selectedDocument, autopilot) ?? defaultLearnSessionOutput(),
    [data, selectedDocument, autopilot],
  );
  const sourceText = data?.source?.rawText ?? selectedDocument?.originalIdea ?? output?.coreIdea ?? "";

  return (
    <main className="learn-workspace" aria-label="Learn">
      <section className="learn-main">
        {onBackToCreate ? (
          <button type="button" className="learn-back-to-create" data-testid="learn-back-to-create" onClick={onBackToCreate}>
            Back to Create
          </button>
        ) : null}
        <LearnSessionView
          output={output}
          sourceText={sourceText}
          focusedClaimId={focusedClaimId}
          focusNode={focusNode}
          disabled={isThinking}
          onSearchBrainRelated={onSearchBrainRelated}
        />
      </section>
    </main>
  );
}

function LearnSessionView({
  output,
  sourceText,
  focusedClaimId,
  focusNode,
  disabled,
  onSearchBrainRelated,
}: {
  output: LearnSessionOutput;
  sourceText: string;
  focusedClaimId: string | null;
  focusNode: CanvasNode | null;
  disabled: boolean;
  onSearchBrainRelated: (query: string, claimId?: string | null) => Promise<BrainHybridSearchResponse["data"]>;
}) {
  const focusedClaim = focusedClaimId
    ? [...output.claims, ...output.assumptions, ...output.questions].find((claim) => claim.id === focusedClaimId) ?? null
    : null;
  const pageData = useMemo(() => buildLearnPageData(output, sourceText, focusedClaim, focusNode), [
    focusedClaim,
    focusNode,
    output,
    sourceText,
  ]);
  const [askPennyOpen, setAskPennyOpen] = useState(false);
  const [askPennySeed, setAskPennySeed] = useState<AskPennySeed | null>(null);
  const [activeMainStepId, setActiveMainStepId] = useState(pageData.steps[0]?.id ?? "step-1");
  const [activeSubstepId, setActiveSubstepId] = useState(pageData.steps[0]?.substeps[0]?.id ?? "step-1-substep-1");
  const lessonPages = useMemo(() => flattenLessonPages(pageData.steps), [pageData.steps]);
  const activeStepIndex = Math.max(
    0,
    pageData.steps.findIndex((step) => step.id === activeMainStepId),
  );
  const activeStep = pageData.steps[activeStepIndex] ?? pageData.steps[0];
  const activeLessonIndex = Math.max(
    0,
    lessonPages.findIndex((lesson) => lesson.substep.id === activeSubstepId),
  );
  const activeLesson = lessonPages[activeLessonIndex];
  const currentProgressPercent = Math.round(((activeLessonIndex + 1) / lessonPages.length) * 100);

  useEffect(() => {
    const firstStep = pageData.steps[0];

    if (!firstStep) {
      return;
    }

    if (!pageData.steps.some((step) => step.id === activeMainStepId)) {
      setActiveMainStepId(firstStep.id);
      setActiveSubstepId(firstStep.substeps[0]?.id ?? firstStep.id);
      return;
    }

    const activeStep = pageData.steps.find((step) => step.id === activeMainStepId);

    if (activeStep && !activeStep.substeps.some((substep) => substep.id === activeSubstepId)) {
      setActiveSubstepId(activeStep.substeps[0]?.id ?? activeStep.id);
    }
  }, [activeMainStepId, activeSubstepId, pageData.steps]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isTextInput =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      const selectedText = window.getSelection()?.toString().trim() ?? "";

      const isAskPennyPasteShortcut =
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") ||
        (selectedText && (event.key === "Control" || event.key === "Meta"));

      if (isAskPennyPasteShortcut) {
        if (isTextInput) {
          return;
        }

        event.preventDefault();
        if (selectedText) {
          setAskPennyOpen(true);
          setAskPennySeed({ text: selectedText, id: Date.now() });
          return;
        }

        setAskPennyOpen((isOpen) => !isOpen);
        return;
      }

      if (event.key === "Enter" && !isTextInput) {
        event.preventDefault();
        goToNextLesson();
        return;
      }

      if (event.key === "Escape" && !isTextInput) {
        event.preventDefault();
        goToPreviousLesson();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function selectStep(stepId: string, substepId?: string) {
    const step = pageData.steps.find((item) => item.id === stepId);

    if (!step) {
      return;
    }

    setAskPennyOpen(false);
    setActiveMainStepId(step.id);
    setActiveSubstepId(substepId ?? step.substeps[0]?.id ?? step.id);
  }

  function goToNextLesson() {
    const nextLesson = lessonPages[activeLessonIndex + 1];

    if (!nextLesson) {
      return;
    }

    setAskPennyOpen(false);
    setActiveMainStepId(nextLesson.step.id);
    setActiveSubstepId(nextLesson.substep.id);
  }

  function goToPreviousLesson() {
    const previousLesson = lessonPages[activeLessonIndex - 1];

    if (!previousLesson) {
      return;
    }

    setAskPennyOpen(false);
    setActiveMainStepId(previousLesson.step.id);
    setActiveSubstepId(previousLesson.substep.id);
  }

  function handleSuggestedQuestion(question: string) {
    void onSearchBrainRelated(question, focusedClaim?.id ?? focusNode?.refs?.claimId ?? null);
  }

  return (
    <section className="learn-session-output" aria-label="Learn session output">
      <LearningPathSidebar
        steps={pageData.steps}
        goal={pageData.goal}
        activeMainStepId={activeMainStepId}
        activeSubstepId={activeSubstepId}
        progressPercent={currentProgressPercent}
        onStepSelect={selectStep}
        onAskPennyToggle={() => setAskPennyOpen((isOpen) => !isOpen)}
      />

      <LearnMainContent
        pageData={pageData}
        activeStepIndex={activeStepIndex}
        activeLessonIndex={activeLessonIndex}
        activeSubstepId={activeSubstepId}
        lessonPages={lessonPages}
        onPrevious={goToPreviousLesson}
        onNext={goToNextLesson}
      />

      <AskPennyDrawer
        askPenny={pageData.askPenny}
        contextKey={activeStep?.id ?? "step-1"}
        activeLessonIndex={activeLessonIndex}
        lessonCount={lessonPages.length}
        lesson={activeLesson?.substep.lesson ?? pageData.currentStep}
        currentStepTitle={activeLesson?.substep.lesson.title ?? activeStep?.title ?? pageData.currentStep.title}
        localContext={askPennyContextForStep(pageData, activeStep, activeLesson?.substep.lesson ?? pageData.currentStep, sourceText)}
        isOpen={askPennyOpen}
        selectedQuestionSeed={askPennySeed}
        disabled={disabled}
        onClose={() => setAskPennyOpen(false)}
        onPromptSelect={handleSuggestedQuestion}
      />
    </section>
  );
}

type LearnExampleFormat = "generic" | "math" | "code" | "writing" | "business";

type AskPennySeed = {
  text: string;
  id: number;
};

type AskPennyMessage = {
  role: "user" | "penny" | "system";
  text: string;
  provider?: AskPennyResponse["data"]["provider"];
  model?: AskPennyResponse["data"]["model"];
};

type LearnLesson = {
  stepNumber: number;
  totalSteps: number;
  substepNumber: number;
  totalSubsteps: number;
  title: string;
  parentTitle: string;
  learningGoal: string;
  shortExplanation: string;
  visual: LearnPageV2["visual"];
  quickCheck: string;
  takeaway: string;
  sourceSpans: LearnPageV2["sourceSpans"];
  teachingSections: Array<{
    title: string;
    body: string;
  }>;
  misconceptions: string[];
  coreIdea: {
    bullets: string[];
    visualPlaceholderLabel?: string;
  };
  example: {
    title: string;
    description: string;
    lines: string[];
    whyThisMatters: string;
    format: LearnExampleFormat;
  };
  inlineNote?: string;
  nextStepTitle: string;
  previousStepTitle?: string;
};

type LearnPageData = {
  goal: string;
  progressPercent: number;
  steps: Array<{
    id: string;
    title: string;
    expanded: boolean;
    substeps: Array<{
      id: string;
      title: string;
      isActive: boolean;
      lesson: LearnLesson;
    }>;
  }>;
  currentStep: LearnLesson;
  askPenny: {
    suggestedQuestions: string[];
    placeholder: string;
  };
};

type LearnLessonPage = {
  step: LearnPageData["steps"][number];
  substep: LearnPageData["steps"][number]["substeps"][number];
};

type CreateLearnBridgeNode = CanvasNode & {
  id: "create-learn:brain-ranker-judgment-events";
};

type CreateOptionLearnNode = CanvasNode & {
  id: `create-option-learn:${string}`;
};

function LearningPathSidebar({
  steps,
  goal,
  activeMainStepId,
  activeSubstepId,
  progressPercent,
  onStepSelect,
  onAskPennyToggle,
}: {
  steps: LearnPageData["steps"];
  goal: string;
  activeMainStepId: string;
  activeSubstepId: string;
  progressPercent: number;
  onStepSelect: (stepId: string, substepId?: string) => void;
  onAskPennyToggle: () => void;
}) {
  const visibleSteps = visibleLearningPathSteps(steps, activeMainStepId);

  return (
    <aside className="learn-path-sidebar" aria-label="Learning path">
      <div className="learn-path-head">
        <div className="learn-path-kicker">
          <span>LEARNING PATH</span>
          <p>Expert-designed order</p>
        </div>
        <button type="button" className="learn-ask-toggle" onClick={onAskPennyToggle} aria-label="Toggle Ask Penny">
          <span>Ask</span>
          <kbd>Ctrl+A</kbd>
        </button>
      </div>

      <div className="learn-path-middle">
        <p className="learn-path-topic">{truncateWords(goal, 9)}</p>
        <ol className="learn-path-list">
        {visibleSteps.map(({ step, index }) => {
          const isActive = step.id === activeMainStepId;

          return (
            <li key={step.id} className={isActive ? "is-active" : ""}>
              <button type="button" onClick={() => onStepSelect(step.id)}>
                <span>{index + 1}</span>
                <strong>{step.title}</strong>
              </button>
              {isActive ? (
                <ol>
                  {step.substeps.map((substep, substepIndex) => (
                    <li key={substep.id} className={substep.id === activeSubstepId ? "is-active-substep" : ""}>
                      <button type="button" onClick={() => onStepSelect(step.id, substep.id)}>
                        <span>
                          {index + 1}.{substepIndex + 1}
                        </span>
                        {substep.title}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          );
        })}
        </ol>

        <LearnThinkingGraph steps={steps} activeMainStepId={activeMainStepId} activeSubstepId={activeSubstepId} />
      </div>

      <div className="learn-path-footer">
        <div className="learn-progress-row">
          <span>Progress</span>
          <strong>{progressPercent}%</strong>
        </div>
        <div className="learn-progress-bar" aria-hidden="true">
          <span style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
    </aside>
  );
}

export function visibleLearningPathSteps(steps: LearnPageData["steps"], activeMainStepId: string) {
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeMainStepId),
  );

  return steps.map((step, index) => ({
    step,
    index,
    isBeforeActive: index < activeIndex,
  }));
}

function LearnThinkingGraph({
  steps,
  activeMainStepId,
  activeSubstepId,
}: {
  steps: LearnPageData["steps"];
  activeMainStepId: string;
  activeSubstepId: string;
}) {
  const activeStepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeMainStepId),
  );
  const activeStep = steps[activeStepIndex] ?? steps[0] ?? null;
  const visibleSubsteps = activeStep ? visibleThinkingGraphSubsteps(activeStep.substeps, activeSubstepId) : [];

  return (
    <section className="learn-thinking-graph" aria-label="Thinking graph preview">
      <div className="learn-thinking-graph-head">
        <span>CANVAS</span>
        <strong>Thinking graph</strong>
      </div>
      <div className="learn-thinking-graph-board">
        {activeStep ? (
          <div className="learn-thinking-graph-map">
            <article className="learn-thinking-graph-root">
              <span>Main topic</span>
              <strong>{compactGraphTitle(steps[0]?.substeps[0]?.lesson.learningGoal ?? activeStep.title, 9)}</strong>
            </article>
            <article className="learn-thinking-graph-main is-selected">
              <span>SECTION {activeStepIndex + 1}</span>
              <strong>{compactGraphTitle(activeStep.title, 7)}</strong>
            </article>
            <ol>
              {visibleSubsteps.map(({ substep, index: substepIndex }) => (
                <li key={substep.id} className={substep.id === activeSubstepId ? "is-selected" : ""}>
                  <span>
                    {activeStepIndex + 1}.{substepIndex + 1}
                  </span>
                  <strong>{compactGraphTitle(substep.title, 6)}</strong>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="learn-thinking-graph-empty">
            <strong>Canvas starts after the first saved idea</strong>
            <p>Save an idea to Brain, then Canvas will show claims, assumptions, questions, and the recommended path.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function LearnMainContent({
  pageData,
  activeStepIndex,
  activeLessonIndex,
  activeSubstepId,
  lessonPages,
  onPrevious,
  onNext,
}: {
  pageData: LearnPageData;
  activeStepIndex: number;
  activeLessonIndex: number;
  activeSubstepId: string;
  lessonPages: LearnLessonPage[];
  onPrevious: () => void;
  onNext: () => void;
}) {
  const activeStep = pageData.steps[activeStepIndex] ?? pageData.steps[0];
  const activeSubstep = activeStep?.substeps.find((substep) => substep.id === activeSubstepId);
  const nextLesson = lessonPages[activeLessonIndex + 1];
  const currentStep = activeSubstep?.lesson ?? pageData.currentStep;
  const canGoPrevious = activeLessonIndex > 0;
  const canGoNext = activeLessonIndex < lessonPages.length - 1;

  return (
    <article className="learn-editorial-main" aria-label="Current learning step">
      <MicroLessonSlide lesson={currentStep} activeLessonIndex={activeLessonIndex} lessonCount={lessonPages.length} />

      <nav className="learn-bottom-nav" aria-label="Step navigation">
        <div className="learn-nav-control learn-nav-control-previous">
          <button type="button" disabled={!canGoPrevious} onClick={onPrevious}>
            Previous
          </button>
          <small>Esc</small>
        </div>
        <div className="learn-nav-control learn-nav-control-next">
          <button type="button" className="learn-next-step" disabled={!canGoNext} onClick={onNext}>
            Next: {nextLesson?.substep.title ?? currentStep.nextStepTitle} →
          </button>
          <small>Enter</small>
        </div>
      </nav>
    </article>
  );
}

export function MicroLessonSlide({
  lesson,
  activeLessonIndex,
  lessonCount,
}: {
  lesson: LearnLesson;
  activeLessonIndex: number;
  lessonCount: number;
}) {
  const displayExplanation = truncateWords(lesson.shortExplanation, 34);
  const focusFit = microLessonFocusFit(displayExplanation);

  return (
    <section className="micro-lesson-slide" aria-label={`Lesson ${activeLessonIndex + 1} of ${lessonCount}`}>
      <header className="micro-lesson-head">
        <span>
          LESSON {activeLessonIndex + 1} / {lessonCount}
        </span>
        <h1>{lesson.title}</h1>
      </header>

      <section className="micro-lesson-focus" aria-label="Lesson focus">
        <p
          data-focus-font-size={focusFit.fontSizePx}
          data-focus-max-chars={focusFit.maxLineCharacters}
          style={{
            "--micro-lesson-focus-font-size": `${focusFit.fontSizePx}px`,
            "--micro-lesson-focus-max-chars": `${focusFit.maxLineCharacters}ch`,
          } as React.CSSProperties}
        >
          {displayExplanation}
        </p>
      </section>

      <LearnUnderstandingTour lesson={lesson} />
    </section>
  );
}

export function LearnUnderstandingTour({ lesson }: { lesson: LearnLesson }) {
  const sourceSpan = lesson.sourceSpans[0] ?? null;
  const tourItems = [
    {
      label: sourceSpan?.label ?? "Source",
      title: "Grounding",
      body: sourceSpan?.text ?? lesson.learningGoal,
    },
    {
      label: "Move",
      title: "What changes",
      body: `Use ${lesson.title.toLowerCase()} as the active concept.`,
    },
    {
      label: "Check",
      title: "Can you use it?",
      body: "Try the concept against the current source.",
    },
  ];

  return (
    <section className="learn-understanding-tour" aria-label="Source to concept tour" data-testid="learn-understanding-tour">
      {tourItems.map((item) => (
        <article key={`${item.label}-${item.title}`}>
          <span>{item.label}</span>
          <strong>{item.title}</strong>
          <p>{truncateWords(item.body, 18)}</p>
        </article>
      ))}
    </section>
  );
}

export function microLessonFocusFit(text: string) {
  const characterCount = text.replace(/\s+/g, " ").trim().length;
  const maxLineCharacters =
    characterCount > 360 ? 68 :
    characterCount > 240 ? 58 :
    characterCount > 150 ? 48 :
    characterCount > 90 ? 40 :
    32;
  const fontSizePx =
    maxLineCharacters >= 68 ? 20 :
    maxLineCharacters >= 58 ? 23 :
    maxLineCharacters >= 48 ? 28 :
    maxLineCharacters >= 40 ? 34 :
    44;

  return {
    characterCount,
    maxLineCharacters,
    fontSizePx,
  };
}

export function LearnVisualRenderer({ visual }: { visual: LearnPageV2["visual"] }) {
  switch (visual.type) {
    case "latex":
      return (
        <figure className="learn-visual learn-visual-latex">
          <figcaption>{visual.title}</figcaption>
          <AskPennyRenderedText text={visual.body} />
          <p>{visual.description}</p>
        </figure>
      );
    case "code":
      return (
        <figure className="learn-visual learn-visual-code">
          <figcaption>{visual.title}</figcaption>
          <pre><code>{visual.body}</code></pre>
          <p>{visual.description}</p>
        </figure>
      );
    case "comparison":
      return (
        <figure className="learn-visual learn-visual-comparison">
          <figcaption>{visual.title}</figcaption>
          <div>
            {(visual.items ?? []).slice(0, 2).map((item) => (
              <article key={item.label}>
                <span>{item.label}</span>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
          <p>{visual.description}</p>
        </figure>
      );
    case "image":
      return (
        <figure className="learn-visual learn-visual-image">
          <figcaption>{visual.title}</figcaption>
          <div aria-label={visual.description}>{visual.body}</div>
          <p>{visual.description}</p>
        </figure>
      );
    case "concept_map":
      return (
        <figure className="learn-visual learn-visual-map">
          <figcaption>{visual.title}</figcaption>
          <ol>
            {(visual.items ?? visual.body.split("->").map((text, index) => ({ label: `${index + 1}`, text }))).map((item) => (
              <li key={`${item.label}-${item.text}`}>
                <span>{item.label}</span>
                <strong>{item.text}</strong>
              </li>
            ))}
          </ol>
          <p>{visual.description}</p>
        </figure>
      );
    case "diagram":
    default:
      return (
        <figure className="learn-visual learn-visual-diagram">
          <figcaption>{visual.title}</figcaption>
          <ol>
            {(visual.items ?? visual.body.split("->").map((text, index) => ({ label: `${index + 1}`, text }))).map((item) => (
              <li key={`${item.label}-${item.text}`}>
                <span>{item.label}</span>
                <strong>{item.text}</strong>
              </li>
            ))}
          </ol>
          <p>{visual.description}</p>
        </figure>
      );
  }
}

function LearnPracticalStep({
  lesson,
  activeLessonIndex,
  lessonCount,
}: {
  lesson: LearnLesson;
  activeLessonIndex: number;
  lessonCount: number;
}) {
  const actions = practicalActionsForLesson(lesson);

  return (
    <section className="learn-practical-step" aria-label="Practical learning step">
      <div className="learn-practical-head">
        <span>Practical step {activeLessonIndex + 1}</span>
        <strong>{activeLessonIndex + 1} / {lessonCount}</strong>
      </div>
      <div className="learn-practical-card">
        <p>{lesson.shortExplanation}</p>
        <ol>
          {actions.map((action, index) => (
            <li key={`${lesson.stepNumber}-${lesson.substepNumber}-action-${index}`}>{action}</li>
          ))}
        </ol>
      </div>
      <p className="learn-practical-note">{lesson.example.whyThisMatters}</p>
    </section>
  );
}

type LearnCheckCategory = {
  id: "good-example" | "bad-example" | "positive" | "negative" | "curve" | "custom";
  label: string;
  prompt: string;
  recommendations: string[];
  placeholder: string;
};

function LearnCheckWorksheet({ lesson }: { lesson: LearnLesson }) {
  const categories = useMemo(() => learnCheckCategoriesForLesson(lesson), [lesson]);
  const [activeCategoryId, setActiveCategoryId] = useState<LearnCheckCategory["id"]>(categories[0]?.id ?? "good-example");
  const [customPrompt, setCustomPrompt] = useState("");
  const [draftTabsByCategory, setDraftTabsByCategory] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(categories.map((category) => [category.id, ["Draft 1"]])),
  );
  const [activeDraftByCategory, setActiveDraftByCategory] = useState<Record<string, number>>(() =>
    Object.fromEntries(categories.map((category) => [category.id, 0])),
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [finalAnswer, setFinalAnswer] = useState("");
  const customCategory = useMemo<LearnCheckCategory>(
    () => ({
      id: "custom",
      label: "Custom",
      prompt: customPrompt.trim() || "What else belongs in this structure?",
      recommendations: [
        "Name the exact piece this answer still needs.",
        "Write it as part of the structure, not a side note.",
        "Keep it checkable against the current lesson.",
        "Add only one new piece at a time.",
      ],
      placeholder: "Type the extra structure piece here...",
    }),
    [customPrompt],
  );
  const structureOptions = useMemo(() => [...categories, customCategory], [categories, customCategory]);
  const activeCategory = structureOptions.find((category) => category.id === activeCategoryId) ?? structureOptions[0] ?? customCategory;

  useEffect(() => {
    setDraftTabsByCategory(Object.fromEntries(categories.map((category) => [category.id, ["Draft 1"]])));
    setActiveDraftByCategory(Object.fromEntries(categories.map((category) => [category.id, 0])));
    setAnswers({});
    setFinalAnswer("");
    setActiveCategoryId(categories[0]?.id ?? "good-example");
  }, [categories]);

  function addDraftTab(categoryId: string) {
    setDraftTabsByCategory((current) => {
      const currentTabs = current[categoryId] ?? ["Draft 1"];
      return {
        ...current,
        [categoryId]: [...currentTabs, `Draft ${currentTabs.length + 1}`],
      };
    });
    setActiveDraftByCategory((current) => ({
      ...current,
      [categoryId]: draftTabsByCategory[categoryId]?.length ?? 1,
    }));
  }

  return (
    <section className="learn-check-worksheet" aria-label="Learn check worksheet">
      <div className="learn-check-head">
        <div>
          <span>STRUCTURE</span>
          <h2>Fill in the check</h2>
        </div>
        <p>Use the recommendations, add drafts until the part is fleshed out, then type the finished version below.</p>
      </div>

      <div className="learn-check-builder">
        <aside className="learn-structure-sidebar" aria-label="Check structure pieces">
          <div className="learn-structure-list" role="tablist" aria-label="Five check options plus custom">
            {structureOptions.map((category, index) => (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={activeCategory.id === category.id}
                onClick={() => setActiveCategoryId(category.id)}
              >
                <span>{category.id === "custom" ? "+" : index + 1}</span>
                <strong>{category.label}</strong>
                <small>{category.prompt}</small>
              </button>
            ))}
          </div>
          <label className="learn-custom-piece">
            <span>Additional piece</span>
            <textarea
              value={customPrompt}
              placeholder="Insert what you want this structure to include..."
              onChange={(event) => setCustomPrompt(event.target.value)}
              rows={4}
            />
          </label>
        </aside>

        <LearnCheckCategoryEditor
          category={activeCategory}
          draftTabs={draftTabsByCategory[activeCategory.id] ?? ["Draft 1"]}
          activeDraftIndex={activeDraftByCategory[activeCategory.id] ?? 0}
          answer={answers[`${activeCategory.id}:${activeDraftByCategory[activeCategory.id] ?? 0}`] ?? ""}
          onDraftSelect={(index) => setActiveDraftByCategory((current) => ({ ...current, [activeCategory.id]: index }))}
          onDraftAdd={() => addDraftTab(activeCategory.id)}
          onAnswerChange={(value) => {
            const activeDraftIndex = activeDraftByCategory[activeCategory.id] ?? 0;
            setAnswers((current) => ({ ...current, [`${activeCategory.id}:${activeDraftIndex}`]: value }));
          }}
        />
      </div>

      <label className="learn-final-answer">
        <span>Final typed answer</span>
        <textarea
          value={finalAnswer}
          placeholder="Write the full finished answer after the five parts are fleshed out..."
          onChange={(event) => setFinalAnswer(event.target.value)}
          rows={5}
        />
      </label>
    </section>
  );
}

function LearnCheckCategoryEditor({
  category,
  draftTabs,
  activeDraftIndex,
  answer,
  onDraftSelect,
  onDraftAdd,
  onAnswerChange,
}: {
  category: LearnCheckCategory;
  draftTabs: string[];
  activeDraftIndex: number;
  answer: string;
  onDraftSelect: (index: number) => void;
  onDraftAdd: () => void;
  onAnswerChange: (value: string) => void;
}) {
  return (
    <section className="learn-check-card" aria-label={category.label}>
      <header>
        <div>
          <span>{category.label}</span>
          <h3>{category.prompt}</h3>
        </div>
      </header>

      <ol className="learn-recommendation-list">
        {category.recommendations.map((recommendation, index) => (
          <li key={`${category.id}-recommendation-${index}`}>{recommendation}</li>
        ))}
      </ol>

      <div className="learn-draft-tabs" role="tablist" aria-label={`${category.label} drafts`}>
        {draftTabs.map((tab, index) => (
          <button
            key={`${category.id}-${tab}`}
            type="button"
            role="tab"
            aria-selected={activeDraftIndex === index}
            onClick={() => onDraftSelect(index)}
          >
            {tab}
          </button>
        ))}
        <button type="button" className="learn-add-tab" onClick={onDraftAdd}>
          + Tab
        </button>
      </div>

      <label>
        <span>Type this part</span>
        <textarea value={answer} placeholder={category.placeholder} onChange={(event) => onAnswerChange(event.target.value)} rows={5} />
      </label>
    </section>
  );
}

function practicalActionsForLesson(lesson: LearnLesson): string[] {
  const directMoves = lesson.coreIdea.bullets.map((bullet) => ensureSentence(bullet));
  const workedLines = lesson.example.lines.map((line) => ensureSentence(line));
  const misconception = lesson.misconceptions[0] ? `Avoid this gap: ${ensureSentence(lesson.misconceptions[0])}` : "";

  return uniqueNonEmpty([
    ...directMoves,
    ...workedLines,
    misconception,
  ]).slice(0, 5);
}

function learnCheckCategoriesForLesson(lesson: LearnLesson): LearnCheckCategory[] {
  const goodExample = lesson.example.lines[0] ?? lesson.example.description;
  const badExample = lesson.misconceptions[0] ?? "A vague answer that sounds right but cannot be checked.";
  const positive = lesson.coreIdea.bullets[0] ?? lesson.shortExplanation;
  const negative = lesson.coreIdea.bullets[1] ?? "Name what this answer should not claim.";
  const curve = lesson.coreIdea.bullets[2] ?? "Name the surprising turn or exception.";

  return [
    {
      id: "good-example",
      label: "Good example",
      prompt: "What would a strong answer look like?",
      recommendations: [
        goodExample,
        "Use a concrete person, object, decision, or event.",
        "Show the move, not just the conclusion.",
        "Make the example short enough to compare.",
        "End with why the example works.",
      ],
      placeholder: "Type the good example here...",
    },
    {
      id: "bad-example",
      label: "Bad example",
      prompt: "What would a weak answer look like?",
      recommendations: [
        badExample,
        "Make the mistake realistic, not silly.",
        "Show the missing evidence or hidden assumption.",
        "Keep the wording close to what a user might actually write.",
        "End with the specific reason it fails.",
      ],
      placeholder: "Type the bad example here...",
    },
    {
      id: "positive",
      label: "Positive",
      prompt: "What is the strongest true version?",
      recommendations: [
        positive,
        "Make the claim direct enough that someone can repeat it.",
        "Tie it to the current step instead of the whole topic.",
        "Use one concrete noun or action.",
        "Keep only what helps the learner move forward.",
      ],
      placeholder: "Type the positive version here...",
    },
    {
      id: "negative",
      label: "Negative",
      prompt: "What should this not mean?",
      recommendations: [
        negative,
        "Name the tempting wrong interpretation.",
        "Separate missing evidence from a false claim.",
        "Avoid arguing with a weak version.",
        "Turn the limit into a checkable boundary.",
      ],
      placeholder: "Type the negative boundary here...",
    },
    {
      id: "curve",
      label: "Curve",
      prompt: "What twist changes the answer?",
      recommendations: [
        curve,
        "Look for the exception that would change the advice.",
        "Name the condition that makes this harder.",
        "Keep the twist connected to the user's goal.",
        "Write it as a useful warning, not trivia.",
      ],
      placeholder: "Type the curve or exception here...",
    },
  ];
}

function directAnswerForLesson(lesson: LearnLesson): string {
  if (lesson.parentTitle.startsWith("Frame what YC is")) {
    if (lesson.title === "Name the program") {
      return "YC is a three-month startup accelerator. The answer is not 'investors like us'; it is 'this team and company could get much stronger during the batch through advice, pressure, users, and fundraising access.'";
    }

    if (lesson.title === "Ask the real application question") {
      return "The real application question is: can YC quickly see a strong founding team, a clear startup idea, and evidence that the team can learn fast? Investors are supporting context, not the center of the answer.";
    }

    if (lesson.title === "Anchor the mock event") {
      return "Save this as the January 1 YC application lesson: YC is evaluating founders plus insight first, idea clarity second, and investor interest only when it proves real traction or market pull.";
    }
  }

  if (lesson.parentTitle.startsWith("Understand the people signal")) {
    return "People matter most when the company is early because the first idea can change. The application should name concrete founder proof: what each founder built, achieved, learned, or did that was unusually hard.";
  }

  if (lesson.parentTitle.startsWith("Understand the idea signal")) {
    return "The idea matters when it shows a specific user, a painful problem, and a non-obvious insight. Do not pitch a category; state the exact improvement the startup creates and why now is the right moment.";
  }

  if (lesson.parentTitle.startsWith("Place investors correctly")) {
    return "Investor interest is useful evidence only if it points to something real: traction, urgency, credible market validation, or founder access. It should never replace founder evidence, customer learning, or idea clarity.";
  }

  if (lesson.parentTitle.startsWith("Turn the lesson into an application move")) {
    return "The final application move is: write a direct company sentence, attach one concrete founder proof point per founder, name the insight, and keep investor interest as optional evidence rather than the main claim.";
  }

  return filledLessonText(lesson);
}

function filledLessonText(lesson: LearnLesson): string {
  const moves = lesson.coreIdea.bullets
    .slice(0, 3)
    .map((move) => ensureSentence(move))
    .join(" ");
  const example = uniqueNonEmpty([lesson.example.description, ...lesson.example.lines])
    .map((line) => ensureSentence(line))
    .join(" ");

  return uniqueNonEmpty([
    lesson.shortExplanation,
    moves ? `Use this move: ${moves}` : "",
    example ? `Example: ${truncateWords(example, 42)}` : "",
  ]).join("\n\n");
}

function learnStepTextDensity(text: string): "short" | "medium" | "long" {
  const length = text.replace(/\s+/g, " ").trim().length;

  if (length > 620) {
    return "long";
  }

  if (length > 160) {
    return "medium";
  }

  return "short";
}

function ensureSentence(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function visibleThinkingGraphSubsteps(
  substeps: LearnPageData["steps"][number]["substeps"],
  activeSubstepId: string,
): Array<{ substep: LearnPageData["steps"][number]["substeps"][number]; index: number }> {
  const indexed = substeps.map((substep, index) => ({ substep, index }));

  if (indexed.length <= 4) {
    return indexed;
  }

  const activeIndex = Math.max(
    0,
    indexed.findIndex((item) => item.substep.id === activeSubstepId),
  );
  const startIndex = Math.min(Math.max(activeIndex - 1, 0), indexed.length - 4);

  return indexed.slice(startIndex, startIndex + 4);
}

function compactGraphTitle(value: string, maxWords: number): string {
  return truncateWords(value.replace(/\s+/g, " ").trim(), maxWords);
}

export function AskPennyDrawer({
  askPenny,
  contextKey,
  activeLessonIndex,
  lessonCount,
  lesson,
  currentStepTitle,
  localContext,
  isOpen,
  selectedQuestionSeed,
  disabled,
  onClose,
  onPromptSelect,
}: {
  askPenny: LearnPageData["askPenny"];
  contextKey: string;
  activeLessonIndex: number;
  lessonCount: number;
  lesson: LearnLesson;
  currentStepTitle: string;
  localContext: string;
  isOpen: boolean;
  selectedQuestionSeed: AskPennySeed | null;
  disabled: boolean;
  onClose: () => void;
  onPromptSelect: (question: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AskPennyMessage[]>([
    { role: "system", text: "Current lesson context is loaded." },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const trimmedDraft = draft.trim();
  const activeLessonPayload = askPennyActiveLessonPayload(lesson, activeLessonIndex, lessonCount);
  const quickActions: Array<{
    id: NonNullable<Parameters<typeof askPennyQuestion>[0]["quickAction"]>;
    label: string;
    question: string;
  }> = [
    { id: "explain_visual", label: "Explain this", question: "Explain this lesson focus." },
    { id: "another_example", label: "Give another example", question: "Give another example for this lesson." },
    { id: "make_simpler", label: "Make simpler", question: "Make this lesson simpler." },
    { id: "quiz_me", label: "Quiz me", question: "Quiz me on this lesson." },
    { id: "connect_previous", label: "Connect to previous", question: "Connect this to the previous lesson." },
  ];

  useEffect(() => {
    if (!selectedQuestionSeed) {
      return;
    }

    setDraft(selectedQuestionSeed.text);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(selectedQuestionSeed.text.length, selectedQuestionSeed.text.length);
    }, 0);
  }, [selectedQuestionSeed]);

  useEffect(() => {
    setDraft("");
    setMessages([
      { role: "system", text: "Current lesson context is loaded." },
    ]);
  }, [contextKey]);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft]);

  async function submitPrompt(question: string, quickAction?: NonNullable<Parameters<typeof askPennyQuestion>[0]["quickAction"]>) {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      return;
    }

    onPromptSelect(trimmedQuestion);
    setMessages((current) => [...current, { role: "user", text: trimmedQuestion }]);
    setIsRunning(true);
    setDraft("");

    try {
      const response = await askPennyQuestion({
        question: trimmedQuestion,
        currentStepTitle,
        localContext,
        ...(quickAction ? { quickAction } : {}),
        activeLesson: activeLessonPayload,
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
      setMessages((current) => [
        ...current,
        {
          role: "system",
          text: error instanceof Error ? error.message : String(error),
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <aside className={`ask-penny-panel ask-penny-drawer${isOpen ? " is-open" : ""}`} aria-label="Ask Penny" aria-hidden={!isOpen}>
      <header>
        <div>
          <span>Ask Penny</span>
          <p>
            Lesson {activeLessonIndex + 1} context: {lesson.title}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Ask Penny">
          ×
        </button>
      </header>

      <div className="ask-penny-context-card" aria-label="Current lesson context">
        <span>lesson focus</span>
        <strong>{lesson.title}</strong>
        <p>{lesson.shortExplanation}</p>
      </div>

      <div className="ask-penny-quick-actions" aria-label="Ask Penny quick actions">
        {quickActions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={disabled || isRunning}
            onClick={() => void submitPrompt(action.question, action.id)}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="ask-penny-thread" role="log" aria-live="polite">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`ask-penny-message is-${message.role}`}>
            <span className="ask-penny-terminal-label">{askPennyMessageLabel(message)}</span>
            {message.role === "user" ? (
              <code className="ask-penny-terminal-command">{message.text}</code>
            ) : (
              <div className="ask-penny-terminal-output">
                <AskPennyRenderedText text={message.text} />
                {askPennyTerminalMeta(message) ? (
                  <code className="ask-penny-terminal-meta">{askPennyTerminalMeta(message)}</code>
                ) : null}
              </div>
            )}
          </div>
        ))}
        {isRunning ? (
          <div className="ask-penny-message is-system">
            <span className="ask-penny-terminal-label">Thinking</span>
            <code className="ask-penny-terminal-command">Reading this lesson</code>
          </div>
        ) : null}
      </div>

      <form
        className="ask-penny-input"
        onSubmit={(event) => {
          event.preventDefault();
              void submitPrompt(trimmedDraft);
        }}
      >
        <label className="sr-only" htmlFor="askPennyInput">Ask Penny</label>
        <div className="ask-penny-input-shell">
          <textarea
            ref={textareaRef}
            id="askPennyInput"
            value={draft}
            disabled={disabled || isRunning}
            placeholder={askPenny.placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitPrompt(trimmedDraft);
              }
            }}
            rows={1}
          />
        </div>
        <button type="submit" disabled={disabled || isRunning || !trimmedDraft} aria-label="Send question">
          →
        </button>
      </form>
    </aside>
  );
}

function askPennyActiveLessonPayload(lesson: LearnLesson, activeLessonIndex: number, lessonCount: number) {
  return {
    lessonNumber: activeLessonIndex + 1,
    totalLessons: lessonCount,
    title: lesson.title,
    explanation: lesson.shortExplanation,
    visual: {
      type: lesson.visual.type,
      title: lesson.visual.title,
      description: lesson.visual.description,
      body: lesson.visual.body,
    },
    quickCheck: lesson.quickCheck,
    takeaway: lesson.takeaway,
    sourceSpans: lesson.sourceSpans.map((span) => ({
      label: span.label,
      text: span.text,
      ...(span.sourceRange ? { sourceRange: span.sourceRange } : {}),
    })),
  };
}

function askPennyMessageLabel(message: AskPennyMessage): string {
  if (message.role === "user") {
    return "You";
  }

  return message.role === "penny" ? "Penny" : "Context";
}

function askPennyTerminalMeta(message: AskPennyMessage): string | null {
  if (message.role !== "penny" || !message.provider) {
    return null;
  }

  return `provider=${message.provider} model=${message.model ?? "local"}`;
}

export function askPennyContextForStep(
  pageData: LearnPageData,
  activeStep: LearnPageData["steps"][number] | undefined,
  activeLesson: LearnLesson,
  sourceText: string,
): string {
  const category = activeStep ?? pageData.steps[0];
  const categoryLessons = category?.substeps.map((substep) => substep.lesson) ?? [activeLesson];
  const categoryMoves = categoryLessons.flatMap((lesson) => lesson.coreIdea.bullets);
  const categoryExamples = categoryLessons.map((lesson) => `${lesson.title}: ${lesson.example.lines.join(" ")}`);

  return [
    `Goal: ${pageData.goal}`,
    `Current category: ${category?.title ?? activeLesson.parentTitle}`,
    `Current step: ${activeLesson.title}`,
    `Active lesson explanation: ${activeLesson.shortExplanation}`,
    `Active lesson visual: ${activeLesson.visual.type} - ${activeLesson.visual.title} - ${activeLesson.visual.description} - ${activeLesson.visual.body}`,
    `Active lesson quick check: ${activeLesson.quickCheck}`,
    `Active lesson takeaway: ${activeLesson.takeaway}`,
    `Active lesson source spans: ${activeLesson.sourceSpans.map((span) => `${span.label}${span.sourceRange ? ` (${span.sourceRange})` : ""}: ${span.text}`).join(" | ")}`,
    `Category purpose: ${activeLesson.example.whyThisMatters}`,
    `Category steps: ${categoryLessons.map((lesson) => lesson.title).join(" -> ")}`,
    `Core moves: ${categoryMoves.join(" ")}`,
    `Examples inside this category: ${categoryExamples.join(" ")}`,
    sourceText ? `Source seed: ${truncateWords(sourceText, 30)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2_000);
}

function buildLearnPageData(
  output: LearnSessionOutput,
  sourceText: string,
  focusedClaim: BrainClaim | null,
  focusNode: CanvasNode | null,
): LearnPageData {
  if (isCreateLearnBridgeNode(focusNode)) {
    return buildCreateLearnBridgePageData(focusNode);
  }

  if (isCreateOptionLearnNode(focusNode)) {
    return buildCreateOptionLearnPageData(focusNode);
  }

  if (output.sessionV2) {
    return buildLearnPageDataFromSessionV2(output.sessionV2);
  }

  if (output.learningPlan) {
    return buildLearnPageDataFromPlan(output.learningPlan, sourceText, output);
  }

  const goal = goalFrom(output.coreIdea);
  const coreBullets = coreIdeaBullets(output, focusedClaim, focusNode);
  const primaryExample = firstText(focusedClaim?.text, focusNode?.summary, output.claims[0]?.text, output.coreIdea);
  const conceptNote = output.creativePotential[0] ?? "Use this step to separate what you know from what still needs testing.";
  const baseSteps = [
    {
      id: "step-1",
      title: "Understand the target",
      expanded: true,
      substeps: [
        { id: "step-1-substep-1", title: "Name the end state", isActive: true },
        { id: "step-1-substep-2", title: "Identify the main object", isActive: false },
        { id: "step-1-substep-3", title: "Define done for this lesson", isActive: false },
      ],
    },
    {
      id: "step-2",
      title: "Break it into work chunks",
      expanded: false,
      substeps: [
        { id: "step-2-substep-1", title: "List the required pieces", isActive: false },
        { id: "step-2-substep-2", title: "Order the chunks", isActive: false },
        { id: "step-2-substep-3", title: "Connect each chunk to the goal", isActive: false },
      ],
    },
    {
      id: "step-3",
      title: "Work the chunks",
      expanded: false,
      substeps: [
        { id: "step-3-substep-1", title: "Choose the first case", isActive: false },
        { id: "step-3-substep-2", title: "Do the expert move", isActive: false },
        { id: "step-3-substep-3", title: "Capture the result", isActive: false },
        { id: "step-3-substep-4", title: "Compare result to goal", isActive: false },
      ],
    },
    {
      id: "step-4",
      title: "Check the work",
      expanded: false,
      substeps: [
        { id: "step-4-substep-1", title: "Find the failure point", isActive: false },
        { id: "step-4-substep-2", title: "Set the revision rule", isActive: false },
        { id: "step-4-substep-3", title: "Revise without losing the goal", isActive: false },
      ],
    },
    {
      id: "step-5",
      title: "Finish with a usable result",
      expanded: false,
      substeps: [
        { id: "step-5-substep-1", title: "Produce the final takeaway", isActive: false },
        { id: "step-5-substep-2", title: "Decide the next action", isActive: false },
        { id: "step-5-substep-3", title: "Connect result to the graph", isActive: false },
      ],
    },
  ];
  const totalSteps = baseSteps.length;
  const steps = baseSteps.map((step, stepIndex) => ({
    ...step,
    substeps: step.substeps.map((substep, substepIndex) => ({
      ...substep,
      lesson: buildSubstepLesson({
        step,
        substep,
        stepIndex,
        substepIndex,
        totalSteps,
        sourceText,
        output,
        primaryExample,
        coreBullets,
        conceptNote,
      }),
    })),
  }));

  return {
    goal,
    progressPercent: 22,
    steps,
    currentStep: steps[0]!.substeps[0]!.lesson,
    askPenny: {
      suggestedQuestions: [
        "Can you explain this in simpler terms?",
        "Can you show a visual?",
        "What's the most important part here?",
        "Give me another example.",
      ],
      placeholder: "Ask anything...",
    },
  };
}

function isCreateLearnBridgeNode(node: CanvasNode | null): node is CreateLearnBridgeNode {
  return node?.id === "create-learn:brain-ranker-judgment-events";
}

function isCreateOptionLearnNode(node: CanvasNode | null): node is CreateOptionLearnNode {
  return Boolean(node?.id.startsWith("create-option-learn:"));
}

function buildCreateLearnBridgePageData(focusNode: CreateLearnBridgeNode): LearnPageData {
  const goal = focusNode.summary ?? "Brain Ranker weights explicit judgment events over implicit behavior.";
  const lessons: LearnLesson[] = [
    createCreateBridgeLesson({
      index: 0,
      title: "Explain simply",
      shortExplanation:
        "Explicit judgment events are the things you deliberately do: selecting cards, writing comments, and rating exports. Penny should trust those more than passive behavior like hovering, scrolling, or merely opening a drawer.",
      visualTitle: "Signal strength",
      visualBody: "Explicit judgment -> strong memory signal -> future Create ranking\nImplicit behavior -> weak hint -> never overrides stated judgment",
      visualDescription: "The ranker treats deliberate judgment as stronger evidence than accidental interaction.",
      quickCheck: "If a user selects Critical but only views Practical, which signal should carry more weight?",
      takeaway: "Penny should learn from chosen judgment before inferred behavior.",
      exampleLines: [
        "User selects Personal, Valuable, and Critical.",
        "User only opens Practical details.",
        "Next Create run should weight the selected lenses higher because those were explicit judgment events.",
      ],
      whyThisMatters: "This keeps Penny controllable: the user teaches the instrument by deciding, not by being watched.",
    }),
    createCreateBridgeLesson({
      index: 1,
      title: "Show worked example",
      shortExplanation:
        "A useful ranking update can be written as a simple priority rule: selected option events outrank unselected viewing events, and written comments outrank both.",
      visualTitle: "Worked ranking rule",
      visualBody: "1. Comment: strongest\n2. Selected option: strong\n3. Export feedback: strong\n4. Viewed option: weak\n5. Unseen option: no signal",
      visualDescription: "The example orders judgment evidence by how intentional it is.",
      quickCheck: "Where should a written founder/builder comment sit in the ranking order?",
      takeaway: "The more intentional the action, the more Penny should reuse it.",
      exampleLines: [
        "Comment: Keep Penny as a memory-native workbench.",
        "Selected: Personal + Valuable + Critical.",
        "Ignored: Weird.",
        "Result: the artifact should preserve memory, target user value, and critique before novelty.",
      ],
      whyThisMatters: "The artifact changes for reasons the user can inspect.",
    }),
    createCreateBridgeLesson({
      index: 2,
      title: "Apply to my artifact",
      shortExplanation:
        "For the current Create artifact, Penny should make the selected lenses and comment visible in the prompt, then use them as future Brain Ranker evidence.",
      visualTitle: "Artifact application",
      visualBody:
        "Brain memory -> five cards -> explicit selection/comment -> artifact sections -> export prompt -> future ranking evidence",
      visualDescription: "The artifact becomes a visible receipt for what Penny learned.",
      quickCheck: "What should the exported prompt show so the next run can learn from it?",
      takeaway: "The artifact is not just output; it is a durable judgment receipt.",
      exampleLines: [
        "Selected lenses appear in Selected Option History.",
        "The founder/builder comment appears in User Intent.",
        "The exported prompt carries those choices forward as source-backed constraints.",
      ],
      whyThisMatters: `This applies directly to ${focusNode.refs?.artifactId ? `artifact ${focusNode.refs.artifactId}` : "the current artifact"}.`,
    }),
  ];
  const steps = lessons.map((lesson, index) => ({
    id: `create-learn-step-${index + 1}`,
    title: lesson.title,
    expanded: index === 0,
    substeps: [
      {
        id: `create-learn-step-${index + 1}-substep-1`,
        title: lesson.title,
        isActive: index === 0,
        lesson,
      },
    ],
  }));

  return {
    goal: "Learn how Brain Ranker uses explicit Create judgment",
    progressPercent: 0,
    steps,
    currentStep: lessons[0]!,
    askPenny: {
      suggestedQuestions: [
        "Explain this more simply.",
        "Show another worked example.",
        "How does this change my artifact?",
        "What should Penny not infer from passive behavior?",
      ],
      placeholder: "Ask about explicit judgment signals...",
    },
  };
}

function buildCreateOptionLearnPageData(focusNode: CreateOptionLearnNode): LearnPageData {
  const optionTitle = focusNode.title || "Create option";
  const optionSummary = focusNode.summary ?? "This Create option needs a simple explanation, worked example, and artifact application.";
  const lessons: LearnLesson[] = [
    createCreateBridgeLesson({
      index: 0,
      title: "Explain simply",
      shortExplanation: `What this option means: ${optionSummary}`,
      visualTitle: "Option meaning",
      visualBody: `${optionTitle}\n-> direction for the artifact\n-> user decides whether to use it`,
      visualDescription: "The option is a possible direction, not Penny's command.",
      quickCheck: "What part of this option should the human judge before Penny updates the artifact?",
      takeaway: "A Create option is useful when it gives direction without taking judgment away.",
      exampleLines: [
        `Option: ${optionTitle}.`,
        "User reads the evidence and decides whether it belongs in the selected mix.",
        "Penny waits for the selection/comment before updating the artifact.",
      ],
      whyThisMatters: "The demo shows Penny growing creativity by opening directions before narrowing them.",
    }),
    createCreateBridgeLesson({
      index: 1,
      title: "Show worked example",
      shortExplanation:
        "A full worked example means translating the option into one visible artifact change, one evidence check, and one next move.",
      visualTitle: "Worked option path",
      visualBody: "Option -> evidence drawer -> selected mix -> artifact section -> export requirement",
      visualDescription: "The example follows the option through the same Create loop the user can inspect.",
      quickCheck: "Which artifact section should change first when this option is selected?",
      takeaway: "The option earns its place by changing the artifact in a traceable way.",
      exampleLines: [
        `Read ${optionTitle}.`,
        "Open details and inspect source/memory evidence.",
        "Select the card, write a comment, update the artifact, and verify the changed section.",
      ],
      whyThisMatters: "This keeps the demo grounded in visible evidence instead of generic generation.",
    }),
    createCreateBridgeLesson({
      index: 2,
      title: "Apply to my artifact",
      shortExplanation:
        "Apply the option by turning its lens into a concrete requirement, risk, or non-goal in the current artifact.",
      visualTitle: "Artifact application",
      visualBody: `${optionTitle}\n-> selected option history\n-> matching artifact section\n-> coding-agent prompt`,
      visualDescription: "The option becomes a visible instruction in the exported build prompt.",
      quickCheck: "What should the export include so a coding agent can act on this option?",
      takeaway: "The selected option should survive as a clear artifact requirement, not just a card click.",
      exampleLines: [
        "Selected option history names the lens.",
        "The artifact section says what changed.",
        "The export carries the evidence, non-goal, and implementation step forward.",
      ],
      whyThisMatters: `This applies directly to ${focusNode.refs?.artifactId ? `artifact ${focusNode.refs.artifactId}` : "the current artifact"}.`,
    }),
  ];
  const steps = lessons.map((lesson, index) => ({
    id: `create-option-learn-step-${index + 1}`,
    title: lesson.title,
    expanded: index === 0,
    substeps: [
      {
        id: `create-option-learn-step-${index + 1}-substep-1`,
        title: lesson.title,
        isActive: index === 0,
        lesson,
      },
    ],
  }));

  return {
    goal: `Learn ${optionTitle} without leaving Create judgment behind.`,
    progressPercent: 34,
    steps,
    currentStep: steps[0]!.substeps[0]!.lesson,
    askPenny: {
      suggestedQuestions: [
        "Explain this option in simpler terms.",
        "Show another worked example.",
        "Apply this option to the artifact.",
        "What evidence supports this option?",
      ],
      placeholder: "Ask about this Create option...",
    },
  };
}

function createCreateBridgeLesson(input: {
  index: number;
  title: string;
  shortExplanation: string;
  visualTitle: string;
  visualBody: string;
  visualDescription: string;
  quickCheck: string;
  takeaway: string;
  exampleLines: string[];
  whyThisMatters: string;
}): LearnLesson {
  return {
    stepNumber: input.index + 1,
    totalSteps: 3,
    substepNumber: 1,
    totalSubsteps: 1,
    title: input.title,
    parentTitle: "Create judgment signals",
    learningGoal: input.title,
    shortExplanation: input.shortExplanation,
    visual: {
      type: "diagram",
      title: input.visualTitle,
      body: input.visualBody,
      description: input.visualDescription,
    },
    quickCheck: input.quickCheck,
    takeaway: input.takeaway,
    sourceSpans: [],
    teachingSections: [
      { title: "Definition", body: input.shortExplanation },
      { title: "Application", body: input.whyThisMatters },
      { title: "Procedure", body: input.exampleLines.join(" ") },
    ],
    misconceptions: ["Passive behavior should not silently override an explicit user decision."],
    coreIdea: {
      bullets: input.exampleLines,
      visualPlaceholderLabel: input.visualTitle,
    },
    example: {
      title: input.visualTitle,
      description: input.visualDescription,
      lines: input.exampleLines,
      whyThisMatters: input.whyThisMatters,
      format: "business",
    },
    nextStepTitle: input.index === 2 ? "Back to Create" : "the next Create judgment lesson",
  };
}

function buildLearnPageDataFromSessionV2(sessionV2: LearnSessionV2): LearnPageData {
  const steps = sessionV2.pages.map((page, index) => {
    const lesson = learnLessonFromV2Page(page, sessionV2.pages.length);

    return {
      id: page.id,
      title: page.title,
      expanded: index === 0,
      substeps: [
        {
          id: page.id,
          title: page.title,
          isActive: index === 0,
          lesson,
        },
      ],
    };
  });

  return {
    goal: sessionV2.goal,
    progressPercent: 0,
    steps,
    currentStep: steps[0]!.substeps[0]!.lesson,
    askPenny: {
      suggestedQuestions: [
        "Explain this visual.",
        "Give another example.",
        "Make this simpler.",
        "Quiz me on this lesson.",
        "Connect this to the previous lesson.",
      ],
      placeholder: "Ask about this lesson...",
    },
  };
}

function learnLessonFromV2Page(page: LearnPageV2, totalLessons: number): LearnLesson {
  return {
    stepNumber: page.lessonNumber,
    totalSteps: totalLessons,
    substepNumber: 1,
    totalSubsteps: 1,
    title: page.title,
    parentTitle: page.title,
    learningGoal: page.title,
    shortExplanation: page.explanation,
    visual: page.visual,
    quickCheck: page.quickCheck,
    takeaway: page.takeaway,
    sourceSpans: page.sourceSpans,
    teachingSections: [],
    misconceptions: [],
    coreIdea: {
      bullets: (page.visual.items ?? []).map((item) => item.text).slice(0, 4),
      visualPlaceholderLabel: page.visual.title,
    },
    example: {
      title: page.visual.title,
      description: page.visual.description,
      lines: [page.visual.body],
      whyThisMatters: page.takeaway,
      format: visualTypeToExampleFormat(page.visual.type),
    },
    nextStepTitle: "the next lesson",
  };
}

function buildLearnPageDataFromPlan(
  plan: LearningPlan,
  sourceText: string,
  output: LearnSessionOutput,
): LearnPageData {
  const totalSteps = plan.groups.length;
  const steps = plan.groups.map((group, stepIndex) => ({
    id: group.id,
    title: group.title,
    expanded: stepIndex === 0,
    substeps: group.subgroups.map((subgroup, substepIndex) => {
      const nextSubgroup = group.subgroups[substepIndex + 1];
      const lesson: LearnLesson = {
        stepNumber: stepIndex + 1,
        totalSteps,
        substepNumber: substepIndex + 1,
        totalSubsteps: group.subgroups.length,
        title: subgroup.title,
        parentTitle: group.title,
        learningGoal: subgroup.oneLineGoal ?? fallbackOneLineGoal(group.id, subgroup.title),
        shortExplanation: subgroup.teachingParagraph,
        visual: legacyVisualFromSubgroup(subgroup, sourceText),
        quickCheck: legacyQuickCheckFromSubgroup(subgroup, output.coreIdea),
        takeaway: legacyTakeawayFromSubgroup(subgroup),
        sourceSpans: legacySourceSpansFromSubgroup(subgroup, sourceText),
        teachingSections: normalizeTeachingSections(subgroup.teachingSections, subgroup.keyMoves, subgroup.teachingParagraph),
        misconceptions: normalizeMisconceptions(subgroup.misconceptions, subgroup.id),
        coreIdea: {
          bullets: subgroup.keyMoves.slice(0, 4),
          visualPlaceholderLabel: `${subgroup.visualExample.title}: ${subgroup.visualExample.description}`,
        },
        example: {
          title: subgroup.visualExample.title,
          description: "Big-picture example for this subgroup.",
          lines: [
            subgroup.sourceContext
              ? `Local context: ${subgroup.sourceContext.sourceRange} - ${subgroup.sourceContext.localSummary}`
              : "",
            `Prompt: ${truncateWords(sourceText || output.coreIdea, 18)}`,
            subgroup.workedExample,
            `Use: ${subgroup.visualExample.description}`,
          ].filter(Boolean),
          whyThisMatters: group.purpose,
          format: inferExampleFormat(sourceText),
        },
        inlineNote: subgroup.sourceContext
          ? `${plan.expertRole} Context is scoped to ${subgroup.sourceContext.clusterTitle}.`
          : plan.expertRole,
        nextStepTitle: nextSubgroup?.title ?? "the next learning chunk",
      };
      const previousSubgroup = group.subgroups[substepIndex - 1];

      return {
        id: subgroup.id,
        title: subgroup.title,
        isActive: stepIndex === 0 && substepIndex === 0,
        lesson: previousSubgroup ? { ...lesson, previousStepTitle: previousSubgroup.title } : lesson,
      };
    }),
  }));

  return {
    goal: plan.goal,
    progressPercent: 0,
    steps,
    currentStep: steps[0]!.substeps[0]!.lesson,
    askPenny: {
      suggestedQuestions: [
        "Can you teach this more simply?",
        "Show me another worked example.",
        "What should I challenge here?",
        "How does this connect to my Brain?",
      ],
      placeholder: "Ask about this subgroup...",
    },
  };
}

function flattenLessonPages(steps: LearnPageData["steps"]): LearnLessonPage[] {
  return steps.flatMap((step) => step.substeps.map((substep) => ({ step, substep })));
}

function normalizeTeachingSections(
  sections: LearningPlan["groups"][number]["subgroups"][number]["teachingSections"] | undefined,
  keyMoves: string[],
  teachingParagraph: string,
): LearnLesson["teachingSections"] {
  if (sections?.length === 3) {
    return sections;
  }

  return fallbackTeachingSections(keyMoves, teachingParagraph);
}

function fallbackTeachingSections(keyMoves: string[], teachingParagraph: string): LearnLesson["teachingSections"] {
  const [firstMove, secondMove, thirdMove] = keyMoves;

  return [
    {
      title: "Definition",
      body: firstMove ?? teachingParagraph,
    },
    {
      title: "Application",
      body: secondMove ?? teachingParagraph,
    },
    {
      title: "Procedure",
      body: thirdMove ?? "Use this subsection to produce one reusable claim, distinction, or next question.",
    },
  ];
}

function fallbackOneLineGoal(groupId: string, subgroupTitle: string): string {
  if (groupId.startsWith("yc-")) {
    return `Use "${subgroupTitle}" to answer what YC would actually evaluate in the January 1 application question.`;
  }

  return `Use "${subgroupTitle}" to produce one concrete learning result for this section.`;
}

function normalizeMisconceptions(misconceptions: string[] | undefined, stepId?: string): string[] {
  return misconceptions?.length ? misconceptions.slice(0, 4) : fallbackMisconceptions(stepId);
}

function fallbackMisconceptions(stepId?: string): string[] {
  if (stepId?.startsWith("yc-")) {
    return [
      "Do not turn the YC question into a prestige ranking.",
      "Do not treat investor interest as stronger than founder proof, insight, or traction.",
      "Do not answer with startup folklore; convert the claim into application evidence.",
    ];
  }

  if (stepId === "step-4") {
    return ["A challenge is not proof by itself.", "A checked explanation can still need external evidence."];
  }

  return ["Do not treat this subsection as the whole topic.", "Do not add background unless it changes the current point."];
}

function buildSubstepLesson({
  step,
  substep,
  stepIndex,
  substepIndex,
  totalSteps,
  sourceText,
  output,
  primaryExample,
  coreBullets,
  conceptNote,
}: {
  step: {
    id: string;
    title: string;
    substeps: Array<{ id: string; title: string }>;
  };
  substep: { id: string; title: string };
  stepIndex: number;
  substepIndex: number;
  totalSteps: number;
  sourceText: string;
  output: LearnSessionOutput;
  primaryExample: string;
  coreBullets: string[];
  conceptNote: string;
}): LearnLesson {
  const source = truncateWords(sourceText || output.coreIdea, 16);
  const claim = truncateWords(primaryExample, 16);
  const compactBullets = lessonBullets(step.id, substep.id, coreBullets, claim);
  const nextSubstep = step.substeps[substepIndex + 1];

  const lesson: LearnLesson = {
    stepNumber: stepIndex + 1,
    totalSteps,
    substepNumber: substepIndex + 1,
    totalSubsteps: step.substeps.length,
    title: substep.title,
    parentTitle: step.title,
    learningGoal: `Learn ${substep.title.toLowerCase()} as the next subsection of ${step.title.toLowerCase()}.`,
    shortExplanation: substepExplanation(step.id, substep.id),
    visual: fallbackVisualForLesson(step.id, substep.title, compactBullets),
    quickCheck: `Your turn: apply "${compactBullets[0] ?? substep.title}" to "${claim}" in one sentence.`,
    takeaway: `${substep.title}: ${compactBullets[0] ?? substepExplanation(step.id, substep.id)}`,
    sourceSpans: [{ sourceId: "source.raw_idea", label: "Source idea", text: sourceText || output.coreIdea }],
    teachingSections: fallbackTeachingSections(compactBullets, substepExplanation(step.id, substep.id)),
    misconceptions: fallbackMisconceptions(step.id),
    coreIdea: {
      bullets: compactBullets,
      visualPlaceholderLabel: lessonVisualLabel(step.id),
    },
    example: {
      title: lessonExampleTitle(step.id, substep.id),
      description: "One compact pass sized for this page.",
      lines: lessonExampleLines(step.id, substep.id, source, claim),
      whyThisMatters: lessonWhyItMatters(step.id),
      format: inferExampleFormat(sourceText),
    },
    inlineNote: substepIndex === 0 ? conceptNote : `Keep this chunk small: finish ${substep.title.toLowerCase()} before opening the next idea.`,
    nextStepTitle: nextSubstep?.title ?? "the next learning chunk",
  };
  const previousSubstep = step.substeps[substepIndex - 1];

  return previousSubstep ? { ...lesson, previousStepTitle: previousSubstep.title } : lesson;
}

function lessonBullets(stepId: string, substepId: string, coreBullets: string[], claim: string): string[] {
  const fallbackByStep: Record<string, string[]> = {
    "step-1": [
      `Keep the end state tied to: ${claim}`,
      "Name what finished understanding should let you do.",
      "Trim details that do not affect the goal.",
    ],
    "step-2": [
      "Turn the goal into visible work chunks.",
      "Put the chunks in the order an expert would use.",
      "Connect each chunk back to the goal.",
    ],
    "step-3": [
      "Work one chunk at a time.",
      "Show the expert move instead of summarizing it.",
      "Capture the result before continuing.",
    ],
    "step-4": [
      "Check the most important weak point first.",
      "Name what would force revision.",
      "Revise without losing the goal.",
    ],
    "step-5": [
      "Produce a final takeaway Penny can reuse.",
      "Choose the next action from the remaining gap.",
      "Leave a clear checkpoint for later review.",
    ],
  };
  const firstCore = coreBullets.slice(0, 2).map((item) => truncateWords(item, 14));
  const fallback = fallbackByStep[stepId] ?? fallbackByStep["step-1"]!;

  if (substepId.endsWith("1") && firstCore.length > 0) {
    return uniqueNonEmpty([...firstCore, fallback[0]!, fallback[1]!]).slice(0, 3);
  }

  return fallback;
}

function substepExplanation(stepId: string, substepId: string): string {
  const explanations: Record<string, string> = {
    "step-1-substep-1": "Turn the prompt into the finished understanding this page is trying to reach.",
    "step-1-substep-2": "Name the main claim, object, or skill the rest of the path must work on.",
    "step-1-substep-3": "Define what counts as done so the path can move all the way to a result.",
    "step-2-substep-1": "List the pieces that must be handled before the goal is genuinely understood.",
    "step-2-substep-2": "Put the pieces in the order an expert would work them.",
    "step-2-substep-3": "Make every chunk point back to the goal it serves.",
    "step-3-substep-1": "Choose the first concrete case small enough to fit on one page.",
    "step-3-substep-2": "Do the expert move one visible action at a time.",
    "step-3-substep-3": "Capture what the work produced before continuing.",
    "step-3-substep-4": "Compare the result with the goal and keep only useful differences.",
    "step-4-substep-1": "Find the failure point that would matter if it were true.",
    "step-4-substep-2": "Name what would force the work to change.",
    "step-4-substep-3": "Revise the result while preserving what still serves the goal.",
    "step-5-substep-1": "Turn the completed work into a compact final takeaway.",
    "step-5-substep-2": "Choose the next action from what remains unresolved.",
    "step-5-substep-3": "Attach the result back to Penny's graph.",
  };

  return explanations[substepId] ?? stepExplanation(stepId);
}

function lessonVisualLabel(stepId: string): string {
  switch (stepId) {
    case "step-2":
      return "Assumption stack: claim -> premise -> risk";
    case "step-3":
      return "Worked example trace: input -> move -> output";
    case "step-4":
      return "Challenge loop: objection -> test -> revision";
    case "step-5":
      return "Finish path: takeaway -> next action -> graph";
    default:
      return "Goal path: prompt -> end state -> done";
  }
}

function lessonExampleTitle(stepId: string, substepId: string): string {
  if (substepId.endsWith("1")) {
    return stepId === "step-1" ? "From prompt to end state" : "Start the chunk";
  }

  if (stepId === "step-3") {
    return "Worked case in miniature";
  }

  if (stepId === "step-4") {
    return "Challenge and response";
  }

  return "Chunked lesson move";
}

function lessonExampleLines(stepId: string, substepId: string, source: string, claim: string): string[] {
  const base: Record<string, string[]> = {
    "step-1": [
      `Input: ${source}`,
      `End state: ${claim}`,
      "Done means the learner can explain the goal and name the weak point.",
    ],
    "step-2": [
      `Goal: ${claim}`,
      "Chunk: name one piece that must be worked.",
      "Link: attach the chunk to the goal it serves.",
    ],
    "step-3": [
      `Case: ${source}`,
      "Move: work one chunk in a concrete situation.",
      "Output: name what changed and why it matters.",
    ],
    "step-4": [
      `Target: ${claim}`,
      "Failure point: state the strongest thing that could break the result.",
      "Revision rule: decide what would change the work.",
    ],
    "step-5": [
      `Result: ${claim}`,
      "Finish: turn the work into a usable takeaway.",
      "Next: attach the follow-up action to the graph.",
    ],
  };
  const detail = substepId.endsWith("3") || substepId.endsWith("4") ? "Checkpoint: keep the result small enough to revisit later." : "";

  return uniqueNonEmpty([...(base[stepId] ?? base["step-1"]!), detail]).slice(0, 4);
}

function lessonWhyItMatters(stepId: string): string {
  switch (stepId) {
    case "step-2":
      return "Visible assumptions make the lesson testable instead of persuasive by default.";
    case "step-3":
      return "A worked case exposes missing moves before they become hidden confusion.";
    case "step-4":
      return "Challenge keeps the lesson from hardening around an untested weak point.";
    case "step-5":
      return "A finished result lets Penny bring the work back in later sessions.";
    default:
      return "A clear frame gives Penny one stable object to teach, challenge, and remember.";
  }
}

function stepExplanation(stepId: string): string {
  switch (stepId) {
    case "step-2":
      return "Break the target into ordered chunks so each page does one real piece of work.";
    case "step-3":
      return "Work the chunks through concrete cases, because examples reveal missing steps faster than summaries.";
    case "step-4":
      return "Check the weakest important point before treating the work as finished.";
    case "step-5":
      return "Turn the completed work into a usable takeaway Penny can bring back later.";
    default:
      return "Start by naming the end state, then keep only the details that help reach it.";
  }
}

function goalFrom(coreIdea: string): string {
  const trimmed = coreIdea.trim();

  if (!trimmed) {
    return "I want to understand this idea clearly.";
  }

  if (/^teach\s+me\s+(about\s+|how\s+to\s+|how\s+|why\s+|what\s+)?/i.test(trimmed)) {
    return trimmed.replace(/^teach\s+me\s+/i, "I want to understand ");
  }

  if (/^i\s+(want|need|would like|am trying)/i.test(trimmed)) {
    return trimmed;
  }

  return `I want to understand how ${trimmed} works.`;
}

function coreIdeaBullets(
  output: LearnSessionOutput,
  focusedClaim: BrainClaim | null,
  focusNode: CanvasNode | null,
): string[] {
  const candidates = uniqueNonEmpty([
    focusedClaim?.text ?? "",
    focusNode?.summary ?? "",
    ...output.claims.map((claim) => claim.text),
    ...output.assumptions.map((claim) => `Assumption to watch: ${claim.text}`),
    ...output.questions.map((claim) => `Open question: ${claim.text}`),
  ]);

  if (candidates.length >= 3) {
    return candidates.slice(0, 5).map((item) => truncateWords(item, 20));
  }

  return [
    "Name the central claim before adding detail.",
    "Separate what is known from what is assumed.",
    "Use one concrete example to make the step inspectable.",
    "Keep the next challenge visible so learning stays testable.",
  ];
}

function inferExampleFormat(text: string): LearnExampleFormat {
  if (/```|function\s|const\s|let\s|class\s|import\s|def\s/i.test(text)) {
    return "code";
  }

  if (/[=∫∑]|derivative|equation|formula|calculate/i.test(text)) {
    return "math";
  }

  if (/\bessay|paragraph|outline|draft|sentence|writing\b/i.test(text)) {
    return "writing";
  }

  if (/\bmarket|customer|revenue|pricing|business|sales\b/i.test(text)) {
    return "business";
  }

  return "generic";
}

function visualTypeToExampleFormat(type: LearnVisualType): LearnExampleFormat {
  if (type === "code") {
    return "code";
  }

  if (type === "latex") {
    return "math";
  }

  return "generic";
}

function legacyVisualFromSubgroup(
  subgroup: LearningPlan["groups"][number]["subgroups"][number],
  sourceText: string,
): LearnPageV2["visual"] {
  const type = inferLegacyVisualType(`${subgroup.title} ${subgroup.teachingParagraph} ${subgroup.visualExample.description} ${sourceText}`);
  const items = subgroup.keyMoves.slice(0, 4).map((move, index) => ({ label: `Step ${index + 1}`, text: move }));

  return {
    type,
    title: subgroup.visualExample.title,
    description: subgroup.visualExample.description,
    body: legacyVisualBody(type, subgroup),
    ...(items.length ? { items } : {}),
  };
}

function fallbackVisualForLesson(stepId: string, title: string, bullets: string[]): LearnPageV2["visual"] {
  const type: LearnVisualType = stepId === "step-3" ? "diagram" : stepId === "step-4" ? "comparison" : "concept_map";
  const items = bullets.slice(0, 4).map((bullet, index) => ({ label: `Step ${index + 1}`, text: bullet }));

  return {
    type,
    title,
    description: lessonVisualLabel(stepId),
    body: bullets.join(" -> "),
    ...(items.length ? { items } : {}),
  };
}

function inferLegacyVisualType(text: string): LearnVisualType {
  const compact = text.toLowerCase();

  if (/```|function\s|const\s|let\s|class\s|code|api/.test(compact)) {
    return "code";
  }

  if (/[=∫∑]|derivative|equation|formula|calculate|probability|slope/.test(compact)) {
    return "latex";
  }

  if (/\b(compare|versus|rather than|instead of|not the same|tradeoff)\b/.test(compact)) {
    return "comparison";
  }

  if (/\b(image|photo|screenshot|slide)\b/.test(compact)) {
    return "image";
  }

  if (/\b(loop|trace|flow|path|arrow|ladder|stack)\b/.test(compact)) {
    return "diagram";
  }

  return "concept_map";
}

function legacyVisualBody(type: LearnVisualType, subgroup: LearningPlan["groups"][number]["subgroups"][number]): string {
  switch (type) {
    case "latex":
      return "$$\\text{idea} \\rightarrow \\text{rule} \\rightarrow \\text{result}$$";
    case "code":
      return ["const lesson = currentIdea;", "const result = applyOneMove(lesson);", "check(result);"].join("\n");
    case "comparison":
      return `${subgroup.keyMoves[0] ?? subgroup.title} | ${subgroup.misconceptions?.[0] ?? "A weaker interpretation"}`;
    case "image":
      return subgroup.visualExample.description;
    case "diagram":
    case "concept_map":
      return [subgroup.title, ...subgroup.keyMoves.slice(0, 3)].join(" -> ");
  }
}

function legacyQuickCheckFromSubgroup(
  subgroup: LearningPlan["groups"][number]["subgroups"][number],
  coreIdea: string,
): string {
  return `Your turn: apply "${subgroup.keyMoves[0] ?? subgroup.title}" to "${truncateWords(coreIdea, 18)}" in one sentence.`;
}

function legacyTakeawayFromSubgroup(subgroup: LearningPlan["groups"][number]["subgroups"][number]): string {
  return truncateWords(`${subgroup.title}: ${subgroup.workedExample}`, 24);
}

function legacySourceSpansFromSubgroup(
  subgroup: LearningPlan["groups"][number]["subgroups"][number],
  sourceText: string,
): LearnPageV2["sourceSpans"] {
  if (subgroup.sourceContext) {
    return [
      {
        sourceId: subgroup.sourceContext.clusterId,
        label: subgroup.sourceContext.clusterTitle,
        text: subgroup.sourceContext.localSummary,
        sourceRange: subgroup.sourceContext.sourceRange,
      },
    ];
  }

  return [{ sourceId: "source.raw_idea", label: "Source idea", text: truncateWords(sourceText, 34) }];
}

function LearnIdeaDrop({
  disabled,
  status,
  recents,
  searchWeb,
  onSearchWebChange,
  onSave,
  onKeep,
}: {
  disabled: boolean;
  status: string;
  recents: BrainRecentIdea[];
  searchWeb: boolean;
  onSearchWebChange: (searchWeb: boolean) => void;
  onSave: (rawIdea: string, options: { searchWeb: boolean }) => Promise<void>;
  onKeep: (rawIdea: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const trimmedDraft = draft.trim();

  async function handleSave() {
    if (!trimmedDraft) {
      return;
    }

    await onSave(trimmedDraft, { searchWeb });
    setDraft("");
  }

  async function handleKeep() {
    if (!trimmedDraft) {
      return;
    }

    await onKeep(trimmedDraft);
    setDraft("");
  }

  return (
    <section className="idea-drop" aria-label="Drop an idea entry">
      <label className="sr-only" htmlFor="learnIdeaDrop">Idea</label>
      <textarea
        id="learnIdeaDrop"
        value={draft}
        disabled={disabled}
        placeholder="Paste the messy thought, decision, or question you want to make rigorous..."
        aria-describedby="learnIdeaDropStatus"
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="idea-drop-footer">
        <button type="button" className="idea-drop-tool" disabled={disabled || !draft} onClick={() => setDraft("")}>
          Clear
        </button>
        <label className="learn-search-toggle">
          <input
            type="checkbox"
            checked={searchWeb}
            disabled={disabled}
            onChange={(event) => onSearchWebChange(event.target.checked)}
          />
          <span>Web sources</span>
        </label>
        <div className="idea-drop-actions">
          <button type="button" className="text-command" disabled={disabled || !trimmedDraft} onClick={handleKeep}>
            Keep in Recents
          </button>
          <button type="button" className="primary-command" disabled={disabled || !trimmedDraft} onClick={handleSave}>
            Save to Brain
          </button>
        </div>
      </div>
      <LearnSourceIndicator behavior={learnSourceBehavior(trimmedDraft, searchWeb)} />
      <LearnLoadout />
      <p id="learnIdeaDropStatus" className="sr-only">
        {status}
      </p>
      {recents.length > 0 ? (
        <div className="recents-pile" aria-label="Recents pile">
          <strong>Recents pile</strong>
          <div>
            {recents.slice(0, 4).map((recent) => (
              <button key={recent.id} type="button" disabled={disabled} onClick={() => setDraft(recent.rawIdea)}>
                {recent.rawIdea}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LearnLoadout() {
  return (
    <div className="learn-loadout" aria-label="Penny loadout">
      <span>
        <kbd>Ctrl</kbd>
        <kbd>B</kbd>
        <strong>Brain</strong>
      </span>
      <span>
        <kbd>Ctrl</kbd>
        <kbd>C</kbd>
        <strong>Check</strong>
      </span>
      <span>
        <kbd>Ctrl</kbd>
        <kbd>L</kbd>
        <strong>Learn</strong>
      </span>
      <span>
        <kbd>Ctrl</kbd>
        <kbd>Q</kbd>
        <strong>Quick note</strong>
      </span>
    </div>
  );
}

interface LearnSourceBehavior {
  usedWeb: boolean;
  label: "Used your Brain" | "Used web because";
  detail: string;
}

function LearnSourceIndicator({ behavior }: { behavior: LearnSourceBehavior }) {
  return (
    <div className={`learn-source-indicator${behavior.usedWeb ? " used-web" : ""}`} aria-label="Learn source behavior">
      <span>{behavior.label}</span>
      <p>{behavior.detail}</p>
    </div>
  );
}

function learnSourceBehavior(text: string, searchWebRequested: boolean): LearnSourceBehavior {
  if (searchWebRequested) {
    return {
      usedWeb: true,
      label: "Used web because",
      detail: "you turned web sources on for this idea.",
    };
  }

  const webReason = learnWebReason(text);

  if (webReason) {
    return {
      usedWeb: true,
      label: "Used web because",
      detail: webReason,
    };
  }

  return {
    usedWeb: false,
    label: "Used your Brain",
    detail: "Penny started from the saved graph context and this idea.",
  };
}

function learnWebReason(text: string): string | null {
  if (/\b(search|web|browse|look up|lookup|source|sources|citation|citations|verify|fact[- ]check|find evidence)\b/i.test(text)) {
    return "the idea asks for external sources.";
  }

  if (/\b(current|latest|today|recent|news|pricing|version|release|law|regulation|202[4-9])\b/i.test(text)) {
    return "the idea may need current information.";
  }

  return null;
}

function buildLearnSessionOutput(
  data: BrainData | null,
  selectedDocument: BrainDocumentSummary | null,
  autopilot: AutopilotTickData | null,
): LearnSessionOutput | null {
  if (selectedDocument?.sessionId === "mock-session-yc-jan-1") {
    return defaultLearnSessionOutput();
  }

  if (!data && !selectedDocument) {
    return null;
  }

  const graphClaims = data?.ideaMap?.claims ?? [];
  const claims: BrainClaim[] =
    graphClaims.length > 0 ? graphClaims : selectedDocument?.mainClaim ? [selectedDocument.mainClaim] : [];
  const assumptions = claims.filter((claim) => isKind(claim, "assumption"));
  const questions = claims.filter((claim) => isKind(claim, "question"));
  const structuredClaims = claims.filter((claim) => !isKind(claim, "assumption") && !isKind(claim, "question"));
  const coreIdea = firstText(
    selectedDocument?.title,
    selectedDocument?.description,
    data?.source?.rawText,
    selectedDocument?.originalIdea,
    claims.find((claim) => claim.seedId === "claim.seed")?.text,
    selectedDocument?.mainClaim?.text,
    claims[0]?.text,
  );
  const learningPlan = data?.learningPlan ?? data?.learn?.learningPlan;
  const sessionV2 = data?.learn?.sessionV2;

  return {
    coreIdea,
    claims: structuredClaims,
    assumptions,
    questions,
    creativePotential: creativePotentialFrom(data, selectedDocument),
    ...(learningPlan ? { learningPlan } : {}),
    ...(sessionV2 ? { sessionV2 } : {}),
    autopilotNextMove: autopilot?.suggestion ?? autopilot?.selectedCandidate ?? null,
  };
}

function defaultLearnSessionOutput(): LearnSessionOutput {
  return {
    coreIdea:
      "Mock learning event on January 1: understand what YC does and whether its batch application cares more about investors, ideas, or people.",
    claims: [],
    assumptions: [
      {
        id: "yc-mock-assumption-founders",
        seedId: "yc.mock.assumption.founders",
        kind: "assumption",
        status: "exploratory",
        text: "YC uses the quality, clarity, and evidence of the founders as the strongest signal when the company is still early.",
        confidence: 78,
      },
      {
        id: "yc-mock-assumption-investors",
        seedId: "yc.mock.assumption.investors",
        kind: "assumption",
        status: "exploratory",
        text: "Having investors already interested may help context, but it is not the central thing YC says applicants should optimize for.",
        confidence: 72,
      },
    ],
    questions: [
      {
        id: "yc-mock-question",
        seedId: "yc.mock.question",
        kind: "question",
        status: "exploratory",
        text: "If YC cares more about founders and insight than outside investors, what should a first-time applicant make concrete in the application?",
        confidence: 64,
      },
    ],
    creativePotential: [
      "Turn YC from a vague prestige signal into a concrete evaluation model: founders, insight, clarity, progress, and evidence.",
      "Use the January 1 mock event as a Learn session, then save the takeaways to Brain for a later Check pass.",
    ],
    learningPlan: ycMockLearningPlan,
    autopilotNextMove: null,
  };
}

const ycMockLearningPlan: LearningPlan = {
  expertRole: "A startup admissions instructor teaching YC through application signals, evidence, examples, and challenge questions.",
  goal:
    "Understand what YC does and whether its batch application is primarily evaluating investors, ideas, or people.",
  paragraphFit: "one_subgroup_per_page",
  groups: [
    {
      id: "yc-frame",
      title: "Frame what YC is",
      purpose: "Start by separating YC the startup program from the application screen and from outside fundraising status.",
      subgroups: [
        {
          id: "yc-frame-program",
          title: "Name the program",
          teachingParagraph:
            "YC is not just an investor logo. In this mock January 1 learning event, treat it as a short, intense startup program whose job is to help a company become much stronger in a few months: clearer product, more users, better fundraising options, and better founder judgment. That frame matters because it makes the application question less about prestige and more about whether YC can see a company that could take off with pressure, advice, and community.",
          keyMoves: [
            "Separate program value from application scoring.",
            "Name the intended company improvement.",
            "Keep fundraising as one outcome, not the whole object.",
          ],
          workedExample:
            "Instead of asking, 'Will investors like us?', ask, 'Can YC see a founding team and startup that could become dramatically stronger during the batch?'",
          visualExample: {
            title: "YC program loop",
            description:
              "A simple diagram showing startup enters YC, passes through advice, batch pressure, users, and fundraising options, then exits stronger.",
          },
        },
        {
          id: "yc-frame-question",
          title: "Ask the real application question",
          teachingParagraph:
            "The useful question is not whether YC prefers investors, ideas, or people as isolated categories. The real question is which signals make a very early company believable. YC's public application guidance puts heavy weight on clear descriptions, impressive founder evidence, and insight about the idea. Existing investor interest is secondary because many accepted companies are very early and may have little or no revenue.",
          keyMoves: [
            "Replace categories with signals.",
            "Track what makes an early startup believable.",
            "Mark investors as context, not proof.",
          ],
          workedExample:
            "A weak answer says, 'We are an AI platform changing productivity.' A stronger answer says, 'We help PhD students turn messy notes into cited literature-review claims in one hour.'",
          visualExample: {
            title: "Signal stack",
            description:
              "A stacked card image with founders and clarity at the base, idea insight in the middle, and investor interest as a smaller context card.",
          },
        },
        {
          id: "yc-frame-event",
          title: "Anchor the mock event",
          teachingParagraph:
            "The January 1 date should act like provenance, not decoration. It tells Penny this was a specific learning event with a concrete question: what does YC evaluate when it chooses a batch? Treating the date as a session marker lets the lesson become durable Brain material later instead of a loose explanation that disappears after reading.",
          keyMoves: [
            "Mark January 1 as the learning event.",
            "Keep the question attached to the session.",
            "Save the takeaway as Brain-ready material.",
          ],
          workedExample:
            "Session title: January 1 YC application lesson. Core question: does YC care more about investors, ideas, or people?",
          visualExample: {
            title: "Learning event stamp",
            description:
              "A dated session card labeled January 1, connected to the YC question, the answer, and the next Check action.",
          },
        },
      ],
    },
    {
      id: "yc-people",
      title: "Understand the people signal",
      purpose: "Explain why founder evidence often matters more than the first version of the idea.",
      subgroups: [
        {
          id: "yc-people-achievement",
          title: "Show founder magnitude",
          teachingParagraph:
            "YC's application guidance asks for specific impressive things each founder has built or achieved. The lesson is not that one resume type wins; it is that extraordinary startup outcomes require people who have already shown unusual initiative, technical ability, persistence, taste, or system-hacking ability. Specific proof beats adjectives because a reader can inspect what actually happened.",
          keyMoves: [
            "Use one concrete founder proof point.",
            "Prefer built or achieved over self-description.",
            "Show difficulty, not personality branding.",
          ],
          workedExample:
            "Weak: 'I am hardworking.' Strong: 'I built a campus scheduling tool used by 1,400 students and handled every support ticket myself.'",
          visualExample: {
            title: "Founder evidence card",
            description:
              "A before-and-after card comparing vague founder adjectives with one concrete built achievement and measurable usage.",
          },
        },
        {
          id: "yc-people-why",
          title: "Why people can outweigh the idea",
          teachingParagraph:
            "The reason founders matter so much is that early startup ideas change. If YC believes the founders are unusually capable, flexible, and clear, the first idea can be treated as evidence of judgment rather than a fixed plan. A good idea still matters, but mainly because it reveals the team's insight, taste, and understanding of a non-obvious problem.",
          keyMoves: [
            "Treat the first idea as evidence of founder judgment.",
            "Ask whether the team can adapt.",
            "Separate insight from a polished pitch.",
          ],
          workedExample:
            "If two teams propose similar products, the team with sharper user insight and proof of building hard things is easier to believe.",
          visualExample: {
            title: "Idea as evidence",
            description:
              "A split image where the idea points back to founder qualities such as insight, speed, clarity, and ability to build.",
          },
        },
      ],
    },
    {
      id: "yc-idea",
      title: "Understand the idea signal",
      purpose: "Show how ideas matter when they demonstrate insight instead of vague ambition.",
      subgroups: [
        {
          id: "yc-idea-clarity",
          title: "Make the idea reproducible",
          teachingParagraph:
            "YC readers need to understand the company quickly, so the first description should be matter-of-fact. The goal is not to sound huge; it is to let a tired application reader reproduce the basic product in their head. Vague market language creates no inspectable claim, while a narrow description gives the reader something concrete to judge.",
          keyMoves: [
            "Start with the plain product.",
            "Avoid market-speak.",
            "Make the reader able to picture it.",
          ],
          workedExample:
            "Better than 'reimagining founder intelligence': 'a tool that turns a founder's raw idea into assumptions, challenges, and a source-grounded brief.'",
          visualExample: {
            title: "Plain sentence test",
            description:
              "A visual showing a vague sentence dissolving into fog and a concrete sentence becoming a simple product sketch.",
          },
        },
        {
          id: "yc-idea-insight",
          title: "Find the non-obvious insight",
          teachingParagraph:
            "A good idea gets attention when it contains insight: a distinctive reason this team can win despite obstacles. 'Easy to use' is usually too generic. The stronger move is to name the overlooked customer behavior, distribution wedge, technical breakthrough, or market shift that changes the odds.",
          keyMoves: [
            "Name the obstacle.",
            "Name the wedge.",
            "Explain why this team sees it.",
          ],
          workedExample:
            "For Penny, the insight might be: ambitious thinkers do not need more notes; they need a graph that stress-tests claims and remembers how their judgment changes.",
          visualExample: {
            title: "Insight wedge",
            description:
              "A wedge diagram showing a specific insight opening a path through an otherwise crowded or difficult market.",
          },
        },
      ],
    },
    {
      id: "yc-investors",
      title: "Place investors correctly",
      purpose: "Answer the user's investor question directly without pretending fundraising is irrelevant.",
      subgroups: [
        {
          id: "yc-investors-secondary",
          title: "Do investors matter?",
          teachingParagraph:
            "Investors can matter as evidence that other people believe the company is fundable, but YC does not appear to make outside investor interest the main thing early applicants should optimize for. YC explicitly accepts many companies that are just an idea or pre-revenue, and it says the money is only a small part of what YC does. Investor interest is useful context, not a substitute for founders, clarity, insight, or progress.",
          keyMoves: [
            "Treat investor interest as context.",
            "Do not use it to replace founder evidence.",
            "Ask what it proves, if anything.",
          ],
          workedExample:
            "If you have investor interest, phrase it as evidence of a real signal: 'Three seed investors asked for updates after seeing our waitlist conversion,' not 'investors like us.'",
          visualExample: {
            title: "Investor signal scale",
            description:
              "A scale where founder proof and customer insight outweigh a smaller investor-interest weight unless the investor signal reveals real traction.",
          },
        },
        {
          id: "yc-investors-answer",
          title: "Answer the tradeoff",
          teachingParagraph:
            "The clean answer is: YC is more interested in people plus insight than in existing investors. Ideas matter, but the idea is strongest when it reveals smart, specific founder insight. Investors can strengthen the story only if they point to real evidence, such as traction, customer demand, or unusually credible market validation.",
          keyMoves: [
            "Rank people and insight first.",
            "Use the idea as proof of insight.",
            "Use investors only when they reveal evidence.",
          ],
          workedExample:
            "Application priority: concrete founder achievement, clear company description, specific insight, real user/progress evidence, then investor interest if it adds signal.",
          visualExample: {
            title: "YC priority ladder",
            description:
              "A ladder with founder evidence and insight on the lower load-bearing rungs, progress above them, and investor interest as an optional top rung.",
          },
        },
      ],
    },
    {
      id: "yc-apply",
      title: "Turn the lesson into an application move",
      purpose: "Convert the YC explanation into a practical next step Penny can save, Check, or Verify.",
      subgroups: [
        {
          id: "yc-apply-draft",
          title: "Draft the application spine",
          teachingParagraph:
            "The useful output of this Learn event is a short application spine. It should say what the company makes, what specific problem or user behavior gives the team insight, what each founder has done that proves unusual ability, and what progress or customer evidence exists. This keeps the application grounded instead of performative.",
          keyMoves: [
            "Write one matter-of-fact product sentence.",
            "Add one founder achievement per founder.",
            "Add one insight and one evidence point.",
          ],
          workedExample:
            "Penny application spine: 'Penny helps ambitious thinkers turn raw thoughts into challengeable claim graphs. The insight is that memory is weak unless it stress-tests beliefs over time. Evidence: users keep returning to revise claims.'",
          visualExample: {
            title: "Application spine",
            description:
              "A one-page application outline with four boxes: product sentence, founder proof, insight, and evidence.",
          },
        },
        {
          id: "yc-apply-check",
          title: "Set the Check question",
          teachingParagraph:
            "A strong Learn session should end with a Check target. For this mock event, the first challenge is whether the team's proof is specific enough for a YC reader to believe it quickly. If the proof is vague, the next action is not to polish wording; it is to find a stronger concrete example or admit the weakness.",
          keyMoves: [
            "Challenge the weakest proof point.",
            "Ask what a reader still cannot believe.",
            "Revise with evidence, not adjectives.",
          ],
          workedExample:
            "Check prompt: 'Which sentence in this YC application asks the reader to trust us without concrete proof?'",
          visualExample: {
            title: "Check loop",
            description:
              "A loop from application spine to weakest sentence, then to evidence needed, then back to a revised application spine.",
          },
        },
      ],
    },
    {
      id: "yc-evidence",
      title: "Build the evidence packet",
      purpose: "Turn the YC lesson into concrete proof that a reader can inspect instead of asking them to trust the pitch.",
      subgroups: [
        {
          id: "yc-evidence-founder",
          title: "Collect founder proof",
          oneLineGoal:
            "Choose the founder evidence that would make a YC reader believe the team can build, learn, and persist.",
          teachingParagraph:
            "For the YC question, founder proof is not a biography. It is a short evidence packet showing what each founder has already done that predicts startup execution: built something hard, learned unusually fast, recruited users, solved a technical problem, or kept going when the default outcome was quitting. This section turns 'people matter' into inspectable proof.",
          keyMoves: [
            "List one unusually concrete achievement per founder.",
            "Attach difficulty, scale, or speed to each proof point.",
            "Cut traits that are not backed by an event.",
          ],
          misconceptions: [
            "Do not write a founder bio when the application needs evidence.",
            "Do not claim grit, speed, or taste without a concrete event.",
            "Do not hide the strongest proof behind modest wording.",
          ],
          workedExample:
            "For Penny: 'Built a working claim-graph learning prototype, shipped Brain/Check/Learn loops, and used user feedback to revise the interface repeatedly' is stronger than 'passionate about AI tools.'",
          visualExample: {
            title: "Founder proof table",
            description:
              "A table with founder, hard thing built, measurable signal, and what that signal proves for YC.",
          },
        },
        {
          id: "yc-evidence-user",
          title: "Collect user proof",
          oneLineGoal:
            "Separate real user evidence from compliments so the application can show why the idea is not imaginary.",
          teachingParagraph:
            "YC does not need a mature company, but it does need a reason to believe the problem is real. User proof can be usage, waitlist behavior, repeated conversations, pilots, revenue, or a sharp pattern from customer interviews. The point is to show that the team has touched reality and learned something specific about demand.",
          keyMoves: [
            "Name the user group precisely.",
            "Show one behavior, not just an opinion.",
            "Explain what changed in the product or claim because of that evidence.",
          ],
          misconceptions: [
            "Do not count polite enthusiasm as traction.",
            "Do not describe a huge market before proving one user behavior.",
            "Do not bury the evidence under future roadmap language.",
          ],
          workedExample:
            "For Penny: 'Users return to revise old claims after challenges' is a stronger demand signal than 'people say thinking tools are interesting.'",
          visualExample: {
            title: "Reality contact log",
            description:
              "A compact log of user behavior, what it proves, and what assumption it changes in the application.",
          },
        },
      ],
    },
    {
      id: "yc-final",
      title: "Answer the YC question",
      purpose: "End with a direct answer and a reusable application checklist for the January 1 learning event.",
      subgroups: [
        {
          id: "yc-final-ranking",
          title: "Rank people, idea, investors",
          oneLineGoal:
            "Give the direct answer: YC should be read as people plus insight first, with investors as optional evidence.",
          teachingParagraph:
            "The final answer should be blunt enough to use. For a YC batch application, people and insight carry the most weight because the company is early and the first version of the idea may change. The idea matters when it proves clear thinking about a real problem. Existing investors matter only when they reveal real evidence such as traction, urgency, or credible market validation.",
          keyMoves: [
            "Put founder proof and insight first.",
            "Use the idea to show judgment and market understanding.",
            "Use investor interest only as evidence of something real.",
          ],
          misconceptions: [
            "Do not say YC ignores the idea.",
            "Do not say investors never matter.",
            "Do not let the ranking replace the evidence packet.",
          ],
          workedExample:
            "Answer: YC is not mainly checking whether investors already like the company. It is checking whether the founders have a clear, promising startup with evidence that they can learn fast and make it much stronger.",
          visualExample: {
            title: "YC answer stack",
            description:
              "A stack with founder proof and insight as the base, clear idea and progress above it, and investor interest as optional supporting evidence.",
          },
        },
        {
          id: "yc-final-save",
          title: "Save the Brain claim",
          oneLineGoal:
            "Convert the lesson into a Penny claim that can be challenged later instead of disappearing as a one-off note.",
          teachingParagraph:
            "The January 1 Learn output should become a durable Brain claim with assumptions and a Check prompt. That keeps the YC lesson connected to Penny's actual loop: claim, assumptions, challenge, response, and artifact. The saved claim should be specific enough to be wrong, because a vague lesson cannot be checked.",
          keyMoves: [
            "Write one challengeable YC claim.",
            "Attach assumptions about founders, ideas, and investors.",
            "Create the next Check prompt from the weakest assumption.",
          ],
          misconceptions: [
            "Do not save a summary that cannot be challenged.",
            "Do not leave the investor question as a loose impression.",
            "Do not skip the next Check target after Learn.",
          ],
          workedExample:
            "Brain claim: 'For early YC applicants, founder evidence and specific insight matter more than existing investor interest.' Check prompt: 'What evidence would make this false for Penny's application?'",
          visualExample: {
            title: "Brain-ready YC claim",
            description:
              "A claim card connected to three assumptions and one Check prompt for the YC application question.",
          },
        },
      ],
    },
  ],
};

function creativePotentialFrom(data: BrainData | null, selectedDocument: BrainDocumentSummary | null): string[] {
  const exploration = (data?.explorationPaths ?? []).map((path) =>
    firstText([path.title, path.expectedValue].filter(Boolean).join(": "), path.title),
  );
  const concepts = (data?.learnCandidates ?? []).map((candidate) =>
    `${candidate.term}: ${candidate.whyItMatters || candidate.unblockExplanation}`,
  );
  const documentActions = selectedDocument?.nextActions ?? [];
  const keyInsight = data?.ideaMap?.keyInsight ? [`Key insight: ${data.ideaMap.keyInsight}`] : [];
  const uniqueItems = uniqueNonEmpty([...exploration, ...concepts, ...documentActions, ...keyInsight]);

  return uniqueItems.length > 0 ? uniqueItems.slice(0, 4) : ["Use Check to test the first weak spot before expanding."];
}

function isKind(claim: BrainClaim, expected: string): boolean {
  return claim.kind.toLowerCase().includes(expected);
}

function firstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();

    if (trimmed) {
      return trimmed;
    }
  }

  return "Untitled idea";
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();

    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    output.push(trimmed);
  }

  return output;
}
