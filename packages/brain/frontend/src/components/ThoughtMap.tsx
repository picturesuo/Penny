import { useMemo, useState, type CSSProperties } from "react";
import type { BrainClaim, WorkStructure, WorkStructureStep, WorkStructureType } from "../types/brain";
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
  onClaimSelect,
  onWorkStructureSelect,
}: ThoughtMapProps) {
  const seedClaim = claims.find((claim) => claim.seedId === "claim.seed") ?? claims[0];
  const renderedWorkStructure =
    workStructure?.steps.length ? workStructure : seedClaim ? fallbackWorkStructure(seedClaim.text, claims, suggestedClaimId) : null;
  const tree = useMemo(
    () => (renderedWorkStructure ? buildThoughtMapTree(renderedWorkStructure, claims, seedClaim) : null),
    [claims, renderedWorkStructure, seedClaim],
  );
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());

  function handleToggle(nodeId: string) {
    setCollapsedNodeIds((current) => {
      const next = new Set(current);

      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }

      return next;
    });
  }

  return (
    <div className="thought-map-tree">
      {renderedWorkStructure && tree ? (
        <WorkStructureTree
          workStructure={renderedWorkStructure}
          tree={tree}
          collapsedNodeIds={collapsedNodeIds}
          focusedClaimId={focusedClaimId}
          focusedWorkStructureStepId={focusedWorkStructureStepId ?? null}
          suggestedClaimId={suggestedClaimId}
          onClaimSelect={onClaimSelect}
          onToggle={handleToggle}
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
  tree,
  collapsedNodeIds,
  focusedClaimId,
  focusedWorkStructureStepId,
  suggestedClaimId,
  onClaimSelect,
  onToggle,
  onWorkStructureSelect,
}: {
  workStructure: WorkStructure;
  tree: ThoughtMapNode;
  collapsedNodeIds: Set<string>;
  focusedClaimId: string | null;
  focusedWorkStructureStepId: string | null;
  suggestedClaimId: string | null;
  onClaimSelect: (claimId: string) => void;
  onToggle: (nodeId: string) => void;
  onWorkStructureSelect: (step: WorkStructureStep) => void;
}) {
  return (
    <div className="work-structure-tree" role="tree" aria-label={workStructure.label}>
      <ThoughtMapTreeNode
        node={tree}
        depth={0}
        activeStepId={workStructure.activeStepId}
        collapsedNodeIds={collapsedNodeIds}
        focusedClaimId={focusedClaimId}
        focusedWorkStructureStepId={focusedWorkStructureStepId}
        suggestedClaimId={suggestedClaimId}
        onClaimSelect={onClaimSelect}
        onToggle={onToggle}
        onWorkStructureSelect={onWorkStructureSelect}
      />
    </div>
  );
}

function ThoughtMapTreeNode({
  node,
  depth,
  activeStepId,
  collapsedNodeIds,
  focusedClaimId,
  focusedWorkStructureStepId,
  suggestedClaimId,
  onClaimSelect,
  onToggle,
  onWorkStructureSelect,
}: {
  node: ThoughtMapNode;
  depth: number;
  activeStepId: string | null;
  collapsedNodeIds: Set<string>;
  focusedClaimId: string | null;
  focusedWorkStructureStepId: string | null;
  suggestedClaimId: string | null;
  onClaimSelect: (claimId: string) => void;
  onToggle: (nodeId: string) => void;
  onWorkStructureSelect: (step: WorkStructureStep) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = hasChildren && collapsedNodeIds.has(node.id);
  const isFocused =
    node.step?.id === focusedWorkStructureStepId ||
    node.step?.id === activeStepId ||
    node.claimId === focusedClaimId ||
    Boolean(focusedClaimId && node.step?.claimIds.includes(focusedClaimId));
  const isSuggested =
    node.claimId === suggestedClaimId || Boolean(suggestedClaimId && node.step?.claimIds.includes(suggestedClaimId));
  const metadata = thoughtMapNodeMetadata(node);
  const label = truncateWords(node.label, depth <= 1 ? 9 : 7);

  function handlePrimaryAction() {
    if (node.step) {
      onWorkStructureSelect(node.step);
      return;
    }

    if (node.claimId) {
      onClaimSelect(node.claimId);
      return;
    }

    if (hasChildren) {
      onToggle(node.id);
    }
  }

  return (
    <div
      className={`thought-node thought-node-${node.kind}${isFocused ? " is-focused" : ""}${isSuggested ? " is-suggested" : ""}${
        isCollapsed ? " is-collapsed" : ""
      }`}
      role="treeitem"
      aria-expanded={hasChildren ? !isCollapsed : undefined}
      style={{ "--thought-depth": depth } as CSSProperties}
    >
      <div className="thought-node-row">
        {hasChildren ? (
          <button
            type="button"
            className="thought-node-toggle"
            aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${node.label}`}
            onClick={() => onToggle(node.id)}
          >
            <span aria-hidden="true" />
          </button>
        ) : (
          <span className="thought-node-toggle-spacer" aria-hidden="true" />
        )}
        <span className={`thought-node-glyph is-${node.kind}`} aria-hidden="true" />
        <button type="button" className="thought-node-label" title={node.description ?? node.label} onClick={handlePrimaryAction}>
          <strong>{label}</strong>
          {metadata ? <small>{metadata}</small> : null}
        </button>
        {hasChildren && node.kind !== "root" ? <span className="thought-node-count">{node.children.length}</span> : null}
      </div>
      {hasChildren && !isCollapsed ? (
        <div className="thought-node-children" role="group">
          {node.children.map((child) => (
            <ThoughtMapTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeStepId={activeStepId}
              collapsedNodeIds={collapsedNodeIds}
              focusedClaimId={focusedClaimId}
              focusedWorkStructureStepId={focusedWorkStructureStepId}
              suggestedClaimId={suggestedClaimId}
              onClaimSelect={onClaimSelect}
              onToggle={onToggle}
              onWorkStructureSelect={onWorkStructureSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type ThoughtMapNodeKind = "root" | "folder" | "step" | "choice" | "claim";

type ThoughtMapNode = {
  id: string;
  kind: ThoughtMapNodeKind;
  label: string;
  description?: string;
  children: ThoughtMapNode[];
  step?: WorkStructureStep;
  claimId?: string;
};

type WorkStructureTreePath = {
  order: number;
  path: string[];
};

function buildThoughtMapTree(workStructure: WorkStructure, claims: BrainClaim[], seedClaim: BrainClaim | undefined): ThoughtMapNode {
  const root: ThoughtMapNode = {
    id: "thought-root",
    kind: "root",
    label: seedClaim?.text ?? workStructure.label,
    description: workStructure.description,
    children: [],
  };
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));

  for (const step of orderedWorkStructureSteps(workStructure)) {
    const path = workStructureTreePath(workStructure.structureType, step);
    const parent = ensureFolderPath(root, path.path);
    const stepNode: ThoughtMapNode = {
      id: `step:${step.id}`,
      kind: "step",
      label: step.title,
      description: step.purpose,
      step,
      children: [
        ...step.detailChoices.map((choice) => ({
          id: `choice:${step.id}:${choice.id}`,
          kind: "choice" as const,
          label: cleanChoiceLabel(choice.label),
          description: choice.description,
          children: [],
        })),
        ...step.claimIds.flatMap((claimId) => {
          const claim = claimsById.get(claimId);

          return claim
            ? [
                {
                  id: `claim:${step.id}:${claim.id}`,
                  kind: "claim" as const,
                  label: claim.text,
                  description: `${formatClaimKind(claim.kind)} claim`,
                  claimId: claim.id,
                  children: [],
                },
              ]
            : [];
        }),
      ],
    };

    parent.children.push(stepNode);
  }

  sortThoughtMapFolders(root);

  return root;
}

function orderedWorkStructureSteps(workStructure: WorkStructure): WorkStructureStep[] {
  return [...workStructure.steps].sort((left, right) => {
    const leftPath = workStructureTreePath(workStructure.structureType, left);
    const rightPath = workStructureTreePath(workStructure.structureType, right);

    return leftPath.order - rightPath.order || left.rank - right.rank || left.title.localeCompare(right.title);
  });
}

function ensureFolderPath(root: ThoughtMapNode, path: string[]): ThoughtMapNode {
  let parent = root;

  for (const segment of path) {
    const id = `${parent.id}/folder:${slugify(segment)}`;
    let folder = parent.children.find((child) => child.id === id);

    if (!folder) {
      folder = {
        id,
        kind: "folder",
        label: segment,
        children: [],
      };
      parent.children.push(folder);
    }

    parent = folder;
  }

  return parent;
}

function sortThoughtMapFolders(node: ThoughtMapNode) {
  node.children.sort((left, right) => nodeKindRank(left.kind) - nodeKindRank(right.kind) || left.label.localeCompare(right.label));
  node.children.forEach(sortThoughtMapFolders);
}

function nodeKindRank(kind: ThoughtMapNodeKind): number {
  switch (kind) {
    case "folder":
      return 0;
    case "step":
      return 1;
    case "choice":
      return 2;
    case "claim":
      return 3;
    case "root":
      return 4;
  }
}

function thoughtMapNodeMetadata(node: ThoughtMapNode): string | null {
  if (node.step) {
    return `${formatStatus(node.step.status)} / fragile ${node.step.fragility}`;
  }

  if (node.kind === "claim" && node.description) {
    return node.description;
  }

  if (node.kind === "root" && node.description) {
    return truncateWords(node.description, 8);
  }

  return null;
}

function workStructureTreePath(structureType: WorkStructureType, step: WorkStructureStep): WorkStructureTreePath {
  const explicitPath = workStructureTreePaths[structureType]?.[step.id];

  if (explicitPath) {
    return explicitPath;
  }

  return inferTreePath(step);
}

const workStructureTreePaths: Partial<Record<WorkStructureType, Record<string, WorkStructureTreePath>>> = {
  essay: {
    bound_topic: treePath(10, "Problem framing", "Topic"),
    assignment_fit: treePath(20, "Problem framing", "Constraints"),
    specific_evidence: treePath(30, "Evidence", "Sources"),
    working_thesis: treePath(40, "Argument", "Thesis"),
    counterargument: treePath(50, "Argument", "Counterarguments"),
    pressure_test: treePath(60, "Risks", "Weak links"),
    essay_outline: treePath(70, "Output", "Essay draft"),
  },
  startup: {
    customer: treePath(10, "Users", "Segments"),
    pain: treePath(20, "Users", "Needs"),
    wedge: treePath(30, "Product", "MVP scope"),
    business_model: treePath(40, "Business model", "Pricing"),
    challenge: treePath(50, "Risks", "Assumptions"),
    artifact: treePath(60, "Workflow", "Brief"),
  },
  research: {
    question: treePath(10, "Question", "Scope"),
    literature: treePath(20, "Precedent", "Literature"),
    method: treePath(30, "Method", "Evidence design"),
    challenge: treePath(40, "Validity", "Confounds"),
    plan: treePath(50, "Output", "Research plan"),
  },
  decision: {
    options: treePath(10, "Options", "Alternatives"),
    criteria: treePath(20, "Criteria", "Tradeoffs"),
    evidence: treePath(30, "Evidence", "Assumption tests"),
    tradeoff: treePath(40, "Risks", "Downside"),
    decision_brief: treePath(50, "Output", "Decision brief"),
  },
  general: {
    clarify: treePath(10, "Problem", "Claim"),
    assumptions: treePath(20, "Problem", "Dependencies"),
    evidence: treePath(30, "Evidence", "Sources"),
    challenge: treePath(40, "Risks", "Challenge"),
    artifact: treePath(50, "Output", "Brief"),
  },
};

function treePath(order: number, ...path: string[]): WorkStructureTreePath {
  return { order, path };
}

function inferTreePath(step: WorkStructureStep): WorkStructureTreePath {
  const text = `${step.title} ${step.purpose}`.toLowerCase();

  if (hasAny(text, ["user", "customer", "student", "reader", "audience", "segment", "persona"])) {
    return treePath(100, "Users", step.title);
  }

  if (hasAny(text, ["product", "feature", "mvp", "scope", "wedge"])) {
    return treePath(110, "Product", step.title);
  }

  if (hasAny(text, ["tech", "implementation", "data", "integration", "method"])) {
    return treePath(120, "Implementation", step.title);
  }

  if (hasAny(text, ["risk", "challenge", "fragile", "counter", "objection", "validity"])) {
    return treePath(130, "Risks", step.title);
  }

  if (hasAny(text, ["evidence", "validation", "source", "test", "metric"])) {
    return treePath(140, "Validation", step.title);
  }

  if (hasAny(text, ["workflow", "process", "outline", "plan", "brief", "artifact"])) {
    return treePath(150, "Workflow", step.title);
  }

  if (hasAny(text, ["pricing", "revenue", "pay", "business", "market"])) {
    return treePath(160, "Business model", step.title);
  }

  return treePath(900, "Thinking", step.title);
}

function cleanChoiceLabel(label: string): string {
  return label.replace(/\s+choice$/i, "");
}

function formatClaimKind(kind: string): string {
  return formatStatus(kind);
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ");
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
