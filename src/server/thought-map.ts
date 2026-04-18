import type {
  Prisma,
  CognitiveBiasProfile as CognitiveBiasProfileRecord,
  ThoughtMap,
  ThoughtMapEvent as ThoughtMapEventRecord,
  ThoughtMapIntervention,
  ThoughtNode,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/db/prisma";
import { buildFounderBrief, getFounderBriefReadiness } from "@/lib/founder-brief";
import {
  buildBeliefGraph,
  propagateBeliefGraph,
  serializeBeliefGraph,
  serializeBeliefPropagationResult,
} from "@/lib/bayesian-propagation";
import { analyzeDialecticResponse, assessSteelManQuality, buildCognitiveBiasProfile, buildPennyLens } from "@/lib/penny-insights";
import { buildRevisitQueue, computeLeitnerBox, computeRevisitScheduleForNode, computeRevisitSchedulesForMap } from "@/lib/revisit-scheduler";
import { buildThoughtMapActionResult, buildThoughtMapJudgment } from "@/lib/thought-map-judgment";
import {
  createRootNodeContent,
  createThoughtMapTitle,
  getDemoThoughtUserId,
} from "@/lib/thought-map";
import { generateActionNotes, generateInitialBranchNotes } from "@/lib/thought-map-generation";
import { cleanSentence } from "@/lib/penny";
import type {
  CognitiveIntervention,
  ClaimCaptureMetadata,
  ClaimRepairAction,
  CreateThoughtMapInput,
  FounderBriefModel,
  DialecticCritiqueStrength,
  GeneratedActionBundle,
  NodeAction,
  EdgeChange,
  RevisitAction,
  RevisitLeitnerBox,
  RevisitPriority,
  RevisitReason,
  RevisitSchedule,
  RevisitStatus,
  SteelMan,
  SteelManVersion,
  SupersessionRecord,
  TriggerDefinition,
  ThoughtMapEvent as ThoughtMapEventModel,
  ThoughtMapModel,
  ThoughtMapEventType,
  ThoughtNodeModel,
  BeliefPropagationAction,
  BeliefPropagationDecision,
  BeliefPropagationResponse,
  CognitiveBiasProfile,
} from "@/types/thought-map";

function mapNode(record: ThoughtNode): ThoughtNodeModel {
  return {
    id: record.id,
    mapId: record.mapId,
    parentId: record.parentId ?? null,
    kind: record.kind as ThoughtNodeModel["kind"],
    nodeStatus: record.nodeStatus as ThoughtNodeModel["nodeStatus"],
    actionOrigin: (record.actionOrigin as ThoughtNodeModel["actionOrigin"]) ?? null,
    supersedesNodeId: record.supersedesNodeId ?? null,
    content: record.content,
    note: record.note ?? null,
    branchOrder: record.branchOrder,
    scores: null,
    psychology: null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildThoughtMapModel(
  record: ThoughtMap & { nodes: ThoughtNode[]; events?: ThoughtMapEventRecord[] },
): ThoughtMapModel {
  const events = record.events ?? [];
  const founderBriefPayload = parseJson<Omit<FounderBriefModel, "generatedAt">>(record.founderBrief);
  const founderBrief =
    founderBriefPayload && record.founderBriefGeneratedAt
      ? {
          ...founderBriefPayload,
          generatedAt: record.founderBriefGeneratedAt,
        }
      : null;
  const mapped: ThoughtMapModel = {
    id: record.id,
    userId: record.userId,
    title: record.title,
    rawThought: record.rawThought,
    status: record.status,
    nodes: record.nodes.map(mapNode),
    events: events.map(mapEventRecord),
    shapeDerivations: [],
    steelMans: parseSteelMans(record.steelMans),
    repairActions: parseClaimRepairActions(record.repairActions),
    revisitSchedules: parseRevisitSchedules(record.revisitSchedules),
    founderBrief,
    founderBriefReadiness: {
      eligible: false,
      missingRequirements: ["assumption", "counter_argument", "research"],
    },
    graphSnapshot: null,
    bayesianPropagation: null,
    beliefGraph: null,
    recommendedNextMove: null,
    interventions: [],
    recommendedIntervention: null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  const judgedMap = {
    ...mapped,
    ...buildThoughtMapJudgment(mapped),
  };
  const lens = buildPennyLens(judgedMap);

  return {
    ...judgedMap,
    shapeDerivations: lens.effectiveShapes
      .map((shape) => shape.derivation)
      .filter((derivation): derivation is NonNullable<typeof derivation> => derivation !== null),
    founderBrief,
    founderBriefReadiness: getFounderBriefReadiness(judgedMap),
  };
}

function interventionDedupeKey(intervention: Pick<CognitiveIntervention, "mapId" | "targetNodeId" | "type">) {
  return `${intervention.mapId}:${intervention.targetNodeId}:${intervention.type}`;
}

function serializeJson(value: unknown) {
  return value == null ? null : JSON.stringify(value);
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeBiasProfileRecord(record: CognitiveBiasProfileRecord | null): CognitiveBiasProfile | null {
  if (!record) {
    return null;
  }

  const parsed = parseJson<Partial<CognitiveBiasProfile>>(record.biasProfileJson);
  if (!parsed) {
    return null;
  }

  return {
    userId: record.userId,
    profileVersion: record.profileVersion,
    biasEntries: Array.isArray(parsed.biasEntries)
      ? parsed.biasEntries.map((entry) => ({
          ...entry,
          firstDetected: entry.firstDetected ? new Date(entry.firstDetected) : new Date(record.createdAt),
          lastSignal: entry.lastSignal ? new Date(entry.lastSignal) : new Date(record.updatedAt),
          evidenceInstances: Array.isArray(entry.evidenceInstances)
            ? entry.evidenceInstances.map((instance) => ({
                ...instance,
                timestamp: new Date(instance.timestamp),
              }))
            : [],
        }))
      : [],
    lastUpdated: new Date(record.lastUpdated),
    overallCalibrationTrend:
      record.overallCalibrationTrend === "improving" || record.overallCalibrationTrend === "degrading"
        ? record.overallCalibrationTrend
        : "stable",
    strongestBias: parsed.strongestBias ?? null,
    mostImprovedBias: parsed.mostImprovedBias ?? null,
  };
}

function serializeBiasProfile(profile: CognitiveBiasProfile) {
  return serializeJson(profile) ?? "{}";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSteelManDate(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeSteelManVersion(record: unknown): SteelManVersion | null {
  if (!isRecord(record)) {
    return null;
  }

  const versionText = typeof record.versionText === "string" ? record.versionText.trim() : "";
  const savedAt = parseSteelManDate(record.savedAt);
  if (!versionText || !savedAt) {
    return null;
  }

  return {
    versionText,
    savedAt,
    roundContext: typeof record.roundContext === "string" && record.roundContext.trim().length > 0 ? record.roundContext.trim() : null,
  };
}

function normalizeSteelMan(record: unknown): SteelMan | null {
  if (!isRecord(record)) {
    return null;
  }

  const id = typeof record.id === "string" ? record.id : "";
  const claimId = typeof record.claimId === "string" ? record.claimId : "";
  const mapId = typeof record.mapId === "string" ? record.mapId : "";
  const userId = typeof record.userId === "string" ? record.userId : "";
  const steelManText = typeof record.steelManText === "string" ? record.steelManText.trim() : "";
  const writtenAt = parseSteelManDate(record.writtenAt);

  if (!id || !claimId || !mapId || !userId || !steelManText || !writtenAt) {
    return null;
  }

  const updateHistory = Array.isArray(record.updateHistory)
    ? record.updateHistory.map(normalizeSteelManVersion).filter((version): version is SteelManVersion => version !== null)
    : [];
  const usedInRound = Array.isArray(record.usedInRound)
    ? record.usedInRound.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const updatedAt = parseSteelManDate(record.updatedAt);

  return {
    id,
    claimId,
    mapId,
    userId,
    steelManText,
    writtenAt,
    qualityScore: typeof record.qualityScore === "number" ? record.qualityScore : null,
    qualityScoreReason:
      typeof record.qualityScoreReason === "string" && record.qualityScoreReason.trim().length > 0
        ? record.qualityScoreReason.trim()
        : null,
    usedInRound,
    updatedAt,
    updateHistory,
  };
}

function parseSteelMans(value: string | null | undefined) {
  const parsed = parseJson<unknown>(value ?? null);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map(normalizeSteelMan)
    .filter((steelMan): steelMan is SteelMan => steelMan !== null)
    .sort((a, b) => {
      const aUpdatedAt = a.updatedAt?.getTime() ?? a.writtenAt.getTime();
      const bUpdatedAt = b.updatedAt?.getTime() ?? b.writtenAt.getTime();
      return bUpdatedAt - aUpdatedAt || b.writtenAt.getTime() - a.writtenAt.getTime();
    });
}

function normalizeSupersessionRecord(record: unknown): SupersessionRecord | null {
  if (!isRecord(record)) {
    return null;
  }

  const supersessionType =
    record.supersessionType === "merge" || record.supersessionType === "split" || record.supersessionType === "reclassification"
      ? record.supersessionType
      : null;

  if (!supersessionType) {
    return null;
  }

  return {
    supersededClaimIds: Array.isArray(record.supersededClaimIds)
      ? record.supersededClaimIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    supersedingClaimIds: Array.isArray(record.supersedingClaimIds)
      ? record.supersedingClaimIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    supersessionType,
    preservedHistory: Boolean(record.preservedHistory),
  };
}

function normalizeEdgeChange(record: unknown): EdgeChange | null {
  if (!isRecord(record)) {
    return null;
  }

  const changeType =
    record.changeType === "created" ||
    record.changeType === "deleted" ||
    record.changeType === "rerouted" ||
    record.changeType === "strength_adjusted"
      ? record.changeType
      : null;
  const edgeId = typeof record.edgeId === "string" ? record.edgeId : "";
  const fromClaimId = typeof record.fromClaimId === "string" ? record.fromClaimId : "";
  const toClaimId = typeof record.toClaimId === "string" ? record.toClaimId : "";
  const reason = typeof record.reason === "string" && record.reason.trim().length > 0 ? record.reason.trim() : "";

  if (!changeType || !edgeId || !fromClaimId || !toClaimId || !reason) {
    return null;
  }

  return {
    edgeId,
    changeType,
    fromClaimId,
    toClaimId,
    reason,
  };
}

function normalizeClaimRepairAction(record: unknown): ClaimRepairAction | null {
  if (!isRecord(record)) {
    return null;
  }

  const actionType =
    record.actionType === "merge" ||
    record.actionType === "split" ||
    record.actionType === "promote" ||
    record.actionType === "demote" ||
    record.actionType === "reclassify" ||
    record.actionType === "reroute_edge" ||
    record.actionType === "reroot"
      ? record.actionType
      : null;
  const initiatedBy = record.initiatedBy === "user" || record.initiatedBy === "penny_suggestion" ? record.initiatedBy : null;
  const reasoning = typeof record.reasoning === "string" && record.reasoning.trim().length > 0 ? record.reasoning.trim() : "";
  const createdAt = parseSteelManDate(record.createdAt);
  const supersessionRecord = normalizeSupersessionRecord(record.supersessionRecord);

  if (!actionType || !initiatedBy || !reasoning || !createdAt || !supersessionRecord) {
    return null;
  }

  return {
    id: typeof record.id === "string" ? record.id : "",
    mapId: typeof record.mapId === "string" ? record.mapId : "",
    actionType,
    initiatedBy,
    sourceClaimIds: Array.isArray(record.sourceClaimIds)
      ? record.sourceClaimIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    resultingClaimIds: Array.isArray(record.resultingClaimIds)
      ? record.resultingClaimIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    reasoning,
    supersessionRecord,
    edgeChanges: Array.isArray(record.edgeChanges)
      ? record.edgeChanges.map(normalizeEdgeChange).filter((item): item is EdgeChange => item !== null)
      : [],
    propagationTriggered: Boolean(record.propagationTriggered),
    createdAt,
  };
}

function normalizeTriggerDefinition(record: unknown): TriggerDefinition | null {
  if (!isRecord(record)) {
    return null;
  }

  const triggerType =
    record.triggerType === "date" ||
    record.triggerType === "event_keyword" ||
    record.triggerType === "dependency_update" ||
    record.triggerType === "confidence_threshold" ||
    record.triggerType === "manual_flag"
      ? record.triggerType
      : null;

  if (!triggerType) {
    return null;
  }

  return {
    triggerType,
    dateTarget: parseSteelManDate(record.dateTarget),
    eventKeyword: typeof record.eventKeyword === "string" && record.eventKeyword.trim().length > 0 ? record.eventKeyword.trim() : null,
    confidenceThreshold: typeof record.confidenceThreshold === "number" ? record.confidenceThreshold : null,
    dependencyClaimId:
      typeof record.dependencyClaimId === "string" && record.dependencyClaimId.trim().length > 0 ? record.dependencyClaimId.trim() : null,
  };
}

function normalizeRevisitReason(record: unknown): RevisitReason | null {
  if (!isRecord(record)) {
    return null;
  }

  const type =
    record.type === "age_threshold" ||
    record.type === "stake_level" ||
    record.type === "untested" ||
    record.type === "dependency_changed" ||
    record.type === "resolution_date_approaching" ||
    record.type === "confidence_drift" ||
    record.type === "external_trigger" ||
    record.type === "manual"
      ? record.type
      : null;
  const description = typeof record.description === "string" && record.description.trim().length > 0 ? record.description.trim() : "";
  const urgencyScore = typeof record.urgencyScore === "number" ? record.urgencyScore : 0;

  if (!type || !description) {
    return null;
  }

  return {
    type,
    description,
    urgencyScore,
  };
}

function normalizeRevisitAction(record: unknown): RevisitAction | null {
  if (!isRecord(record)) {
    return null;
  }

  const type =
    record.type === "reviewed_no_change" ||
    record.type === "confidence_updated" ||
    record.type === "claim_updated" ||
    record.type === "claim_retired" ||
    record.type === "snoozed" ||
    record.type === "triggered_repair" ||
    record.type === "triggered_dialectic"
      ? record.type
      : null;
  const completedAt = parseSteelManDate(record.completedAt);

  if (!type || !completedAt) {
    return null;
  }

  return {
    type,
    notes: typeof record.notes === "string" && record.notes.trim().length > 0 ? record.notes.trim() : null,
    newConfidence: typeof record.newConfidence === "number" ? record.newConfidence : null,
    completedAt,
  };
}

function normalizeRevisitSchedule(record: unknown): RevisitSchedule | null {
  if (!isRecord(record)) {
    return null;
  }

  const status =
    record.status === "pending" ||
    record.status === "surfaced" ||
    record.status === "snoozed" ||
    record.status === "completed" ||
    record.status === "dismissed"
      ? record.status
      : null;
  const priority = record.priority === "low" || record.priority === "medium" || record.priority === "high" || record.priority === "urgent" ? record.priority : null;
  const triggerType =
    record.triggerType === "time_based" ||
    record.triggerType === "event_based" ||
    record.triggerType === "dependency_change" ||
    record.triggerType === "confidence_drift" ||
    record.triggerType === "external_trigger"
      ? record.triggerType
      : null;
  const schedulingReason = normalizeRevisitReason(record.schedulingReason);
  const triggerDefinition = normalizeTriggerDefinition(record.triggerDefinition);
  const scheduledFor = parseSteelManDate(record.scheduledFor);
  const lastComputedAt = parseSteelManDate(record.lastComputedAt);

  if (
    !status ||
    !priority ||
    !triggerType ||
    !schedulingReason ||
    !triggerDefinition ||
    !scheduledFor ||
    !lastComputedAt ||
    typeof record.id !== "string" ||
    typeof record.claimId !== "string" ||
    typeof record.mapId !== "string" ||
    typeof record.userId !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    claimId: record.claimId,
    mapId: record.mapId,
    userId: record.userId,
    scheduledFor,
    schedulingReason,
    priority,
    status,
    leitnerBox: record.leitnerBox === 1 || record.leitnerBox === 2 || record.leitnerBox === 3 || record.leitnerBox === 4 || record.leitnerBox === 5 ? record.leitnerBox : 1,
    surfacedAt: parseSteelManDate(record.surfacedAt),
    userAction: normalizeRevisitAction(record.userAction),
    snoozedUntil: parseSteelManDate(record.snoozedUntil),
    triggerType,
    triggerDefinition,
    lastComputedAt,
  };
}

function parseClaimRepairActions(value: string | null | undefined) {
  const parsed = parseJson<unknown>(value ?? null);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map(normalizeClaimRepairAction)
    .filter((repairAction): repairAction is ClaimRepairAction => repairAction !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function parseRevisitSchedules(value: string | null | undefined) {
  const parsed = parseJson<unknown>(value ?? null);

  if (!Array.isArray(parsed)) {
    return [];
  }

  const priorityWeight = (priority: RevisitPriority) => (priority === "urgent" ? 4 : priority === "high" ? 3 : priority === "medium" ? 2 : 1);

  return parsed
    .map(normalizeRevisitSchedule)
    .filter((schedule): schedule is RevisitSchedule => schedule !== null)
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || a.scheduledFor.getTime() - b.scheduledFor.getTime());
}

function mapEventRecord(record: ThoughtMapEventRecord): ThoughtMapEventModel {
  return {
    id: record.id,
    mapId: record.mapId,
    nodeId: record.nodeId,
    interventionId: record.interventionId,
    eventType: record.eventType as ThoughtMapEventType,
    payload: parseJson<Record<string, unknown>>(record.payload),
    createdAt: record.createdAt,
  };
}

function formatClaimCaptureMetadata(metadata: ClaimCaptureMetadata) {
  const lines = [
    "## Claim capture",
    `- Confidence: ${metadata.confidence}%`,
    `- Resolution date: ${metadata.resolutionDate ?? "not set"}`,
    `- Provenance: ${metadata.provenance}`,
    `- Provenance detail: ${metadata.provenanceDetail || "not specified"}`,
    `- Source citation: ${metadata.sourceCitation || "not specified"}`,
    `- Source reliability: ${metadata.sourceTrustLevel}`,
    `- Stakes: ${metadata.stakes.length ? metadata.stakes.join(", ") : "none tagged"}`,
    `- Dependency notes: ${metadata.dependencyNotes || "none provided"}`,
    `- Status: ${metadata.status}`,
  ];

  if (metadata.temporalScope) {
    lines.push(`- Temporal scope: ${metadata.temporalScope}`);
  }

  if (metadata.conditionalStatement) {
    lines.push(`- Conditional statement: ${metadata.conditionalStatement}`);
  }

  if (metadata.structureKind) {
    lines.push(`- Structure kind: ${metadata.structureKind.replaceAll("_", " ")}`);
  }

  lines.push("", "## Raw thought");

  return lines.join("\n");
}

function mapIntervention(record: ThoughtMapIntervention): CognitiveIntervention {
  const outcomeDelta = parseJson(record.outcomeDelta) as CognitiveIntervention["outcomeDelta"];

  return {
    id: record.id,
    mapId: record.mapId,
    targetNodeId: record.targetNodeId,
    type: record.type as CognitiveIntervention["type"],
    detector: record.detector as CognitiveIntervention["detector"],
    triggerReason: record.triggerReason,
    prompt: record.prompt,
    inputMode: record.inputMode as CognitiveIntervention["inputMode"],
    status: record.status as CognitiveIntervention["status"],
    outcomeDelta,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    shownAt: record.shownAt,
    completedAt: record.completedAt,
    dismissedAt: record.dismissedAt,
  };
}

function psychologyDelta(beforeMap: ThoughtMapModel | null, afterMap: ThoughtMapModel, targetNodeId: string) {
  const before = beforeMap?.nodes.find((node) => node.id === targetNodeId)?.psychology ?? null;
  const after =
    afterMap.nodes.find((node) => node.id === targetNodeId)?.psychology ??
    afterMap.nodes.find((node) => node.supersedesNodeId === targetNodeId)?.psychology ??
    null;

  if (!before || !after) {
    return null;
  }

  return {
    ambiguityScore: Number((after.ambiguityScore - before.ambiguityScore).toFixed(2)),
    comparisonCoverageScore: Number((after.comparisonCoverageScore - before.comparisonCoverageScore).toFixed(2)),
    falsificationCoverageScore: Number((after.falsificationCoverageScore - before.falsificationCoverageScore).toFixed(2)),
    actionabilityScore: Number((after.actionabilityScore - before.actionabilityScore).toFixed(2)),
  };
}

async function createThoughtMapEvent(
  tx: Prisma.TransactionClient,
  input: {
    mapId: string;
    nodeId?: string | null;
    interventionId?: string | null;
    eventType: ThoughtMapEventType;
    payload?: Record<string, unknown> | null;
  },
) {
  await tx.thoughtMapEvent.create({
    data: {
      mapId: input.mapId,
      nodeId: input.nodeId ?? null,
      interventionId: input.interventionId ?? null,
      eventType: input.eventType,
      payload: serializeJson(input.payload ?? null),
      },
    });
}

function deriveChallengeCalibration(params: {
  response: string;
  responsePath: "defend" | "revise" | "absorb";
}) {
  const responseLength = params.response.trim().length;
  const masteryLevel = responseLength >= 160 ? "solid" : responseLength >= 90 ? "growing" : "unmeasured";
  const quickResponse = responseLength < 80;

  if (masteryLevel === "solid" && params.responsePath !== "absorb") {
    return {
      masteryLevel,
      label: "under-challenged",
      direction: "increase challenge" as const,
      note: "The response is long and sustained enough to tolerate a sharper next round.",
      responseLength,
      quickResponse,
    };
  }

  if (quickResponse || params.responsePath === "absorb") {
    return {
      masteryLevel,
      label: "scaffolded",
      direction: "reduce challenge" as const,
      note: "The response is still short or absorbent, so the next round should stay gentler.",
      responseLength,
      quickResponse,
    };
  }

  return {
    masteryLevel,
    label: "near the flow zone",
    direction: "hold steady" as const,
    note: "The response shows enough traction to keep challenge at the current level.",
    responseLength,
    quickResponse,
  };
}

function normalizeDialecticCritiqueStrength(
  critiqueStrength: string,
  critiqueType?: string | null,
): DialecticCritiqueStrength {
  const normalized = critiqueStrength.trim().toLowerCase();

  if (normalized.includes("adversarial") || critiqueType === "red_team") {
    return "adversarial";
  }

  if (normalized.includes("strong") || normalized.includes("brutal")) {
    return "strong";
  }

  if (normalized.includes("moderate") || normalized.includes("firm")) {
    return "moderate";
  }

  return "mild";
}

function confidenceScoreToPercent(score: number | null | undefined) {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(score * 100)));
}

function summarizePriorDialecticRounds(map: ThoughtMapModel, nodeId: string | null | undefined) {
  return map.events
    .filter((event) => event.eventType === "dialectic_round" && (nodeId ? event.nodeId === nodeId : true))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((event, index) => {
      const round = typeof event.payload?.round === "string" ? String(event.payload.round) : `Round ${index + 1}`;
      const responsePath =
        event.payload?.responsePath === "defend" ||
        event.payload?.responsePath === "revise" ||
        event.payload?.responsePath === "absorb"
          ? event.payload.responsePath
          : "defend";
      const roundPayload = event.payload?.dialecticRound && typeof event.payload.dialecticRound === "object"
        ? (event.payload.dialecticRound as Record<string, unknown>)
        : null;

      return {
        id: event.id,
        round,
        roundIndex:
          typeof event.payload?.roundIndex === "number" ? Number(event.payload.roundIndex) : index,
        title: typeof event.payload?.title === "string" ? String(event.payload.title) : "Dialectic round",
        critiqueStrength:
          typeof event.payload?.critiqueStrength === "string" ? String(event.payload.critiqueStrength) : "mild",
        critiqueType:
          typeof event.payload?.critiqueType === "string" && event.payload.critiqueType.trim().length > 0
            ? String(event.payload.critiqueType)
            : null,
        responsePath,
        prompt: typeof event.payload?.prompt === "string" ? String(event.payload.prompt) : "",
        why: typeof event.payload?.why === "string" ? String(event.payload.why) : "",
        response: typeof event.payload?.response === "string" ? String(event.payload.response) : "",
        responseClassification:
          roundPayload && typeof roundPayload.responseClassification === "object"
            ? (roundPayload.responseClassification as Record<string, unknown>)
            : null,
        confidenceDelta:
          roundPayload && typeof roundPayload.confidenceDelta === "number"
            ? Number(roundPayload.confidenceDelta)
            : null,
        engagementScore:
          roundPayload && typeof roundPayload.engagementScore === "number"
            ? Number(roundPayload.engagementScore)
            : null,
        evidenceAdded:
          roundPayload && typeof roundPayload.newEvidenceAdded === "boolean"
            ? Boolean(roundPayload.newEvidenceAdded)
            : roundPayload && typeof roundPayload.responseEvidenceAdded === "boolean"
              ? Boolean(roundPayload.responseEvidenceAdded)
              : false,
        dialecticRound: roundPayload
          ? {
              confidenceAtRoundEnd:
                typeof roundPayload.confidenceAtRoundEnd === "number"
                  ? Number(roundPayload.confidenceAtRoundEnd)
                  : null,
              confidenceDelta:
                typeof roundPayload.confidenceDelta === "number" ? Number(roundPayload.confidenceDelta) : null,
              engagementScore:
                typeof roundPayload.engagementScore === "number" ? Number(roundPayload.engagementScore) : null,
              responseClassification:
                roundPayload.responseClassification && typeof roundPayload.responseClassification === "object"
                  ? (roundPayload.responseClassification as Record<string, unknown>)
                  : null,
              newEvidenceAdded:
                typeof roundPayload.newEvidenceAdded === "boolean"
                  ? Boolean(roundPayload.newEvidenceAdded)
                  : typeof roundPayload.responseEvidenceAdded === "boolean"
                    ? Boolean(roundPayload.responseEvidenceAdded)
                    : false,
            }
          : null,
      };
    });
}

export async function recordShapeFeedback(params: {
  mapId: string;
  shapeId: string;
  verdict: "confirmed" | "rejected" | "refined";
  shapeLabel: string;
  source: string;
  reasoning: string;
  falsificationCondition?: string | null;
  nodeId?: string | null;
}) {
  const created = await prisma.$transaction(async (tx) => {
    return tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: params.nodeId ?? null,
        eventType: "shape_feedback",
        payload: serializeJson({
          shapeId: params.shapeId,
          verdict: params.verdict,
          shapeLabel: params.shapeLabel,
          source: params.source,
          reasoning: params.reasoning,
          falsificationCondition: params.falsificationCondition ?? null,
        }),
      },
    });
  });

  return mapEventRecord(created);
}

export async function recordMetaCognitionEvent(params: {
  mapId: string;
  nodeId?: string | null;
  payload: Record<string, unknown>;
}) {
  const created = await prisma.$transaction(async (tx) => {
    return tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: params.nodeId ?? null,
        eventType: params.payload.responseType ? "meta_cognition_response" : "meta_cognition_prompt",
        payload: serializeJson(params.payload),
      },
    });
  });

  return mapEventRecord(created);
}

