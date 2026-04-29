import type { BrainClaim, ExplorationPath } from "../types/brain";
import { placeholderPaths } from "../data/placeholders";

interface CurrentExplorationProps {
  title: string;
  subtitle: string;
  claims: BrainClaim[];
  paths: ExplorationPath[];
}

interface PathRow {
  id: string;
  title: string;
  reasoning: string[];
}

export function CurrentExploration({ title, subtitle, claims, paths }: CurrentExplorationProps) {
  const rows = buildRows(claims, paths);

  return (
    <section className="current-exploration">
      <h2 className="section-label">CURRENT EXPLORATION</h2>
      <div className="exploration-headline">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="pathway-list" aria-label="Exploration pathways">
        {rows.map((row) => (
          <PathwayRow key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}

function PathwayRow({ row }: { row: PathRow }) {
  return (
    <article className="pathway-row">
      <span className="path-index">#</span>
      <strong>{row.title}</strong>
      <ul>
        {row.reasoning.map((item, index) => (
          <li key={`${row.id}-reason-${index}`}>{item}</li>
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

  return assumptionRows.length > 0
    ? assumptionRows
    : placeholderPaths.map((path, index) => ({
        id: `placeholder-${index}`,
        title: path.title,
        reasoning: [path.prompt ?? "Reasoning", path.expectedValue ?? "Reasoning"],
      }));
}
