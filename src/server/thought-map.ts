import type {
  Prisma,
  CognitiveBiasProfile as CognitiveBiasProfileRecord,
  BlindSpotMapCache as BlindSpotMapCacheRecord,
  Session,
  ThoughtMap,
  ThoughtMapEvent as ThoughtMapEventRecord,
  ThoughtMapIntervention,
  ThoughtNode,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/db/prisma";
import { track } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import { artifactDraftToFounderBrief, artifactRecordFromFounderBrief, buildArtifactDraft, getArtifactType } from "@/lib/artifact-types";
import { buildArtifactDependencyHealth, buildDependencyHealthReport } from "@/lib/dependency-health";
import { getFounderBriefReadiness } from "@/lib/founder-brief";
import { buildBeliefGraph, propagateBeliefGraph, serializeBeliefGraph, serializeBeliefPropagationResult } from "@/lib/bayesian-propagation";
import {
  analyzeDialecticResponse,
  assessSteelManQuality,
  buildClaimDependencyGraph,
  buildBlindSpotMap,
  buildCalibrationDashboard,
  buildCritiqueQualityProfile,
  buildCognitiveBiasProfile,
  collectCritiqueFeedback,
  buildPennyLens,
  captureSnapshotForMap,
} from "@/lib/penny-insights";
import {
  calculateBrierScore,
  calculateLogScore,
  buildCalibrationCoaching,
  classifyCalibrationDomain,
  outcomeProbability,
  updateDomainCalibration,
} from "@/lib/calibration";
import { buildClaimEvidenceSummary, buildEvidenceQualityGate, scoreEvidenceQuality } from "@/lib/evidence-quality";
import { buildCounterfactualAnalysis } from "@/lib/counterfactual-engine";
import { buildRevisitQueue, computeLeitnerBox, computeRevisitScheduleForNode, computeRevisitSchedulesForMap } from "@/lib/revisit-scheduler";
import { buildThoughtMapActionResult, buildThoughtMapJudgment } from "@/lib/thought-map-judgment";
import { buildPennyUncertainty } from "@/lib/uncertainty";
import {
  createRootNodeContent,
  createThoughtMapTitle,
} from "@/lib/thought-map";
import { generateActionNotes, generateInitialBranchNotes } from "@/lib/thought-map-generation";
import { buildReferenceClassRecord, suggestReferenceClass } from "@/lib/reference-classes";
import { EXPORT_PORTABILITY_GUARANTEE, serializeSessionRecord } from "@/lib/export";
import { EXPORT_SCHEMA_VERSION } from "@/types/thought-map";
import type {
  OpenFormatExportBundle,
  ExportMapSnapshot,
  ExportCalibrationSnapshot,
} from "@/lib/export";
import { cleanSentence } from "@/lib/penny";
import { assertRateLimit } from "@/lib/rate-limiter";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import type {
  CognitiveIntervention,
  ClaimCaptureMetadata,
  ClaimRepairAction,
  CreateThoughtMapInput,
  FounderBriefModel,
  ExtractedClaim,
  ArtifactOutcome,
  ArtifactRecord,
  ArtifactTypeId,
  DependencyHealth,
  ImportSource,
  DialecticCritiqueStrength,
  GeneratedActionBundle,
  NodeAction,
  EdgeChange,
  ClaimOutcomePair,
  Evidence,
  CritiqueCorrection,
  CalibrationCoaching,
  CalibrationCoachingRejection,
  ClaimResolution,
  ClaimResolutionType,
  BlindSpotDomain,
  RevisitAction,
  RevisitLeitnerBox,
  RevisitPriority,
  RevisitReason,
  RevisitSchedule,
  RevisitStatus,
  SteelMan,
  SteelManVersion,
  SupersessionRecord,
  ResolutionEvidence,
  PostMortem,
  PropagationResult,
  TriggerDefinition,
  VaultEntryManifest,
  VaultEntryType,
  ThoughtMapEvent as ThoughtMapEventModel,
  ThoughtMapModel,
  ThoughtMapEventType,
  ThoughtNodeModel,
  BeliefPropagationAction,
  BeliefPropagationDecision,
  BeliefPropagationResponse,
  CognitiveBiasProfile,
  BlindSpotMap,
  ReferenceClass,
  ExportRequest,
  ExportType,
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
    dependencyHealth: null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildThoughtMapModel(
  record: ThoughtMap & { nodes: ThoughtNode[]; events?: ThoughtMapEventRecord[] },
): ThoughtMapModel {
  const events = record.events ?? [];
  const founderBriefPayload = parseJson<Omit<FounderBriefModel, "generatedAt">>(record.founderBrief);
  let founderBrief =
    founderBriefPayload && record.founderBriefGeneratedAt
      ? {
          ...founderBriefPayload,
          artifactId:
            typeof founderBriefPayload.artifactId === "string" && founderBriefPayload.artifactId.trim().length > 0
              ? founderBriefPayload.artifactId
              : `founder_brief:${record.id}:${record.founderBriefGeneratedAt.getTime()}`,
          artifactTypeId: founderBriefPayload.artifactTypeId ?? "founder_brief",
          loadBearingClaims: Array.isArray(founderBriefPayload.loadBearingClaims)
            ? founderBriefPayload.loadBearingClaims
            : [],
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
    evidence: [],
    artifacts: [],
    shapeDerivations: [],
    steelMans: parseSteelMans(record.steelMans),
    critiqueFeedbacks: [],
    critiqueCorrections: [],
    critiqueQualityProfile: null,
    repairActions: parseClaimRepairActions(record.repairActions),
    revisitSchedules: parseRevisitSchedules(record.revisitSchedules),
    importSources: [],
    vaultEntries: [],
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
  const critiqueFeedbacks = collectCritiqueFeedback(judgedMap.events);
  const critiqueCorrections = judgedMap.events
    .filter((event) => event.eventType === "critique_correction")
    .map((event) => {
      const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : null;
      return {
        id: event.id,
        roundId: typeof payload?.roundId === "string" ? String(payload.roundId) : event.id,
        critiqueText: typeof payload?.critiqueText === "string" ? String(payload.critiqueText) : "",
        correctionText: typeof payload?.correctionText === "string" ? String(payload.correctionText) : "",
        correctionType:
          payload?.correctionType === "factual_error" ||
          payload?.correctionType === "wrong_target" ||
          payload?.correctionType === "wrong_tone" ||
          payload?.correctionType === "missing_context" ||
          payload?.correctionType === "already_addressed" ||
          payload?.correctionType === "other"
            ? payload.correctionType
            : "other",
        userId: typeof payload?.userId === "string" ? String(payload.userId) : judgedMap.userId,
        createdAt: event.createdAt,
        reviewedAt:
          typeof payload?.reviewedAt === "string" ? new Date(String(payload.reviewedAt)) : null,
        incorporated: Boolean(payload?.incorporated),
        shapeId:
          typeof payload?.shapeId === "string" && String(payload.shapeId).trim().length > 0
            ? String(payload.shapeId).trim()
            : null,
      } satisfies CritiqueCorrection;
    })
    .filter((correction) => correction.correctionText.trim().length > 0);
  const critiqueQualityProfile = buildCritiqueQualityProfile(judgedMap, critiqueFeedbacks);
  const artifacts = collectArtifactRecords(judgedMap, events);
  const evidence = collectEvidenceRecords(events);
  const importSources = collectImportSources(events);
  const vaultEntries = collectVaultEntries(events);
  const founderBriefArtifact = artifacts.find((artifact) => artifact.artifactTypeId === "founder_brief");
  if (founderBriefArtifact && founderBrief) {
    founderBrief = {
      ...founderBrief,
      artifactId: founderBriefArtifact.id,
      artifactTypeId: "founder_brief",
      loadBearingClaims:
        founderBriefArtifact.loadBearingClaims.length > 0 ? founderBriefArtifact.loadBearingClaims : founderBrief.loadBearingClaims,
      dependencyHealth:
        founderBriefArtifact.dependencyHealth ??
        buildArtifactDependencyHealth(
          judgedMap,
          founderBriefArtifact.loadBearingClaims.map((pair) => pair.claimId),
          founderBriefArtifact.id,
        ).health,
    };
  }

  const nodes = judgedMap.nodes.map((node) => ({
    ...node,
    dependencyHealth: buildDependencyHealthReport(judgedMap, node.id).health,
  }));
  const hydratedArtifacts = artifacts.map((artifact) => ({
    ...artifact,
    dependencyHealth:
      artifact.dependencyHealth ??
      buildArtifactDependencyHealth(judgedMap, artifact.loadBearingClaims.map((pair) => pair.claimId), artifact.id).health,
  }));

  return {
    ...judgedMap,
    importSources,
    vaultEntries,
    evidence,
    nodes,
    artifacts: hydratedArtifacts,
    shapeDerivations: lens.effectiveShapes
      .map((shape) => shape.derivation)
      .filter((derivation): derivation is NonNullable<typeof derivation> => derivation !== null),
    critiqueFeedbacks,
    critiqueCorrections,
    critiqueQualityProfile,
    founderBrief,
    founderBriefReadiness: getFounderBriefReadiness(judgedMap),
  };
}

type HydratedThoughtMapRecord = ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] };

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
    calibrationCoaching: normalizeCalibrationCoaching(parsed.calibrationCoaching),
    coachingRejections: Array.isArray(parsed.coachingRejections)
      ? parsed.coachingRejections
          .map((entry) => normalizeCalibrationRejection(entry))
          .filter((entry): entry is CalibrationCoachingRejection => entry !== null)
      : [],
  };
}

function serializeBiasProfile(profile: CognitiveBiasProfile) {
  return serializeJson(profile) ?? "{}";
}

function normalizeCalibrationRejection(value: unknown): CalibrationCoachingRejection | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Record<string, unknown>;
  if (
    typeof entry.id !== "string" ||
    typeof entry.userId !== "string" ||
    typeof entry.domain !== "string" ||
    typeof entry.claimType !== "string" ||
    typeof entry.originalConfidence !== "number" ||
    typeof entry.suggestedAdjustment !== "number" ||
    typeof entry.recommendationText !== "string" ||
    !(entry.dismissedAt instanceof Date || typeof entry.dismissedAt === "string")
  ) {
    return null;
  }

  return {
    id: entry.id,
    userId: entry.userId,
    domain: entry.domain as CalibrationCoachingRejection["domain"],
    claimType: entry.claimType as CalibrationCoachingRejection["claimType"],
    originalConfidence: entry.originalConfidence,
    suggestedAdjustment: entry.suggestedAdjustment,
    recommendationText: entry.recommendationText,
    dismissedAt: new Date(entry.dismissedAt),
  };
}