export async function recordConfidenceOverride(params: {
  mapId: string;
  sourceNodeId: string;
  targetNodeId: string;
  mode: "hold" | "reduce" | "decouple";
  reasoning: string;
}) {
  const created = await prisma.$transaction(async (tx) => {
    return tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: params.targetNodeId,
        eventType: "confidence_override",
        payload: serializeJson({
          sourceNodeId: params.sourceNodeId,
          targetNodeId: params.targetNodeId,
          mode: params.mode,
          reasoning: params.reasoning,
        }),
      },
    });
  });

  return mapEventRecord(created);
}

function decisionTypeToConfidenceMode(decisionType: Exclude<BeliefPropagationAction, "compute">) {
  if (decisionType === "decouple") {
    return "decouple" as const;
  }

  if (decisionType === "override") {
    return "reduce" as const;
  }

  return "hold" as const;
}

export async function recordBeliefPropagationDecision(params: {
  mapId: string;
  seedClaimId: string;
  targetClaimId: string;
  decisionType: Exclude<BeliefPropagationAction, "compute">;
  oldPosterior: number;
  proposedPosterior: number;
  finalPosterior: number;
  reason: string;
  arithmetic: BeliefPropagationDecision["arithmetic"];
}) {
  const createdAt = new Date();
  const created = await prisma.$transaction(async (tx) => {
    const decisionEvent = await tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: params.targetClaimId,
        eventType: "belief_propagation_decision",
        payload: serializeJson({
          seedClaimId: params.seedClaimId,
          targetClaimId: params.targetClaimId,
          decisionType: params.decisionType,
          oldPosterior: params.oldPosterior,
          proposedPosterior: params.proposedPosterior,
          finalPosterior: params.finalPosterior,
          reason: params.reason,
          arithmetic: params.arithmetic,
          createdAt,
        }),
      },
    });

    const compatibilityEvent = await tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: params.targetClaimId,
        eventType: "confidence_override",
        payload: serializeJson({
          sourceNodeId: params.seedClaimId,
          targetNodeId: params.targetClaimId,
          mode: decisionTypeToConfidenceMode(params.decisionType),
          reasoning: params.reason,
        }),
      },
    });

    return {
      decisionEvent,
      compatibilityEvent,
    };
  });

  return {
    decisionEvent: mapEventRecord(created.decisionEvent),
    compatibilityEvent: mapEventRecord(created.compatibilityEvent),
    decisionEventId: created.decisionEvent.id,
    compatibilityEventId: created.compatibilityEvent.id,
  };
}

