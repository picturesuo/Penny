import type {
  BeliefCombiningModel,
  BeliefEdge,
  BeliefEdgeModel,
  BeliefGraph,
  BeliefGraphPropagationModel,
  BeliefNode,
  BeliefPropagationContribution,
  BeliefPropagationDecisionType,
  BeliefPropagationResult,
  BeliefPropagationStep,
  ThoughtMapEvent,
  ThoughtMapModel,
  ThoughtNodeModel,
} from "@/types/thought-map";

const EPSILON = 0.0001;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function confidenceFromScore(score: number | null | undefined) {
  return clamp01(score ?? 0);
}

function recencyWeight(from: Date, to: Date) {
  const days = Math.max(0, (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  return clamp01(1 - Math.min(days / 180, 1));
}

function edgeKey(parentId: string, childId: string) {
  return `${parentId}:${childId}`;
}

function normalizePosterior(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, value));
}

function edgeModelForNode(node: Pick<ThoughtNodeModel, "kind">): BeliefEdgeModel {
  if (node.kind === "counter_argument") {
    return "contradictory";
  }

  if (node.kind === "assumption" || node.kind === "research") {
    return "conditional";
  }

  if (node.kind === "why_it_matters") {
    return "enabling";
  }

  return "supportive";
}

function combiningModelForNode(node: Pick<ThoughtNodeModel, "kind">): BeliefCombiningModel {
  if (node.kind === "assumption" || node.kind === "why_it_matters") {
    return "conjunctive";
  }

  if (node.kind === "counter_argument") {
    return "disjunctive";
  }

  return "independent";
}

function strengthScoreForEdge(source: ThoughtNodeModel, target: ThoughtNodeModel, relation: "parent" | "supersedes") {
  const sourceConfidence = confidenceFromScore(source.scores?.confidence);
  const targetConfidence = confidenceFromScore(target.scores?.confidence);
  const sourceStrength = confidenceFromScore(source.scores?.strength);
  const targetStrength = confidenceFromScore(target.scores?.strength);
  const relationBias = relation === "supersedes" ? 0.08 : 0.04;

  return clamp01((sourceConfidence * 0.28 + targetConfidence * 0.3 + sourceStrength * 0.22 + targetStrength * 0.18 + relationBias));
}

function conditionalProbabilityForEdge(
  source: ThoughtNodeModel,
  target: ThoughtNodeModel,
  relation: "parent" | "supersedes",
  edgeModel: BeliefEdgeModel,
) {
  const base = confidenceFromScore(target.scores?.confidence);
  const strength = strengthScoreForEdge(source, target, relation);
  const recency = recencyWeight(source.updatedAt, target.updatedAt);
  const structuralBias = 0.5 + strength * 0.28 + recency * 0.14;

  if (edgeModel === "contradictory") {
    return clamp01(1 - base * structuralBias);
  }

  if (edgeModel === "enabling") {
    return clamp01(Math.max(base, base * structuralBias));
  }

  return clamp01(base * structuralBias);
}

function collectLatestDecisionState(events: ThoughtMapEvent[]) {
  const decisions = new Map<
    string,
    {
      seedClaimId: string;
      targetClaimId: string;
      decisionType: BeliefPropagationDecisionType;
      oldPosterior: number | null;
      proposedPosterior: number | null;
      finalPosterior: number | null;
      reason: string;
      createdAt: Date;
      lockedByUser: boolean;
      propagationDecoupled: boolean;
    }
  >();

  for (const event of events) {
    const payload = event.payload ?? null;
    if (!payload) {
      continue;
    }

    const isDecisionEvent = event.eventType === "belief_propagation_decision" || event.eventType === "confidence_override";

    if (!isDecisionEvent) {
      continue;
    }

    const targetClaimId = typeof payload.targetClaimId === "string" ? payload.targetClaimId : typeof payload.targetNodeId === "string" ? payload.targetNodeId : null;
    const seedClaimId = typeof payload.seedClaimId === "string" ? payload.seedClaimId : typeof payload.sourceNodeId === "string" ? payload.sourceNodeId : targetClaimId;
    const mode = typeof payload.decisionType === "string" ? payload.decisionType : typeof payload.mode === "string" ? payload.mode : "accept";
    const decisionType: BeliefPropagationDecisionType =
      mode === "decouple" ? "decouple" : mode === "override" || mode === "reduce" ? "override" : "accept";
    const oldPosterior =
      typeof payload.oldPosterior === "number"
        ? payload.oldPosterior
        : typeof payload.currentConfidence === "number"
          ? payload.currentConfidence / 100
          : null;
    const proposedPosterior =
      typeof payload.proposedPosterior === "number"
        ? payload.proposedPosterior
        : typeof payload.targetPosterior === "number"
          ? payload.targetPosterior
          : typeof payload.confidenceAtRoundEnd === "number"
            ? payload.confidenceAtRoundEnd / 100
            : null;
    const finalPosterior =
      typeof payload.finalPosterior === "number"
        ? payload.finalPosterior
        : decisionType === "decouple"
          ? oldPosterior
          : proposedPosterior;
    const reason =
      typeof payload.reason === "string"
        ? payload.reason
        : typeof payload.reasoning === "string"
          ? payload.reasoning
          : "";

    if (!targetClaimId || !seedClaimId) {
      continue;
    }

    decisions.set(targetClaimId, {
      seedClaimId,
      targetClaimId,
      decisionType,
      oldPosterior,
      proposedPosterior,
      finalPosterior,
      reason,
      createdAt: event.createdAt,
      lockedByUser: decisionType !== "decouple",
      propagationDecoupled: decisionType === "decouple",
    });
  }

  return decisions;
}

