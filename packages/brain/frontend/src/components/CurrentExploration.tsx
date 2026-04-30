import { useEffect, useMemo, useState } from "react";
import type { AutopilotSuggestion, BrainClaim, ExplorationPath, WorkStructureStep } from "../types/brain";

interface CurrentExplorationProps {
  title: string;
  subtitle: string;
  claims: BrainClaim[];
  paths: ExplorationPath[];
  autopilotSuggestion: AutopilotSuggestion | null;
  focusedClaim: BrainClaim | null;
  activeWorkStructureStep?: WorkStructureStep | null;
  onGoThere: () => void;
}

interface PathRow {
  id: string;
  title: string;
  reasoning: string[];
  summary: string;
  tweaks: string[];
}

const maxIdeaRows = 8;

export function CurrentExploration({
  title,
  subtitle,
  claims,
  paths,
  activeWorkStructureStep,
}: CurrentExplorationProps) {
  const rows = useMemo(() => buildRows(claims, paths, activeWorkStructureStep), [claims, paths, activeWorkStructureStep]);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number | null>(null);
  const [betterOption, setBetterOption] = useState("");
  const defaultPathIndex = defaultDecisionIndex(rows, activeWorkStructureStep);
  const selectedDecisionIndex = selectedPathIndex ?? defaultPathIndex;
  const selectedPath = selectedDecisionIndex === null ? null : rows[selectedDecisionIndex] ?? null;
  const decisionLabel = decisionLabelForStep(activeWorkStructureStep);
  const decisionQuestion = decisionQuestionForStep(activeWorkStructureStep, title, subtitle);
  const stepNumber = decisionStepNumberForStep(activeWorkStructureStep);
  const stepCountLabel = stepNumber ? `Step ${stepNumber} of 7` : `${rows.length} options`;

  useEffect(() => {
    if (selectedPathIndex !== null && selectedPathIndex >= rows.length) {
      setSelectedPathIndex(rows.length > 0 ? rows.length - 1 : null);
    }
  }, [rows.length, selectedPathIndex]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const targetElement = target instanceof HTMLElement ? target : null;

      if (
        targetElement &&
        (targetElement.tagName === "INPUT" ||
          targetElement.tagName === "TEXTAREA" ||
          targetElement.isContentEditable)
      ) {
        return;
      }

      const index = shortcutIndex(event.key);

      if (index === null || index >= rows.length) {
        return;
      }

      event.preventDefault();
      setSelectedPathIndex(index);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [rows.length]);

  return (
    <section className="current-exploration">
      <div className="decision-kicker">
        <h2 className="section-label">CURRENT DECISION</h2>
        <span>{stepCountLabel}</span>
      </div>
      <div className="decision-hero">
        <p>
          Penny thinks the next thing to validate is: <strong>{decisionLabel}</strong>
        </p>
        <h1 title={decisionQuestion}>{decisionQuestion}</h1>
      </div>
      {selectedPath ? (
        <DecisionCard
          betterOption={betterOption}
          onBetterOptionChange={setBetterOption}
          onSelectOption={setSelectedPathIndex}
          rows={rows}
          selectedIndex={selectedDecisionIndex ?? 0}
          selectedRow={selectedPath}
        />
      ) : (
        <DecisionEmpty />
      )}
    </section>
  );
}

