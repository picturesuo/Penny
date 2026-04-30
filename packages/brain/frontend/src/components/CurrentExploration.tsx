import { useEffect, useMemo, useState } from "react";
import type { AutopilotSuggestion, BrainClaim, ExplorationPath, WorkStructureStep } from "../types/brain";
import { truncateWords } from "../lib/text";

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

const maxIdeaRows = 10;

export function CurrentExploration({
  title,
  subtitle,
  claims,
  paths,
  autopilotSuggestion,
  focusedClaim,
  activeWorkStructureStep,
  onGoThere,
}: CurrentExplorationProps) {
  const rows = useMemo(() => buildRows(claims, paths, activeWorkStructureStep), [claims, paths, activeWorkStructureStep]);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number | null>(null);
  const selectedPath = selectedPathIndex === null ? null : rows[selectedPathIndex] ?? null;

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
      <h2 className="section-label">CURRENT EXPLORATION</h2>
      <div className="exploration-headline">
        <h1 title={title}>{title}</h1>
        <p title={subtitle}>{subtitle}</p>
      </div>
      {activeWorkStructureStep ? <WorkStructureStepDetail step={activeWorkStructureStep} focusedClaim={focusedClaim} /> : null}
      {autopilotSuggestion ? (
        <article className="autopilot-card">
          <div>
            <span>NEXT THINKING ACTION</span>
            <strong title={autopilotSuggestion.label}>{truncateWords(autopilotSuggestion.label, 4)}</strong>
            <p title={autopilotSuggestion.why}>{truncateWords(autopilotSuggestion.why, 18)}</p>
            <p title={autopilotSuggestion.exitCriteria.label}>{truncateWords(autopilotSuggestion.exitCriteria.label, 16)}</p>
            {autopilotSuggestion.exitCriteria.acceptedMoveKinds.length > 0 ? (
              <small>{truncateWords(autopilotSuggestion.exitCriteria.acceptedMoveKinds.map(formatMoveKind).join(", "), 6)}</small>
            ) : null}
            {focusedClaim ? <em title={focusedClaim.text}>{truncateWords(focusedClaim.text, 16)}</em> : null}
          </div>
          <button type="button" onClick={onGoThere}>
            {autopilotSuggestion.primaryActionLabel} <span aria-hidden="true">-&gt;</span>
          </button>
        </article>
      ) : null}
      <div className="pathway-list" aria-label="Exploration pathways">
        {rows.length > 0 ? (
          rows.map((row, index) => (
            <PathwayRow
              key={row.id}
              row={row}
              index={index}
              selected={index === selectedPathIndex}
              onSelect={() => setSelectedPathIndex(index)}
            />
          ))
        ) : (
          <EmptyPathways />
        )}
      </div>
      {selectedPath ? <PathPreview row={selectedPath} index={selectedPathIndex ?? 0} /> : <PathPreviewEmpty />}
    </section>
  );
}

function WorkStructureStepDetail({
  step,
  focusedClaim,
}: {
  step: WorkStructureStep;
  focusedClaim: BrainClaim | null;
}) {
  return (
    <article className="work-step-detail">
      <div className="work-step-detail-head">
        <span>#{step.rank}</span>
        <strong title={step.title}>{truncateWords(step.title, 8)}</strong>
        <small>{formatStatus(step.status)}</small>
      </div>
      <p title={step.purpose}>{truncateWords(step.purpose, 18)}</p>
      <p title={step.whyNow}>{truncateWords(step.whyNow, 18)}</p>
      {focusedClaim ? <em title={focusedClaim.text}>{truncateWords(focusedClaim.text, 16)}</em> : null}
      <div className="work-step-metrics" aria-label="Work step ranking">
        <span>Fragility {step.fragility}</span>
        <span>Importance {step.importance}</span>
      </div>
      <div className="work-step-choices" aria-label="Work step choices">
        {step.detailChoices.map((choice) => (
          <article key={choice.id}>
            <strong title={choice.label}>{truncateWords(choice.label, 4)}</strong>
            <span title={choice.description}>{truncateWords(choice.description, 10)}</span>
          </article>
        ))}
      </div>
    </article>
  );
}