export async function recordBeliefPropagation(params: {
  mapId: string;
  seedClaimId: string;
  updatedPosterior?: number | null;
}): Promise<BeliefPropagationResponse> {
  const map = await getThoughtMap(params.mapId);

  if (!map) {
    throw new Error("Map not found");
  }

  const graph = buildBeliefGraph(map);
  const result = propagateBeliefGraph(graph, params.seedClaimId, params.updatedPosterior ?? null);
  const serializedResult = serializeBeliefPropagationResult(result);

  const created = await prisma.$transaction(async (tx) => {
    const graphEvent = await tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: params.seedClaimId,
        eventType: "belief_graph_state",
        payload: serializeJson({
          seedClaimId: params.seedClaimId,
          beliefGraph: serializeBeliefGraph(result.graph),
          cycleError: result.cycleError,
          computedAt: result.computedAt,
        }),
      },
    });

    const propagationEvent = await tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: params.seedClaimId,
        eventType: "belief_propagation",
        payload: serializeJson({
          seedClaimId: params.seedClaimId,
          updatedPosterior: params.updatedPosterior ?? null,
          result: serializedResult,
        }),
      },
    });

    let cycleEvent: ThoughtMapEventRecord | null = null;
    if (result.cycleError) {
      cycleEvent = await tx.thoughtMapEvent.create({
        data: {
          mapId: params.mapId,
          nodeId: params.seedClaimId,
          eventType: "belief_graph_cycle",
          payload: serializeJson({
            seedClaimId: params.seedClaimId,
            cycleError: result.cycleError,
            computedAt: result.computedAt,
          }),
        },
      });
    }

    return {
      graphEvent,
      propagationEvent,
      cycleEvent,
    };
  });

  return {
    result,
    graphEventId: created.graphEvent.id,
    propagationEventId: created.propagationEvent.id,
    decisionEventId: null,
    cycleError: result.cycleError,
    graphEvent: mapEventRecord(created.graphEvent),
    propagationEvent: mapEventRecord(created.propagationEvent),
    cycleEvent: created.cycleEvent ? mapEventRecord(created.cycleEvent) : null,
  };
}

