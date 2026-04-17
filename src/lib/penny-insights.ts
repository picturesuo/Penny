import type { ThoughtMapEvent, ThoughtNodeModel } from "@/types/thought-map";

export type ShapeVerdict = "confirmed" | "provisional" | "rejected" | "refined";
export type PennyShapeFeedback = "confirmed" | "rejected" | "refined";

export type PennyShapeKind = "cognitive" | "domain";

export interface PennyShape {
  id: string;
  label: string;
  summary: string;
  kind: PennyShapeKind;
  primaryMapId: string | null;
  sourceMapIds: string[];
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
  contradictions: ThoughtNodeModel[];
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

export interface ClaimMoveHistoryEntry {
  id: string;
  label: string;
  summary: string;
  createdAt: Date;
  accent: "move" | "feedback" | "signal";
}

export interface PrecedentCase {
  id: string;
  name: string;
  domain: string;
  failureMode: string;
  riskTags: string[];
  killAssumption: string;
  whatKilledIt: string;
  audienceAttacks: string[];
}

export interface ConfidenceDecaySnapshot {
  nodeId: string;
  untouchedDays: number;
  revisitThresholdDays: number;
  decayMultiplier: number;
  decayedConfidence: number | null;
  isFoundational: boolean;
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
      const marketText = /market|distribution|adoption|pricing|launch|go[- ]to[- ]market/.test(text);
      const highConfidence = (node.scores?.confidence ?? 0) >= 0.75;
      const thinEvidence = (node.scores?.evidence ?? 1) < 0.7;