function PathwayRow({
  row,
  index,
  selected,
  onSelect,
}: {
  row: PathRow;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const shortcut = shortcutLabel(index);

  return (
    <article className={`pathway-row${selected ? " is-selected" : ""}`}>
      <button type="button" className="path-index" aria-label={`Preview choice ${shortcut}`} onClick={onSelect}>
        {shortcut}
      </button>
      <strong title={row.title}>{row.title}</strong>
      <ul>
        {row.reasoning.map((item, index) => (
          <li key={`${row.id}-reason-${index}`} title={item}>
            {item}
          </li>
        ))}
      </ul>
      <button type="button" className="path-explore-button" aria-label={`Preview ${row.title}`} onClick={onSelect}>
        Preview <span aria-hidden="true">-&gt;</span>
      </button>
    </article>
  );
}

function PathPreview({ row, index }: { row: PathRow; index: number }) {
  return (
    <article className="path-preview" aria-label="Selected exploration preview">
      <div>
        <span>Choice {shortcutLabel(index)}</span>
        <strong title={row.title}>{row.title}</strong>
      </div>
      <p title={row.summary}>{row.summary}</p>
      <ul aria-label="Tweakable aspects">
        {row.tweaks.slice(0, 3).map((tweak) => (
          <li key={tweak}>{tweak}</li>
        ))}
      </ul>
    </article>
  );
}

function PathPreviewEmpty() {
  return (
    <article className="path-preview is-empty" aria-label="Exploration preview">
      <span>Press 1-9</span>
      <p>Preview a path outcome, then decide which parts to tweak before exploring.</p>
    </article>
  );
}

function buildRows(
  claims: BrainClaim[],
  paths: ExplorationPath[],
  activeWorkStructureStep: WorkStructureStep | null | undefined,
): PathRow[] {
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
      tweaks: [formatStatus(step.status), `Fragility ${step.fragility}`, `Importance ${step.importance}`],
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
      reasoning: [claim.text, `${claim.confidence ?? 60}% confidence / ${formatStatus(claim.status)}`],
      summary: "Preview how testing this claim changes the rest of the thinking pack.",
      tweaks: [claim.text, `${claim.confidence ?? 60}% confidence`, formatStatus(claim.kind)],
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
    "Expos Curriculum Deep Dive",
    "Retrieve official assignment expectations.",
    "Determine exact genre, evidence rules, and grading constraints.",
  ),
  ideaRow(
    "Topic Boundary",
    "Narrow neoliberalism to one tractable angle.",
    "Prevent the essay from becoming a broad institutional critique.",
  ),
  ideaRow(
    "Neoliberalism Definitions",
    "Collect 2-3 academic definitions.",
    "Establish a precise working vocabulary before arguing.",
  ),
  ideaRow(
    "Harvard-Specific Cases",
    "List concrete local practices.",
    "Surface evidence that makes the essay specific rather than generic.",
  ),
  ideaRow(
    "Assignment Alignment Check",
    "Map the topic to Expos requirements.",
    "Reveal mismatches that would force a scope change.",
  ),
  ideaRow(
    "Source Availability Scan",
    "Search for scholarly and primary sources.",
    "Test whether enough accessible evidence exists.",
  ),
  ideaRow(
    "Thesis Stress Test",
    "Turn the idea into one defensible claim.",
    "Identify what would make the argument collapse.",
  ),
  ideaRow(
    "Counterargument Inventory",
    "Name the strongest objection.",
    "Decide whether to defend, revise, or absorb it.",
  ),
  ideaRow(
    "Personal Connection Probe",
    "Find the writer's direct stake.",
    "Uncover a non-generic reason this essay should exist.",
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

function shortcutLabel(index: number): string {
  if (index === 9) {
    return "0";
  }

  return String(index + 1);
}

function EmptyPathways() {
  return (
    <article className="pathway-empty">
      <strong>No current pathways</strong>
      <p>Awaiting session state.</p>
    </article>
  );
}

function formatMoveKind(value: string): string {
  return value.replaceAll("_", " ");
}

function formatStatus(value: string): string {
  return value.replaceAll("_", " ");
}

function formatTitleStatus(value: string): string {
  const formatted = formatStatus(value);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