function DecisionCard({
  betterOption,
  onBetterOptionChange,
  onSelectOption,
  rows,
  selectedIndex,
  selectedRow,
}: {
  betterOption: string;
  onBetterOptionChange: (value: string) => void;
  onSelectOption: (index: number) => void;
  rows: PathRow[];
  selectedIndex: number;
  selectedRow: PathRow;
}) {
  const selectedLetter = optionLetter(selectedIndex);
  const previousIndex = selectedIndex > 0 ? selectedIndex - 1 : null;
  const nextIndex = selectedIndex < rows.length - 1 ? selectedIndex + 1 : null;

  return (
    <article className="decision-card" aria-label="Penny decision">
      <h3>PENNY'S CHOSEN OPTION</h3>
      <div className="decision-chosen">
        <p>
          <strong>Option {selectedLetter}:</strong> {optionSentence(selectedRow)}
        </p>
        <h4>WHY PENNY CHOSE THIS</h4>
        <p>{decisionReason(selectedRow)}</p>
      </div>
      <section className="decision-alternatives" aria-label="Alternative options">
        <h4>ALTERNATIVE OPTIONS</h4>
        <div>
          {rows.map((row, index) => (
            <button
              key={row.id}
              type="button"
              className={`decision-option${index === selectedIndex ? " is-selected" : ""}`}
              onClick={() => onSelectOption(index)}
            >
              <span className="decision-radio" aria-hidden="true" />
              <strong>{optionLetter(index)}</strong>
              <span title={optionSentence(row)}>{optionSentence(row)}</span>
            </button>
          ))}
        </div>
      </section>
      <label className="decision-better-option">
        <span>EVEN BETTER IDEA</span>
        <textarea
          value={betterOption}
          onChange={(event) => onBetterOptionChange(event.target.value)}
          placeholder="Put an even better option here..."
          rows={2}
        />
      </label>
      <section className="decision-downstream" aria-label="Downstream changes">
        <h4>WHAT CHANGES DOWNSTREAM</h4>
        <div className="decision-impact">
          <span>If you choose Option {selectedLetter}</span>
          <strong>{downstreamImpact(selectedRow)}</strong>
        </div>
      </section>
      <div className="decision-actions">
        <button type="button" disabled={previousIndex === null} onClick={() => previousIndex !== null && onSelectOption(previousIndex)}>
          <span aria-hidden="true">&lt;-</span> Previous{previousIndex !== null ? ` (${optionLetter(previousIndex)}. ${rows[previousIndex]?.title})` : ""}
        </button>
        <button type="button" disabled={nextIndex === null} onClick={() => nextIndex !== null && onSelectOption(nextIndex)}>
          Next from Option {selectedLetter} <span aria-hidden="true">-&gt;</span>
        </button>
      </div>
    </article>
  );
}

function DecisionEmpty() {
  return (
    <article className="decision-card is-empty" aria-label="Current decision">
      <h3>NO DECISION OPTIONS</h3>
      <p>Awaiting enough session state to compare options.</p>
    </article>
  );
}

function buildRows(
  claims: BrainClaim[],
  paths: ExplorationPath[],
  activeWorkStructureStep: WorkStructureStep | null | undefined,
): PathRow[] {
  if (activeWorkStructureStep && isCourseFitStep(activeWorkStructureStep)) {
    return courseFitRows(activeWorkStructureStep);
  }

  const pathRows = paths.map((path, index) => ({
    id: `${path.title}-${index}`,
    title: path.title,
    reasoning: [path.prompt ?? "Reasoning", path.expectedValue ?? "Reasoning"].filter(Boolean),
    summary: pathSummary(path.title, [path.prompt, path.expectedValue]),
    tweaks: pathTweaks([path.prompt, path.expectedValue]),
  }));
  const rows = [
    ...pathRows,
    ...workStepRows(activeWorkStructureStep),
    ...fallbackIdeaRows(claims, paths, activeWorkStructureStep),
    ...claimRows(claims),
  ];

  return uniquePathRows(rows).slice(0, maxIdeaRows);
}

function courseFitRows(step: WorkStructureStep): PathRow[] {
  const rows = [
    decisionRow(
      "Too broad",
      "This essay is too broad for the assignment.",
      "You would need to tighten the topic boundary and thesis.",
    ),
    decisionRow(
      "Too narrow",
      "This essay is too narrow and limits analysis.",
      "You would need to widen the frame before outlining.",
    ),
    decisionRow(
      "Fits assignment framing",
      "This essay fits the assignment, with a clear Argue/Analyze framing.",
      step.whyNow || "The scope supports a clear claim with evidence-rich argument.",
    ),
    decisionRow(
      "Lens mismatch",
      "The lens does not match the course framing.",
      "You would need to reframe the thesis or choose a better theoretical lens.",
    ),
    decisionRow(
      "Missing concepts",
      "The assignment expects more theory; add missing concepts.",
      "You would need to add core concepts before the evidence pass.",
    ),
    decisionRow(
      "Wrong essay type",
      "The essay type should be compare/contrast, not argument.",
      "You would need to restructure the outline and evidence.",
    ),
    decisionRow(
      "Needs boundary",
      "The scope needs a time or context boundary.",
      "You would need to tighten scope and sources.",
    ),
    decisionRow(
      "Not original enough",
      "The claim is fine, but the angle is not original enough.",
      "You would need to sharpen the angle and uniqueness.",
    ),
  ];

  return rows.map((row, index) => ({
    ...row,
    id: `course-fit:${index}:${row.title}`,
  }));
}

