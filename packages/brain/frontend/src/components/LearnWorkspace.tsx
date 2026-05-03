import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  AutopilotTickData,
  BrainClaim,
  BrainData,
  BrainDocumentSummary,
  BrainDocumentsData,
  BrainHybridSearchResponse,
  BrainRecentIdea,
  CanvasNode,
  LearningPlan,
  LearnSessionOutput,
} from "../types/brain";
import { askPenny as askPennyQuestion } from "../api/brainClient";
import { truncateWords } from "../lib/text";
import { AskPennyRenderedText } from "./AskPennyRenderedText";

interface LearnWorkspaceProps {
  documentsData: BrainDocumentsData | null;
  selectedDocument: BrainDocumentSummary | null;
  data: BrainData | null;
  autopilot: AutopilotTickData | null;
  recents: BrainRecentIdea[];
  focusedClaimId: string | null;
  focusNode: CanvasNode | null;
  relatedBrainSearch: BrainHybridSearchResponse["data"] | null;
  status: string;
  isThinking: boolean;
  onSeed: (rawIdea: string) => Promise<void>;
  onKeepRecent: (rawIdea: string) => Promise<void>;
  onSelectDocument: (sessionId: string) => void;
  onOpenBrain: () => void;
  onOpenCanvas: () => void;
  onOpenCheck: () => void;
  onOpenVerify: () => void;
  onSearchBrainRelated: (query: string, claimId?: string | null) => Promise<BrainHybridSearchResponse["data"]>;
  onVerifyChanged?: () => Promise<void>;
}