export async function recordDialecticRound(params: {
  mapId: string;
  nodeId?: string | null;
  round: string;
  roundIndex: number;
  title: string;
  critiqueStrength: string;
  critiqueType?: string | null;
  critiqueFailureTypes?: string[];
  prompt: string;
  why: string;
  responsePath: "defend" | "revise" | "absorb";
  response: string;
  confidenceAtRoundEnd?: number | null;
}) {
  const map = await getThoughtMap(params.mapId);

  if (!map) {
    throw new Error("Map not found");
  }

  const currentNode = params.nodeId ? map.nodes.find((candidate) => candidate.id === params.nodeId) ?? null : null;
  const currentConfidence = confidenceScoreToPercent(currentNode?.scores?.confidence) ?? 0;
  const priorRounds = summarizePriorDialecticRounds(map, params.nodeId ?? null);
  const priorRoundId = priorRounds.at(-1)?.id ?? null;
  const confidenceAtRoundStart = priorRounds.at(-1)?.dialecticRound?.confidenceAtRoundEnd ?? currentConfidence;
  const confidenceAtRoundEnd =
    typeof params.confidenceAtRoundEnd === "number" && Number.isFinite(params.confidenceAtRoundEnd)
      ? Math.max(0, Math.min(100, Math.round(params.confidenceAtRoundEnd)))
      : confidenceAtRoundStart;
  const confidenceDelta = Number((confidenceAtRoundEnd - confidenceAtRoundStart).toFixed(2));
  const critiqueStrength = normalizeDialecticCritiqueStrength(params.critiqueStrength, params.critiqueType ?? null);
  const critiqueFailureTypes = params.critiqueFailureTypes?.length
    ? params.critiqueFailureTypes
    : params.critiqueType
      ? [params.critiqueType]
      : [];
  const roundId = crypto.randomUUID();
  const roundNumber = params.roundIndex + 1;
  const responseEvidenceAdded = /(https?:\/\/|www\.|paper|study|data|source|citation|according to|for example|for instance)/i.test(
    params.response,
  );
  const analysis = analyzeDialecticResponse({
    roundId,
    response: params.response,
    responsePath: params.responsePath,
    critiqueGenerated: params.prompt,
    critiqueFailureTypes,
    confidenceAtRoundStart,
    confidenceAtRoundEnd,
    priorRoundsCount: priorRounds.length,
    followUpFocus: params.why,
    responseAddressedEvidence: responseEvidenceAdded,
  });
  const stagnantRounds = [...priorRounds.slice(-2), { confidenceDelta, engagementScore: analysis.engagementScore, evidenceAdded: analysis.newEvidenceAdded }].filter(
    (entry) => Number(entry.confidenceDelta ?? 0) === 0 && !entry.evidenceAdded,
  ).length;
  const followUpPrompt =
    stagnantRounds >= 3
      ? "The next round should name the pattern of no confidence change or new evidence and ask the user to notice it."
      : analysis.followUpPrompt;
  const createdAt = new Date();
  const structuredRound = {
    id: roundId,
    mapId: params.mapId,
    claimId: params.nodeId ?? null,
    roundNumber,
    priorRoundId,
    critiqueGenerated: params.prompt,
    critiqueFailureTypes,
    critiqueLens: params.why,
    critiqueStrength,
    userResponse: params.response,
    responseClassification: analysis.classification,
    concessions: analysis.concessions,
    defenses: analysis.defenses,
    dismissals: analysis.dismissals,
    confidenceAtRoundStart,
    confidenceAtRoundEnd,
    confidenceDelta,
    engagementScore: analysis.engagementScore,
    followUpPrompt,
    createdAt: createdAt.toISOString(),
    closedAt: createdAt.toISOString(),
  };

  const created = await prisma.$transaction(async (tx) => {
    const event = await tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: params.nodeId ?? null,
        eventType: "dialectic_round",
        payload: serializeJson({
          round: params.round,
          roundIndex: params.roundIndex,
          title: params.title,
          critiqueStrength,
          critiqueType: params.critiqueType ?? null,
          prompt: params.prompt,
          why: params.why,
          responsePath: params.responsePath,
          response: params.response,
          dialecticRound: structuredRound,
          priorRounds: priorRounds.slice(-3),
        }),
      },
    });

    const calibration = deriveChallengeCalibration({
      response: params.response,
      responsePath: params.responsePath,
    });

    await tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: params.nodeId ?? null,
        eventType: "challenge_calibration",
        payload: serializeJson({
          round: params.round,
          roundIndex: params.roundIndex,
          masteryLevel: calibration.masteryLevel,
          label: calibration.label,
          direction: calibration.direction,
          note: calibration.note,
          responseLength: calibration.responseLength,
          quickResponse: calibration.quickResponse,
          responsePath: params.responsePath,
          engagementScore: analysis.engagementScore,
          responseClassification: analysis.classification,
          confidenceAtRoundStart,
          confidenceAtRoundEnd,
          confidenceDelta,
          responseEvidenceAdded: analysis.newEvidenceAdded,
        }),
      },
    });

    return event;
  });

  return mapEventRecord(created);
}

