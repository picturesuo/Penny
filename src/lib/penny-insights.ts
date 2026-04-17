import type { ThoughtMapEvent, ThoughtNodeModel } from "@/types/thought-map";

export type ShapeVerdict = "confirmed" | "provisional" | "rejected" | "refined";

export type PennyShapeKind = "cognitive" | "domain";

export interface PennyShape {
  id: string;
  label: string;
  summary: string;
  kind: PennyShapeKind;
  verdict: ShapeVerdict;
  confidence: number;
  evidenceNodeIds: string[];
  supportingNodes: ThoughtNodeModel[];
  explanation: string;
  signals: string[];
}

export interface BeliefGenealogy {
  current: ThoughtNodeModel | null;
  lineage: ThoughtNodeModel[];
  dependents: ThoughtNodeModel[];
}

export interface OldSelfSnapshot {
  id: string;
  nodeId: string;
  versionLabel: string;
  content: string;
  note: string;
  confidence: number | null;
  updatedAt: Date;
  moveLabel: string;
  moveSummary: string;
  status: ThoughtNodeModel["nodeStatus"];
  isCurrent: boolean;
}

const SHAPE_RULES: Array<{
  id: string;
  label: string;
  kind: PennyShapeKind;
  summary: string;
  explanation: string;
  signals: string[];
  matches: (node: ThoughtNodeModel) => boolean;
}> = [
  {
    id: "market-overconfidence",
    label: "You over-confidence market claims.",
    kind: "domain",
    summary: "Market-facing claims often outrun their evidence.",
    explanation: "This shape activates when market, distribution, or adoption language shows high confidence with thin falsification.",
    signals: ["market", "distribution", "adoption", "pricing", "launch"],
    matches: (node) => {
      const text = node.content.toLowerCase();
      const psychology = node.psychology;

      return (
        /market|distribution|adoption|pricing|launch|go[- ]to[- ]market/.test(text) &&
        ((node.scores?.confidence ?? 0) >= 0.75 && (node.scores?.evidence ?? 1) < 0.7) ||
        psychology?.likelyBiases.includes("overconfidence") === true
      );
    },
  },
  {
    id: "market-timing-stress",
    label: "You under-stress-test market timing.",
    kind: "domain",
    summary: "Timing and demand assumptions need more explicit pressure.",
    explanation: "This shape activates when market claims appear without enough comparison or falsification coverage.",
    signals: ["timing", "market", "demand", "distribution"],
    matches: (node) => {
      const text = node.content.toLowerCase();

      return (
        /market|timing|demand|distribution|adoption/.test(text) &&
        ((node.psychology?.comparisonCoverageScore ?? 1) < 0.62 ||
          (node.psychology?.falsificationCoverageScore ?? 1) < 0.62 ||
          node.nodeStatus === "weak")
      );
    },
  },
  {
    id: "abstraction-before-concretization",
    label: "You abstract before concretizing.",
    kind: "cognitive",
    summary: "The claim stack moves to abstraction before the operational test is specific enough.",
    explanation: "This shape activates when a node is high-level but low on actionability and specificity.",
    signals: ["specificity", "concretize", "operational"],
    matches: (node) =>
      (node.scores?.specificity ?? 1) < 0.6 ||
      (node.psychology?.actionabilityScore ?? 1) < 0.58 ||
      node.psychology?.likelyBiases.includes("shallow_abstraction") === true,
  },
  {
    id: "confirmation-protection",
    label: "You protect familiar frames.",
    kind: "cognitive",
    summary: "Critique tends to preserve the original framing unless forced to falsify it.",
    explanation: "This shape activates when confirmation bias or weak falsification shows up across the map.",
    signals: ["confirmation_bias", "falsification", "frame"],
    matches: (node) =>
      node.psychology?.likelyBiases.includes("confirmation_bias") === true ||
      (node.psychology?.falsificationCoverageScore ?? 1) < 0.6,
  },
  {
    id: "choice-overload",
    label: "You widen choices before ranking them.",
    kind: "cognitive",
    summary: "Option generation appears before a strong ranking rule has been established.",
    explanation: "This shape activates when choice proliferation appears without a clear priority filter.",
    signals: ["choice", "ranking", "priority", "comparison"],
    matches: (node) =>
      node.psychology?.likelyBiases.includes("option_overload") === true ||
      (node.psychology?.comparisonCoverageScore ?? 1) < 0.58 ||
      node.scores?.tension === null,
  },
];

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function shapeVerdict(confidence: number, supportCount: number): ShapeVerdict {
  if (confidence >= 76 && supportCount >= 2) {
    return "confirmed";
  }

  if (confidence >= 60) {
    return "provisional";
  }

  if (confidence <= 45) {
    return "rejected";
  }

  return "refined";
}