function buildCycleError(nodeIds: string[], message: string) {
  return {
    nodeIds,
    message,
  };
}

function detectCycles(nodes: BeliefNode[], edges: BeliefEdge[]) {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const outgoing = adjacency.get(edge.parentId) ?? [];
    outgoing.push(edge.childId);
    adjacency.set(edge.parentId, outgoing);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function dfs(nodeId: string): string[] | null {
    if (visiting.has(nodeId)) {
      const index = stack.indexOf(nodeId);
      return index >= 0 ? [...stack.slice(index), nodeId] : [nodeId];
    }

    if (visited.has(nodeId)) {
      return null;
    }

    visiting.add(nodeId);
    stack.push(nodeId);

    for (const childId of adjacency.get(nodeId) ?? []) {
      const cycle = dfs(childId);
      if (cycle) {
        return cycle;
      }
    }

    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  }

  for (const node of nodes) {
    const cycle = dfs(node.claimId);
    if (cycle) {
      return cycle;
    }
  }

  return null;
}

function topologicalOrder(nodeIds: string[], edges: BeliefEdge[]) {
  const incomingCount = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const nodeId of nodeIds) {
    incomingCount.set(nodeId, 0);
  }

  for (const edge of edges) {
    if (!incomingCount.has(edge.childId) || !incomingCount.has(edge.parentId)) {
      continue;
    }

    adjacency.set(edge.parentId, [...(adjacency.get(edge.parentId) ?? []), edge.childId]);
    incomingCount.set(edge.childId, (incomingCount.get(edge.childId) ?? 0) + 1);
  }

  const queue = nodeIds.filter((nodeId) => (incomingCount.get(nodeId) ?? 0) === 0);
  const ordered: string[] = [];

  while (queue.length) {
    const nodeId = queue.shift();
    if (!nodeId) continue;

    ordered.push(nodeId);

    for (const childId of adjacency.get(nodeId) ?? []) {
      const nextCount = (incomingCount.get(childId) ?? 0) - 1;
      incomingCount.set(childId, nextCount);
      if (nextCount === 0) {
        queue.push(childId);
      }
    }
  }

  return ordered;
}

function combineIndependent(values: number[]) {
  return clamp01(1 - values.reduce((product, value) => product * (1 - clamp01(value)), 1));
}

function combineConjunctive(values: number[]) {
  return clamp01(values.reduce((product, value) => product * clamp01(value), 1));
}

function combineDisjunctive(values: number[]) {
  return clamp01(values.reduce((max, value) => Math.max(max, clamp01(value)), 0));
}

function formatPercent(value: number) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function summarizeCombiningModel(model: BeliefCombiningModel) {
  return model === "independent" ? "independent" : model === "conjunctive" ? "conjunctive" : "disjunctive";
}

function summarizeEdgeModel(model: BeliefEdgeModel) {
  return model;
}