export async function recordSteelMan(params: {
  mapId: string;
  claimId: string;
  steelManText: string;
  roundContext?: string | null;
  usedInRound?: string[];
  userId?: string;
}) {
  const userId = params.userId ?? getDemoThoughtUserId();
  const map = await prisma.thoughtMap.findUnique({
    where: { id: params.mapId },
    select: {
      id: true,
      userId: true,
      steelMans: true,
      nodes: {
        select: {
          id: true,
          content: true,
        },
      },
    },
  });

  if (!map) {
    throw new Error("Map not found");
  }

  const claim = map.nodes.find((node) => node.id === params.claimId);

  if (!claim) {
    throw new Error("Claim not found");
  }

  const steelMans = parseSteelMans(map.steelMans);
  const assessment = assessSteelManQuality(params.steelManText, claim.content);
  const now = new Date();
  const nextVersion: SteelManVersion = {
    versionText: params.steelManText.trim(),
    savedAt: now,
    roundContext: params.roundContext ?? null,
  };
  const usedInRound = Array.from(
    new Set([...(steelMans.find((steelMan) => steelMan.claimId === params.claimId && steelMan.userId === userId)?.usedInRound ?? []), ...(params.usedInRound ?? [])]),
  );
  const existingIndex = steelMans.findIndex((steelMan) => steelMan.claimId === params.claimId && steelMan.userId === userId);

  if (existingIndex >= 0) {
    const existing = steelMans[existingIndex];
    const currentVersion = existing.updateHistory[existing.updateHistory.length - 1] ?? null;
    const updateHistory =
      currentVersion && currentVersion.versionText.trim() === nextVersion.versionText
        ? existing.updateHistory
        : [...existing.updateHistory, nextVersion];

    steelMans[existingIndex] = {
      ...existing,
      steelManText: nextVersion.versionText,
      qualityScore: assessment.qualityScore,
      qualityScoreReason: assessment.qualityScoreReason,
      usedInRound,
      updatedAt: now,
      updateHistory,
    };
  } else {
    steelMans.push({
      id: randomUUID(),
      claimId: params.claimId,
      mapId: params.mapId,
      userId,
      steelManText: nextVersion.versionText,
      writtenAt: now,
      qualityScore: assessment.qualityScore,
      qualityScoreReason: assessment.qualityScoreReason,
      usedInRound,
      updatedAt: now,
      updateHistory: [nextVersion],
    });
  }

  await prisma.thoughtMap.update({
    where: { id: params.mapId },
    data: {
      steelMans: serializeJson(steelMans) ?? "[]",
    },
  });

  const steelMan = steelMans.find((item) => item.claimId === params.claimId && item.userId === userId) ?? steelMans[steelMans.length - 1];

  if (!steelMan) {
    throw new Error("Steel man not found");
  }

  return {
    steelMan,
    assessment,
  };
}

function readString(value: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return fallback;
}