function normalizeCalibrationCoaching(value: unknown): CalibrationCoaching | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const coaching = value as Record<string, unknown>;
  if (
    typeof coaching.userId !== "string" ||
    !(coaching.generatedAt instanceof Date || typeof coaching.generatedAt === "string") ||
    typeof coaching.overallTrend !== "string"
  ) {
    return null;
  }

  const domainProfiles: CalibrationCoaching["domainProfiles"] = Array.isArray(coaching.domainProfiles)
    ? coaching.domainProfiles.map((entry) => {
        const profile = entry as Record<string, unknown>;
        const systematicError: CalibrationCoaching["domainProfiles"][number]["systematicError"] =
          profile.systematicError === "overconfident" ||
          profile.systematicError === "underconfident" ||
          profile.systematicError === "well_calibrated" ||
          profile.systematicError === "insufficient_data"
            ? profile.systematicError
            : "insufficient_data";

        return {
          domain: profile.domain as CalibrationCoaching["domainProfiles"][number]["domain"],
          claimCount: typeof profile.claimCount === "number" ? profile.claimCount : 0,
          resolvedClaimCount: typeof profile.resolvedClaimCount === "number" ? profile.resolvedClaimCount : 0,
          averageBrierScore: typeof profile.averageBrierScore === "number" ? profile.averageBrierScore : 0,
          calibrationCurve: Array.isArray(profile.calibrationCurve)
            ? profile.calibrationCurve.map((point) => point as CalibrationCoaching["domainProfiles"][number]["calibrationCurve"][number])
            : [],
          systematicError,
          errorMagnitude: typeof profile.errorMagnitude === "number" ? profile.errorMagnitude : 0,
          bestDomain: Boolean(profile.bestDomain),
          worstDomain: Boolean(profile.worstDomain),
          coachingNote: typeof profile.coachingNote === "string" ? profile.coachingNote : "",
        } satisfies CalibrationCoaching["domainProfiles"][number];
      })
    : [];
  const claimTypeProfiles: CalibrationCoaching["claimTypeProfiles"] = Array.isArray(coaching.claimTypeProfiles)
    ? coaching.claimTypeProfiles.map((entry) => {
        const profile = entry as Record<string, unknown>;
        const systematicError: CalibrationCoaching["claimTypeProfiles"][number]["systematicError"] =
          profile.systematicError === "overconfident" ||
          profile.systematicError === "underconfident" ||
          profile.systematicError === "well_calibrated" ||
          profile.systematicError === "insufficient_data"
            ? profile.systematicError
            : "insufficient_data";

        return {
          claimType: profile.claimType as CalibrationCoaching["claimTypeProfiles"][number]["claimType"],
          resolvedCount: typeof profile.resolvedCount === "number" ? profile.resolvedCount : 0,
          averageBrierScore: typeof profile.averageBrierScore === "number" ? profile.averageBrierScore : 0,
          systematicError,
          coachingNote: typeof profile.coachingNote === "string" ? profile.coachingNote : "",
        } satisfies CalibrationCoaching["claimTypeProfiles"][number];
      })
    : [];
  const recommendations: CalibrationCoaching["coachingRecommendations"] = Array.isArray(coaching.coachingRecommendations)
    ? coaching.coachingRecommendations.map((entry) => {
        const profile = entry as Record<string, unknown>;
        const recommendationType: CalibrationCoaching["coachingRecommendations"][number]["recommendationType"] =
          profile.recommendationType === "reduce_confidence" ||
          profile.recommendationType === "increase_confidence" ||
          profile.recommendationType === "seek_more_evidence" ||
          profile.recommendationType === "use_base_rate" ||
          profile.recommendationType === "apply_reference_class" ||
          profile.recommendationType === "stress_test_more"
            ? profile.recommendationType
            : "seek_more_evidence";

        const priority: CalibrationCoaching["coachingRecommendations"][number]["priority"] =
          profile.priority === "low" || profile.priority === "medium" || profile.priority === "high"
            ? profile.priority
            : "low";

        return {
          id: typeof profile.id === "string" ? profile.id : randomUUID(),
          domain:
            profile.domain === null ||
            typeof profile.domain === "string"
              ? (profile.domain as CalibrationCoaching["coachingRecommendations"][number]["domain"])
              : null,
          claimType:
            profile.claimType === null ||
            typeof profile.claimType === "string"
              ? (profile.claimType as CalibrationCoaching["coachingRecommendations"][number]["claimType"])
              : null,
          recommendationType,
          recommendationText: typeof profile.recommendationText === "string" ? profile.recommendationText : "",
          magnitude: typeof profile.magnitude === "number" ? profile.magnitude : 0,
          evidenceCount: typeof profile.evidenceCount === "number" ? profile.evidenceCount : 0,
          priority,
        } satisfies CalibrationCoaching["coachingRecommendations"][number];
      })
    : [];
  const rejectionHistory = Array.isArray(coaching.rejectionHistory)
    ? coaching.rejectionHistory
        .map((entry) => normalizeCalibrationRejection(entry))
        .filter((entry): entry is CalibrationCoachingRejection => entry !== null)
    : [];

  return {
    userId: coaching.userId,
    generatedAt: new Date(coaching.generatedAt),
    domainProfiles,
    claimTypeProfiles,
    coachingRecommendations: recommendations,
    overallTrend:
      coaching.overallTrend === "improving" || coaching.overallTrend === "degrading" ? coaching.overallTrend : "stable",
    rejectionHistory,
  };
}

function normalizeBlindSpotMapRecord(record: BlindSpotMapCacheRecord | null) {
  if (!record) {
    return null;
  }

  const parsed = parseJson<{
    userId?: string;
    computedAt?: string | Date;
    untestedHighConfidenceClaims?: Array<{
      claimId: string;
      claimText: string;
      confidence: number;
      daysSinceCreation: number;
      dialecticRoundCount: number;
      stakeLevel: string;
      urgencyScore: number;
      suggestedAction: string;
    }>;
    unexaminedDomains?: Array<{
      domain: BlindSpotDomain;
      claimCount: number;
      averageConfidence: number;
      stressTestedCount: number;
      stressTestedPercent: number;
      oldestUntestedClaim: string | Date;
      suggestedAction: string;
      sampleClaimId: string | null;
    }>;
    unchallengedAssumptions?: Array<{
      assumptionId: string;
      assumptionText: string;
      parentClaimIds: string[];
      parentClaimCount: number;
      daysSinceCreation: number;
      hasBeenQuestioned: boolean;
      suggestedAction: string;
    }>;
    loadBearingUntestedNodes?: Array<{
      claimId: string;
      claimText: string;
      downstreamClaimCount: number;
      downstreamArtifactCount: number;
      dialecticRoundCount: number;
      confidence: number;
      riskScore: number;
      daysSinceCreation: number;
    }>;
    claimTypeGaps?: Array<{
      claimType: string;
      totalClaims: number;
      testedClaims: number;
      gapSeverity: "low" | "medium" | "high" | "critical";
      sampleClaimId: string | null;
    }>;
  }>(record.blindSpotMapJson);

  if (!parsed) {
    return null;
  }

  return {
    userId: record.userId,
    computedAt: parsed.computedAt ? new Date(parsed.computedAt) : new Date(record.lastComputedAt),
    untestedHighConfidenceClaims: Array.isArray(parsed.untestedHighConfidenceClaims)
      ? parsed.untestedHighConfidenceClaims
      : [],
    unexaminedDomains: Array.isArray(parsed.unexaminedDomains)
      ? parsed.unexaminedDomains.map((entry) => ({
          ...entry,
          oldestUntestedClaim: new Date(entry.oldestUntestedClaim),
          domain: (
            entry.domain === "market" ||
            entry.domain === "technical" ||
            entry.domain === "personal" ||
            entry.domain === "competitive" ||
            entry.domain === "financial" ||
            entry.domain === "operational" ||
            entry.domain === "research"
              ? entry.domain
              : "general"
          ) as BlindSpotDomain,
        }))
      : [],
    unchallengedAssumptions: Array.isArray(parsed.unchallengedAssumptions) ? parsed.unchallengedAssumptions : [],
    loadBearingUntestedNodes: Array.isArray(parsed.loadBearingUntestedNodes) ? parsed.loadBearingUntestedNodes : [],
    claimTypeGaps: Array.isArray(parsed.claimTypeGaps)
      ? parsed.claimTypeGaps.map((entry) => ({
          ...entry,
          claimType: entry.claimType as BlindSpotMap["claimTypeGaps"][number]["claimType"],
          sampleClaimId: entry.sampleClaimId ?? null,
        }))
      : [],
  };
}

