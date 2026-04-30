import type { BrainClaim, WorkStructure, WorkStructureStep } from "../types/brain";
import { truncateWords } from "../lib/text";

interface ThoughtMapProps {
  claims: BrainClaim[];
  workStructure?: WorkStructure | null;
  focusedClaimId: string | null;
  focusedWorkStructureStepId?: string | null;
  suggestedClaimId: string | null;
  onClaimSelect: (claimId: string) => void;
  onWorkStructureSelect?: (step: WorkStructureStep) => void;
}

export function ThoughtMap({
  claims,
  workStructure,
  focusedClaimId,
  focusedWorkStructureStepId,
  suggestedClaimId,
  onWorkStructureSelect,
}: ThoughtMapProps) {
  const seedClaim = claims.find((claim) => claim.seedId === "claim.seed") ?? claims[0];
  const renderedWorkStructure =
    workStructure?.steps.length ? workStructure : seedClaim ? fallbackWorkStructure(seedClaim.text, claims, suggestedClaimId) : null;

  return (
    <div className="thought-map-tree">
      {renderedWorkStructure ? (
        <WorkStructureTree
          workStructure={renderedWorkStructure}
          focusedClaimId={focusedClaimId}
          focusedWorkStructureStepId={focusedWorkStructureStepId ?? null}
          suggestedClaimId={suggestedClaimId}
          onWorkStructureSelect={onWorkStructureSelect ?? noopWorkStructureSelect}
        />
      ) : (
        <EmptyTree />
      )}
    </div>
  );
}

function noopWorkStructureSelect() {}