function readStringArray(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

export async function recordClaimRepairAction(params: {
  mapId: string;
  actionType: "merge" | "split" | "promote" | "demote" | "reclassify" | "reroute_edge" | "reroot";
  initiatedBy?: "user" | "penny_suggestion";
  sourceClaimIds: string[];
  reasoning: string;
  details?: Record<string, unknown>;
  propagationTriggered?: boolean;
  userId?: string;
}) {
  const userId = params.userId ?? getDemoThoughtUserId();
  const map = await prisma.thoughtMap.findUnique({
    where: { id: params.mapId },
    select: {
      id: true,
      userId: true,
      repairActions: true,
      revisitSchedules: true,
      nodes: {
        select: {
          id: true,
          mapId: true,
          parentId: true,
          kind: true,
          nodeStatus: true,
          actionOrigin: true,
          supersedesNodeId: true,
          content: true,
          note: true,
          branchOrder: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!map) {
    throw new Error("Map not found");
  }

  const sourceNodes = params.sourceClaimIds
    .map((claimId) => map.nodes.find((node) => node.id === claimId))
    .filter((node): node is ThoughtNode => node != null);

  if (!sourceNodes.length) {
    throw new Error("Claim not found");
  }

  const now = new Date();
  const repairActions = parseClaimRepairActions(map.repairActions);
  const branchOrderForParent = (parentId: string | null) =>
    (map.nodes.filter((candidate) => candidate.parentId === parentId).reduce((max, candidate) => Math.max(max, candidate.branchOrder), 0) || 0) + 1;
  const commonParentId =
    sourceNodes.map((node) => node.parentId).every((parentId, _, list) => parentId === list[0])
      ? sourceNodes[0]?.parentId ?? null
      : sourceNodes[0]?.parentId ?? null;
  let resultingClaimIds: string[] = [];
  const edgeChanges: EdgeChange[] = [];
  const supersessionRecord: SupersessionRecord = {
    supersededClaimIds: sourceNodes.map((node) => node.id),
    supersedingClaimIds: [],
    supersessionType: params.actionType === "split" ? "split" : params.actionType === "merge" ? "merge" : "reclassification",
    preservedHistory: true,
  };

  await prisma.$transaction(async (tx) => {
    if (params.actionType === "merge") {
      const mergedText = readString(params.details ?? {}, ["mergedText", "mergeText"], sourceNodes.map((node) => node.content).join(" "));
      const mergedKind = (readString(params.details ?? {}, ["mergedKind", "newKind"], "core_claim") as ThoughtNode["kind"]) ?? "core_claim";
      const mergedNode = await tx.thoughtNode.create({
        data: {
          mapId: map.id,
          parentId: commonParentId,
          kind: mergedKind,
          nodeStatus: "active",
          content: mergedText,
          note: `Merged from ${sourceNodes.map((node) => node.id).join(", ")}`,
          branchOrder: branchOrderForParent(commonParentId),
        },
      });

      await tx.thoughtNode.updateMany({
        where: { id: { in: sourceNodes.map((node) => node.id) } },
        data: {
          nodeStatus: "superseded",
          supersedesNodeId: mergedNode.id,
        },
      });

      const childIds = map.nodes.filter((node) => params.sourceClaimIds.includes(node.parentId ?? "")).map((node) => node.id);
      if (childIds.length) {
        await tx.thoughtNode.updateMany({
          where: { id: { in: childIds } },
          data: {
            parentId: mergedNode.id,
          },
        });
        edgeChanges.push(
          ...childIds.map((childId) => ({
            edgeId: `${map.id}:${childId}:${mergedNode.id}`,
            changeType: "rerouted" as const,
            fromClaimId: params.sourceClaimIds[0] ?? mergedNode.id,
            toClaimId: mergedNode.id,
            reason: "Children rerouted to the merged claim.",
          })),
        );
      }

      resultingClaimIds = [mergedNode.id];
      supersessionRecord.supersedingClaimIds = [mergedNode.id];
      edgeChanges.push({
        edgeId: `${map.id}:${mergedNode.id}:parent`,
        changeType: "created",
        fromClaimId: commonParentId ?? mergedNode.id,
        toClaimId: mergedNode.id,
        reason: "Merged claim created from overlapping claims.",
      });
    } else if (params.actionType === "split") {
      const source = sourceNodes[0];
      const splitTexts = readStringArray(params.details ?? {}, "splitTexts");
      const firstText = splitTexts[0] ?? readString(params.details ?? {}, ["firstText", "leftText"], `${source.content} (part 1)`);
      const secondText = splitTexts[1] ?? readString(params.details ?? {}, ["secondText", "rightText"], `${source.content} (part 2)`);
      const firstNode = await tx.thoughtNode.create({
        data: {
          mapId: map.id,
          parentId: source.parentId,
          kind: source.kind,
          nodeStatus: "active",
          content: firstText,
          note: `Split from ${source.id}`,
          branchOrder: branchOrderForParent(source.parentId),
        },
      });
      const secondNode = await tx.thoughtNode.create({
        data: {
          mapId: map.id,
          parentId: source.parentId,
          kind: source.kind,
          nodeStatus: "active",
          content: secondText,
          note: `Split from ${source.id}`,
          branchOrder: branchOrderForParent(source.parentId) + 1,
        },
      });

      await tx.thoughtNode.update({
        where: { id: source.id },
        data: {
          nodeStatus: "superseded",
          supersedesNodeId: firstNode.id,
        },
      });

      const childNodes = map.nodes.filter((node) => node.parentId === source.id);
      for (const [index, child] of childNodes.entries()) {
        await tx.thoughtNode.update({
          where: { id: child.id },
          data: {
            parentId: index % 2 === 0 ? firstNode.id : secondNode.id,
          },
        });
        edgeChanges.push({
          edgeId: `${map.id}:${child.id}:${index % 2 === 0 ? firstNode.id : secondNode.id}`,
          changeType: "rerouted",
          fromClaimId: source.id,
          toClaimId: index % 2 === 0 ? firstNode.id : secondNode.id,
          reason: "Child claim assigned during split.",
        });
      }

      resultingClaimIds = [firstNode.id, secondNode.id];
      supersessionRecord.supersedingClaimIds = resultingClaimIds;
      edgeChanges.push(
        {
          edgeId: `${map.id}:${firstNode.id}:parent`,
          changeType: "created",
          fromClaimId: source.parentId ?? firstNode.id,
          toClaimId: firstNode.id,
          reason: "First split claim created.",
        },
        {
          edgeId: `${map.id}:${secondNode.id}:parent`,
          changeType: "created",
          fromClaimId: source.parentId ?? secondNode.id,
          toClaimId: secondNode.id,
          reason: "Second split claim created.",
        },
      );
    } else if (params.actionType === "promote") {
      const source = sourceNodes[0];
      const promotedText = readString(params.details ?? {}, ["promotedText", "claimText"], source.content);
      const promotedNode = await tx.thoughtNode.create({
        data: {
          mapId: map.id,
          parentId: source.parentId,
          kind: "core_claim",
          nodeStatus: "active",
          content: promotedText,
          note: `Promoted from ${source.id}`,
          branchOrder: branchOrderForParent(source.parentId),
        },
      });

      await tx.thoughtNode.update({
        where: { id: source.id },
        data: {
          nodeStatus: "superseded",
          supersedesNodeId: promotedNode.id,
        },
      });

      const childNodes = map.nodes.filter((node) => node.parentId === source.id);
      if (childNodes.length) {
        await tx.thoughtNode.updateMany({
          where: { id: { in: childNodes.map((node) => node.id) } },
          data: {
            parentId: promotedNode.id,
          },
        });
      }

      resultingClaimIds = [promotedNode.id];
      supersessionRecord.supersedingClaimIds = [promotedNode.id];
      edgeChanges.push({
        edgeId: `${map.id}:${promotedNode.id}:parent`,
        changeType: "created",
        fromClaimId: source.parentId ?? promotedNode.id,
        toClaimId: promotedNode.id,
        reason: "Assumption promoted to first-class claim.",
      });
    } else if (params.actionType === "demote") {
      const source = sourceNodes[0];
      const targetClaimId = readString(params.details ?? {}, ["targetClaimId"], source.parentId ?? "");
      if (!targetClaimId) {
        throw new Error("Target claim required for demote");
      }

      const demotedNode = await tx.thoughtNode.create({
        data: {
          mapId: map.id,
          parentId: targetClaimId,
          kind: "assumption",
          nodeStatus: "active",
          content: readString(params.details ?? {}, ["demotedText", "claimText"], source.content),
          note: `Demoted from ${source.id}`,
          branchOrder: branchOrderForParent(targetClaimId),
        },
      });

      await tx.thoughtNode.update({
        where: { id: source.id },
        data: {
          nodeStatus: "superseded",
          supersedesNodeId: demotedNode.id,
        },
      });

      resultingClaimIds = [demotedNode.id];
      supersessionRecord.supersedingClaimIds = [demotedNode.id];
      edgeChanges.push({
        edgeId: `${map.id}:${demotedNode.id}:parent`,
        changeType: "created",
        fromClaimId: targetClaimId,
        toClaimId: demotedNode.id,
        reason: "Claim demoted into a supporting assumption.",
      });
    } else if (params.actionType === "reclassify") {
      const source = sourceNodes[0];
      const newKind = readString(params.details ?? {}, ["newStructureKind", "kind"], source.kind) as ThoughtNode["kind"];
      const reclassifiedNode = await tx.thoughtNode.create({
        data: {
          mapId: map.id,
          parentId: source.parentId,
          kind: newKind,
          nodeStatus: "active",
          content: source.content,
          note: `Reclassified from ${source.kind}`,
          branchOrder: branchOrderForParent(source.parentId),
        },
      });

      await tx.thoughtNode.update({
        where: { id: source.id },
        data: {
          nodeStatus: "superseded",
          supersedesNodeId: reclassifiedNode.id,
        },
      });

      resultingClaimIds = [reclassifiedNode.id];
      supersessionRecord.supersedingClaimIds = [reclassifiedNode.id];
      supersessionRecord.supersessionType = "reclassification";
      edgeChanges.push({
        edgeId: `${map.id}:${reclassifiedNode.id}:parent`,
        changeType: "created",
        fromClaimId: source.parentId ?? reclassifiedNode.id,
        toClaimId: reclassifiedNode.id,
        reason: "Claim reclassified into a new structure kind.",
      });
    } else if (params.actionType === "reroute_edge") {
      const childClaimId = readString(params.details ?? {}, ["childClaimId", "edgeId", "sourceClaimId"], sourceNodes[0].id);
      const toClaimId = readString(params.details ?? {}, ["toClaimId", "targetClaimId"], "");
      if (!toClaimId) {
        throw new Error("Target claim required for reroute_edge");
      }

      await tx.thoughtNode.update({
        where: { id: childClaimId },
        data: {
          parentId: toClaimId,
        },
      });

      resultingClaimIds = [toClaimId];
      edgeChanges.push({
        edgeId: `${map.id}:${childClaimId}:${toClaimId}`,
        changeType: "rerouted",
        fromClaimId: sourceNodes[0].id,
        toClaimId,
        reason: "Edge explicitly rerouted by the user.",
      });
    } else if (params.actionType === "reroot") {
      const source = sourceNodes[0];
      const rerootedNode = await tx.thoughtNode.create({
        data: {
          mapId: map.id,
          parentId: null,
          kind: source.kind,
          nodeStatus: "active",
          content: readString(params.details ?? {}, ["rerootText", "claimText"], source.content),
          note: `Rerooted from ${source.id}`,
          branchOrder: branchOrderForParent(null),
        },
      });

      await tx.thoughtNode.update({
        where: { id: source.id },
        data: {
          nodeStatus: "superseded",
          supersedesNodeId: rerootedNode.id,
        },
      });

      resultingClaimIds = [rerootedNode.id];
      supersessionRecord.supersedingClaimIds = [rerootedNode.id];
      edgeChanges.push({
        edgeId: `${map.id}:${rerootedNode.id}:root`,
        changeType: "created",
        fromClaimId: rerootedNode.id,
        toClaimId: rerootedNode.id,
        reason: "Claim rerooted as a new top-level structure.",
      });
    }

    const repairActionRecord = await tx.thoughtMapEvent.create({
      data: {
        mapId: map.id,
        nodeId: sourceNodes[0].id,
        eventType: "repair_action",
        payload: serializeJson({
          actionType: params.actionType,
          initiatedBy: params.initiatedBy ?? "user",
          sourceClaimIds: params.sourceClaimIds,
          resultingClaimIds,
          reasoning: params.reasoning,
          supersessionRecord,
          edgeChanges,
          propagationTriggered: params.propagationTriggered ?? true,
          createdAt: now,
        }),
      },
    });

    repairActions.unshift({
      id: repairActionRecord.id,
      mapId: map.id,
      actionType: params.actionType,
      initiatedBy: params.initiatedBy ?? "user",
      sourceClaimIds: params.sourceClaimIds,
      resultingClaimIds,
      reasoning: params.reasoning,
      supersessionRecord,
      edgeChanges,
      propagationTriggered: params.propagationTriggered ?? true,
      createdAt: now,
    });

    await tx.thoughtMap.update({
      where: { id: map.id },
      data: {
        repairActions: serializeJson(repairActions) ?? "[]",
      },
    });
  });

  const updatedRecord = await prisma.thoughtMap.findUnique({
    where: { id: params.mapId },
    include: {
      nodes: {
        orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
      },
      events: {
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });

  if (!updatedRecord) {
    throw new Error("Map not found after repair");
  }

  const updatedMap = await hydrateThoughtMap(updatedRecord as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] });
  const revisitSchedules = computeRevisitSchedulesForMap(updatedMap);

  await prisma.thoughtMap.update({
    where: { id: params.mapId },
    data: {
      revisitSchedules: serializeJson(revisitSchedules) ?? "[]",
    },
  });

  const finalMap = await getThoughtMap(params.mapId);

  if (!finalMap) {
    throw new Error("Map not found after revisit refresh");
  }

  return {
    repairAction: repairActions[0] ?? null,
    map: finalMap,
    revisitSchedules,
  };
}

export async function refreshRevisitSchedules(mapId: string) {
  const map = await getThoughtMap(mapId);

  if (!map) {
    throw new Error("Map not found");
  }

  const revisitSchedules = computeRevisitSchedulesForMap(map);

  await prisma.thoughtMap.update({
    where: { id: mapId },
    data: {
      revisitSchedules: serializeJson(revisitSchedules) ?? "[]",
    },
  });

  return revisitSchedules;
}

export async function setRevisitTrigger(params: {
  mapId: string;
  claimId: string;
  triggerDefinition: TriggerDefinition;
  userId?: string;
}) {
  const map = await getThoughtMap(params.mapId);

  if (!map) {
    throw new Error("Map not found");
  }

  const claim = map.nodes.find((node) => node.id === params.claimId);
  if (!claim) {
    throw new Error("Claim not found");
  }

  const existing = map.revisitSchedules.find((schedule) => schedule.claimId === params.claimId) ?? null;
  const nextSchedule = computeRevisitScheduleForNode(map, claim, {
    existing,
    triggerDefinition: params.triggerDefinition,
  });
  const nextSchedules = map.revisitSchedules.filter((schedule) => schedule.claimId !== params.claimId).concat(nextSchedule);

  await prisma.$transaction(async (tx) => {
    await tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: params.claimId,
        eventType: "revisit_schedule",
        payload: serializeJson({
          claimId: params.claimId,
          triggerDefinition: params.triggerDefinition,
          scheduledFor: nextSchedule.scheduledFor,
          schedulingReason: nextSchedule.schedulingReason,
          priority: nextSchedule.priority,
        }),
      },
    });

    await tx.thoughtMap.update({
      where: { id: params.mapId },
      data: {
        revisitSchedules: serializeJson(nextSchedules) ?? "[]",
      },
    });
  });

  const updatedMap = await getThoughtMap(params.mapId);

  if (!updatedMap) {
    throw new Error("Map not found after trigger update");
  }

  return {
    schedule: nextSchedule,
    map: updatedMap,
    queue: buildRevisitQueue(updatedMap),
  };
}

export async function recordRevisitAction(params: {
  mapId: string;
  claimId: string;
  type: "reviewed_no_change" | "confidence_updated" | "claim_updated" | "claim_retired" | "snoozed" | "triggered_repair" | "triggered_dialectic";
  notes?: string | null;
  newConfidence?: number | null;
  triggerDefinition?: TriggerDefinition | null;
  snoozedUntil?: Date | null;
  userId?: string;
}) {
  const userId = params.userId ?? getDemoThoughtUserId();
  const mapRecord = await prisma.thoughtMap.findUnique({
    where: { id: params.mapId },
    select: {
      id: true,
      userId: true,
      revisitSchedules: true,
      nodes: {
        select: {
          id: true,
          mapId: true,
          parentId: true,
          kind: true,
          nodeStatus: true,
          actionOrigin: true,
          supersedesNodeId: true,
          content: true,
          note: true,
          branchOrder: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!mapRecord) {
    throw new Error("Map not found");
  }

  const map = await getThoughtMap(params.mapId);
  if (!map) {
    throw new Error("Map not found");
  }

  const schedule = parseRevisitSchedules(mapRecord.revisitSchedules).find((item) => item.claimId === params.claimId) ?? null;
  if (!schedule) {
    throw new Error("Revisit schedule not found");
  }

  const completedAt = new Date();
  const nextStatus: RevisitStatus = params.type === "snoozed" ? "snoozed" : "completed";
  const nextSchedule = {
    ...schedule,
    status: nextStatus,
    surfacedAt: schedule.surfacedAt ?? completedAt,
    userAction: {
      type: params.type,
      notes: params.notes ?? null,
      newConfidence: params.newConfidence ?? null,
      completedAt,
    },
    snoozedUntil: params.snoozedUntil ?? schedule.snoozedUntil,
    triggerDefinition: params.triggerDefinition ?? schedule.triggerDefinition,
    leitnerBox: computeLeitnerBox({
      currentBox: schedule.leitnerBox,
      reviewAction: params.type,
      majorChange: params.type === "claim_updated" || params.type === "confidence_updated",
      dependencyChanged: params.type === "triggered_repair",
      unstable: params.type === "claim_updated" && (params.newConfidence ?? 0) < 40,
    }),
    lastComputedAt: completedAt,
  };

  const nextSchedules = map.revisitSchedules
    .filter((item) => item.claimId !== params.claimId)
    .concat(nextSchedule)
    .sort((a, b) => (b.priority === "urgent" ? 4 : b.priority === "high" ? 3 : b.priority === "medium" ? 2 : 1) - (a.priority === "urgent" ? 4 : a.priority === "high" ? 3 : a.priority === "medium" ? 2 : 1));

  await prisma.$transaction(async (tx) => {
    await tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: params.claimId,
        eventType: "revisit_action",
        payload: serializeJson({
          claimId: params.claimId,
          type: params.type,
          notes: params.notes ?? null,
          newConfidence: params.newConfidence ?? null,
          snoozedUntil: params.snoozedUntil ?? null,
          triggerDefinition: params.triggerDefinition ?? schedule.triggerDefinition,
          completedAt,
        }),
      },
    });

    await tx.thoughtMap.update({
      where: { id: params.mapId },
      data: {
        revisitSchedules: serializeJson(nextSchedules) ?? "[]",
      },
    });
  });

  const updatedMap = await getThoughtMap(params.mapId);

  if (!updatedMap) {
    throw new Error("Map not found after revisit action");
  }

  return {
    schedule: nextSchedule,
    map: updatedMap,
    queue: buildRevisitQueue(updatedMap),
  };
}

async function syncThoughtMapInterventions(params: {
  map: ThoughtMapModel;
  beforeMap?: ThoughtMapModel | null;
}) {
  const candidateInterventions = params.map.interventions;
  const candidateKeys = new Set(candidateInterventions.map((intervention) => interventionDedupeKey(intervention)));
  const candidateOrder = new Map(
    candidateInterventions.map((intervention, index) => [interventionDedupeKey(intervention), index]),
  );
  const existing = await prisma.thoughtMapIntervention.findMany({
    where: { mapId: params.map.id },
    orderBy: [{ shownAt: "desc" }],
  });
  const existingByKey = new Map(existing.map((record) => [record.dedupeKey, record]));

  await prisma.$transaction(async (tx) => {
    for (const candidate of candidateInterventions) {
      const dedupeKey = interventionDedupeKey(candidate);
      const existingRecord = existingByKey.get(dedupeKey);

      if (!existingRecord) {
        const created = await tx.thoughtMapIntervention.create({
          data: {
            dedupeKey,
            mapId: candidate.mapId,
            targetNodeId: candidate.targetNodeId,
            type: candidate.type,
            detector: candidate.detector,
            triggerReason: candidate.triggerReason,
            prompt: candidate.prompt,
            inputMode: candidate.inputMode,
            status: "open",
            shownAt: candidate.shownAt,
          },
        });

        await createThoughtMapEvent(tx, {
          mapId: candidate.mapId,
          nodeId: candidate.targetNodeId,
          interventionId: created.id,
          eventType: "intervention_shown",
          payload: {
            type: candidate.type,
            detector: candidate.detector,
          },
        });
        await createThoughtMapEvent(tx, {
          mapId: candidate.mapId,
          nodeId: candidate.targetNodeId,
          interventionId: created.id,
          eventType: "bias_detected",
          payload: {
            detector: candidate.detector,
          },
        });

        continue;
      }

      if (existingRecord.status !== "open") {
        await tx.thoughtMapIntervention.update({
          where: { id: existingRecord.id },
          data: {
            triggerReason: candidate.triggerReason,
            prompt: candidate.prompt,
            inputMode: candidate.inputMode,
            status: "open",
            outcomeDelta: null,
            completedAt: null,
            dismissedAt: null,
            shownAt: new Date(),
          },
        });

        await createThoughtMapEvent(tx, {
          mapId: candidate.mapId,
          nodeId: candidate.targetNodeId,
          interventionId: existingRecord.id,
          eventType: "intervention_shown",
          payload: {
            type: candidate.type,
            detector: candidate.detector,
          },
        });
        await createThoughtMapEvent(tx, {
          mapId: candidate.mapId,
          nodeId: candidate.targetNodeId,
          interventionId: existingRecord.id,
          eventType: "bias_detected",
          payload: {
            detector: candidate.detector,
          },
        });
      }
    }

    for (const record of existing) {
      if (record.status !== "open" || candidateKeys.has(record.dedupeKey)) {
        continue;
      }

      const outcomeDelta = psychologyDelta(params.beforeMap ?? null, params.map, record.targetNodeId);
      await tx.thoughtMapIntervention.update({
        where: { id: record.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          outcomeDelta: serializeJson(outcomeDelta),
        },
      });

      await createThoughtMapEvent(tx, {
        mapId: record.mapId,
        nodeId: record.targetNodeId,
        interventionId: record.id,
        eventType: "intervention_completed",
        payload: outcomeDelta ?? {
          resolved: true,
        },
      });
      await createThoughtMapEvent(tx, {
        mapId: record.mapId,
        nodeId: record.targetNodeId,
        interventionId: record.id,
        eventType: "bias_resolved",
        payload: {
          detector: record.detector,
          outcomeDelta,
        },
      });
    }
  });

  const activeInterventions = await prisma.thoughtMapIntervention.findMany({
    where: {
      mapId: params.map.id,
      status: "open",
    },
    orderBy: [{ shownAt: "desc" }],
  });
  const interventions = activeInterventions
    .sort(
      (a, b) =>
        (candidateOrder.get(a.dedupeKey) ?? Number.MAX_SAFE_INTEGER) -
        (candidateOrder.get(b.dedupeKey) ?? Number.MAX_SAFE_INTEGER),
    )
    .map(mapIntervention);

  await refreshCognitiveBiasProfile(params.map.userId);

  return {
    interventions,
    recommendedIntervention: interventions[0] ?? null,
  };
}

async function hydrateThoughtMap(
  record: ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] },
  beforeMap?: ThoughtMapModel | null,
  options?: { syncInterventions?: boolean },
) {
  const judgedMap = buildThoughtMapModel(record);
  const interventionState = options?.syncInterventions === false
    ? { interventions: [], recommendedIntervention: null }
    : await syncThoughtMapInterventions({
        map: judgedMap,
        beforeMap,
      });

  return {
    ...judgedMap,
    ...interventionState,
  };
}

export async function listThoughtMaps() {
  const maps = await prisma.thoughtMap.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      nodes: {
        orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
      },
    },
    take: 12,
  });

  return Promise.all(
    maps.map((map) =>
      hydrateThoughtMap({
        ...map,
        events: [],
      } as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] }, undefined, {
        syncInterventions: false,
      }),
    ),
  );
}