function workStepRows(step: WorkStructureStep | null | undefined): PathRow[] {
  if (!step) {
    return [];
  }

  return [
    {
      id: `step:${step.id}`,
      title: step.title,
      reasoning: [step.purpose, step.whyNow],
      summary: `Preview how working on "${step.title}" changes the current idea.`,
      tweaks: [formatStatus(step.status), step.purpose, step.whyNow],
    },
    ...step.detailChoices.map((choice) => ({
      id: `choice:${step.id}:${choice.id}`,
      title: choice.label,
      reasoning: [choice.description, step.whyNow],
      summary: `Preview the outcome of choosing "${choice.label}" inside "${step.title}".`,
      tweaks: [choice.description, step.purpose, step.whyNow],
    })),
  ];
}

function claimRows(claims: BrainClaim[]): PathRow[] {
  return claims
    .filter((claim) => claim.kind !== "concept")
    .map((claim) => ({
      id: `claim:${claim.id}`,
      title: `${formatTitleStatus(claim.kind)} check`,
      reasoning: [claim.text, formatStatus(claim.status)],
      summary: "Preview how testing this claim changes the rest of the thinking pack.",
      tweaks: [claim.text, formatStatus(claim.status), formatStatus(claim.kind)],
    }));
}

function fallbackIdeaRows(
  claims: BrainClaim[],
  paths: ExplorationPath[],
  activeWorkStructureStep: WorkStructureStep | null | undefined,
): PathRow[] {
  const context = [
    activeWorkStructureStep?.title,
    activeWorkStructureStep?.purpose,
    ...paths.flatMap((path) => [path.title, path.prompt, path.expectedValue]),
    ...claims.map((claim) => claim.text),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .toLowerCase();
  const sourceRows = essayLikeContext(context) ? essayIdeaRows : generalIdeaRows;

  return sourceRows.map((row, index) => ({
    ...row,
    id: `fallback:${index}:${row.title}`,
  }));
}

function essayLikeContext(context: string): boolean {
  return ["essay", "expos", "harvard", "neoliberalism", "thesis", "counterargument"].some((term) =>
    context.includes(term),
  );
}

const essayIdeaRows: Array<Omit<PathRow, "id">> = [
  ideaRow(
    "Positive case",
    "Show why this can become a strong Expos essay.",
    "Identify the most compelling payoff if the scope is right.",
  ),
  ideaRow(
    "Negative case",
    "Find why the topic may be too broad or under-sourced.",
    "Decide what would make the idea not worth pursuing.",
  ),
  ideaRow(
    "Curveball",
    "Ask what unexpected frame could beat neoliberalism.",
    "Test whether a sharper concept explains Harvard better.",
  ),
  ideaRow(
    "Expos Curriculum Deep Dive",
    "Retrieve official assignment expectations.",
    "Determine exact genre, evidence rules, and grading constraints.",
  ),
  ideaRow(
    "Evidence path",
    "List concrete Harvard practices and available sources.",
    "Separate what can be proven from what only sounds plausible.",
  ),
  ideaRow(
    "Failure mode",
    "Name how the essay could collapse in review.",
    "Look for unsupported claims, vague definitions, or weak examples.",
  ),
  ideaRow(
    "Ethical concern",
    "Check whether the critique becomes unfair or overstated.",
    "Keep the argument precise enough to be defensible.",
  ),
  ideaRow(
    "Counterargument Inventory",
    "Name the strongest objection.",
    "Decide whether to defend, revise, or absorb it.",
  ),
  ideaRow(
    "Thesis Stress Test",
    "Turn the idea into one defensible claim.",
    "Identify what would make the argument collapse.",
  ),
];

const generalIdeaRows: Array<Omit<PathRow, "id">> = [
  ideaRow("Clarify the Core Claim", "Rewrite the idea as one testable sentence.", "Separate the main claim from background context."),
  ideaRow("Assumption Scan", "List what must be true.", "Find the dependencies that carry the most weight."),
  ideaRow("Evidence Hunt", "Name the observations or sources needed.", "Distinguish evidence from vibes and preferences."),
  ideaRow("User or Audience Check", "Identify who the idea must work for.", "Make the target user, reader, or stakeholder concrete."),
  ideaRow("Constraint Check", "List rules, limits, and deadlines.", "Prevent work that cannot fit the actual situation."),
  ideaRow("Risk Review", "Attack the most fragile part.", "Find what could make the idea fail."),
  ideaRow("Counterargument Pass", "Write the strongest objection.", "Avoid protecting the idea from useful pressure."),
  ideaRow("Revision Path", "Choose what should change if the critique lands.", "Turn pressure into a cleaner version."),
  ideaRow("Artifact Plan", "Decide what output would be useful.", "Convert the thinking into a brief, map, outline, or next action."),
];

function ideaRow(title: string, firstReason: string, secondReason: string): Omit<PathRow, "id"> {
  return {
    title,
    reasoning: [firstReason, secondReason],
    summary: `${title}: ${firstReason} ${secondReason}`,
    tweaks: [firstReason, secondReason, "Preview before exploring"],
  };
}

function decisionRow(title: string, option: string, downstream: string): Omit<PathRow, "id"> {
  return {
    title,
    reasoning: [option, downstream],
    summary: option,
    tweaks: [downstream, option, "Next step updates from this option"],
  };
}

function defaultDecisionIndex(rows: PathRow[], step: WorkStructureStep | null | undefined): number | null {
  if (rows.length === 0) {
    return null;
  }

  if (isCourseFitStep(step)) {
    return Math.min(2, rows.length - 1);
  }

  return 0;
}

function decisionQuestionForStep(step: WorkStructureStep | null | undefined, title: string, subtitle: string): string {
  if (isCourseFitStep(step)) {
    return "Does this essay fit the expectations and framing of the assignment?";
  }

  if (step?.purpose) {
    return toQuestion(step.purpose);
  }

  return subtitle || title;
}

function decisionLabelForStep(step: WorkStructureStep | null | undefined): string {
  if (!step) {
    return "Current idea";
  }

  if (isCourseFitStep(step)) {
    return "Course Fit";
  }

  return step.title;
}

function decisionStepNumberForStep(step: WorkStructureStep | null | undefined): number | null {
  if (!step) {
    return null;
  }

  const text = `${step.id} ${step.title} ${step.purpose}`.toLowerCase();

  if (hasAny(text, ["bound_topic", "topic boundary", "bound the topic"])) {
    return 1;
  }

  if (hasAny(text, ["working_thesis", "working thesis", "thesis candidate"])) {
    return 2;
  }

  if (isCourseFitStep(step)) {
    return 3;
  }

  if (hasAny(text, ["specific_evidence", "evidence bucket", "evidence path", "find specific evidence"])) {
    return 4;
  }

  if (hasAny(text, ["counterargument", "objection"])) {
    return 5;
  }

  if (hasAny(text, ["essay_outline", "outline"])) {
    return 6;
  }

  if (hasAny(text, ["pressure_test", "missing", "weak link", "to do later"])) {
    return 7;
  }

  return Math.min(Math.max(step.rank, 1), 7);
}

function optionLetter(index: number): string {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

function optionSentence(row: PathRow): string {
  return row.summary || row.reasoning[0] || row.title;
}

function decisionReason(row: PathRow): string {
  return row.reasoning.filter(Boolean).join(" ");
}

function downstreamImpact(row: PathRow): string {
  return row.tweaks[0] ?? row.reasoning[1] ?? `The next step follows ${row.title}.`;
}

function isCourseFitStep(step: WorkStructureStep | null | undefined): boolean {
  if (!step) {
    return false;
  }

  const text = `${step.id} ${step.title} ${step.purpose}`.toLowerCase();

  return text.includes("course fit") || text.includes("assignment_fit") || text.includes("assignment fit");
}

function hasAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function toQuestion(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "What should Penny validate next?";
  }

  if (/[?!.]$/.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}?`;
}

function uniquePathRows(rows: PathRow[]): PathRow[] {
  const seen = new Set<string>();
  const unique: PathRow[] = [];

  for (const row of rows) {
    const key = row.title.trim().toLowerCase();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(row);
  }

  return unique;
}

function pathSummary(title: string, values: Array<string | undefined>): string {
  const detail = values.find((value) => value?.trim())?.trim();

  if (!detail) {
    return `Choosing this path previews how "${title}" changes the rest of the pack.`;
  }

  return `Choosing this path previews ${detail} against the rest of the pack.`;
}

function pathTweaks(values: Array<string | undefined>): string[] {
  const cleaned = values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));

  if (cleaned.length === 0) {
    return ["Scope", "Evidence", "Risk"];
  }

  return cleaned;
}

function shortcutIndex(key: string): number | null {
  if (key === "0") {
    return 9;
  }

  if (/^[1-9]$/.test(key)) {
    return Number(key) - 1;
  }

  return null;
}

function formatStatus(value: string): string {
  return value.replaceAll("_", " ");
}

function formatTitleStatus(value: string): string {
  const formatted = formatStatus(value);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