export function LearnWorkspace({
  selectedDocument,
  data,
  autopilot,
  focusedClaimId,
  focusNode,
  isThinking,
  onSearchBrainRelated,
}: LearnWorkspaceProps) {
  const output = useMemo(
    () => buildLearnSessionOutput(data, selectedDocument, autopilot) ?? defaultLearnSessionOutput(),
    [data, selectedDocument, autopilot],
  );
  const sourceText = data?.source?.rawText ?? selectedDocument?.originalIdea ?? output?.coreIdea ?? "";

  return (
    <main className="learn-workspace" aria-label="Learn">
      <section className="learn-main">
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

      if (event.key === "Control" && selectedText) {
        event.preventDefault();
        setAskPennyOpen(true);
        setAskPennySeed({ text: selectedText, id: Date.now() });
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "a") {
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

    setActiveMainStepId(previousLesson.step.id);
    setActiveSubstepId(previousLesson.substep.id);
  }

  function handleSuggestedQuestion(question: string) {
    void onSearchBrainRelated(question, focusedClaim?.id ?? focusNode?.refs?.claimId ?? null);
  }

  return (
    <section className={`learn-session-output${askPennyOpen ? " ask-open" : ""}`} aria-label="Learn session output">
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

      <AskPennyPanel
        askPenny={pageData.askPenny}
        contextKey={activeStep?.id ?? "step-1"}
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

type LearnLesson = {
  stepNumber: number;
  totalSteps: number;
  substepNumber: number;
  totalSubsteps: number;
  title: string;
  parentTitle: string;
  learningGoal: string;
  shortExplanation: string;
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

  return steps.slice(activeIndex, activeIndex + 5).map((step, offset) => ({
    step,
    index: activeIndex + offset,
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

  return (
    <section className="learn-thinking-graph" aria-label="Thinking graph preview">
      <div className="learn-thinking-graph-head">
        <span>CANVAS</span>
        <strong>Thinking graph</strong>
      </div>
      <div className="learn-thinking-graph-board">
        {activeStep ? (
          <div className="learn-thinking-graph-map">
            <article className="learn-thinking-graph-main is-selected">
              <span>SECTION {activeStepIndex + 1}</span>
              <strong>{activeStep.title}</strong>
            </article>
            <ol>
              {activeStep.substeps.map((substep, substepIndex) => (
                <li key={substep.id} className={substep.id === activeSubstepId ? "is-selected" : ""}>
                  <span>
                    {activeStepIndex + 1}.{substepIndex + 1}
                  </span>
                  <strong>{substep.title}</strong>
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
      <section className="learn-goal-block" aria-label="Your goal">
        <span>
          STEP {currentStep.stepNumber}.{currentStep.substepNumber} OF {lessonPages.length}
        </span>
        <h1>{currentStep.title}</h1>
      </section>

      <section className="learn-step-header" aria-label="Current step">
        <strong>{currentStep.parentTitle}</strong>
        <p>{currentStep.learningGoal}</p>
      </section>

      <section className="learn-core-section" aria-label="Subsection lesson">
        {currentStep.teachingSections.map((section) => (
          <article key={section.title} className="learn-teaching-section">
            <span>{section.title}</span>
            <p>{section.body}</p>
          </article>
        ))}
      </section>

      <section className="learn-support-section" aria-label="Misconceptions and example">
        <div className="learn-misconception-copy">
          <span>MISCONCEPTIONS</span>
          <ul>
            {currentStep.misconceptions.map((misconception) => (
              <li key={misconception}>{misconception}</li>
            ))}
          </ul>
        </div>
        <div className="learn-example-copy">
          <span>EXAMPLE</span>
          <p>{currentStep.example.lines.join(" ")}</p>
        </div>
      </section>

      <nav className="learn-bottom-nav" aria-label="Step navigation">
        <button type="button" disabled={!canGoPrevious} onClick={onPrevious}>
          Previous
        </button>
        <div>
          <button type="button" className="learn-next-step" disabled={!canGoNext} onClick={onNext}>
            Next: {nextLesson?.substep.title ?? currentStep.nextStepTitle} →
          </button>
          <small>Enter forward / Esc back</small>
        </div>
      </nav>
    </article>
  );
}

function AskPennyPanel({
  askPenny,
  contextKey,
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
  currentStepTitle: string;
  localContext: string;
  isOpen: boolean;
  selectedQuestionSeed: AskPennySeed | null;
  disabled: boolean;
  onClose: () => void;
  onPromptSelect: (question: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "penny" | "system"; text: string }>>([
    { role: "system", text: "Ask a question about this step. Penny will answer from the current lesson context." },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const trimmedDraft = draft.trim();

  useEffect(() => {
    if (!selectedQuestionSeed) {
      return;
    }

    setDraft(selectedQuestionSeed.text);
  }, [selectedQuestionSeed]);

  useEffect(() => {
    setDraft("");
    setMessages([
      { role: "system", text: "Ask a question about this category. Penny will answer from this category only." },
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

  async function submitPrompt(question: string) {
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
      });

      setMessages((current) => [...current, { role: "penny", text: response.data.answer }]);
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
    <aside className={`ask-penny-panel${isOpen ? " is-open" : ""}`} aria-label="Ask Penny" aria-hidden={!isOpen}>
      <header>
        <div>
          <span>Ask Penny</span>
          <p>Ctrl + A to toggle</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Ask Penny">
          ×
        </button>
      </header>

      <div className="ask-penny-thread" role="log" aria-live="polite">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`ask-penny-message is-${message.role}`}>
            <span>{message.role === "penny" ? "Penny" : message.role === "user" ? "You" : "Ask Penny"}</span>
            <AskPennyRenderedText text={message.text} />
          </div>
        ))}
        {isRunning ? (
          <div className="ask-penny-message is-system">
            <span>Penny</span>
            <AskPennyRenderedText text="Thinking..." />
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
        <button type="submit" disabled={disabled || isRunning || !trimmedDraft} aria-label="Send question">
          →
        </button>
      </form>
    </aside>
  );
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
        learningGoal: subgroup.oneLineGoal ?? `Learn ${subgroup.title.toLowerCase()} as the next subsection.`,
        shortExplanation: subgroup.teachingParagraph,
        teachingSections: normalizeTeachingSections(subgroup.teachingSections, subgroup.keyMoves, subgroup.teachingParagraph),
        misconceptions: normalizeMisconceptions(subgroup.misconceptions),
        coreIdea: {
          bullets: subgroup.keyMoves.slice(0, 4),
          visualPlaceholderLabel: `${subgroup.visualExample.title}: ${subgroup.visualExample.description}`,
        },
        example: {
          title: subgroup.visualExample.title,
          description: "Big-picture example for this subgroup.",
          lines: [
            `Prompt: ${truncateWords(sourceText || output.coreIdea, 18)}`,
            subgroup.workedExample,
            `Use: ${subgroup.visualExample.description}`,
          ],
          whyThisMatters: group.purpose,
          format: inferExampleFormat(sourceText),
        },
        inlineNote: plan.expertRole,
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

function normalizeMisconceptions(misconceptions: string[] | undefined): string[] {
  return misconceptions?.length ? misconceptions.slice(0, 4) : fallbackMisconceptions();
}

function fallbackMisconceptions(stepId?: string): string[] {
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

  return {
    coreIdea,
    claims: structuredClaims,
    assumptions,
    questions,
    creativePotential: creativePotentialFrom(data, selectedDocument),
    ...(learningPlan ? { learningPlan } : {}),
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