function moveLabelForNode(node: ThoughtNodeModel, event?: ThoughtMapEvent | undefined) {
  if (event?.eventType === "move_applied" && typeof event.payload?.action === "string") {
    return `${String(event.payload.action).replaceAll("_", " ")} move`;
  }

  if (node.actionOrigin) {
    return `${node.actionOrigin.replaceAll("_", " ")} move`;
  }

  return node.kind === "root" ? "capture" : "self-iteration";
}

export function derivePennyShapes(nodes: ThoughtNodeModel[]): PennyShape[] {
  return SHAPE_RULES.map((rule) => {
    const supportingNodes = nodes.filter(rule.matches);

    if (!supportingNodes.length) {
      return null;
    }

    const supportCount = supportingNodes.length;
    const confidence = clampConfidence(40 + supportCount * 14 + Math.min(12, supportCount * 2));

    return {
      id: rule.id,
      label: rule.label,
      summary: rule.summary,
      kind: rule.kind,
      verdict: shapeVerdict(confidence, supportCount),
      confidence,
      evidenceNodeIds: supportingNodes.map((node) => node.id),
      supportingNodes: supportingNodes.slice(0, 4),
      explanation: rule.explanation,
      signals: rule.signals,
    } satisfies PennyShape;
  }).filter((shape): shape is PennyShape => shape !== null);
}

export function buildBeliefGenealogy(nodes: ThoughtNodeModel[], nodeId: string): BeliefGenealogy {
  const current = nodes.find((node) => node.id === nodeId) ?? null;

  if (!current) {
    return { current: null, lineage: [], dependents: [] };
  }

  const lineage: ThoughtNodeModel[] = [];
  const seen = new Set<string>();
  let cursor: ThoughtNodeModel | null = current;

  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    lineage.push(cursor);
    const supersedesNodeId: string | null = cursor.supersedesNodeId;
    cursor = supersedesNodeId ? nodes.find((candidate) => candidate.id === supersedesNodeId) ?? null : null;
  }

  const dependents = nodes.filter(
    (candidate) => candidate.parentId === current.id || candidate.supersedesNodeId === current.id,
  );

  return {
    current,
    lineage: lineage.reverse(),
    dependents,
  };
}

export function buildOldSelfTimeline(
  nodes: ThoughtNodeModel[],
  events: ThoughtMapEvent[],
  nodeId: string,
): OldSelfSnapshot[] {
  const genealogy = buildBeliefGenealogy(nodes, nodeId);
  const eventByNodeId = new Map(
    events
      .filter((event) => event.eventType === "move_applied")
      .map((event) => [event.nodeId ?? "", event]),
  );

  return genealogy.lineage.map((node, index) => {
    const event = eventByNodeId.get(node.id);
    const confidence = node.scores?.confidence ?? null;

    return {
      id: `${node.id}:${index}`,
      nodeId: node.id,
      versionLabel: index === genealogy.lineage.length - 1 ? "current self" : `old self ${index + 1}`,
      content: node.content,
      note: node.note ?? "",
      confidence,
      updatedAt: node.updatedAt,
      moveLabel: moveLabelForNode(node, event),
      moveSummary: event?.payload?.action
        ? `Penny applied a ${String(event.payload.action).replaceAll("_", " ")} move here.`
        : node.actionOrigin
          ? `This version was created by a ${node.actionOrigin.replaceAll("_", " ")} move.`
          : "This is the original captured claim.",
      status: node.nodeStatus,
      isCurrent: node.id === nodeId,
    };
  });
}

export function findActiveShapeCallout(
  node: ThoughtNodeModel | null,
  shapes: PennyShape[],
): PennyShape | null {
  if (!node || !shapes.length) {
    return null;
  }

  const nodeText = node.content.toLowerCase();

  return (
    shapes.find((shape) => shape.evidenceNodeIds.includes(node.id)) ??
    shapes.find((shape) => shape.signals.some((signal) => nodeText.includes(signal))) ??
    null
  );
}

export function formatShapeVerdict(verdict: ShapeVerdict) {
  return verdict.replaceAll("_", " ");
}
