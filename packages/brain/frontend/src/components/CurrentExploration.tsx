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
  const rows = useMemo(() => buildRows(claims, paths), [claims, paths]);
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
        <h1 title={title}>{truncateWords(title, 12)}</h1>
        <p title={subtitle}>{truncateWords(subtitle, 3)}</p>
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
      <strong title={row.title}>{truncateWords(row.title, 8)}</strong>
      <ul>
        {row.reasoning.map((item, index) => (
          <li key={`${row.id}-reason-${index}`} title={item}>
            {truncateWords(item, 4)}
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
        <strong title={row.title}>{truncateWords(row.title, 10)}</strong>
      </div>
      <p title={row.summary}>{truncateWords(row.summary, 22)}</p>
      <ul aria-label="Tweakable aspects">
        {row.tweaks.slice(0, 3).map((tweak) => (
          <li key={tweak}>{truncateWords(tweak, 5)}</li>
        ))}
      </ul>
    </article>
  );
}

function PathPreviewEmpty() {
  return (
    <article className="path-preview is-empty" aria-label="Exploration preview">
      <span>Press 1-9 or 0</span>
      <p>Preview a path outcome, then decide which parts to tweak before exploring.</p>
    </article>
  );
}

function buildRows(claims: BrainClaim[], paths: ExplorationPath[]): PathRow[] {
  if (paths.length > 0) {
    return paths.slice(0, 10).map((path, index) => ({
      id: `${path.title}-${index}`,
      title: path.title,
      reasoning: [path.prompt ?? "Reasoning", path.expectedValue ?? "Reasoning"].filter(Boolean),
      summary: pathSummary(path.title, [path.prompt, path.expectedValue]),
      tweaks: pathTweaks([path.prompt, path.expectedValue]),
    }));
  }

  const assumptionRows = claims
    .filter((claim) => claim.kind === "assumption")
    .slice(0, 10)
    .map((claim) => ({
      id: claim.id,
      title: claim.text,
      reasoning: [`${claim.confidence ?? 60}% confidence`, claim.status],
      summary: `Choosing this path tests how "${truncateWords(claim.text, 12)}" changes the rest of the thinking pack.`,
      tweaks: [`${claim.confidence ?? 60}% confidence`, claim.status, claim.kind],
    }));

  return assumptionRows;
}

function pathSummary(title: string, values: Array<string | undefined>): string {
  const detail = values.find((value) => value?.trim())?.trim();

  if (!detail) {
    return `Choosing this path previews how "${truncateWords(title, 12)}" changes the rest of the pack.`;
  }

  return `Choosing this path previews ${truncateWords(detail, 18)} against the rest of the pack.`;
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
  return index === 9 ? "0" : String(index + 1);
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