export async function createThoughtMap(input: CreateThoughtMapInput) {
  const rawThought = cleanSentence(input.rawThought);
  const captureEnvelope = formatClaimCaptureMetadata(input.claim);
  const mapRawThought = `${captureEnvelope}\n${rawThought}`;
  const title = createThoughtMapTitle(rawThought);
  const seedNodes = generateInitialBranchNotes(mapRawThought);

  const created = await prisma.$transaction(async (tx) => {
    const map = await tx.thoughtMap.create({
      data: {
        userId: getDemoThoughtUserId(),
        title,
        rawThought: mapRawThought,
      },
    });

    const root = await tx.thoughtNode.create({
        data: {
          mapId: map.id,
          kind: "root",
          nodeStatus: "active",
          content: createRootNodeContent(mapRawThought),
          branchOrder: 0,
        },
      });

    await tx.thoughtNode.createMany({
      data: seedNodes.map((node, index) => ({
        mapId: map.id,
        parentId: root.id,
        kind: node.kind,
        nodeStatus: "active",
        content: node.content,
        note: node.note,
        branchOrder: index + 1,
      })),
    });

    await createThoughtMapEvent(tx, {
      mapId: map.id,
      nodeId: root.id,
      eventType: "map_created",
      payload: {
        rawThought,
        claim: input.claim,
      },
    });

    return tx.thoughtMap.findUniqueOrThrow({
      where: { id: map.id },
      include: {
        nodes: {
          orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
        },
        events: {
          orderBy: [{ createdAt: "asc" }],
        },
      },
    });
  });

  return hydrateThoughtMap(created);
}