function serializeBlindSpotMap(map: BlindSpotMap) {
  return serializeJson(map) ?? "{}";
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

function normalizeClaimOutcomePair(payload: Record<string, unknown> | null): ClaimOutcomePair | null {
  if (!payload) {
    return null;
  }

  const claimId = typeof payload.claimId === "string" ? payload.claimId : null;
  const claimText = typeof payload.claimText === "string" ? payload.claimText : null;

  if (!claimId || !claimText) {
    return null;
  }

  return {
    claimId,
    claimText,
    wasClaimCorrect:
      payload.wasClaimCorrect === true || payload.wasClaimCorrect === false ? payload.wasClaimCorrect : null,
    confidenceAtArtifactTime:
      typeof payload.confidenceAtArtifactTime === "number" ? payload.confidenceAtArtifactTime : 0,
    actualOutcome: typeof payload.actualOutcome === "string" ? payload.actualOutcome : null,
  };
}

function normalizeDependencyHealth(payload: Record<string, unknown> | null): DependencyHealth | null {
  if (!payload) {
    return null;
  }

  const claimId = typeof payload.claimId === "string" ? payload.claimId : null;
  const mapId = typeof payload.mapId === "string" ? payload.mapId : null;
  const weakestLinkPayload =
    payload.weakestLink && typeof payload.weakestLink === "object"
      ? (payload.weakestLink as Record<string, unknown>)
      : null;
  const healthComponents = Array.isArray(payload.healthComponents)
    ? payload.healthComponents
        .map((component) =>
          component && typeof component === "object"
            ? {
                dimension:
                  component.dimension === "confidence_floor" ||
                  component.dimension === "test_coverage" ||
                  component.dimension === "evidence_quality" ||
                  component.dimension === "staleness" ||
                  component.dimension === "contradiction_density" ||
                  component.dimension === "assumption_coverage"
                    ? component.dimension
                    : "confidence_floor",
                score: typeof component.score === "number" ? component.score : 0,
                weight: typeof component.weight === "number" ? component.weight : 0,
                explanation: typeof component.explanation === "string" ? component.explanation : "",
              }
            : null,
        )
        .filter((component): component is DependencyHealth["healthComponents"][number] => component !== null)
    : [];

  if (!claimId || !mapId || !weakestLinkPayload) {
    return null;
  }

  return {
    claimId,
    mapId,
    healthScore: typeof payload.healthScore === "number" ? payload.healthScore : 0,
    weakestLink: {
      claimId: typeof weakestLinkPayload.claimId === "string" ? weakestLinkPayload.claimId : claimId,
      claimText: typeof weakestLinkPayload.claimText === "string" ? weakestLinkPayload.claimText : "",
      claimConfidence: typeof weakestLinkPayload.claimConfidence === "number" ? weakestLinkPayload.claimConfidence : 0,
      dialecticRoundCount: typeof weakestLinkPayload.dialecticRoundCount === "number" ? weakestLinkPayload.dialecticRoundCount : 0,
      daysSinceUpdate: typeof weakestLinkPayload.daysSinceUpdate === "number" ? weakestLinkPayload.daysSinceUpdate : 0,
      downstreamImpact: typeof weakestLinkPayload.downstreamImpact === "number" ? weakestLinkPayload.downstreamImpact : 0,
      riskScore: typeof weakestLinkPayload.riskScore === "number" ? weakestLinkPayload.riskScore : 0,
      riskReason: typeof weakestLinkPayload.riskReason === "string" ? weakestLinkPayload.riskReason : "",
    },
    chainDepth: typeof payload.chainDepth === "number" ? payload.chainDepth : 0,
    totalDependencies: typeof payload.totalDependencies === "number" ? payload.totalDependencies : 0,
    untestedDependencies: typeof payload.untestedDependencies === "number" ? payload.untestedDependencies : 0,
    lowConfidenceDependencies: typeof payload.lowConfidenceDependencies === "number" ? payload.lowConfidenceDependencies : 0,
    contradictionRisk: typeof payload.contradictionRisk === "number" ? payload.contradictionRisk : 0,
    staleDependencies: typeof payload.staleDependencies === "number" ? payload.staleDependencies : 0,
    healthComponents,
    computedAt:
      typeof payload.computedAt === "string" || payload.computedAt instanceof Date
        ? new Date(payload.computedAt)
        : new Date(),
  };
}

function normalizeArtifactOutcome(payload: Record<string, unknown> | null): ArtifactOutcome | null {
  if (!payload) {
    return null;
  }

  const id = typeof payload.id === "string" ? payload.id : null;
  const artifactId = typeof payload.artifactId === "string" ? payload.artifactId : null;
  const artifactType = typeof payload.artifactType === "string" ? payload.artifactType : null;
  const userId = typeof payload.userId === "string" ? payload.userId : null;
  const actionTaken = typeof payload.actionTaken === "string" ? payload.actionTaken : null;
  const outcomeDescription = typeof payload.outcomeDescription === "string" ? payload.outcomeDescription : null;
  const outcomeType =
    payload.outcomeType === "success" ||
    payload.outcomeType === "partial_success" ||
    payload.outcomeType === "failure" ||
    payload.outcomeType === "inconclusive" ||
    payload.outcomeType === "pending"
      ? payload.outcomeType
      : null;

  if (!id || !artifactId || !artifactType || !userId || !actionTaken || !outcomeDescription || !outcomeType) {
    return null;
  }

  return {
    id,
    artifactId,
    artifactType,
    userId,
    actionTaken,
    outcomeDate:
      typeof payload.outcomeDate === "string" || payload.outcomeDate instanceof Date
        ? new Date(payload.outcomeDate)
        : new Date(),
    outcomeDescription,
    outcomeType,
    loadBearingClaimResolutions: Array.isArray(payload.loadBearingClaimResolutions)
      ? payload.loadBearingClaimResolutions
          .map((entry) => (entry && typeof entry === "object" ? normalizeClaimOutcomePair(entry as Record<string, unknown>) : null))
          .filter((entry): entry is ClaimOutcomePair => entry !== null)
      : [],
    artifactQualityRating: typeof payload.artifactQualityRating === "number" ? payload.artifactQualityRating : 0,
    qualityDimensions: Array.isArray(payload.qualityDimensions)
      ? payload.qualityDimensions
          .map((entry) =>
            entry && typeof entry === "object"
              ? {
                  dimension:
                    entry.dimension === "accuracy" ||
                    entry.dimension === "completeness" ||
                    entry.dimension === "persuasiveness" ||
                    entry.dimension === "actionability" ||
                    entry.dimension === "structure"
                      ? entry.dimension
                      : "structure",
                  score: typeof entry.score === "number" ? entry.score : 0,
                  comment: typeof entry.comment === "string" ? entry.comment : null,
                }
              : null,
          )
          .filter((entry): entry is ArtifactOutcome["qualityDimensions"][number] => entry !== null)
      : [],
    wouldUseAgain: Boolean(payload.wouldUseAgain),
    lessonsLearned: typeof payload.lessonsLearned === "string" ? payload.lessonsLearned : null,
  };
}

function normalizeArtifactRecord(payload: Record<string, unknown> | null): ArtifactRecord | null {
  if (!payload) {
    return null;
  }

  const id = typeof payload.id === "string" ? payload.id : null;
  const artifactTypeId =
    payload.artifactTypeId === "founder_brief" ||
    payload.artifactTypeId === "decision_memo" ||
    payload.artifactTypeId === "investment_thesis" ||
    payload.artifactTypeId === "research_proposal" ||
    payload.artifactTypeId === "risk_register" ||
    payload.artifactTypeId === "personal_decision_audit" ||
    payload.artifactTypeId === "hypothesis_brief"
      ? payload.artifactTypeId
      : null;
  const artifactTypeName = typeof payload.artifactTypeName === "string" ? payload.artifactTypeName : null;
  const title = typeof payload.title === "string" ? payload.title : null;
  const sourceMapId = typeof payload.sourceMapId === "string" ? payload.sourceMapId : null;

  if (!id || !artifactTypeId || !artifactTypeName || !title || !sourceMapId) {
    return null;
  }

  const sections = Array.isArray(payload.sections)
    ? payload.sections
        .map((section) =>
          section && typeof section === "object"
            ? {
                id: typeof section.id === "string" ? section.id : "",
                title: typeof section.title === "string" ? section.title : "",
                body: typeof section.body === "string" ? section.body : "",
                sourceClaimIds: Array.isArray(section.sourceClaimIds)
                  ? section.sourceClaimIds.filter((item: unknown): item is string => typeof item === "string")
                  : [],
              }
            : null,
        )
        .filter((section): section is ArtifactRecord["sections"][number] => Boolean(section?.id))
    : [];

  const loadBearingClaims = Array.isArray(payload.loadBearingClaims)
    ? payload.loadBearingClaims
        .map((entry) => (entry && typeof entry === "object" ? normalizeClaimOutcomePair(entry as Record<string, unknown>) : null))
        .filter((entry): entry is ClaimOutcomePair => entry !== null)
    : [];
  const dependencyHealth = normalizeDependencyHealth(
    payload.dependencyHealth && typeof payload.dependencyHealth === "object"
      ? (payload.dependencyHealth as Record<string, unknown>)
      : null,
  );

  const outcomes = Array.isArray(payload.outcomes)
    ? payload.outcomes
        .map((entry) => (entry && typeof entry === "object" ? normalizeArtifactOutcome(entry as Record<string, unknown>) : null))
        .filter((entry): entry is ArtifactOutcome => entry !== null)
    : [];
  const latestOutcome = outcomes.length ? outcomes[outcomes.length - 1] : null;

  return {
    id,
    artifactTypeId,
    artifactTypeName,
    title,
    audience: typeof payload.audience === "string" ? payload.audience : null,
    sourceMapId,
    generatedAt:
      typeof payload.generatedAt === "string" || payload.generatedAt instanceof Date
        ? new Date(payload.generatedAt)
        : new Date(),
    version: typeof payload.version === "number" ? payload.version : 1,
    sectionOrder: Array.isArray(payload.sectionOrder)
      ? payload.sectionOrder.filter((item): item is string => typeof item === "string")
      : [],
    narrativeGlue: typeof payload.narrativeGlue === "string" ? payload.narrativeGlue : null,
    sections,
    loadBearingClaims,
    dependencyHealth,
    outcomes,
    latestOutcome,
  };
}

function collectArtifactRecords(
  map: ThoughtMapModel,
  events: ThoughtMapEventRecord[],
): ArtifactRecord[] {
  const records = new Map<string, ArtifactRecord>();

  for (const event of events) {
    const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : null;

    if (event.eventType === "artifact_generated") {
      const record = normalizeArtifactRecord(payload);
      if (record) {
        records.set(record.id, record);
      }
    }
  }

  if (map.founderBrief && !records.has(map.founderBrief.artifactId)) {
    records.set(map.founderBrief.artifactId, artifactRecordFromFounderBrief(map, map.founderBrief, 1));
  }

  for (const event of events) {
    if (event.eventType !== "artifact_outcome") {
      continue;
    }

    const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : null;
    const outcome = normalizeArtifactOutcome(payload);
    if (!outcome) {
      continue;
    }

    const record = records.get(outcome.artifactId);
    if (!record) {
      continue;
    }

    const outcomes = [...record.outcomes.filter((item) => item.id !== outcome.id), outcome].sort(
      (a, b) => a.outcomeDate.getTime() - b.outcomeDate.getTime(),
    );
    records.set(outcome.artifactId, {
      ...record,
      outcomes,
      latestOutcome: outcomes[outcomes.length - 1] ?? null,
    });
  }

  return [...records.values()].sort((a, b) => a.generatedAt.getTime() - b.generatedAt.getTime());
}

function normalizeExtractedClaim(payload: Record<string, unknown> | null): ExtractedClaim | null {
  if (!payload) {
    return null;
  }

  const id = typeof payload.id === "string" ? payload.id : "";
  const importSourceId = typeof payload.importSourceId === "string" ? payload.importSourceId : "";
  const rawText = typeof payload.rawText === "string" ? payload.rawText : "";
  const extractedText = typeof payload.extractedText === "string" ? payload.extractedText : "";
  const structureKind = typeof payload.structureKind === "string" ? payload.structureKind : "";
  const sourceAttribution = typeof payload.sourceAttribution === "string" ? payload.sourceAttribution : "";
  const offsetInSource = typeof payload.offsetInSource === "number" ? payload.offsetInSource : -1;
  const userDecision =
    payload.userDecision === "accepted" ||
    payload.userDecision === "rejected" ||
    payload.userDecision === "edited" ||
    payload.userDecision === "pending"
      ? payload.userDecision
      : null;

  if (!id || !importSourceId || !rawText || !extractedText || !structureKind || !sourceAttribution || offsetInSource < 0 || !userDecision) {
    return null;
  }

  return {
    id,
    importSourceId,
    rawText,
    extractedText,
    structureKind,
    inferredConfidence: typeof payload.inferredConfidence === "number" ? payload.inferredConfidence : null,
    inferredDomain: typeof payload.inferredDomain === "string" && payload.inferredDomain.trim().length > 0 ? payload.inferredDomain : null,
    sourceAttribution,
    offsetInSource,
    userDecision,
    editedText: typeof payload.editedText === "string" && payload.editedText.trim().length > 0 ? payload.editedText.trim() : null,
    resultingClaimId:
      typeof payload.resultingClaimId === "string" && payload.resultingClaimId.trim().length > 0 ? payload.resultingClaimId.trim() : null,
  };
}

function normalizeImportSource(payload: Record<string, unknown> | null): ImportSource | null {
  if (!payload) {
    return null;
  }

  const id = typeof payload.id === "string" ? payload.id : "";
  const mapId = typeof payload.mapId === "string" ? payload.mapId : "";
  const userId = typeof payload.userId === "string" ? payload.userId : "";
  const sourceType =
    payload.sourceType === "url" || payload.sourceType === "text_paste" || payload.sourceType === "document"
      ? payload.sourceType
      : null;
  const sourceContent = typeof payload.sourceContent === "string" ? payload.sourceContent : "";
  const importedAt =
    typeof payload.importedAt === "string" || payload.importedAt instanceof Date ? new Date(payload.importedAt) : null;

  if (!id || !mapId || !userId || !sourceType || !sourceContent || !importedAt || Number.isNaN(importedAt.getTime())) {
    return null;
  }

  const extractedClaims = Array.isArray(payload.extractedClaims)
    ? payload.extractedClaims
        .map((entry) => normalizeExtractedClaim(entry as Record<string, unknown>))
        .filter((entry): entry is ExtractedClaim => entry !== null)
    : [];

  return {
    id,
    mapId,
    userId,
    sourceType,
    sourceUrl:
      typeof payload.sourceUrl === "string" && payload.sourceUrl.trim().length > 0 ? payload.sourceUrl.trim() : null,
    sourceTitle:
      typeof payload.sourceTitle === "string" && payload.sourceTitle.trim().length > 0 ? payload.sourceTitle.trim() : null,
    sourceContent,
    importedAt,
    extractedClaims,
    acceptedClaimIds: Array.isArray(payload.acceptedClaimIds)
      ? payload.acceptedClaimIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    rejectedClaimCount: typeof payload.rejectedClaimCount === "number" ? payload.rejectedClaimCount : 0,
    editedClaimCount: typeof payload.editedClaimCount === "number" ? payload.editedClaimCount : 0,
  };
}

function collectImportSources(events: ThoughtMapEventRecord[]) {
  const records = new Map<string, ImportSource>();

  for (const event of events) {
    if (event.eventType !== "import_source" && event.eventType !== "import_review") {
      continue;
    }

    const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : null;
    const record = normalizeImportSource(payload);

    if (!record) {
      continue;
    }

    records.set(record.id, record);
  }

  return [...records.values()].sort((a, b) => a.importedAt.getTime() - b.importedAt.getTime());
}

function normalizeVaultEntryManifest(payload: Record<string, unknown> | null): VaultEntryManifest | null {
  if (!payload) {
    return null;
  }

  const id = typeof payload.vaultEntryId === "string" ? payload.vaultEntryId : "";
  const mapId = typeof payload.mapId === "string" ? payload.mapId : "";
  const entryType =
    payload.entryType === "claim" || payload.entryType === "map" || payload.entryType === "session"
      ? payload.entryType
      : null;

  if (!id || !mapId || !entryType) {
    return null;
  }

  return {
    id,
    entryType,
    mapId,
    claimId: typeof payload.claimId === "string" && payload.claimId.trim().length > 0 ? payload.claimId.trim() : null,
    sessionId: typeof payload.sessionId === "string" && payload.sessionId.trim().length > 0 ? payload.sessionId.trim() : null,
    createdAt:
      typeof payload.createdAt === "string" || payload.createdAt instanceof Date ? new Date(payload.createdAt) : new Date(),
    lastAccessedAt:
      typeof payload.lastAccessedAt === "string" || payload.lastAccessedAt instanceof Date
        ? new Date(payload.lastAccessedAt)
        : new Date(),
    syncStatus: "local_only" as const,
  };
}

function collectVaultEntries(events: ThoughtMapEventRecord[]) {
  const records = new Map<string, VaultEntryManifest>();

  for (const event of events) {
    if (event.eventType !== "vault_entry_registered") {
      continue;
    }

    const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : null;
    const record = normalizeVaultEntryManifest(payload);

    if (!record) {
      continue;
    }

    records.set(record.id, record);
  }

  return [...records.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function normalizeEvidence(record: unknown): Evidence | null {
  if (!isRecord(record)) {
    return null;
  }

  const id = typeof record.id === "string" ? record.id : "";
  const claimId = typeof record.claimId === "string" ? record.claimId : "";
  const evidenceText = typeof record.evidenceText === "string" ? record.evidenceText.trim() : "";
  const evidenceType =
    record.evidenceType === "peer_reviewed" ||
    record.evidenceType === "expert_opinion" ||
    record.evidenceType === "case_study" ||
    record.evidenceType === "survey_data" ||
    record.evidenceType === "first_hand_observation" ||
    record.evidenceType === "anecdote" ||
    record.evidenceType === "intuition" ||
    record.evidenceType === "hearsay" ||
    record.evidenceType === "analogy"
      ? record.evidenceType
      : null;
  const sourceUrl = typeof record.sourceUrl === "string" && record.sourceUrl.trim().length > 0 ? record.sourceUrl.trim() : null;
  const sourceName = typeof record.sourceName === "string" && record.sourceName.trim().length > 0 ? record.sourceName.trim() : null;
  const publicationDate = parseSteelManDate(record.publicationDate);
  const authorCredentials =
    typeof record.authorCredentials === "string" && record.authorCredentials.trim().length > 0
      ? record.authorCredentials.trim()
      : null;
  const sampleSize =
    typeof record.sampleSize === "number" && Number.isFinite(record.sampleSize) && record.sampleSize > 0
      ? Math.round(record.sampleSize)
      : null;
  const replicationStatus =
    record.replicationStatus === "replicated" ||
    record.replicationStatus === "unreplicated" ||
    record.replicationStatus === "contested" ||
    record.replicationStatus === "unknown"
      ? record.replicationStatus
      : null;
  const qualityScore = typeof record.qualityScore === "number" ? record.qualityScore : 0;
  const qualityComponents = Array.isArray(record.qualityComponents)
    ? record.qualityComponents
        .map((entry) =>
          isRecord(entry) && typeof entry.dimension === "string" && typeof entry.score === "number" && typeof entry.explanation === "string"
            ? {
                dimension:
                  entry.dimension === "source_type" ||
                  entry.dimension === "recency" ||
                  entry.dimension === "sample_size" ||
                  entry.dimension === "replication" ||
                  entry.dimension === "credentials" ||
                  entry.dimension === "directness"
                    ? entry.dimension
                    : "source_type",
                score: entry.score,
                explanation: entry.explanation,
              }
            : null,
        )
        .filter((component): component is Evidence["qualityComponents"][number] => component !== null)
    : [];
  const addedAt = parseSteelManDate(record.addedAt);
  const addedBy = record.addedBy === "user" || record.addedBy === "penny_suggestion" ? record.addedBy : null;

  if (!id || !claimId || !evidenceText || !evidenceType || !addedAt || !addedBy) {
    return null;
  }

  return {
    id,
    claimId,
    evidenceText,
    evidenceType,
    sourceUrl,
    sourceName,
    publicationDate,
    authorCredentials,
    sampleSize,
    replicationStatus,
    qualityScore,
    qualityComponents,
    addedAt,
    addedBy,
  };
}

function collectEvidenceRecords(events: ThoughtMapEventRecord[]) {
  const records = new Map<string, Evidence>();

  for (const event of events) {
    if (event.eventType !== "evidence_added") {
      continue;
    }

    const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : null;
    const record = normalizeEvidence(payload);

    if (!record) {
      continue;
    }

    records.set(record.id, record);
  }

  return [...records.values()].sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime());
}

function formatClaimCaptureMetadata(metadata: ClaimCaptureMetadata) {
  const lines = [
    "## Claim capture",
    `- Inside-view estimate: ${metadata.insideViewEstimate}%`,
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

function parseReferenceClassPayload(payload: Record<string, unknown> | null) {
  const referenceClass = payload?.referenceClass;

  if (!isRecord(referenceClass)) {
    return null;
  }

  const divergence = typeof referenceClass.divergence === "number" ? referenceClass.divergence : 0;
  const divergenceDirection =
    referenceClass.divergenceDirection === "higher_than_base_rate" ||
    referenceClass.divergenceDirection === "lower_than_base_rate" ||
    referenceClass.divergenceDirection === "aligned"
      ? referenceClass.divergenceDirection
      : "aligned";

  return {
    id: typeof referenceClass.id === "string" ? referenceClass.id : "",
    claimId: typeof referenceClass.claimId === "string" ? referenceClass.claimId : "",
    promptShown: typeof referenceClass.promptShown === "string" ? referenceClass.promptShown : "",
    referenceClassType: typeof referenceClass.referenceClassType === "string" ? referenceClass.referenceClassType : "custom",
    benchmarkLow: typeof referenceClass.benchmarkLow === "number" ? referenceClass.benchmarkLow : null,
    benchmarkHigh: typeof referenceClass.benchmarkHigh === "number" ? referenceClass.benchmarkHigh : null,
    benchmarkSource: typeof referenceClass.benchmarkSource === "string" ? referenceClass.benchmarkSource : null,
    userInsideViewEstimate: typeof referenceClass.userInsideViewEstimate === "number" ? referenceClass.userInsideViewEstimate : 0,
    userReferenceClassEstimate:
      typeof referenceClass.userReferenceClassEstimate === "number" ? referenceClass.userReferenceClassEstimate : null,
    userFinalConfidence: typeof referenceClass.userFinalConfidence === "number" ? referenceClass.userFinalConfidence : 0,
    divergence,
    divergenceDirection,
    userExplainedDivergence:
      typeof referenceClass.userExplainedDivergence === "string" && referenceClass.userExplainedDivergence.trim().length > 0
        ? referenceClass.userExplainedDivergence.trim()
        : null,
    capturedAt:
      typeof referenceClass.capturedAt === "string" || referenceClass.capturedAt instanceof Date
        ? new Date(referenceClass.capturedAt as string | Date)
        : new Date(),
  } satisfies ReferenceClass;
}

async function maybeRecordReferenceClassBiasSignal(params: {
  mapId: string;
  userId: string;
  referenceClass: ReferenceClass | null;
  nodeId: string;
}) {
  if (
    !params.referenceClass ||
    params.referenceClass.userReferenceClassEstimate == null ||
    params.referenceClass.userExplainedDivergence?.trim().length ||
    params.referenceClass.divergence <= 20
  ) {
    return;
  }

  const priorMaps = await loadBiasProfileMaps(params.userId);
  let priorUnexplainedDivergences = 0;

  for (const map of priorMaps) {
    if (map.id === params.mapId) {
      continue;
    }

    for (const event of map.events) {
      if (event.eventType !== "map_created") {
        continue;
      }

      const payload = parseJson<Record<string, unknown>>(event.payload);
      const referenceClass = parseReferenceClassPayload(payload);

      if (
        referenceClass &&
        referenceClass.userReferenceClassEstimate != null &&
        referenceClass.divergence > 20 &&
        referenceClass.userExplainedDivergence == null
      ) {
        priorUnexplainedDivergences += 1;
      }
    }
  }

  if (priorUnexplainedDivergences < 1) {
    return;
  }

  await prisma.thoughtMapEvent.create({
    data: {
      mapId: params.mapId,
      nodeId: params.nodeId,
      eventType: "bias_detected",
      payload: serializeJson({
        detector: "confirmation_bias",
        reason: "reference_class_divergence",
        repetitionCount: priorUnexplainedDivergences + 1,
        referenceClassId: params.referenceClass.id,
        divergence: params.referenceClass.divergence,
      }),
    },
  });
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
  const startedAt = Date.now();
  const map = await getThoughtMap(params.mapId);

  if (!map) {
    throw new Error("Map not found");
  }

  const graph = buildBeliefGraph(map);
  const seedPrior = graph.nodes.get(params.seedClaimId)?.posterior ?? 0;
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

  const seedPosterior = result.graph.nodes.get(params.seedClaimId)?.posterior ?? params.updatedPosterior ?? seedPrior;
  void track(
    {
      event: "confidence_updated",
      properties: {
        claimId: params.seedClaimId,
        delta: Math.round((seedPosterior - seedPrior) * 100),
      },
    },
    map.userId,
  );

  logger.info("belief_propagation_updated", {
    userId: map.userId,
    featureId: "thought-map",
    durationMs: Date.now() - startedAt,
    data: {
      mapId: params.mapId,
      seedClaimId: params.seedClaimId,
      seedPrior,
      seedPosterior,
      cycleError: result.cycleError ?? null,
    },
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

function collectDownstreamClaimIds(map: ThoughtMapModel, claimId: string) {
  const graph = buildClaimDependencyGraph(map);
  const adjacency = new Map<string, string[]>();

  for (const edge of graph.edges) {
    const bucket = adjacency.get(edge.fromNodeId) ?? [];
    bucket.push(edge.toNodeId);
    adjacency.set(edge.fromNodeId, bucket);
  }

  const queue: Array<{ claimId: string; relation: "direct" | "transitive" }> = [{ claimId, relation: "direct" }];
  const seen = new Set<string>([claimId]);
  const results: Array<{ claimId: string; relation: "direct" | "transitive" }> = [];

  while (queue.length) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const children = adjacency.get(current.claimId) ?? [];
    for (const childId of children) {
      if (seen.has(childId)) {
        continue;
      }

      seen.add(childId);
      results.push({
        claimId: childId,
        relation: current.claimId === claimId ? "direct" : "transitive",
      });
      queue.push({ claimId: childId, relation: "transitive" });
    }
  }

  return results;
}

function downstreamArtifactsForClaim(map: ThoughtMapModel, claimId: string) {
  const artifacts = new Set<string>();

  if (map.repairActions.some((repairAction) => repairAction.sourceClaimIds.includes(claimId))) {
    artifacts.add("repair_action");
  }

  if (map.revisitSchedules.some((schedule) => schedule.claimId === claimId)) {
    artifacts.add("revisit_schedule");
  }

  if (map.interventions.some((intervention) => intervention.targetNodeId === claimId)) {
    artifacts.add("intervention");
  }

  if (map.recommendedNextMove?.targetNodeId === claimId) {
    artifacts.add("recommended_next_move");
  }

  return Array.from(artifacts);
}

async function loadDomainCalibrationHistory(userId: string, domain: string) {
  const maps = await prisma.thoughtMap.findMany({
    where: { userId },
    include: {
      nodes: {
        orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
      },
      events: {
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });

  const history: Array<{
    domain: string;
    predictedConfidence: number;
    actualProbability: number;
    brierScore: number;
    logScore: number;
  }> = [];

  for (const record of maps) {
    const map = buildThoughtMapModel(record as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] });
    const mapDomain = classifyCalibrationDomain(`${map.title} ${map.rawThought} ${map.nodes.map((node) => node.content).join(" ")}`);

    if (mapDomain !== domain) {
      continue;
    }

    for (const event of map.events) {
      if (event.eventType !== "claim_resolution" || !event.payload || typeof event.payload !== "object") {
        continue;
      }

      const payload = event.payload as Record<string, unknown>;
      const predictedConfidence =
        typeof payload.predictedConfidenceAtResolution === "number" ? payload.predictedConfidenceAtResolution : null;
      const resolutionType =
        payload.resolutionType === "confirmed" ||
        payload.resolutionType === "disconfirmed" ||
        payload.resolutionType === "partially_confirmed" ||
        payload.resolutionType === "inconclusive" ||
        payload.resolutionType === "reframed" ||
        payload.resolutionType === "superseded"
          ? (payload.resolutionType as ClaimResolutionType)
          : null;

      if (predictedConfidence == null || !resolutionType) {
        continue;
      }

      const actualProbability = outcomeProbability(resolutionType);
      history.push({
        domain: mapDomain,
        predictedConfidence: predictedConfidence / 100,
        actualProbability,
        brierScore: calculateBrierScore(predictedConfidence / 100, actualProbability),
        logScore: calculateLogScore(predictedConfidence / 100, actualProbability),
      });
    }
  }

  return history;
}

export async function recordClaimResolution(params: {
  mapId: string;
  claimId: string;
  resolutionType: ClaimResolutionType;
  actualOutcome: string;
  resolutionEvidence: ResolutionEvidence[];
  postMortem: PostMortem | null;
  propagationTriggered?: boolean;
  lessonsCaptured?: string[];
  propagationResults?: PropagationResult[];
  userId?: string;
}) {
  const startedAt = Date.now();
  const userId = params.userId ?? (await getCurrentAuthenticatedUserId());
  const mapRecord = await prisma.thoughtMap.findUnique({
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

  if (!mapRecord) {
    throw new Error("Map not found");
  }

  const map = buildThoughtMapModel(mapRecord as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] });
  const claim = map.nodes.find((node) => node.id === params.claimId);

  if (!claim) {
    throw new Error("Claim not found");
  }

  const captureConfidence = Math.round(captureSnapshotForMap(map)?.confidence ?? claim.scores?.confidence ?? 0);
  const actualProbability = outcomeProbability(params.resolutionType);
  const brierScore = calculateBrierScore(captureConfidence / 100, actualProbability);
  const logScore = calculateLogScore(captureConfidence / 100, actualProbability);
  const domain = classifyCalibrationDomain(`${map.title} ${map.rawThought} ${claim.content}`);
  const calibrationHistory = await loadDomainCalibrationHistory(userId, domain);
  const calibrationImpact = updateDomainCalibration(calibrationHistory, {
    domain,
    predictedConfidence: captureConfidence / 100,
    actualProbability,
    brierScore,
    logScore,
  });
  const downstreamClaims = collectDownstreamClaimIds(map, claim.id);
  const downstreamArtifacts = downstreamArtifactsForClaim(map, claim.id);
  const resolutionId = randomUUID();
  const resolutionDate = new Date();
  const lessonsCaptured = (params.lessonsCaptured ?? []).filter((lesson) => lesson.trim().length > 0);
  const propagationResults =
    params.propagationResults?.length
      ? params.propagationResults
      : downstreamClaims.map((downstream) => {
          const downstreamNode = map.nodes.find((node) => node.id === downstream.claimId) ?? null;
          const currentConfidence = downstreamNode?.scores?.confidence != null ? Math.round(downstreamNode.scores.confidence * 100) : null;
          const suggestedConfidence = (() => {
            switch (params.resolutionType) {
              case "confirmed":
                return currentConfidence == null ? Math.min(100, captureConfidence + 15) : Math.min(100, currentConfidence + Math.round((100 - currentConfidence) * 0.2));
              case "disconfirmed":
                return currentConfidence == null ? Math.max(0, captureConfidence - 25) : Math.max(0, currentConfidence - Math.round(currentConfidence * 0.35));
              case "partially_confirmed":
                return currentConfidence == null ? Math.max(0, Math.min(100, Math.round(captureConfidence * 0.85))) : Math.max(0, Math.min(100, Math.round(currentConfidence + (captureConfidence - currentConfidence) * 0.25)));
              case "reframed":
                return currentConfidence;
              case "superseded":
                return null;
              case "inconclusive":
                return currentConfidence;
            }
          })();

          return {
            claimId: downstream.claimId,
            claimText: downstreamNode?.content ?? downstream.claimId,
            relation: downstream.relation,
            currentConfidence,
            suggestedConfidence,
            decision:
              params.resolutionType === "disconfirmed" || params.resolutionType === "superseded"
                ? "override"
                : params.resolutionType === "reframed"
                  ? "decouple"
                  : "accept",
            confidenceDelta:
              currentConfidence != null && suggestedConfidence != null ? Number((suggestedConfidence - currentConfidence).toFixed(1)) : null,
            downstreamArtifacts,
          } satisfies PropagationResult;
        });
  const claimResolution: ClaimResolution = {
    id: resolutionId,
    claimId: params.claimId,
    mapId: params.mapId,
    resolutionDate,
    resolutionType: params.resolutionType,
    actualOutcome: params.actualOutcome.trim(),
    predictedConfidenceAtResolution: captureConfidence,
    brierScore,
    logScore,
    resolutionEvidence: params.resolutionEvidence.map((evidence) => ({
      ...evidence,
      addedAt: evidence.addedAt instanceof Date ? evidence.addedAt : new Date(evidence.addedAt),
    })),
    postMortem: params.postMortem
      ? {
          ...params.postMortem,
          createdAt: params.postMortem.createdAt instanceof Date ? params.postMortem.createdAt : new Date(params.postMortem.createdAt),
        }
      : null,
    propagationTriggered: params.propagationTriggered ?? downstreamClaims.length > 0,
    propagationResults,
    lessonsCaptured,
    calibrationImpact,
    counterfactualAnalysis: null,
  };

  claimResolution.counterfactualAnalysis = buildCounterfactualAnalysis({
    map,
    claim,
    resolution: claimResolution,
    userId,
    captureSnapshot: captureSnapshotForMap(map),
  });

  await prisma.$transaction(async (tx) => {
    await tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: params.claimId,
        eventType: "claim_resolution",
        payload: serializeJson(claimResolution),
      },
    });
  });

  const updatedMap = await getThoughtMap(params.mapId);

  if (!updatedMap) {
    throw new Error("Map not found after resolution");
  }

  return {
    resolution: claimResolution,
    map: updatedMap,
    propagationResults,
    calibrationImpact,
    downstreamArtifacts,
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
  critiqueMode?: string | null;
  voiceLabel?: string | null;
  prompt: string;
  why: string;
  responsePath: "defend" | "revise" | "absorb";
  response: string;
  confidenceAtRoundEnd?: number | null;
}) {
  const startedAt = Date.now();
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
  const uncertainty = buildPennyUncertainty({
    outputType: "critique",
    groundingType: priorRounds.length >= 1 ? "user_pattern_data" : "general_heuristic",
    groundingCount: priorRounds.length,
    evidenceBasis:
      priorRounds.length > 0
        ? `Based on ${priorRounds.length} prior critique round${priorRounds.length === 1 ? "" : "s"} on this claim and the user's response history.`
        : "This is a general critique heuristic because there is no prior round history yet.",
    caveats:
      priorRounds.length === 0
        ? ["Penny has not seen enough of this claim yet to claim a strong pattern."]
        : [],
  });
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
    critiqueMode: params.critiqueMode ?? null,
    voiceLabel: params.voiceLabel ?? null,
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
    uncertainty,
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
          critiqueMode: params.critiqueMode ?? null,
          voiceLabel: params.voiceLabel ?? null,
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
  const startedAt = Date.now();
  const userId = params.userId ?? (await getCurrentAuthenticatedUserId());
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

  void track(
    {
      event: "steel_man_written",
      properties: {
        claimId: params.claimId,
        qualityScore: assessment.qualityScore,
      },
    },
    userId,
  );

  logger.info("steel_man_written", {
    userId,
    featureId: "thought-map",
    durationMs: Date.now() - startedAt,
    data: {
      mapId: params.mapId,
      claimId: params.claimId,
      qualityScore: assessment.qualityScore,
    },
  });

  return {
    steelMan,
    assessment,
  };
}

export async function recordCritiqueFeedback(params: {
  mapId: string;
  roundId: string;
  critiqueId: string;
  userId: string;
  ratings: Array<{
    dimension: string;
    score: number;
    comment: string | null;
  }>;
  overallUsefulness: number;
  freeTextFeedback?: string | null;
  correctionText?: string | null;
  correctionType?: CritiqueCorrection["correctionType"];
  isCorrectionFlagged?: boolean;
  dismissed?: boolean;
  shapeId?: string | null;
  critiqueMode?: string | null;
  voiceLabel?: string | null;
  failureTypes?: string[];
}) {
  const startedAt = Date.now();
  const map = await getThoughtMap(params.mapId);

  if (!map) {
    throw new Error("Map not found");
  }

  const critiqueEvent = map.events.find((event) => event.id === params.roundId || event.id === params.critiqueId) ?? null;
  const critiquePayload =
    critiqueEvent?.payload && typeof critiqueEvent.payload === "object"
      ? (critiqueEvent.payload as Record<string, unknown>)
      : null;
  const critiqueMode =
    typeof critiquePayload?.critiqueMode === "string" && critiquePayload.critiqueMode.trim().length > 0
      ? critiquePayload.critiqueMode.trim()
      : typeof params.critiqueMode === "string" && params.critiqueMode.trim().length > 0
        ? params.critiqueMode.trim()
        : null;
  const voiceLabel =
    typeof critiquePayload?.voiceLabel === "string" && critiquePayload.voiceLabel.trim().length > 0
      ? critiquePayload.voiceLabel.trim()
      : typeof params.voiceLabel === "string" && params.voiceLabel.trim().length > 0
        ? params.voiceLabel.trim()
        : null;
  const failureTypes = Array.isArray(critiquePayload?.critiqueFailureTypes)
    ? critiquePayload.critiqueFailureTypes.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : params.failureTypes?.filter((item): item is string => typeof item === "string" && item.trim().length > 0) ?? [];
  const feedbackGivenAt = new Date();
  const feedbackPayload = {
    roundId: params.roundId,
    critiqueId: params.critiqueId,
    userId: params.userId,
    ratings: params.ratings,
    overallUsefulness: params.overallUsefulness,
    freeTextFeedback: params.freeTextFeedback ?? null,
    correctionText: params.correctionText ?? null,
    isCorrectionFlagged: params.isCorrectionFlagged ?? false,
    feedbackGivenAt: feedbackGivenAt.toISOString(),
    dismissed: params.dismissed ?? false,
    critiqueMode,
    failureTypes,
    voiceLabel,
    shapeId: params.shapeId ?? null,
  };

  const created = await prisma.$transaction(async (tx) => {
    const feedbackEvent = await tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: critiqueEvent?.nodeId ?? null,
        eventType: "critique_feedback",
        payload: serializeJson(feedbackPayload),
      },
    });

    let correctionEvent: ThoughtMapEventRecord | null = null;
    if (params.isCorrectionFlagged && params.correctionText?.trim().length) {
      correctionEvent = await tx.thoughtMapEvent.create({
        data: {
          mapId: params.mapId,
          nodeId: critiqueEvent?.nodeId ?? null,
          eventType: "critique_correction",
          payload: serializeJson({
            roundId: params.roundId,
            critiqueId: params.critiqueId,
            critiqueText: typeof critiquePayload?.prompt === "string" ? String(critiquePayload.prompt) : "",
            correctionText: params.correctionText.trim(),
            correctionType: params.correctionType ?? "other",
            userId: params.userId,
            createdAt: feedbackGivenAt.toISOString(),
            reviewedAt: null,
            incorporated: false,
            shapeId: params.shapeId ?? null,
          }),
        },
      });
    }

    const updatedMap = await tx.thoughtMap.findUnique({
      where: { id: params.mapId },
      select: {
        id: true,
        userId: true,
        title: true,
        rawThought: true,
        status: true,
        founderBrief: true,
        founderBriefGeneratedAt: true,
        steelMans: true,
        repairActions: true,
        revisitSchedules: true,
        nodes: true,
        events: {
          orderBy: { createdAt: "asc" },
        },
        createdAt: true,
        updatedAt: true,
      },
    });
    const profile = updatedMap ? buildCritiqueQualityProfile(buildThoughtMapModel(updatedMap)) : null;

    const profileEvent = profile
      ? await tx.thoughtMapEvent.create({
          data: {
            mapId: params.mapId,
            nodeId: critiqueEvent?.nodeId ?? null,
            eventType: "critique_quality_profile",
            payload: serializeJson(profile),
          },
        })
      : null;

    return {
      feedbackEvent,
      correctionEvent,
      profileEvent,
    };
  });

  return {
    feedback: mapEventRecord(created.feedbackEvent),
    correction: created.correctionEvent ? mapEventRecord(created.correctionEvent) : null,
    profileEvent: created.profileEvent ? mapEventRecord(created.profileEvent) : null,
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
  const userId = params.userId ?? (await getCurrentAuthenticatedUserId());
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
  const startedAt = Date.now();
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
  const userId = params.userId ?? (await getCurrentAuthenticatedUserId());
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
  const userId = await getCurrentAuthenticatedUserId();
  const maps = await prisma.thoughtMap.findMany({
    where: { userId },
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

export async function createThoughtMap(input: CreateThoughtMapInput, userId?: string) {
  const startedAt = Date.now();
  const rawThought = cleanSentence(input.rawThought);
  const captureEnvelope = formatClaimCaptureMetadata(input.claim);
  const mapRawThought = `${captureEnvelope}\n${rawThought}`;
  const title = createThoughtMapTitle(rawThought);
  const seedNodes = generateInitialBranchNotes(mapRawThought);
  const referenceClassSuggestion = input.referenceClass
    ? suggestReferenceClass({
        claimText: rawThought,
        claimType: input.claim.structureKind ?? "assertion",
        structureKind: input.claim.structureKind ?? "assertion",
      })
    : null;
  let referenceClassRecord: ReferenceClass | null = null;
  const activeUserId = userId ?? (await getCurrentAuthenticatedUserId());
  const claimDomain = classifyCalibrationDomain(mapRawThought);

  const created = await prisma.$transaction(async (tx) => {
    const map = await tx.thoughtMap.create({
      data: {
        userId: activeUserId,
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

    if (input.referenceClass && referenceClassSuggestion) {
      referenceClassRecord = buildReferenceClassRecord({
        claimId: root.id,
        suggestion: referenceClassSuggestion,
        userInsideViewEstimate: input.referenceClass.userInsideViewEstimate,
        userReferenceClassEstimate: input.referenceClass.userReferenceClassEstimate,
        userFinalConfidence: input.referenceClass.userFinalConfidence,
        userExplainedDivergence: input.referenceClass.userExplainedDivergence,
        capturedAt: root.createdAt,
      });
    }

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
        referenceClass: referenceClassRecord,
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

  if (referenceClassRecord) {
    await maybeRecordReferenceClassBiasSignal({
      mapId: created.id,
      userId: activeUserId,
      referenceClass: referenceClassRecord,
      nodeId: created.nodes[0]?.id ?? created.id,
    });
  }

  void track(
    {
      event: "map_created",
      properties: {
        mapId: created.id,
      },
    },
    userId,
  );

  const rootNodeId = created.nodes[0]?.id ?? null;
  if (rootNodeId) {
    void track(
      {
        event: "claim_created",
        properties: {
          claimId: rootNodeId,
          mapId: created.id,
          domain: claimDomain,
        },
      },
      activeUserId,
    );
  }

  logger.info("map_created", {
    userId: activeUserId,
    featureId: "thought-map",
    durationMs: Date.now() - startedAt,
    data: {
      mapId: created.id,
      rootClaimId: rootNodeId,
      claimDomain,
      hasReferenceClass: Boolean(referenceClassRecord),
    },
  });

  return hydrateThoughtMap(created);
}

export async function getThoughtMap(mapId: string, userId?: string) {
  const activeUserId = userId ?? (await getCurrentAuthenticatedUserId());
  const map = await prisma.thoughtMap.findFirst({
    where: { id: mapId, userId: activeUserId },
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

export async function generateArtifactForMap(params: {
  mapId: string;
  artifactTypeId: ArtifactTypeId;
  audience?: string | null;
  sectionOrder?: string[];
  narrativeGlue?: string | null;
  userId?: string;
}) {
  const startedAt = Date.now();
  const map = await getThoughtMap(params.mapId);

  if (!map) {
    throw new Error("Map not found");
  }

  const artifactType = getArtifactType(params.artifactTypeId);
  if (!artifactType) {
    throw new Error("Artifact type not found");
  }

  const evidenceGate = buildEvidenceQualityGate(map);
  if (evidenceGate.blocked) {
    throw new Error(evidenceGate.message ?? "Artifact not ready: this artifact depends on poorly evidenced claims.");
  }

  const activeUserId = params.userId ?? (await getCurrentAuthenticatedUserId());
  assertRateLimit(activeUserId, "ai_classify");

  const lens = buildPennyLens(map);
  const version = map.artifacts.filter((artifact) => artifact.artifactTypeId === params.artifactTypeId).length + 1;
  const artifact = buildArtifactDraft(map, params.artifactTypeId, {
    artifactId: `${map.id}:${params.artifactTypeId}:${randomUUID()}`,
    version,
    audience: params.audience ?? artifactType.template.defaultAudience,
    sectionOrder: params.sectionOrder,
    narrativeGlue: params.narrativeGlue ?? null,
    lens,
  });

  const founderBrief =
    params.artifactTypeId === "founder_brief" ? artifactDraftToFounderBrief(artifact) : null;
  const storedFounderBrief =
    founderBrief && params.artifactTypeId === "founder_brief"
      ? (() => {
          const { generatedAt, ...rest } = founderBrief;
          return { generatedAt, stored: rest };
        })()
      : null;

  const updatedRecord: HydratedThoughtMapRecord | null = await prisma.$transaction(async (tx) => {
    await tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: null,
        eventType: "artifact_generated",
        payload: serializeJson(artifact),
      },
    });

    if (storedFounderBrief) {
      await tx.thoughtMap.update({
        where: { id: params.mapId },
        data: {
          founderBrief: serializeJson(storedFounderBrief.stored),
          founderBriefGeneratedAt: storedFounderBrief.generatedAt,
        },
      });
    }

    const updatedRecord = await tx.thoughtMap.findUnique({
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

    return updatedRecord;
  });

  if (!updatedRecord) {
    throw new Error("Map not found");
  }

  void track(
    {
      event: "artifact_generated",
      properties: {
        artifactType: params.artifactTypeId,
        mapId: params.mapId,
      },
    },
    activeUserId,
  );

  logger.info("artifact_generated", {
    userId: activeUserId,
    featureId: "thought-map",
    durationMs: Date.now() - startedAt,
    data: {
      mapId: params.mapId,
      artifactTypeId: params.artifactTypeId,
      artifactId: artifact.id,
    },
  });

  const hydratedMap = await hydrateThoughtMap(
    updatedRecord as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] },
    map,
  );

  return {
    artifact,
    map: hydratedMap,
  };
}

export async function generateFounderBrief(mapId: string, userId?: string) {
  const result = await generateArtifactForMap({
    mapId,
    artifactTypeId: "founder_brief",
    userId,
  });

  return result.map;
}

function importStructureToNodeKind(structureKind: string): ThoughtNodeModel["kind"] {
  if (structureKind === "conditional") {
    return "assumption";
  }

  if (structureKind === "recommendation") {
    return "why_it_matters";
  }

  if (structureKind === "causal" || structureKind === "quantitative_prediction" || structureKind === "future_assertion") {
    return "research";
  }

  return "core_claim";
}

function buildImportedClaimNote(importSource: ImportSource, claim: ExtractedClaim) {
  const sourceLabel = importSource.sourceTitle ?? importSource.sourceUrl ?? importSource.sourceType.replaceAll("_", " ");
  const decisionLabel = claim.userDecision === "edited" ? "edited" : "accepted";
  return `Imported from ${sourceLabel}. ${claim.sourceAttribution}. ${decisionLabel} from ${claim.structureKind}.`;
}

export async function recordImportSource(importSource: ImportSource) {
  await prisma.$transaction(async (tx) => {
    await tx.thoughtMapEvent.create({
      data: {
        mapId: importSource.mapId,
        nodeId: null,
        eventType: "import_source",
        payload: serializeJson(importSource),
      },
    });
  });

  return importSource;
}

export async function recordImportReview(params: {
  mapId: string;
  importSource: ImportSource;
}) {
  const mapRecord = await prisma.thoughtMap.findUnique({
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

  if (!mapRecord) {
    throw new Error("Map not found");
  }

  const map = buildThoughtMapModel(mapRecord as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] });
  const rootNode = map.nodes.find((node) => node.kind === "root") ?? null;
  const startOrder =
    map.nodes
      .filter((node) => node.parentId === rootNode?.id)
      .reduce((max, node) => Math.max(max, node.branchOrder), 0) || 0;

  const result: { review: ImportSource; updatedRecord: HydratedThoughtMapRecord | null } = await prisma.$transaction(async (tx) => {
    const finalizedClaims: ExtractedClaim[] = [];
    const acceptedClaimIds: string[] = [];
    let rejectedClaimCount = 0;
    let editedClaimCount = 0;

    for (const claim of params.importSource.extractedClaims) {
      if (claim.userDecision === "pending") {
        throw new Error("Resolve all imported claims before accepting them.");
      }

      if (claim.userDecision === "rejected") {
        rejectedClaimCount += 1;
        finalizedClaims.push({
          ...claim,
          resultingClaimId: null,
        });
        continue;
      }

      const claimText = (claim.userDecision === "edited" ? claim.editedText : claim.extractedText)?.trim() ?? "";
      if (!claimText) {
        throw new Error("Imported claims need text before they can be accepted.");
      }

      const created = await tx.thoughtNode.create({
        data: {
          mapId: params.mapId,
          parentId: rootNode?.id ?? null,
          kind: importStructureToNodeKind(claim.structureKind),
          nodeStatus: "active",
          content: claimText,
          note: buildImportedClaimNote(params.importSource, claim),
          branchOrder: startOrder + acceptedClaimIds.length + 1,
        },
      });

      acceptedClaimIds.push(created.id);
      if (claim.userDecision === "edited") {
        editedClaimCount += 1;
      }

      finalizedClaims.push({
        ...claim,
        importSourceId: params.importSource.id,
        resultingClaimId: created.id,
      });
    }

    const review: ImportSource = {
      ...params.importSource,
      extractedClaims: finalizedClaims,
      acceptedClaimIds,
      rejectedClaimCount,
      editedClaimCount,
    };

    await tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: null,
        eventType: "import_review",
        payload: serializeJson(review),
      },
    });

    const updatedRecord = await tx.thoughtMap.findUnique({
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

    return {
      review,
      updatedRecord,
    };
  });

  if (!result.updatedRecord) {
    throw new Error("Map not found after import review");
  }

  const hydratedMap = await hydrateThoughtMap(
    result.updatedRecord as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] },
    map,
  );

  return {
    importSource: result.review,
    map: hydratedMap,
  };
}

export async function recordVaultEntryRegistration(params: {
  userId: string;
  mapId: string;
  entryId: string;
  entryType: VaultEntryType;
  claimId?: string | null;
  sessionId?: string | null;
}) {
  const mapRecord = await prisma.thoughtMap.findUnique({
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

  if (!mapRecord) {
    throw new Error("Map not found");
  }

  const vaultEntry: VaultEntryManifest = {
    id: params.entryId,
    entryType: params.entryType,
    mapId: params.mapId,
    claimId: params.claimId ?? null,
    sessionId: params.sessionId ?? null,
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    syncStatus: "local_only",
  };

  const updatedRecord = await prisma.$transaction(async (tx) => {
    await createThoughtMapEvent(tx, {
      mapId: params.mapId,
      nodeId: params.claimId ?? null,
      eventType: "vault_entry_registered",
      payload: {
        vaultEntryId: vaultEntry.id,
        entryType: vaultEntry.entryType,
        mapId: vaultEntry.mapId,
        claimId: vaultEntry.claimId,
        sessionId: vaultEntry.sessionId,
        createdAt: vaultEntry.createdAt.toISOString(),
        lastAccessedAt: vaultEntry.lastAccessedAt.toISOString(),
        syncStatus: vaultEntry.syncStatus,
        userId: params.userId,
      },
    });

    return tx.thoughtMap.findUnique({
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
  });

  if (!updatedRecord) {
    throw new Error("Map not found after vault registration");
  }

  const hydratedMap = await hydrateThoughtMap(
    updatedRecord as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] },
    buildThoughtMapModel(mapRecord as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] }),
  );

  return {
    vaultEntry,
    map: hydratedMap,
  };
}

export async function recordClaimEvidence(params: {
  mapId: string;
  claimId: string;
  evidenceText: string;
  evidenceType: Evidence["evidenceType"];
  sourceUrl?: string | null;
  sourceName?: string | null;
  publicationDate?: Date | string | null;
  authorCredentials?: string | null;
  sampleSize?: number | null;
  replicationStatus?: Evidence["replicationStatus"];
  addedBy?: Evidence["addedBy"];
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

  const quality = scoreEvidenceQuality({
    evidenceText: params.evidenceText,
    evidenceType: params.evidenceType,
    sourceUrl: params.sourceUrl ?? null,
    sourceName: params.sourceName ?? null,
    publicationDate: params.publicationDate ?? null,
    authorCredentials: params.authorCredentials ?? null,
    sampleSize: params.sampleSize ?? null,
    replicationStatus: params.replicationStatus ?? null,
    addedAt: new Date(),
  });
  const evidence: Evidence = {
    id: randomUUID(),
    claimId: params.claimId,
    evidenceText: params.evidenceText.trim(),
    evidenceType: params.evidenceType,
    sourceUrl: params.sourceUrl ?? null,
    sourceName: params.sourceName ?? null,
    publicationDate: params.publicationDate ? new Date(params.publicationDate) : null,
    authorCredentials: params.authorCredentials ?? null,
    sampleSize:
      typeof params.sampleSize === "number" && Number.isFinite(params.sampleSize) ? Math.round(params.sampleSize) : null,
    replicationStatus: params.replicationStatus ?? null,
    qualityScore: quality.qualityScore,
    qualityComponents: quality.qualityComponents,
    addedAt: new Date(),
    addedBy: params.addedBy ?? "user",
  };

  await prisma.$transaction(async (tx) => {
    await createThoughtMapEvent(tx, {
      mapId: params.mapId,
      nodeId: params.claimId,
      eventType: "evidence_added",
      payload: evidence as unknown as Record<string, unknown>,
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
    throw new Error("Map not found after evidence update");
  }

  const updatedMap = await hydrateThoughtMap(
    updatedRecord as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] },
    map,
  );

  return {
    evidence,
    map: updatedMap,
    summary: buildClaimEvidenceSummary({
      claimId: params.claimId,
      evidence: updatedMap.evidence,
    }),
  };
}

export async function recordArtifactOutcome(params: {
  artifactId: string;
  userId: string;
  actionTaken: string;
  outcomeDate: Date;
  outcomeDescription: string;
  outcomeType: "success" | "partial_success" | "failure" | "inconclusive" | "pending";
  loadBearingClaimResolutions: ClaimOutcomePair[];
  artifactQualityRating: number;
  qualityDimensions: ArtifactOutcome["qualityDimensions"];
  wouldUseAgain: boolean;
  lessonsLearned: string | null;
}) {
  const mapId = params.artifactId.split(":")[0];
  const map = await getThoughtMap(mapId);

  if (!map) {
    throw new Error("Map not found");
  }

  const artifact = map.artifacts.find((candidate) => candidate.id === params.artifactId);

  if (!artifact) {
    throw new Error("Artifact not found");
  }

  const outcome: ArtifactOutcome = {
    id: randomUUID(),
    artifactId: params.artifactId,
    artifactType: artifact.artifactTypeId,
    userId: params.userId,
    actionTaken: params.actionTaken,
    outcomeDate: params.outcomeDate,
    outcomeDescription: params.outcomeDescription,
    outcomeType: params.outcomeType,
    loadBearingClaimResolutions: params.loadBearingClaimResolutions,
    artifactQualityRating: params.artifactQualityRating,
    qualityDimensions: params.qualityDimensions,
    wouldUseAgain: params.wouldUseAgain,
    lessonsLearned: params.lessonsLearned,
  };

  const incorrectCount = params.loadBearingClaimResolutions.filter((entry) => entry.wasClaimCorrect === false).length;
  const retrospectivePrompt =
    params.outcomeType === "failure" && incorrectCount >= 3
      ? `3 of the ${params.loadBearingClaimResolutions.length} load-bearing claims in this artifact turned out to be wrong. Would you like to walk through what happened?`
      : null;

  const updatedRecord = await prisma.$transaction(async (tx) => {
    await tx.thoughtMapEvent.create({
      data: {
        mapId,
        nodeId: null,
        eventType: "artifact_outcome",
        payload: serializeJson(outcome),
      },
    });

    for (const claim of params.loadBearingClaimResolutions) {
      if (claim.wasClaimCorrect === null) {
        continue;
      }

      await tx.thoughtMapEvent.create({
        data: {
          mapId,
          nodeId: claim.claimId,
          eventType: "claim_resolution",
          payload: serializeJson({
            id: randomUUID(),
            artifactId: params.artifactId,
            artifactOutcomeId: outcome.id,
            artifactType: artifact.artifactTypeId,
            userId: params.userId,
            ...claim,
            outcomeDate: params.outcomeDate.toISOString(),
          }),
        },
      });
    }

    return tx.thoughtMap.findUnique({
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
  });

  if (!updatedRecord) {
    throw new Error("Map not found");
  }

  await refreshCalibrationCoaching(params.userId);

  const hydratedMap = await hydrateThoughtMap(
    updatedRecord as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] },
    map,
  );

  return {
    outcome,
    retrospectivePrompt,
    map: hydratedMap,
  };
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

async function loadBlindSpotMapRecords(userId: string) {
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
  const existingProfile = normalizeBiasProfileRecord(existing);
  const mergedProfile: CognitiveBiasProfile = {
    ...profile,
    calibrationCoaching: existingProfile?.calibrationCoaching ?? null,
    coachingRejections: existingProfile?.coachingRejections ?? [],
  };
  const serialized = serializeBiasProfile(mergedProfile);

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

  return mergedProfile;
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

async function loadCalibrationMaps(userId: string) {
  return loadBiasProfileMaps(userId);
}

export async function refreshCalibrationCoaching(userId: string) {
  const mapRecords = await loadCalibrationMaps(userId);
  const maps = await Promise.all(
    mapRecords.map((record) =>
      hydrateThoughtMap(
        record as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] },
        undefined,
        { syncInterventions: false },
      ),
    ),
  );
  const coaching = buildCalibrationCoaching(maps, userId);
  const stored = await prisma.cognitiveBiasProfile.findUnique({
    where: { userId },
  });
  const storedProfile = normalizeBiasProfileRecord(stored);
  const mergedProfile: CognitiveBiasProfile = {
    ...(storedProfile ?? {
      userId,
      profileVersion: 1,
      biasEntries: [],
      lastUpdated: coaching.generatedAt,
      overallCalibrationTrend: coaching.overallTrend,
      strongestBias: null,
      mostImprovedBias: null,
    }),
    calibrationCoaching: {
      ...coaching,
      userId,
      rejectionHistory: storedProfile?.coachingRejections ?? coaching.rejectionHistory ?? [],
    },
    coachingRejections: storedProfile?.coachingRejections ?? coaching.rejectionHistory ?? [],
  };
  const serialized = serializeBiasProfile(mergedProfile);

  if (!stored || stored.biasProfileJson !== serialized) {
    const nextVersion = stored ? stored.profileVersion + 1 : mergedProfile.profileVersion;
    await prisma.cognitiveBiasProfile.upsert({
      where: { userId },
      update: {
        profileVersion: nextVersion,
        biasProfileJson: serialized,
        overallCalibrationTrend: coaching.overallTrend,
        strongestBiasId: storedProfile?.strongestBias?.id ?? null,
        mostImprovedBiasId: storedProfile?.mostImprovedBias?.id ?? null,
        lastUpdated: coaching.generatedAt,
      },
      create: {
        userId,
        profileVersion: mergedProfile.profileVersion,
        biasProfileJson: serialized,
        overallCalibrationTrend: coaching.overallTrend,
        strongestBiasId: storedProfile?.strongestBias?.id ?? null,
        mostImprovedBiasId: storedProfile?.mostImprovedBias?.id ?? null,
        lastUpdated: coaching.generatedAt,
      },
    });
  }

  return mergedProfile.calibrationCoaching ?? coaching;
}

export async function getCalibrationCoaching(userId: string) {
  const stored = await prisma.cognitiveBiasProfile.findUnique({
    where: { userId },
  });

  if (stored) {
    const profile = normalizeBiasProfileRecord(stored);
    if (profile?.calibrationCoaching) {
      return profile.calibrationCoaching;
    }
  }

  return refreshCalibrationCoaching(userId);
}

export async function recordCalibrationRejection(params: {
  userId: string;
  domain: CalibrationCoachingRejection["domain"];
  claimType: CalibrationCoachingRejection["claimType"];
  originalConfidence: number;
  suggestedAdjustment: number;
  recommendationText: string;
}) {
  const current = await getCalibrationCoaching(params.userId);
  const rejection: CalibrationCoachingRejection = {
    id: randomUUID(),
    userId: params.userId,
    domain: params.domain,
    claimType: params.claimType,
    originalConfidence: params.originalConfidence,
    suggestedAdjustment: params.suggestedAdjustment,
    recommendationText: params.recommendationText,
    dismissedAt: new Date(),
  };
  const nextProfile: CalibrationCoaching = {
    ...current,
    rejectionHistory: [rejection, ...current.rejectionHistory],
    generatedAt: new Date(),
  };
  const existing = await prisma.cognitiveBiasProfile.findUnique({
    where: { userId: params.userId },
  });
  const storedProfile = normalizeBiasProfileRecord(existing);
  const mergedProfile: CognitiveBiasProfile = {
    ...(storedProfile ?? {
      userId: params.userId,
      profileVersion: 1,
      biasEntries: [],
      lastUpdated: nextProfile.generatedAt,
      overallCalibrationTrend: nextProfile.overallTrend,
      strongestBias: null,
      mostImprovedBias: null,
    }),
    calibrationCoaching: nextProfile,
    coachingRejections: nextProfile.rejectionHistory,
    lastUpdated: nextProfile.generatedAt,
  };
  const serialized = serializeBiasProfile(mergedProfile);
  const nextVersion = existing ? existing.profileVersion + 1 : mergedProfile.profileVersion;
  await prisma.cognitiveBiasProfile.upsert({
    where: { userId: params.userId },
    update: {
      profileVersion: nextVersion,
      biasProfileJson: serialized,
      overallCalibrationTrend: nextProfile.overallTrend,
      strongestBiasId: storedProfile?.strongestBias?.id ?? null,
      mostImprovedBiasId: storedProfile?.mostImprovedBias?.id ?? null,
      lastUpdated: nextProfile.generatedAt,
    },
    create: {
      userId: params.userId,
      profileVersion: mergedProfile.profileVersion,
      biasProfileJson: serialized,
      overallCalibrationTrend: nextProfile.overallTrend,
      strongestBiasId: storedProfile?.strongestBias?.id ?? null,
      mostImprovedBiasId: storedProfile?.mostImprovedBias?.id ?? null,
      lastUpdated: nextProfile.generatedAt,
    },
  });

  return nextProfile;
}

export async function refreshBlindSpotMap(userId: string) {
  const mapRecords = await loadBlindSpotMapRecords(userId);
  const maps = await Promise.all(
    mapRecords.map((record) =>
      hydrateThoughtMap(
        record as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] },
        undefined,
        { syncInterventions: false },
      ),
    ),
  );
  const blindSpotMap = buildBlindSpotMap(maps, userId);
  const existing = await prisma.blindSpotMapCache.findUnique({
    where: { userId },
  });
  const serialized = serializeBlindSpotMap(blindSpotMap);

  if (!existing || existing.blindSpotMapJson !== serialized) {
    await prisma.blindSpotMapCache.upsert({
      where: { userId },
      update: {
        blindSpotMapJson: serialized,
        lastComputedAt: blindSpotMap.computedAt,
      },
      create: {
        userId,
        blindSpotMapJson: serialized,
        lastComputedAt: blindSpotMap.computedAt,
      },
    });
  }

  return blindSpotMap;
}

export async function getBlindSpotMap(userId: string) {
  const stored = await prisma.blindSpotMapCache.findUnique({
    where: { userId },
  });

  if (stored) {
    const blindSpotMap = normalizeBlindSpotMapRecord(stored);
    const lastComputedAt = stored.lastComputedAt.getTime();
    const stale = Date.now() - lastComputedAt > 7 * 24 * 60 * 60 * 1000;

    if (blindSpotMap && !stale) {
      return blindSpotMap;
    }
  }

  return refreshBlindSpotMap(userId);
}

export interface ExportDataBundle {
  exportType: ExportType;
  title: string | null;
  document: unknown;
}

function eventPayloadForExport(event: ThoughtMapEventModel, includePrivate: boolean) {
  if (!event.payload || typeof event.payload !== "object") {
    return null;
  }

  const payload = { ...(event.payload as Record<string, unknown>) };

  if (includePrivate) {
    return payload;
  }

  for (const key of ["rawThought", "sourceContent", "conversation", "answers", "declaredIntention", "rawIdea"]) {
    if (key in payload) {
      payload[key] = "[redacted]";
    }
  }

  return payload;
}

function mapHistoryEvents(map: ThoughtMapModel, claimId: string, includeHistory: boolean, includePrivate: boolean): ThoughtMapEventModel[] {
  if (!includeHistory) {
    return [];
  }

  return map.events
    .filter((event) => event.nodeId === claimId)
    .map((event) => ({
      id: event.id,
      mapId: map.id,
      eventType: event.eventType,
      nodeId: event.nodeId,
      interventionId: event.interventionId,
      createdAt: event.createdAt,
      payload: eventPayloadForExport(event, includePrivate),
    }));
}

function buildSessionExportRecords(records: Session[], includePrivate: boolean) {
  return records.map((record) => {
    const session = serializeSessionRecord(record);

    if (includePrivate) {
      return session;
    }

    return {
      ...session,
      declaredIntention: "[redacted]",
      sessionEvents: [],
      closingRitual: null,
      sessionSummary: null,
      rawIdea: "[redacted]",
      extractedProblem: null,
      extractedCustomer: null,
      extractedSolution: null,
      ideaSummary: null,
      targetUser: null,
      problem: null,
      solution: null,
      assumptions: [],
      resolvedAssumptions: [],
      risks: [],
      unknowns: [],
      evidenceFor: [],
      evidenceAgainst: [],
      marketPatterns: [],
      questionsAsked: [],
      answers: [],
      conversation: [],
      conceptBrief: null,
    };
  });
}

async function loadUserMaps(userId: string) {
  const records = await prisma.thoughtMap.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      nodes: {
        orderBy: [{ branchOrder: "asc" }, { createdAt: "asc" }],
      },
      events: {
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });

  return Promise.all(
    records.map((record) =>
      hydrateThoughtMap(record as ThoughtMap & { nodes: ThoughtNode[]; events: ThoughtMapEventRecord[] }, undefined, {
        syncInterventions: false,
      }),
    ),
  );
}

async function loadSessionsForExport(userId: string, mapId?: string | null, sessionId?: string | null): Promise<Session[]> {
  return prisma.session.findMany({
    where: {
      userId,
      ...(mapId ? { mapId } : {}),
      ...(sessionId ? { id: sessionId } : {}),
    },
    orderBy: [{ startedAt: "desc" }],
  });
}

type CalibrationBundle = {
  biasProfile: CognitiveBiasProfile | null;
  blindSpotMap: BlindSpotMap | null;
  coaching: CalibrationCoaching | null;
};

async function loadCalibrationBundle(userId: string): Promise<CalibrationBundle | null> {
  const [biasProfile, blindSpotMap, coaching] = await Promise.all([
    getCognitiveBiasProfile(userId),
    getBlindSpotMap(userId),
    getCalibrationCoaching(userId),
  ]);

  if (!biasProfile && !blindSpotMap && !coaching) {
    return null;
  }

  return {
    biasProfile,
    blindSpotMap,
    coaching,
  };
}

function buildMapExportSnapshot(params: {
  map: ThoughtMapModel;
  sessions: Session[];
  includeHistory: boolean;
  includePrivate: boolean;
  focusClaimId: string | null;
  focusClaimText: string | null;
  claimFilter?: string | null;
}): ExportMapSnapshot {
  const { map, sessions, includeHistory, includePrivate, focusClaimId, focusClaimText, claimFilter } = params;
  const claims = claimFilter ? map.nodes.filter((claim) => claim.id === claimFilter) : map.nodes;
  const lens = buildPennyLens(map);
  const sanitizedMap: ThoughtMapModel = includePrivate
    ? map
    : {
        ...map,
        rawThought: "",
        nodes: map.nodes.map((node) => ({
          ...node,
          note: null,
        })),
      };

  return {
    map: sanitizedMap,
    lens,
    shapes: lens.effectiveShapes,
    claimHistory: claims.map((claim) => {
      const claimSnapshot = includePrivate ? claim : { ...claim, note: null };

      return {
        claimId: claim.id,
        claim: claimSnapshot,
        history: includeHistory ? mapHistoryEvents(map, claim.id, includeHistory, includePrivate) : [],
      };
    }),
    focusClaimId,
    focusClaimText,
    sessions: buildSessionExportRecords(sessions, includePrivate) as unknown as ExportMapSnapshot["sessions"],
  };
}

function buildCalibrationSnapshot(maps: ThoughtMapModel[], calibration: CalibrationBundle | null): ExportCalibrationSnapshot {
  return {
    biasProfile: calibration?.biasProfile ?? null,
    coaching: calibration?.coaching ?? null,
    blindSpotMap: calibration?.blindSpotMap ?? null,
    dashboard: maps.length ? buildCalibrationDashboard(maps) : null,
  };
}

export async function buildExportData(params: {
  userId: string;
  exportType: ExportType;
  includeHistory: boolean;
  includePrivate: boolean;
  mapId?: string | null;
  claimId?: string | null;
  sessionId?: string | null;
  exportRequest: ExportRequest;
}): Promise<OpenFormatExportBundle> {
  const allMaps = await loadUserMaps(params.userId);
  const calibration = await loadCalibrationBundle(params.userId);
  const allSessions = await loadSessionsForExport(params.userId);
  const calibrationSnapshot = buildCalibrationSnapshot(allMaps, calibration);
  const filteredMaps =
    params.exportType === "single_map"
      ? allMaps.filter((map) => map.id === params.mapId)
      : params.exportType === "single_claim"
        ? allMaps.filter((map) => map.nodes.some((claim) => claim.id === params.claimId))
        : params.exportType === "shapes_and_lens" && params.mapId
          ? allMaps.filter((map) => map.id === params.mapId)
          : params.exportType === "session_history"
            ? params.mapId
              ? allMaps.filter((map) => map.id === params.mapId)
              : []
            : params.exportType === "calibration_data"
              ? []
              : allMaps;

  if (params.exportType === "single_map" && filteredMaps.length === 0) {
    throw new Error("Map not found");
  }

  if (params.exportType === "single_claim" && !params.claimId) {
    throw new Error("Claim not found");
  }

  if (params.exportType === "single_claim" && params.claimId && filteredMaps.length === 0) {
    throw new Error("Claim not found");
  }

  if (params.exportType === "shapes_and_lens" && params.mapId && filteredMaps.length === 0) {
    throw new Error("Map not found");
  }

  if (params.exportType === "session_history" && params.mapId && filteredMaps.length === 0) {
    throw new Error("Map not found");
  }

  const claimFilter = params.exportType === "single_claim" ? params.claimId ?? null : null;
  const mapSnapshots = filteredMaps.map((map) => {
    const sessionsForMap =
      params.exportType === "session_history" && params.mapId && params.sessionId
        ? allSessions.filter((session) => session.mapId === params.mapId && session.id === params.sessionId)
        : params.exportType === "session_history" && params.mapId
          ? allSessions.filter((session) => session.mapId === params.mapId)
          : params.exportType === "single_map" || params.exportType === "single_claim"
            ? allSessions.filter((session) => session.mapId === map.id)
            : allSessions.filter((session) => session.mapId === map.id);

    return buildMapExportSnapshot({
      map,
      sessions: sessionsForMap,
      includeHistory: params.includeHistory,
      includePrivate: params.includePrivate,
      focusClaimId: claimFilter,
      focusClaimText: claimFilter ? map.nodes.find((claim) => claim.id === claimFilter)?.content ?? null : null,
      claimFilter,
    });
  });

  const topLevelSessions: Session[] =
    params.exportType === "calibration_data"
      ? []
      : params.exportType === "session_history"
      ? allSessions.filter((session) =>
          params.mapId ? session.mapId === params.mapId : params.sessionId ? session.id === params.sessionId : true,
        )
      : params.exportType === "single_map" || params.exportType === "single_claim"
        ? allSessions.filter((session) => mapSnapshots.some((snapshot) => snapshot.map.id === session.mapId))
        : params.exportType === "shapes_and_lens"
          ? allSessions.filter((session) => (params.mapId ? session.mapId === params.mapId : true))
          : allSessions;

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date(),
    request: params.exportRequest,
    portabilityGuarantee: EXPORT_PORTABILITY_GUARANTEE,
    userId: params.userId,
    maps: mapSnapshots,
    sessions: buildSessionExportRecords(topLevelSessions, params.includePrivate) as unknown as OpenFormatExportBundle["sessions"],
    calibration: calibrationSnapshot,
  };
}
