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
  const rows = buildRows(claims, paths);

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
        {rows.length > 0 ? rows.map((row) => <PathwayRow key={row.id} row={row} />) : <EmptyPathways />}
      </div>
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

function PathwayRow({ row }: { row: PathRow }) {
  return (
    <article className="pathway-row">
      <span className="path-index">#</span>
      <strong title={row.title}>{truncateWords(row.title, 8)}</strong>
      <ul>
        {row.reasoning.map((item, index) => (
          <li key={`${row.id}-reason-${index}`} title={item}>
            {truncateWords(item, 4)}
          </li>
        ))}
      </ul>
      <button type="button" aria-label={`Explore ${row.title}`}>
        Explore <span aria-hidden="true">-&gt;</span>
      </button>
    </article>
  );
}

function buildRows(claims: BrainClaim[], paths: ExplorationPath[]): PathRow[] {
  if (paths.length > 0) {
    return paths.slice(0, 8).map((path, index) => ({
      id: `${path.title}-${index}`,
      title: path.title,
      reasoning: [path.prompt ?? "Reasoning", path.expectedValue ?? "Reasoning"].filter(Boolean),
    }));
  }

  const assumptionRows = claims
    .filter((claim) => claim.kind === "assumption")
    .slice(0, 8)
    .map((claim) => ({
      id: claim.id,
      title: claim.text,
      reasoning: [`${claim.confidence ?? 60}% confidence`, claim.status],
    }));

  return assumptionRows;
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