export function buildBeliefGraph(map: ThoughtMapModel): BeliefGraph {
  const now = new Date();
  const decisions = collectLatestDecisionState(map.events);
  const nodes = new Map<string, BeliefNode>();
  const edges = new Map<string, BeliefEdge>();

  for (const node of map.nodes.filter((candidate) => candidate.nodeStatus !== "superseded")) {
    const decision = decisions.get(node.id) ?? null;
    const posterior = normalizePosterior(decision?.finalPosterior) ?? confidenceFromScore(node.scores?.confidence);
    nodes.set(node.id, {
      claimId: node.id,
      kind: node.kind,
      prior: confidenceFromScore(node.scores?.confidence),
      posterior,
      posteriorComputedAt: decision?.createdAt ?? node.updatedAt,
      lockedByUser: decision?.lockedByUser ?? false,
      propagationDecoupled: decision?.propagationDecoupled ?? false,
      computedFrom: decision ? [decision.seedClaimId] : [],
    });
  }

  for (const node of map.nodes.filter((candidate) => candidate.nodeStatus !== "superseded")) {
    const target = nodes.get(node.id);
    if (!target) {
      continue;
    }

    if (node.parentId && nodes.has(node.parentId)) {
      const parent = nodes.get(node.parentId)!;
      const sourceNode = map.nodes.find((candidate) => candidate.id === node.parentId) ?? null;
      const edgeModel = edgeModelForNode(node);
      const key = edgeKey(node.parentId, node.id);
      edges.set(key, {
        id: key,
        parentId: node.parentId,
        childId: node.id,
        conditionalProbability: sourceNode
          ? conditionalProbabilityForEdge(sourceNode, node, "parent", edgeModel)
          : confidenceFromScore(node.scores?.confidence),
        edgeModel,
        combiningModel: combiningModelForNode(node),
        userSetConditional: false,
        strength: sourceNode ? strengthScoreForEdge(sourceNode, node, "parent") : 0.5,
        recency: sourceNode ? recencyWeight(sourceNode.updatedAt, node.updatedAt) : 0.5,
      });
      target.computedFrom = Array.from(new Set([...target.computedFrom, parent.claimId]));
    }

    if (node.supersedesNodeId && nodes.has(node.supersedesNodeId)) {
      const sourceNode = map.nodes.find((candidate) => candidate.id === node.supersedesNodeId) ?? null;
      const key = edgeKey(node.supersedesNodeId, node.id);
      edges.set(key, {
        id: key,
        parentId: node.supersedesNodeId,
        childId: node.id,
        conditionalProbability: sourceNode
          ? conditionalProbabilityForEdge(sourceNode, node, "supersedes", "conditional")
          : confidenceFromScore(node.scores?.confidence),
        edgeModel: "conditional",
        combiningModel: "independent",
        userSetConditional: false,
        strength: sourceNode ? strengthScoreForEdge(sourceNode, node, "supersedes") : 0.45,
        recency: sourceNode ? recencyWeight(sourceNode.updatedAt, node.updatedAt) : 0.5,
      });
    }
  }

  return {
    nodes,
    edges,
    propagationModel: "bayesian",
    lastFullCompute: now,
  };
}

function descendantsFromSeed(graph: BeliefGraph, seedClaimId: string) {
  const outgoing = new Map<string, string[]>();

  for (const edge of graph.edges.values()) {
    outgoing.set(edge.parentId, [...(outgoing.get(edge.parentId) ?? []), edge.childId]);
  }

  const queue = [seedClaimId];
  const seen = new Set<string>([seedClaimId]);

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    for (const childId of outgoing.get(current) ?? []) {
      if (seen.has(childId)) {
        continue;
      }

      seen.add(childId);
      queue.push(childId);
    }
  }

  seen.delete(seedClaimId);
  return seen;
}

function buildContributionExplanation(params: {
  parentId: string;
  parentPrior: number;
  parentPosterior: number;
  edgeProbability: number;
  model: BeliefCombiningModel;
  edgeModel: BeliefEdgeModel;
  value: number;
}) {
  const ratio = params.parentPrior <= EPSILON ? 1 : params.parentPosterior / params.parentPrior;
  const direction =
    params.edgeModel === "contradictory"
      ? "pushes the child down as the parent gets stronger"
      : params.edgeModel === "enabling"
        ? "keeps the child from falling below the enabling floor"
        : "passes the parent update forward";

  return `Parent ${params.parentId} moved ${formatPercent(params.parentPrior)} → ${formatPercent(params.parentPosterior)}. The edge's conditional probability is ${formatPercent(params.edgeProbability)}, the propagation ratio is ${ratio.toFixed(2)}×, and the ${params.model} model ${direction}, yielding ${formatPercent(params.value)}.`;
}