function WorkStructureTree({
  workStructure,
  focusedClaimId,
  focusedWorkStructureStepId,
  suggestedClaimId,
  onWorkStructureSelect,
}: {
  workStructure: WorkStructure;
  focusedClaimId: string | null;
  focusedWorkStructureStepId: string | null;
  suggestedClaimId: string | null;
  onWorkStructureSelect: (step: WorkStructureStep) => void;
}) {
  return (
    <div className="tree-line work-structure-tree">
      <div className="tree-group">
        <strong title={workStructure.label}>{truncateWords(workStructure.label, 10)}</strong>
        <span title={workStructure.description}>{truncateWords(workStructure.description, 12)}</span>
        {workStructure.steps.map((step) => {
          const isFocused =
            step.id === focusedWorkStructureStepId ||
            step.id === workStructure.activeStepId ||
            Boolean(focusedClaimId && step.claimIds.includes(focusedClaimId));
          const isSuggested = Boolean(suggestedClaimId && step.claimIds.includes(suggestedClaimId));

          return (
            <button
              key={step.id}
              type="button"
              className={`tree-branch work-structure-step is-${step.status}${isFocused ? " is-focused" : ""}${
                isSuggested ? " is-suggested" : ""
              }`}
              onClick={() => onWorkStructureSelect(step)}
            >
              <small>#{step.rank} / fragile {step.fragility}</small>
              <strong title={step.title}>{truncateWords(step.title, 6)}</strong>
              <span title={step.purpose}>{truncateWords(step.purpose, 9)}</span>
              <em title={step.whyNow}>{truncateWords(step.whyNow, 9)}</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyTree() {
  return (
    <div className="tree-empty">
      <strong>No graph state</strong>
      <span>Awaiting session claims.</span>
    </div>
  );
}

type FallbackTemplate = {
  id: string;
  title: string;
  purpose: string;
  keywords: string[];
  preferredKinds: string[];
  baseFragility: number;
  baseImportance: number;
};

function fallbackWorkStructure(seedText: string, claims: BrainClaim[], suggestedClaimId: string | null): WorkStructure {
  const structureType = inferFallbackStructureType([seedText, ...claims.map((claim) => claim.text)].join(" "));
  const templates = fallbackTemplates(structureType);
  const rankedSteps = templates
    .map((template, order) => fallbackStep(template, order, claims, suggestedClaimId))
    .sort((left, right) => right.fragility + right.importance - (left.fragility + left.importance))
    .map((step, index) => ({ ...step, rank: index + 1 }));
  const activeStep = rankedSteps.find((step) => step.status === "active") ?? rankedSteps[0] ?? null;

  return {
    structureType,
    label: fallbackLabel(structureType),
    description: "A live work order inferred from the current claims.",
    activeStepId: activeStep?.id ?? null,
    steps: rankedSteps,
  };
}

function fallbackStep(
  template: FallbackTemplate,
  order: number,
  claims: BrainClaim[],
  suggestedClaimId: string | null,
): WorkStructure["steps"][number] {
  const matchedClaims = selectFallbackClaims(template, claims, suggestedClaimId);
  const claimIds = matchedClaims.map((claim) => claim.id);
  const isActive = Boolean(suggestedClaimId && claimIds.includes(suggestedClaimId));
  const fragility = clampScore(
    template.baseFragility +
      Math.max(0, ...matchedClaims.map(claimFragility)) +
      (isActive ? 24 : 0) -
      order * 2,
  );
  const importance = clampScore(template.baseImportance + matchedClaims.length * 5 + (isActive ? 16 : 0));
  const anchor = matchedClaims[0];

  return {
    id: template.id,
    title: template.title,
    purpose: template.purpose,
    rank: order + 1,
    fragility,
    importance,
    status: isActive ? "active" : fragility >= 76 ? "stale" : "not_started",
    claimIds,
    edgeIds: [],
    whyNow: anchor ? `This step is tied to "${truncateWords(anchor.text, 12)}".` : template.purpose,
    detailChoices: [
      {
        id: `${template.id}_choice`,
        label: `${template.title} choice`,
        description: template.purpose,
        claimIds,
        edgeIds: [],
      },
    ],
  };
}

function selectFallbackClaims(template: FallbackTemplate, claims: BrainClaim[], suggestedClaimId: string | null): BrainClaim[] {
  const matching = claims.filter((claim) => {
    const text = claim.text.toLowerCase();

    return template.preferredKinds.includes(claim.kind) || template.keywords.some((keyword) => text.includes(keyword));
  });
  const suggested = claims.find((claim) => claim.id === suggestedClaimId);
  const fragile = [...claims].sort((left, right) => claimFragility(right) - claimFragility(left));
  const fallback = template.id.includes("pressure") || template.id.includes("challenge") ? fragile : claims;
  const combined = uniqueClaims([...(suggested ? [suggested] : []), ...matching, ...fallback]);

  return combined.slice(0, 4);
}

function inferFallbackStructureType(text: string): WorkStructure["structureType"] {
  const normalized = text.toLowerCase();

  if (hasAny(normalized, ["essay", "expos", "thesis", "course", "paragraph", "counterargument"])) {
    return "essay";
  }

  if (hasAny(normalized, ["startup", "founder", "customer", "market", "pricing", "product", "wedge"])) {
    return "startup";
  }

  if (hasAny(normalized, ["research", "study", "hypothesis", "dataset", "method", "experiment"])) {
    return "research";
  }

  if (hasAny(normalized, ["decision", "choose", "whether", "option", "tradeoff"])) {
    return "decision";
  }

  return "general";
}

function fallbackTemplates(structureType: WorkStructure["structureType"]): FallbackTemplate[] {
  if (structureType === "essay") {
    return [
      template("bound_topic", "Bound the topic", "Make the topic precise enough to argue.", ["bound", "broad", "define", "scope"], ["question", "assumption"], 46, 78),
      template("assignment_fit", "Confirm assignment fit", "Check the project against the course constraints.", ["assignment", "course", "expos", "program"], ["assumption"], 42, 74),
      template("specific_evidence", "Find specific evidence", "Ground the essay in concrete observations.", ["evidence", "specific", "primary", "generic"], ["assumption", "belief"], 52, 82),
      template("working_thesis", "Shape the working thesis", "Turn the idea into a claim the essay can defend.", ["thesis", "claim", "viable", "project"], ["belief"], 38, 70),
      template("pressure_test", "Pressure-test the weak link", "Attack the most fragile load-bearing assumption.", ["fragile", "load-bearing", "risk", "assumption"], ["assumption"], 70, 90),
      template("counterargument", "Handle counterargument", "Keep the strongest objection visible until answered.", ["counterargument", "challenge", "critique", "objection"], ["belief", "question"], 64, 84),
      template("essay_outline", "Convert to essay outline", "Compile the worked claims into essay order.", ["outline", "artifact", "paragraph"], ["belief", "assumption"], 18, 52),
    ];
  }

  if (structureType === "startup") {
    return [
      template("customer", "Identify the customer", "Name who has the painful situation.", ["customer", "user", "founder", "buyer"], ["assumption"], 46, 82),
      template("pain", "Validate the pain", "Separate admired ideas from urgent problems.", ["pain", "urgent", "problem", "workflow"], ["assumption"], 66, 90),
      template("wedge", "Clarify the wedge", "Make the first product surface testable.", ["wedge", "product", "mvp", "first"], ["belief", "assumption"], 44, 76),
      template("business_model", "Check willingness to pay", "Test whether urgency supports payment.", ["revenue", "pricing", "pay", "budget"], ["assumption"], 64, 88),
      template("challenge", "Pressure-test the riskiest claim", "Attack the assumption the startup depends on.", ["challenge", "risk", "fragile"], ["assumption"], 70, 92),
      template("artifact", "Compile the current thesis", "Turn the worked state into an Idea Map and Challenge Brief.", ["artifact", "brief", "map"], ["belief"], 18, 54),
    ];
  }

  return [
    template("clarify", "Clarify the claim", "Make the idea specific enough to work on.", ["claim", "clarify", "scope", "define"], ["belief", "question"], 48, 82),
    template("assumptions", "Find assumptions", "Expose what the idea depends on.", ["assumption", "depends", "because"], ["assumption"], 58, 86),
    template("evidence", "Seek evidence", "Ground the idea in observations or sources.", ["evidence", "source", "example"], ["assumption", "belief"], 46, 80),
    template("challenge", "Pressure-test the idea", "Attack the most fragile load-bearing point.", ["challenge", "risk", "counter", "fragile"], ["assumption", "question"], 70, 92),
    template("artifact", "Compile the current state", "Turn the worked graph into a useful artifact.", ["artifact", "brief", "map"], ["belief"], 18, 52),
  ];
}

function template(
  id: string,
  title: string,
  purpose: string,
  keywords: string[],
  preferredKinds: string[],
  baseFragility: number,
  baseImportance: number,
): FallbackTemplate {
  return {
    id,
    title,
    purpose,
    keywords,
    preferredKinds,
    baseFragility,
    baseImportance,
  };
}

function fallbackLabel(structureType: WorkStructure["structureType"]): string {
  switch (structureType) {
    case "essay":
      return "Essay Work Order";
    case "startup":
      return "Startup Work Order";
    case "research":
      return "Research Work Order";
    case "decision":
      return "Decision Work Order";
    case "general":
      return "Thinking Work Order";
  }
}

function claimFragility(claim: BrainClaim): number {
  const confidence = claim.confidence ?? 60;
  const kindWeight = claim.kind === "assumption" ? 28 : claim.kind === "question" ? 18 : 0;

  return clampScore(kindWeight + Math.max(0, 70 - confidence));
}

function uniqueClaims(claims: BrainClaim[]): BrainClaim[] {
  const seen = new Set<string>();
  const unique: BrainClaim[] = [];

  for (const claim of claims) {
    if (!seen.has(claim.id)) {
      seen.add(claim.id);
      unique.push(claim);
    }
  }

  return unique;
}

function hasAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