      return marketText && ((highConfidence && thinEvidence) || psychology?.likelyBiases.includes("overconfidence") === true);
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

const PRECEDENT_CORPUS: PrecedentCase[] = [
  {
    id: "quibi-mobile-shortform",
    name: "Quibi",
    domain: "consumer media",
    failureMode: "network-effects mismatch",
    riskTags: ["network effects", "adoption", "distribution", "attention"],
    killAssumption: "People would pay for short-form premium video on mobile without a stronger habit loop.",
    whatKilledIt: "The product bet on a weak behavior change and a crowded attention environment, so distribution never compensated for the missing habit.",
    audienceAttacks: [
      "Skeptical investor: where is the durable retention loop?",
      "Thesis advisor: what theory of behavior change was actually tested?",
    ],
  },
  {
    id: "juicero-hardware-cost",
    name: "Juicero",
    domain: "hardware",
    failureMode: "operational overbuild",
    riskTags: ["operations", "money", "time", "dependency"],
    killAssumption: "A premium machine would create enough value to justify expensive hardware and proprietary supply.",
    whatKilledIt: "The system optimized for complexity and capital burn, but the underlying job could be done more cheaply without the machine.",
    audienceAttacks: [
      "Skeptical investor: where is the unit-economics moat?",
      "GTM operator: what operational step is this making harder instead of easier?",
    ],
  },
  {
    id: "wework-growth",
    name: "WeWork",
    domain: "real estate / platform",
    failureMode: "premise-rejection",
    riskTags: ["reputation", "money", "operational", "governance"],
    killAssumption: "Community and brand would outrun the basic economics of space and occupancy.",
    whatKilledIt: "The story outgrew the economics and governance structure, so the business became impossible to defend on its own terms.",
    audienceAttacks: [
      "Skeptical investor: what if the growth story is just subsidized occupancy?",
      "Thesis committee: does the premise survive once governance is removed from the slide deck?",
    ],
  },
  {
    id: "theranos-validation",
    name: "Theranos",
    domain: "health / science",
    failureMode: "evidence failure",
    riskTags: ["reputation", "relationship", "self-image", "money"],
    killAssumption: "The promise would hold even if the core measurement system could not be independently validated.",
    whatKilledIt: "The claim depended on hidden test validity, and when the measurement layer was exposed, the rest of the structure collapsed.",
    audienceAttacks: [
      "Skeptical academic: where is the reproducible evidence chain?",
      "Thesis advisor: what specific result would falsify the core claim?",
    ],
  },
  {
    id: "google-glass-norms",
    name: "Google Glass",
    domain: "wearable computing",
    failureMode: "norm friction",
    riskTags: ["relationship", "self-image", "political", "social"],
    killAssumption: "The product could be useful even if it violated everyday social norms and made people uncomfortable.",
    whatKilledIt: "The social cost became visible faster than the utility, so the norm violation itself became the blocking issue.",
    audienceAttacks: [
      "Skeptical investor: who wants to wear this in public?",
      "Thesis committee: does the counter-case actually neutralize the social friction?",
    ],
  },
  {
    id: "clubhouse-retention",
    name: "Clubhouse",
    domain: "social audio",
    failureMode: "retention collapse",
    riskTags: ["network effects", "time", "attention", "social"],
    killAssumption: "Novelty plus invite scarcity would create durable engagement and real network effects.",
    whatKilledIt: "The product got attention before it earned repeat behavior, so the network thinned once the novelty faded.",
    audienceAttacks: [
      "Skeptical investor: how does this keep compounding after novelty?",
      "GTM operator: what repeated behavior is the sales motion actually feeding?",
    ],
  },
];

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
}

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

function riskProfile(node: ThoughtNodeModel) {
  const text = normalize(node.content);
  const tags = new Set<string>();

  if (node.scores?.dependencyRisk != null && node.scores.dependencyRisk > 0.55) {
    tags.add("dependency");
  }
  if (node.scores?.coverage != null && node.scores.coverage < 0.55) {
    tags.add("network effects");
  }
  if ((node.psychology?.comparisonCoverageScore ?? 1) < 0.6) {
    tags.add("comparison");
  }
  if ((node.psychology?.falsificationCoverageScore ?? 1) < 0.6) {
    tags.add("evidence");
  }
  if (node.scores?.confidence != null && node.scores.confidence > 0.7) {
    tags.add("confidence");
  }
  if (text.includes("norm") || text.includes("policy") || text.includes("social")) {
    tags.add("norm");
  }
  if (text.includes("team") || text.includes("process") || text.includes("workflow")) {
    tags.add("operations");
  }
  if (text.includes("market") || text.includes("distribution") || text.includes("buyer")) {
    tags.add("adoption");
  }

  return Array.from(tags);
}

export function retrievePrecedentsForNode(node: ThoughtNodeModel, limit = 3): PrecedentCase[] {
  const tags = new Set(riskProfile(node));
  const text = normalize(node.content);

  return [...PRECEDENT_CORPUS]
    .map((precedent) => {
      let score = 0;

      if (precedent.riskTags.some((tag) => tags.has(tag))) score += 3;
      if (precedent.failureMode.includes("evidence") && (node.psychology?.falsificationCoverageScore ?? 1) < 0.6) score += 2;
      if (precedent.failureMode.includes("network") && tags.has("network effects")) score += 2;
      if (precedent.failureMode.includes("norm") && tags.has("norm")) score += 2;
      if (precedent.failureMode.includes("operational") && tags.has("operations")) score += 2;
      if (precedent.failureMode.includes("premise") && (node.scores?.confidence ?? 0) > 0.7) score += 1;
      if (precedent.name.toLowerCase().includes("wework") && text.includes("governance")) score += 1;
      if (precedent.name.toLowerCase().includes("theranos") && text.includes("validation")) score += 1;

      return { precedent, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .slice(0, limit)
    .map((item) => item.precedent);
}

export function buildConfidenceDecaySnapshot(node: ThoughtNodeModel): ConfidenceDecaySnapshot {
  const untouchedDays = Math.max(0, Math.floor((Date.now() - node.updatedAt.getTime()) / (1000 * 60 * 60 * 24)));
  const isFoundational = node.kind === "root" || node.kind === "core_claim" || node.kind === "why_it_matters";
  const revisitThresholdDays = isFoundational ? 9 : 21;
  const decayMultiplier =
    untouchedDays <= revisitThresholdDays
      ? 1
      : Math.max(0.45, 1 - (untouchedDays - revisitThresholdDays) * (isFoundational ? 0.05 : 0.03));
  const confidence = node.scores?.confidence ?? null;

  return {
    nodeId: node.id,
    untouchedDays,
    revisitThresholdDays,
    decayMultiplier,
    decayedConfidence: confidence == null ? null : Math.max(0, Math.round(confidence * decayMultiplier * 100) / 100),
    isFoundational,
  };
}

export function interleaveStressNodes(nodes: ThoughtNodeModel[]): ThoughtNodeModel[] {
  const buckets = [
    nodes.filter((node) => (node.scores?.evidence ?? 1) < 0.6),
    nodes.filter((node) => (node.psychology?.falsificationCoverageScore ?? 1) < 0.6),
    nodes.filter((node) => (node.scores?.dependencyRisk ?? 0) > 0.55),
    nodes.filter((node) => (node.psychology?.comparisonCoverageScore ?? 1) < 0.6),
  ].map((bucket) => [...bucket]);

  const interleaved: ThoughtNodeModel[] = [];
  let added = true;

  while (added) {
    added = false;

    for (const bucket of buckets) {
      const next = bucket.shift();
      if (next) {
        interleaved.push(next);
        added = true;
      }
    }
  }

  return interleaved;
}

export function derivePennyShapes(nodes: ThoughtNodeModel[]): PennyShape[] {
  return SHAPE_RULES.reduce<PennyShape[]>((acc, rule) => {
    const supportingNodes = nodes.filter(rule.matches);

    if (!supportingNodes.length) {
      return acc;
    }

    const supportCount = supportingNodes.length;
    const confidence = clampConfidence(40 + supportCount * 14 + Math.min(12, supportCount * 2));

    acc.push({
      id: rule.id,
      label: rule.label,
      summary: rule.summary,
      kind: rule.kind,
      primaryMapId: supportingNodes[0]?.mapId ?? null,
      sourceMapIds: Array.from(new Set(supportingNodes.map((node) => node.mapId))),
      verdict: shapeVerdict(confidence, supportCount),
      confidence,
      evidenceNodeIds: supportingNodes.map((node) => node.id),
      supportingNodes: supportingNodes.slice(0, 4),
      explanation: rule.explanation,
      signals: rule.signals,
    });

    return acc;
  }, []);
}

export function buildBeliefGenealogy(nodes: ThoughtNodeModel[], nodeId: string): BeliefGenealogy {
  const current = nodes.find((node) => node.id === nodeId) ?? null;

  if (!current) {
    return { current: null, lineage: [], contradictions: [], dependents: [] };
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
  const contradictions = nodes.filter((candidate) =>
    lineage.some((ancestor) => {
      const sharesParent = ancestor.parentId !== null && candidate.parentId === ancestor.parentId && candidate.id !== ancestor.id;
      const directCounterArgument = sharesParent && candidate.kind === "counter_argument";
      const supersedingAncestor = candidate.supersedesNodeId === ancestor.id;
      const contradictedSource = sharesParent && candidate.nodeStatus === "superseded";

      return directCounterArgument || supersedingAncestor || contradictedSource;
    }),
  );

  return {
    current,
    lineage: lineage.reverse(),
    contradictions,
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

export function buildClaimMoveHistory(
  nodes: ThoughtNodeModel[],
  events: ThoughtMapEvent[],
  nodeId: string,
): ClaimMoveHistoryEntry[] {
  const genealogy = buildBeliefGenealogy(nodes, nodeId);
  const nodeIds = new Set(genealogy.lineage.map((node) => node.id));

  return events
    .filter((event) => event.nodeId ? nodeIds.has(event.nodeId) : false)
    .map((event) => {
      if (event.eventType === "move_applied") {
        const action = typeof event.payload?.action === "string" ? String(event.payload.action).replaceAll("_", " ") : "move";

        return {
          id: event.id,
          label: "Move applied",
          summary: `Penny applied a ${action} move.`,
          createdAt: event.createdAt,
          accent: "move",
        } satisfies ClaimMoveHistoryEntry;
      }

      if (event.eventType === "bias_detected" || event.eventType === "bias_resolved") {
        const detector = typeof event.payload?.detector === "string" ? String(event.payload.detector).replaceAll("_", " ") : "bias signal";

        return {
          id: event.id,
          label: event.eventType === "bias_detected" ? "Signal detected" : "Signal resolved",
          summary:
            event.eventType === "bias_detected"
              ? `Penny detected ${detector} pressure on this branch.`
              : `Penny logged the resolution of ${detector} pressure on this branch.`,
          createdAt: event.createdAt,
          accent: "signal",
        } satisfies ClaimMoveHistoryEntry;
      }

      if (event.eventType === "shape_feedback") {
        const verdict = typeof event.payload?.verdict === "string" ? String(event.payload.verdict) : "feedback";

        return {
          id: event.id,
          label: "Shape feedback",
          summary: `The user marked the associated shape as ${verdict}.`,
          createdAt: event.createdAt,
          accent: "feedback",
        } satisfies ClaimMoveHistoryEntry;
      }

      return {
        id: event.id,
        label: event.eventType.replaceAll("_", " "),
        summary: "An event was recorded for this claim.",
        createdAt: event.createdAt,
        accent: "signal",
      } satisfies ClaimMoveHistoryEntry;
    })
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export function collectShapeFeedback(events: ThoughtMapEvent[]) {
  return events.reduce<Record<string, PennyShapeFeedback>>((accumulator, event) => {
    if (event.eventType !== "shape_feedback") {
      return accumulator;
    }

    const shapeId = typeof event.payload?.shapeId === "string" ? event.payload.shapeId : null;
    const verdict = event.payload?.verdict;

    if (!shapeId || (verdict !== "confirmed" && verdict !== "rejected" && verdict !== "refined")) {
      return accumulator;
    }

    accumulator[shapeId] = verdict;
    return accumulator;
  }, {});
}

export function shapeFeedbackPayload(params: {
  shapeId: string;
  verdict: PennyShapeFeedback;
  shapeLabel: string;
  source: string;
  nodeId?: string | null;
}) {
  return {
    shapeId: params.shapeId,
    verdict: params.verdict,
    shapeLabel: params.shapeLabel,
    source: params.source,
    nodeId: params.nodeId ?? null,
  };
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