export function propagateBeliefGraph(
  graph: BeliefGraph,
  seedClaimId: string,
  updatedPosterior?: number | null,
): BeliefPropagationResult {
  const now = new Date();
  const workingGraph: BeliefGraph = {
    nodes: new Map(
      Array.from(graph.nodes.entries(), ([claimId, node]) => [
        claimId,
        { ...node, computedFrom: [...node.computedFrom] },
      ]),
    ),
    edges: new Map(Array.from(graph.edges.entries(), ([edgeId, edge]) => [edgeId, { ...edge }])),
    propagationModel: graph.propagationModel,
    lastFullCompute: now,
  };

  const nodes = Array.from(workingGraph.nodes.values());
  const edges = Array.from(workingGraph.edges.values());
  const cycle = detectCycles(nodes, edges);

  if (cycle) {
    return {
      graph: workingGraph,
      steps: [],
      changedClaimIds: [],
      cycleError: buildCycleError(cycle, `Cycle detected across ${cycle.join(" → ")}`),
      computedAt: now,
    };
  }

  const seedNode = workingGraph.nodes.get(seedClaimId) ?? null;
  if (!seedNode) {
    return {
      graph: workingGraph,
      steps: [],
      changedClaimIds: [],
      cycleError: null,
      computedAt: now,
    };
  }

  const affected = descendantsFromSeed(workingGraph, seedClaimId);
  const order = topologicalOrder([seedClaimId, ...Array.from(affected)], edges).filter(
    (claimId) => claimId === seedClaimId || affected.has(claimId),
  );
  const steps: BeliefPropagationStep[] = [];
  const changedClaimIds = new Set<string>();

  const seedPrior = seedNode.posterior;
  const seedPosterior = normalizePosterior(updatedPosterior) ?? seedNode.posterior;
  seedNode.prior = seedPrior;
  seedNode.posterior = seedPosterior;
  seedNode.posteriorComputedAt = now;
  seedNode.computedFrom = [seedClaimId];

  steps.push({
    claimId: seedClaimId,
    oldPosterior: seedPrior,
    newPosterior: seedPosterior,
    posteriorDelta: seedPosterior - seedPrior,
    posteriorComputedAt: now,
    model: "independent",
    edgeModel: "supportive",
    lockedByUser: seedNode.lockedByUser,
    propagationDecoupled: seedNode.propagationDecoupled,
    computedFrom: [seedClaimId],
    contributions: [],
    explanation: `Seed claim updated directly by the user from ${formatPercent(seedPrior)} to ${formatPercent(seedPosterior)}.`,
  });

  if (Math.abs(seedPosterior - seedPrior) > 0.0001) {
    changedClaimIds.add(seedClaimId);
  }

  for (const claimId of order) {
    if (claimId === seedClaimId) {
      continue;
    }

    const node = workingGraph.nodes.get(claimId);
    if (!node) {
      continue;
    }

    const incomingEdges = edges.filter((edge) => edge.childId === claimId);
    const oldPosterior = node.posterior;

    if (node.propagationDecoupled) {
      steps.push({
        claimId,
        oldPosterior,
        newPosterior: oldPosterior,
        posteriorDelta: 0,
        posteriorComputedAt: now,
        model: "independent",
        edgeModel: "conditional",
        lockedByUser: node.lockedByUser,
        propagationDecoupled: true,
        computedFrom: incomingEdges.map((edge) => edge.parentId),
        contributions: [],
        explanation: `This claim was decoupled earlier, so it was skipped and kept at ${formatPercent(oldPosterior)}.`,
        skipped: true,
        skippedReason: "Propagation decoupled by user",
      });
      continue;
    }

    if (node.lockedByUser) {
      steps.push({
        claimId,
        oldPosterior,
        newPosterior: oldPosterior,
        posteriorDelta: 0,
        posteriorComputedAt: now,
        model: combiningModelForNode(
          workingGraph.nodes.get(claimId) ? (graph as unknown as ThoughtMapModel).nodes.find((candidate) => candidate.id === claimId) ?? ({} as ThoughtNodeModel) : ({} as ThoughtNodeModel),
        ),
        edgeModel: incomingEdges[0]?.edgeModel ?? "conditional",
        lockedByUser: true,
        propagationDecoupled: false,
        computedFrom: incomingEdges.map((edge) => edge.parentId),
        contributions: [],
        explanation: `This claim is locked by the user, so Penny recorded the warning but did not override the prior belief.`,
        skipped: true,
        skippedReason: "Locked by user",
      });
      continue;
    }

    const contributions: BeliefPropagationContribution[] = incomingEdges
      .map((edge) => {
        const parent = workingGraph.nodes.get(edge.parentId);
        if (!parent) {
          return null;
        }

        const parentPrior = parent.prior;
        const parentPosterior = parent.posterior;
        const ratio = parentPrior <= EPSILON ? 1 : parentPosterior / parentPrior;

        let value: number;
        if (edge.edgeModel === "contradictory") {
          value = clamp01(1 - edge.conditionalProbability * ratio);
        } else if (edge.edgeModel === "enabling") {
          value = clamp01(Math.max(edge.conditionalProbability, edge.conditionalProbability * ratio));
        } else {
          value = clamp01(edge.conditionalProbability * ratio);
        }

        return {
          parentId: edge.parentId,
          edgeId: edge.id,
          parentPosterior,
          parentPrior,
          edgeProbability: edge.conditionalProbability,
          model: edge.combiningModel,
          value,
          explanation: buildContributionExplanation({
            parentId: edge.parentId,
            parentPrior,
            parentPosterior,
            edgeProbability: edge.conditionalProbability,
            model: edge.combiningModel,
            edgeModel: edge.edgeModel,
            value,
          }),
        } satisfies BeliefPropagationContribution;
      })
      .filter((contribution): contribution is BeliefPropagationContribution => contribution != null);

    const contributionValues = contributions.map((contribution) => contribution.value);
    const dominantModel = incomingEdges[0]?.combiningModel ?? combiningModelForNode(workingGraph.nodes.get(claimId) ?? ({} as ThoughtNodeModel));

    const newPosterior =
      contributionValues.length === 0
        ? oldPosterior
        : dominantModel === "conjunctive"
          ? combineConjunctive(contributionValues)
          : dominantModel === "disjunctive"
            ? combineDisjunctive(contributionValues)
            : combineIndependent(contributionValues);

    node.prior = oldPosterior;
    node.posterior = newPosterior;
    node.posteriorComputedAt = now;
    node.computedFrom = incomingEdges.map((edge) => edge.parentId);

    const dominantEdge = incomingEdges[0]?.edgeModel ?? "supportive";
    const explanation =
      contributions.length > 0
        ? `Recomputed from ${contributions.length} parent${contributions.length === 1 ? "" : "s"} with a ${dominantModel} combination model. ${contributions[0]?.explanation ?? ""}`
        : `No active parents changed this node, so Penny kept the posterior at ${formatPercent(oldPosterior)}.`;

    steps.push({
      claimId,
      oldPosterior,
      newPosterior,
      posteriorDelta: newPosterior - oldPosterior,
      posteriorComputedAt: now,
      model: dominantModel,
      edgeModel: dominantEdge,
      lockedByUser: false,
      propagationDecoupled: false,
      computedFrom: incomingEdges.map((edge) => edge.parentId),
      contributions,
      explanation,
    });

    if (Math.abs(newPosterior - oldPosterior) > 0.0001) {
      changedClaimIds.add(claimId);
    }
  }

  return {
    graph: {
      ...workingGraph,
      lastFullCompute: now,
    },
    steps,
    changedClaimIds: Array.from(changedClaimIds),
    cycleError: null,
    computedAt: now,
  };
}

export function serializeBeliefGraph(graph: BeliefGraph) {
  return {
    propagationModel: graph.propagationModel,
    lastFullCompute: graph.lastFullCompute,
    nodes: Array.from(graph.nodes.values()).map((node) => ({
      ...node,
    })),
    edges: Array.from(graph.edges.values()).map((edge) => ({
      ...edge,
    })),
  };
}

export function serializeBeliefPropagationResult(result: BeliefPropagationResult) {
  return {
    graph: serializeBeliefGraph(result.graph),
    steps: result.steps.map((step) => ({
      ...step,
      contributions: step.contributions.map((contribution) => ({ ...contribution })),
    })),
    changedClaimIds: [...result.changedClaimIds],
    cycleError: result.cycleError,
    computedAt: result.computedAt,
  };
}