export async function getThoughtMap(mapId: string) {
  const map = await prisma.thoughtMap.findUnique({
    where: { id: mapId },
    include: {
      nodes: {
        orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
      },
      events: {
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });

  return map ? hydrateThoughtMap(map) : null;
}

export async function applyNodeAction(params: {
  mapId: string;
  nodeId: string;
  action: NodeAction;
}): Promise<GeneratedActionBundle & { createdNodes: ThoughtNodeModel[]; updatedNodes: ThoughtNodeModel[] }> {
  const map = await getThoughtMap(params.mapId);

  if (!map) {
    throw new Error("Map not found");
  }

  const node = map.nodes.find((candidate) => candidate.id === params.nodeId);

  if (!node) {
    throw new Error("Node not found");
  }

  const lens = buildPennyLens(map);
  const generated = generateActionNotes({
    map,
    node,
    action: params.action,
    lens,
  });
  const persistenceParentId = generated.execution.targetParentId ?? generated.parentNodeId;
  const weakNodeIds = generated.reasoning.graphAnalysis?.weakNodes.map((weakNode) => weakNode.nodeId) ?? [];
  const supersededNodeId =
    generated.execution.mode === "replace_weak_branch" &&
    generated.notes.some((note) => note.kind === generated.execution.targetNodeKind)
      ? generated.execution.supersededNodeId
      : null;

  const lastChildOrder =
    map.nodes
      .filter((candidate) => candidate.parentId === persistenceParentId)
      .reduce((max, candidate) => Math.max(max, candidate.branchOrder), 0) || 0;

  const result = await prisma.$transaction(async (tx) => {
    await tx.thoughtNode.updateMany({
      where: {
        mapId: map.id,
        nodeStatus: { not: "superseded" },
      },
      data: {
        nodeStatus: "active",
      },
    });

    if (weakNodeIds.length > 0) {
      await tx.thoughtNode.updateMany({
        where: {
          id: { in: weakNodeIds },
          nodeStatus: { not: "superseded" },
        },
        data: {
          nodeStatus: "weak",
        },
      });
    }

    if (supersededNodeId) {
      await tx.thoughtNode.update({
        where: { id: supersededNodeId },
        data: {
          nodeStatus: "superseded",
        },
      });
    }

    const inserts = [];

    for (const [index, note] of generated.notes.entries()) {
      const created = await tx.thoughtNode.create({
        data: {
          mapId: map.id,
          parentId: persistenceParentId,
          kind: note.kind,
          nodeStatus: "active",
          actionOrigin: params.action,
          supersedesNodeId:
            generated.execution.mode === "replace_weak_branch" &&
            supersededNodeId &&
            note.kind === generated.execution.targetNodeKind
              ? supersededNodeId
              : null,
          content: note.content,
          note: note.note,
          branchOrder: lastChildOrder + index + 1,
        },
      });

      inserts.push(mapNode(created));
    }

    const updatedNodes = await tx.thoughtNode.findMany({
      where: {
        id: {
          in: Array.from(
            new Set([
              ...weakNodeIds,
              ...(supersededNodeId ? [supersededNodeId] : []),
            ]),
          ),
        },
      },
      orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
    });

    await createThoughtMapEvent(tx, {
      mapId: map.id,
      nodeId: generated.execution.targetNodeId,
      eventType: "move_applied",
      payload: {
        action: params.action,
        executionMode: generated.execution.mode,
        targetNodeKind: generated.execution.targetNodeKind,
        targetParentId: generated.execution.targetParentId,
        supersededNodeId,
        createdNodeIds: inserts.map((insert) => insert.id),
        updatedNodeIds: updatedNodes.map((updatedNode) => updatedNode.id),
      },
    });

    return {
      createdNodes: inserts,
      updatedNodes: updatedNodes.map(mapNode),
    };
  });

  const updatedRecord = await prisma.thoughtMap.findUnique({
    where: { id: params.mapId },
    include: {
      nodes: {
        orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
      },
      events: {
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });

  if (!updatedRecord) {
    throw new Error("Map not found after update");
  }

  const updatedMap = await hydrateThoughtMap(
    updatedRecord as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] },
    map,
  );

  const actionResult = buildThoughtMapActionResult({
    action: params.action,
    beforeMap: map,
    afterMap: updatedMap,
    targetNodeId: generated.execution.targetNodeId,
    createdNodeIds: result.createdNodes.map((createdNode) => createdNode.id),
    updatedNodeIds: result.updatedNodes.map((updatedNode) => updatedNode.id),
  });
  const createdNodeIds = new Set(result.createdNodes.map((createdNode) => createdNode.id));
  const updatedNodeIds = new Set(result.updatedNodes.map((updatedNode) => updatedNode.id));
  const createdNodes = updatedMap.nodes.filter((updatedNode) => createdNodeIds.has(updatedNode.id));
  const updatedNodes = updatedMap.nodes.filter((updatedNode) => updatedNodeIds.has(updatedNode.id));

  return {
    ...generated,
    actionResult,
    execution: {
      ...generated.execution,
      supersededNodeId,
    },
    createdNodes,
    updatedNodes,
    graphSnapshot: updatedMap.graphSnapshot,
    interventions: updatedMap.interventions,
    recommendedIntervention: updatedMap.recommendedIntervention,
    recommendedNextMove: updatedMap.recommendedNextMove,
  };
}

export async function applyRecommendedNextMove(mapId: string) {
  const map = await getThoughtMap(mapId);

  if (!map) {
    throw new Error("Map not found");
  }

  if (!map.recommendedNextMove) {
    throw new Error("Recommended next move unavailable");
  }

  return applyNodeAction({
    mapId,
    nodeId: map.recommendedNextMove.targetNodeId,
    action: map.recommendedNextMove.action,
  });
}

export async function generateFounderBrief(mapId: string) {
  const map = await getThoughtMap(mapId);

  if (!map) {
    throw new Error("Map not found");
  }

  const lens = buildPennyLens(map);
  const founderBrief = buildFounderBrief(map, lens);
  const { generatedAt, ...storedFounderBrief } = founderBrief;
  const updatedRecord = await prisma.thoughtMap.update({
    where: { id: mapId },
    data: {
      founderBrief: serializeJson(storedFounderBrief),
      founderBriefGeneratedAt: generatedAt,
    },
    include: {
      nodes: {
        orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
      },
      events: {
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });

  return hydrateThoughtMap(
    updatedRecord as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] },
    map,
  );
}

export async function dismissThoughtMapIntervention(params: { mapId: string; interventionId: string }) {
  const intervention = await prisma.thoughtMapIntervention.findFirst({
    where: {
      id: params.interventionId,
      mapId: params.mapId,
    },
  });

  if (!intervention) {
    throw new Error("Intervention not found");
  }

  if (intervention.status === "dismissed") {
    return mapIntervention(intervention);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const dismissed = await tx.thoughtMapIntervention.update({
      where: { id: intervention.id },
      data: {
        status: "dismissed",
        dismissedAt: new Date(),
      },
    });

    await createThoughtMapEvent(tx, {
      mapId: intervention.mapId,
      nodeId: intervention.targetNodeId,
      interventionId: intervention.id,
      eventType: "intervention_dismissed",
      payload: {
        type: intervention.type,
        detector: intervention.detector,
      },
    });

    return dismissed;
  });

  return mapIntervention(updated);
}

async function loadBiasProfileMaps(userId: string) {
  return prisma.thoughtMap.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    include: {
      nodes: {
        orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
      },
      events: {
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });
}

export async function refreshCognitiveBiasProfile(userId: string) {
  const mapRecords = await loadBiasProfileMaps(userId);
  const maps = await Promise.all(
    mapRecords.map((record) =>
      hydrateThoughtMap(
        record as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] },
        undefined,
        { syncInterventions: false },
      ),
    ),
  );
  const profile = buildCognitiveBiasProfile(maps, userId);
  const existing = await prisma.cognitiveBiasProfile.findUnique({
    where: { userId },
  });
  const serialized = serializeBiasProfile(profile);

  if (!existing || existing.biasProfileJson !== serialized) {
    const nextVersion = existing ? existing.profileVersion + 1 : profile.profileVersion;
    await prisma.cognitiveBiasProfile.upsert({
      where: { userId },
      update: {
        profileVersion: nextVersion,
        biasProfileJson: serialized,
        overallCalibrationTrend: profile.overallCalibrationTrend,
        strongestBiasId: profile.strongestBias?.id ?? null,
        mostImprovedBiasId: profile.mostImprovedBias?.id ?? null,
        lastUpdated: profile.lastUpdated,
      },
      create: {
        userId,
        profileVersion: profile.profileVersion,
        biasProfileJson: serialized,
        overallCalibrationTrend: profile.overallCalibrationTrend,
        strongestBiasId: profile.strongestBias?.id ?? null,
        mostImprovedBiasId: profile.mostImprovedBias?.id ?? null,
        lastUpdated: profile.lastUpdated,
      },
    });
  }

  return profile;
}

export async function getCognitiveBiasProfile(userId: string) {
  const stored = await prisma.cognitiveBiasProfile.findUnique({
    where: { userId },
  });

  if (stored) {
    const profile = normalizeBiasProfileRecord(stored);
    if (profile) {
      return profile;
    }
  }

  return refreshCognitiveBiasProfile(userId);
}
