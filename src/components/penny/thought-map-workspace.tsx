"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { AlertCircle, ArrowRightLeft, CircleDot, Download, GitBranchPlus, Link2, Lock, Sparkles } from "lucide-react";
import { BiasProfile } from "@/components/penny/bias-profile";
import { SessionClose } from "@/components/penny/session-close";
import { SessionStart } from "@/components/penny/session-start";
import { BlindSpotMapView } from "@/components/penny/blind-spot-map";
import { ArtifactBuilder } from "@/components/penny/artifact-builder";
import { ExportModal } from "@/components/penny/export-modal";
import { DependencyHealthBar, DependencyHealthPanel } from "@/components/penny/dependency-health";
import { DocumentImport } from "@/components/penny/document-import";
import { FounderBriefCard } from "@/components/penny/founder-brief-card";
import { VaultModal, type VaultDraft } from "@/components/penny/vault-modal";
import { UncertaintyIndicator } from "@/components/penny/uncertainty-indicator";
import { ClaimRepairModal } from "@/components/penny/claim-repair-modal";
import { ResolutionFlow, type ResolutionDownstreamClaim, type ResolutionSubmission } from "@/components/penny/resolution-flow";
import { MarginRail } from "@/components/penny/margin-rail";
import { RevisitQueue } from "@/components/penny/revisit-queue";
import { SteelManGate } from "@/components/penny/steel-man-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfidenceSlider } from "@/components/penny/confidence-slider";
import {
  buildDependencyChainTimeline,
  buildMapTimeline,
  buildClaimMoveHistory,
  buildClaimDependencyGraph,
  buildBeliefGenealogy,
  buildBayesianPropagationSnapshot,
  buildDevilsAdvocateReceipts,
  buildAudienceCritiqueSurface,
  buildAdvisorReviewSurface,
  buildConfidenceDecaySnapshot,
  buildConfusionLog,
  buildAdversarialFinalPass,
  buildClaimRepairSuggestions,
  buildCritiqueQualityProfile,
  buildCalibrationDashboard,
  critiqueGenerationModifier,
  collectCritiqueCorrections,
  collectCritiqueFeedback,
  biasProfileCritiqueContext,
  buildCognitiveBiasProfile,
  buildPennyLens,
  buildSessionRhythmSnapshot,
  collectShapeFeedback,
  captureSnapshotForMap,
  buildClaimStructureSnapshot,
  inheritedClaimSnapshots,
  buildOldSelfTimeline,
  findActiveShapeCallout,
  formatShapeVerdict,
  interleaveStressNodes,
  retrievePrecedentsForNode,
  retrieveSurvivorPrecedentsForCase,
  traceContradictionCascade,
  buildShapeTimeline,
  type PennyShape,
  type PennyShapeFeedback,
  type MapTimelineSnapshot,
  type ShapeTimelineSnapshot,
  type DependencyChainTimelineSnapshot,
  type SteelManQualityAssessment,
} from "@/lib/penny-insights";
import { buildPersonalizedCritiqueContext, generatePersonalizationDisclosure } from "@/lib/personalized-critique-engine";
import { buildArtifactDependencyHealth } from "@/lib/dependency-health";
import { buildClaimEvidenceSummary } from "@/lib/evidence-quality";
import { track } from "@/lib/analytics";
import { classifyCalibrationDomain } from "@/lib/calibration";
import { evaluateMetaCognitionTrigger, type MetaCognitionPromptSnapshot } from "@/lib/meta-cognition";
import { generateLearningPrompt, type LearningPromptOutput, type LearningPromptClaim, type LearningPromptRound } from "@/lib/learning-prompts";
import { generateSessionSummary } from "@/lib/session-summary";
import { buildRevisitQueue } from "@/lib/revisit-scheduler";
import type { VaultContentPayload } from "@/lib/vault";
import { cn } from "@/lib/utils";
import { CritiqueFeedback as CritiqueFeedbackCard } from "@/components/penny/critique-feedback";
import { EvidenceEntry } from "@/components/penny/evidence-entry";
import { MetaCognitionPrompt } from "@/components/penny/meta-cognition-prompt";
import { LearningPromptCard } from "@/components/penny/learning-prompt-card";
import { PersonalizedCritiquePanel } from "@/components/penny/personalized-critique-panel";
import { ShapeDetail } from "@/components/penny/shape-detail";
import type { SteelManGateSavedSteelMan } from "@/components/penny/steel-man-gate";
import type {
  CognitiveIntervention,
  ClaimRepairAction,
  FounderBriefModel,
  DialecticRound,
  ClaimStructureSnapshot,
  ThoughtMapGraphSnapshot,
  ThoughtMapEvent,
  ThoughtMapModel,
  ThoughtMapRecommendedMove,
  ThoughtNodeKind,
  ThoughtNodeModel,
  RevisitAction,
  RevisitSchedule,
  TriggerDefinition,
  CritiqueFeedback as CritiqueFeedbackModel,
  CritiqueCorrection as CritiqueCorrectionModel,
  CritiqueQualityProfile as CritiqueQualityProfileModel,
  Evidence,
  EvidenceQualityComponent,
  SteelMan,
  SteelManVersion,
  CognitiveBiasProfile,
  BlindSpotMap,
  ShapeDerivation,
  MetaCognitionResponseType,
  ImportSource,
  ExtractedClaim,
  VaultEntryManifest,
  ThinkingSession,
  SessionEvent,
} from "@/types/thought-map";
import type { PersonalizedCritiqueContext } from "@/types/personalized-critique";
import type { MarginFragmentModel } from "@/types/penny";

type SerializableThoughtNode = Omit<ThoughtNodeModel, "createdAt" | "updatedAt"> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};

type SerializableThoughtMap = Omit<
  ThoughtMapModel,
  | "nodes"
  | "createdAt"
  | "updatedAt"
  | "interventions"
  | "recommendedIntervention"
  | "founderBrief"
  | "steelMans"
  | "critiqueFeedbacks"
  | "critiqueCorrections"
  | "critiqueQualityProfile"
  | "repairActions"
  | "revisitSchedules"
  | "importSources"
  | "vaultEntries"
  | "shapeDerivations"
  | "evidence"
> & {
  nodes: SerializableThoughtNode[];
  events: SerializableThoughtMapEvent[];
  steelMans: SerializableSteelMan[];
  critiqueFeedbacks: SerializableCritiqueFeedback[];
  critiqueCorrections: SerializableCritiqueCorrection[];
  critiqueQualityProfile: SerializableCritiqueQualityProfile | null;
  repairActions: SerializableClaimRepairAction[];
  revisitSchedules: SerializableRevisitSchedule[];
  shapeDerivations: SerializableShapeDerivation[];
  evidence: SerializableEvidence[];
  founderBrief: SerializableFounderBrief | null;
  interventions: SerializableIntervention[];
  recommendedIntervention: SerializableIntervention | null;
  importSources: SerializableImportSource[];
  vaultEntries: SerializableVaultEntryManifest[];
  createdAt: Date | string;
  updatedAt: Date | string;
};

type SerializableSessionEvent = Omit<SessionEvent, "timestamp"> & {
  timestamp: Date | string;
};

type SerializableThinkingSession = Omit<
  ThinkingSession,
  "startedAt" | "endedAt" | "sessionEvents" | "closingRitual" | "sessionSummary"
> & {
  startedAt: Date | string;
  endedAt: Date | string | null;
  sessionEvents: SerializableSessionEvent[];
  closingRitual: ThinkingSession["closingRitual"] | null;
  sessionSummary: ThinkingSession["sessionSummary"] | null;
};

type SerializableFounderBrief = Omit<FounderBriefModel, "generatedAt"> & {
  generatedAt: Date | string;
};

type SerializableIntervention = Omit<
  CognitiveIntervention,
  "createdAt" | "updatedAt" | "shownAt" | "completedAt" | "dismissedAt"
> & {
  createdAt: Date | string;
  updatedAt: Date | string;
  shownAt: Date | string;
  completedAt: Date | string | null;
  dismissedAt: Date | string | null;
};

type SerializableThoughtMapEvent = Omit<ThoughtMapEvent, "createdAt"> & {
  createdAt: Date | string;
};

type SerializableEvidenceComponent = EvidenceQualityComponent;

type SerializableEvidence = Omit<Evidence, "publicationDate" | "addedAt" | "qualityComponents"> & {
  publicationDate: Date | string | null;
  addedAt: Date | string;
  qualityComponents: SerializableEvidenceComponent[];
};

type SerializableSteelManVersion = Omit<SteelManVersion, "savedAt"> & {
  savedAt: Date | string;
};

type SerializableSteelMan = Omit<SteelMan, "writtenAt" | "updatedAt" | "updateHistory"> & {
  writtenAt: Date | string;
  updatedAt: Date | string | null;
  updateHistory: SerializableSteelManVersion[];
};

type SerializableShapeDerivation = Omit<ShapeDerivation, "computedAt" | "contributingMoves"> & {
  contributingMoves: Array<
    Omit<ShapeDerivation["contributingMoves"][number], "timestamp"> & {
      timestamp: Date | string;
    }
  >;
  computedAt: Date | string;
};

type SerializableCritiqueRating = Omit<CritiqueFeedbackModel["ratings"][number], never>;

type SerializableCritiqueFeedback = Omit<CritiqueFeedbackModel, "feedbackGivenAt" | "ratings"> & {
  ratings: SerializableCritiqueRating[];
  feedbackGivenAt: Date | string;
};

type SerializableCritiqueCorrection = Omit<CritiqueCorrectionModel, "createdAt" | "reviewedAt"> & {
  createdAt: Date | string;
  reviewedAt: Date | string | null;
};

type SerializableCritiqueQualityProfile = Omit<CritiqueQualityProfileModel, "lastUpdated"> & {
  lastUpdated: Date | string;
};

type SerializableExtractedClaim = ExtractedClaim;

type SerializableImportSource = Omit<ImportSource, "importedAt" | "extractedClaims"> & {
  importedAt: Date | string;
  extractedClaims: SerializableExtractedClaim[];
};

type SerializableVaultEntryManifest = Omit<VaultEntryManifest, "createdAt" | "lastAccessedAt"> & {
  createdAt: Date | string;
  lastAccessedAt: Date | string;
};

type SerializableClaimRepairAction = Omit<ClaimRepairAction, "createdAt"> & {
  createdAt: Date | string;
  supersessionRecord: Omit<ClaimRepairAction["supersessionRecord"], never>;
  edgeChanges: Array<ClaimRepairAction["edgeChanges"][number]>;
};

type SerializableBiasEvidenceInstance = Omit<CognitiveBiasProfile["biasEntries"][number]["evidenceInstances"][number], "timestamp"> & {
  timestamp: Date | string;
};

type SerializableBiasEntry = Omit<CognitiveBiasProfile["biasEntries"][number], "firstDetected" | "lastSignal" | "evidenceInstances"> & {
  firstDetected: Date | string;
  lastSignal: Date | string;
  evidenceInstances: SerializableBiasEvidenceInstance[];
};

type SerializableCognitiveBiasProfile = Omit<CognitiveBiasProfile, "biasEntries" | "lastUpdated"> & {
  biasEntries: SerializableBiasEntry[];
  lastUpdated: Date | string;
};

type SerializableBlindSpotDomain = Omit<BlindSpotMap["unexaminedDomains"][number], "oldestUntestedClaim"> & {
  oldestUntestedClaim: Date | string;
};

type SerializableBlindSpotMap = Omit<BlindSpotMap, "computedAt" | "unexaminedDomains"> & {
  computedAt: Date | string;
  unexaminedDomains: SerializableBlindSpotDomain[];
};

type SerializableRevisitAction = Omit<RevisitAction, "completedAt"> & {
  completedAt: Date | string;
};

type SerializableRevisitSchedule = Omit<RevisitSchedule, "scheduledFor" | "surfacedAt" | "userAction" | "snoozedUntil" | "lastComputedAt"> & {
  scheduledFor: Date | string;
  surfacedAt: Date | string | null;
  userAction: SerializableRevisitAction | null;
  snoozedUntil: Date | string | null;
  lastComputedAt: Date | string;
  triggerDefinition: TriggerDefinition;
};

type SerializableDialecticRound = Omit<DialecticRound, "createdAt" | "closedAt"> & {
  createdAt: Date | string;
  closedAt: Date | string | null;
};

type ActionResponse = {
  action: string;
  createdNodes: SerializableThoughtNode[];
  updatedNodes: SerializableThoughtNode[];
  graphSnapshot?: ThoughtMapGraphSnapshot | null;
  interventions?: SerializableIntervention[];
  recommendedIntervention?: SerializableIntervention | null;
  recommendedNextMove?: ThoughtMapRecommendedMove | null;
  execution: {
    mode: "add_children" | "strengthen_branch" | "replace_weak_branch" | "diversify_branches";
    targetNodeId: string;
    targetNodeKind: ThoughtNodeKind;
    targetParentId: string | null;
    supersededNodeId: string | null;
  };
  reasoning: {
    graphAnalysis?: {
      primaryGap: string;
      secondaryGap: string | null;
      critiqueTags: string[];
      reasons: string[];
      weakNodes: Array<{
        nodeId: string;
        kind: ThoughtNodeKind;
        content: string;
        score: number;
        issues: string[];
      }>;
      actionSelection: {
        mode: "add_children" | "strengthen_branch" | "replace_weak_branch" | "diversify_branches";
        targetNodeId: string;
        targetNodeKind: ThoughtNodeKind;
        why: string[];
      };
    };
  };
};

type FounderBriefResponse = {
  map: SerializableThoughtMap;
};

type SessionMapOption = {
  id: string;
  title: string;
  claimIds: string[];
};

type MapView = "outline" | "graph";

type PeerAudience = "skeptical investor" | "thesis advisor" | "skeptical academic" | "gtm operator";
type ElicitationMode = "devils advocate" | "naive questioner" | "integrator" | "skeptic";

type PositionedGraphNode = {
  node: ThoughtNodeModel;
  depth: number;
  x: number;
  y: number;
  isWeak: boolean;
  isCritical: boolean;
  childCount: number;
  ageDays: number;
  densityScore: number;
  saturationScore: number;
};

type PositionedGraphEdge = {
  id: string;
  parentId: string;
  childId: string;
  from: { x: number; y: number; depth: number };
  to: { x: number; y: number; depth: number };
  isWeak: boolean;
  isCritical: boolean;
  strengthScore: number;
  contradictionScore: number;
  recencyDays: number;
};

type ChallengeCalibrationEntry = {
  id: string;
  createdAt: Date;
  nodeId: string | null;
  masteryLevel: "solid" | "growing" | "unmeasured";
  label: string;
  direction: "increase challenge" | "reduce challenge" | "hold steady";
  note: string;
  responseLength: number;
  roundIndex: number;
};

type CritiqueMode = "direct" | "socratic" | "red_team";
type CritiqueFailureType =
  | "weak evidence"
  | "missing counterargument"
  | "shaky assumption"
  | "analogy break"
  | "dependency risk"
  | "unaddressed precedent"
  | "premise rejection"
  | "definition failure";

const CRITIQUE_FAILURE_TYPES: CritiqueFailureType[] = [
  "weak evidence",
  "missing counterargument",
  "shaky assumption",
  "analogy break",
  "dependency risk",
  "unaddressed precedent",
  "premise rejection",
  "definition failure",
];

const GRAPH_NODE_WIDTH = 188;
const GRAPH_NODE_HEIGHT = 104;
const GRAPH_COLUMN_GAP = 232;
const GRAPH_ROW_GAP = 132;
const GRAPH_PADDING_X = 108;
const GRAPH_PADDING_Y = 76;

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function normalizeIntervention(intervention: SerializableIntervention): CognitiveIntervention {
  return {
    ...intervention,
    createdAt: toDate(intervention.createdAt),
    updatedAt: toDate(intervention.updatedAt),
    shownAt: toDate(intervention.shownAt),
    completedAt: intervention.completedAt ? toDate(intervention.completedAt) : null,
    dismissedAt: intervention.dismissedAt ? toDate(intervention.dismissedAt) : null,
  };
}

function normalizeNode(node: SerializableThoughtNode): ThoughtNodeModel {
  return {
    ...node,
    createdAt: toDate(node.createdAt),
    updatedAt: toDate(node.updatedAt),
  };
}

function normalizeFounderBrief(brief: SerializableFounderBrief): FounderBriefModel {
  return {
    ...brief,
    generatedAt: toDate(brief.generatedAt),
  };
}

function normalizeSteelManVersion(version: SerializableSteelManVersion): SteelManVersion {
  return {
    ...version,
    savedAt: toDate(version.savedAt),
  };
}

function normalizeSteelMan(steelMan: SerializableSteelMan): SteelMan {
  return {
    ...steelMan,
    writtenAt: toDate(steelMan.writtenAt),
    updatedAt: steelMan.updatedAt ? toDate(steelMan.updatedAt) : null,
    updateHistory: steelMan.updateHistory.map(normalizeSteelManVersion),
  };
}

function normalizeShapeDerivation(derivation: SerializableShapeDerivation): ShapeDerivation {
  return {
    ...derivation,
    computedAt: toDate(derivation.computedAt),
    contributingMoves: derivation.contributingMoves.map((move) => ({
      ...move,
      timestamp: toDate(move.timestamp),
    })),
  };
}

function normalizeCritiqueRating(rating: SerializableCritiqueRating): CritiqueFeedbackModel["ratings"][number] {
  return {
    ...rating,
  };
}

function normalizeCritiqueFeedback(feedback: SerializableCritiqueFeedback): CritiqueFeedbackModel {
  return {
    ...feedback,
    feedbackGivenAt: toDate(feedback.feedbackGivenAt),
    ratings: feedback.ratings.map(normalizeCritiqueRating),
  };
}

function normalizeCritiqueCorrection(correction: SerializableCritiqueCorrection): CritiqueCorrectionModel {
  return {
    ...correction,
    createdAt: toDate(correction.createdAt),
    reviewedAt: correction.reviewedAt ? toDate(correction.reviewedAt) : null,
  };
}

function normalizeCritiqueQualityProfile(profile: SerializableCritiqueQualityProfile): CritiqueQualityProfileModel {
  return {
    ...profile,
    lastUpdated: toDate(profile.lastUpdated),
  };
}

function normalizeClaimRepairAction(repairAction: SerializableClaimRepairAction): ClaimRepairAction {
  return {
    ...repairAction,
    createdAt: toDate(repairAction.createdAt),
    edgeChanges: repairAction.edgeChanges,
  };
}

function normalizeRevisitAction(action: SerializableRevisitAction | null): RevisitAction | null {
  if (!action) {
    return null;
  }

  return {
    ...action,
    completedAt: toDate(action.completedAt),
  };
}

function normalizeRevisitSchedule(schedule: SerializableRevisitSchedule): RevisitSchedule {
  return {
    ...schedule,
    scheduledFor: toDate(schedule.scheduledFor),
    surfacedAt: schedule.surfacedAt ? toDate(schedule.surfacedAt) : null,
    userAction: normalizeRevisitAction(schedule.userAction),
    snoozedUntil: schedule.snoozedUntil ? toDate(schedule.snoozedUntil) : null,
    lastComputedAt: toDate(schedule.lastComputedAt),
  };
}

function normalizeExtractedClaim(claim: SerializableExtractedClaim): ExtractedClaim {
  return {
    ...claim,
  };
}

function normalizeImportSource(importSource: SerializableImportSource): ImportSource {
  return {
    ...importSource,
    importedAt: toDate(importSource.importedAt),
    extractedClaims: importSource.extractedClaims.map(normalizeExtractedClaim),
  };
}

function normalizeVaultEntryManifest(entry: SerializableVaultEntryManifest): VaultEntryManifest {
  return {
    ...entry,
    createdAt: toDate(entry.createdAt),
    lastAccessedAt: toDate(entry.lastAccessedAt),
  };
}

function normalizeBiasEvidenceInstance(instance: SerializableBiasEvidenceInstance) {
  return {
    ...instance,
    timestamp: toDate(instance.timestamp),
  };
}

function normalizeBiasEntry(entry: SerializableBiasEntry): CognitiveBiasProfile["biasEntries"][number] {
  return {
    ...entry,
    firstDetected: toDate(entry.firstDetected),
    lastSignal: toDate(entry.lastSignal),
    evidenceInstances: entry.evidenceInstances.map(normalizeBiasEvidenceInstance),
  };
}

function normalizeBiasProfile(profile: SerializableCognitiveBiasProfile): CognitiveBiasProfile {
  return {
    ...profile,
    lastUpdated: toDate(profile.lastUpdated),
    biasEntries: profile.biasEntries.map(normalizeBiasEntry),
  };
}

function normalizeBlindSpotDomain(domain: SerializableBlindSpotDomain): BlindSpotMap["unexaminedDomains"][number] {
  return {
    ...domain,
    oldestUntestedClaim: toDate(domain.oldestUntestedClaim),
  };
}

function normalizeBlindSpotMap(blindSpotMap: SerializableBlindSpotMap): BlindSpotMap {
  return {
    ...blindSpotMap,
    computedAt: toDate(blindSpotMap.computedAt),
    unexaminedDomains: blindSpotMap.unexaminedDomains.map(normalizeBlindSpotDomain),
  };
}

function normalizeEvent(event: SerializableThoughtMapEvent): ThoughtMapEvent {
  return {
    ...event,
    payload: event.payload ?? null,
    createdAt: toDate(event.createdAt),
  };
}

function normalizeEvidenceComponent(component: SerializableEvidenceComponent): EvidenceQualityComponent {
  return {
    dimension: component.dimension,
    score: component.score,
    explanation: component.explanation,
  };
}

function normalizeEvidence(evidence: SerializableEvidence): Evidence {
  return {
    ...evidence,
    publicationDate: evidence.publicationDate ? toDate(evidence.publicationDate) : null,
    addedAt: toDate(evidence.addedAt),
    qualityComponents: evidence.qualityComponents.map(normalizeEvidenceComponent),
  };
}

function normalizeMap(map: SerializableThoughtMap): ThoughtMapModel {
  return {
    ...map,
    nodes: map.nodes.map(normalizeNode),
    events: map.events.map(normalizeEvent),
    evidence: (map.evidence ?? []).map(normalizeEvidence),
    steelMans: (map.steelMans ?? []).map(normalizeSteelMan),
    critiqueFeedbacks: (map.critiqueFeedbacks ?? []).map(normalizeCritiqueFeedback),
    critiqueCorrections: (map.critiqueCorrections ?? []).map(normalizeCritiqueCorrection),
    critiqueQualityProfile: map.critiqueQualityProfile ? normalizeCritiqueQualityProfile(map.critiqueQualityProfile) : null,
    repairActions: (map.repairActions ?? []).map(normalizeClaimRepairAction),
    revisitSchedules: (map.revisitSchedules ?? []).map(normalizeRevisitSchedule),
    shapeDerivations: (map.shapeDerivations ?? []).map(normalizeShapeDerivation),
    importSources: (map.importSources ?? []).map(normalizeImportSource),
    vaultEntries: (map.vaultEntries ?? []).map(normalizeVaultEntryManifest),
    founderBrief: map.founderBrief ? normalizeFounderBrief(map.founderBrief) : null,
    interventions: map.interventions.map(normalizeIntervention),
    recommendedIntervention: map.recommendedIntervention ? normalizeIntervention(map.recommendedIntervention) : null,
    createdAt: toDate(map.createdAt),
    updatedAt: toDate(map.updatedAt),
  };
}

function normalizeSessionEvent(event: SerializableSessionEvent): SessionEvent {
  return {
    ...event,
    timestamp: toDate(event.timestamp),
  };
}

function normalizeSession(session: SerializableThinkingSession): ThinkingSession {
  return {
    ...session,
    startedAt: toDate(session.startedAt),
    endedAt: session.endedAt ? toDate(session.endedAt) : null,
    sessionEvents: session.sessionEvents.map(normalizeSessionEvent),
    closingRitual: session.closingRitual
      ? {
          ...session.closingRitual,
          completedAt: toDate(session.closingRitual.completedAt),
        }
      : null,
    sessionSummary: session.sessionSummary
      ? {
          ...session.sessionSummary,
          generatedAt: toDate(session.sessionSummary.generatedAt),
        }
      : null,
  };
}

const ACTIONS = [
  { key: "expand", label: "Expand", icon: GitBranchPlus },
  { key: "challenge", label: "Challenge", icon: AlertCircle },
  { key: "invert", label: "Invert", icon: ArrowRightLeft },
  { key: "concretize", label: "Concrete", icon: Sparkles },
  { key: "connect", label: "Connect", icon: Link2 },
] as const;

function kindLabel(kind: ThoughtNodeKind) {
  return kind.replaceAll("_", " ");
}

function statusTone(status: ThoughtNodeModel["nodeStatus"]) {
  if (status === "weak") {
    return "border-[#b56f3a]/35 bg-[#fff6ed]";
  }

  if (status === "superseded") {
    return "border-black/6 bg-[#f4efe8] opacity-65";
  }

  return "border-black/10 bg-white";
}

function statusBadge(status: ThoughtNodeModel["nodeStatus"]) {
  if (status === "weak") {
    return "bg-[#f5d6b3] text-[#8b4d1f]";
  }

  if (status === "superseded") {
    return "bg-black/8 text-[var(--muted-ink)]";
  }

  return "bg-[#d9ead8] text-[#355b32]";
}

function countByStatus(nodes: ThoughtNodeModel[]) {
  return nodes.reduce(
    (acc, node) => {
      acc[node.nodeStatus] += 1;
      return acc;
    },
    { active: 0, weak: 0, superseded: 0 },
  );
}

function preferredGraphNodeId(map: ThoughtMapModel) {
  return (
    map.recommendedNextMove?.targetNodeId ??
    map.graphSnapshot?.weakestNodeIds[0] ??
    map.graphSnapshot?.criticalDependencyIds[0] ??
    map.nodes.find((node) => node.kind !== "root")?.id ??
    map.nodes[0]?.id ??
    null
  );
}

function formatScore(score: number | null | undefined) {
  if (score == null) {
    return "n/a";
  }

  return `${Math.round(score * 100)}`;
}

function formatPercentValue(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "n/a";
  }

  return `${Math.round(value)}%`;
}

function topNodesBy(
  nodes: ThoughtNodeModel[],
  selector: (node: ThoughtNodeModel) => number,
  predicate?: (node: ThoughtNodeModel) => boolean,
) {
  return nodes
    .filter((node) => node.kind !== "root" && (predicate ? predicate(node) : true))
    .sort((a, b) => selector(b) - selector(a))
    .slice(0, 3);
}

function labelAction(action: ThoughtNodeModel["actionOrigin"]) {
  return action?.replaceAll("_", " ") ?? "";
}

function labelBias(bias: string) {
  return bias.replaceAll("_", " ");
}

function critiqueDepthLabel(node: ThoughtNodeModel) {
  const confidence = node.scores?.confidence ?? 0;

  if (confidence >= 0.8) {
    return "heavy";
  }

  if (confidence >= 0.6) {
    return "medium";
  }

  return "light";
}

function critiqueDepthNote(node: ThoughtNodeModel) {
  const confidence = node.scores?.confidence ?? 0;

  if (confidence >= 0.8) {
    return "High confidence deserves heavier critique because motivated reasoning hides there.";
  }

  if (confidence >= 0.6) {
    return "Moderate confidence gets balanced pressure so uncertainty still has room to resolve.";
  }

  return "Low confidence already carries uncertainty, so Penny keeps the critique lighter and more targeted.";
}

function critiqueStrengthLabel(score: number | null | undefined) {
  const value = score ?? 0;

  if (value >= 0.75) {
    return {
      label: "strong",
      note: "Attacks a load-bearing structure instead of a surface detail.",
    };
  }

  if (value >= 0.5) {
    return {
      label: "moderate",
      note: "Challenges an assumption the user could potentially operationalize away.",
    };
  }

  return {
    label: "weak",
    note: "Mostly rhetorical, useful as a prompt but not yet the hardest attack.",
  };
}

function challengeSkillState(params: {
  masteryLevel: "unmeasured" | "growing" | "solid";
  responseTrail: string[];
  critiqueStrength: string;
  teachBackGap: string[];
  calibrationTrail: Array<{
    masteryLevel: "unmeasured" | "growing" | "solid";
    label: string;
    direction: "increase challenge" | "reduce challenge" | "hold steady";
    note: string;
    responseLength: number;
  }>;
}) {
  const latestCalibration = params.calibrationTrail[0] ?? null;
  const responseLength = params.responseTrail.reduce((sum, item) => sum + item.length, 0);
  const shortResponses = params.responseTrail.filter((item) => item.length < 45).length;
  const recentQuickResponses = params.responseTrail.slice(-5).filter((item) => item.length < 80).length;

  if (latestCalibration) {
    return {
      label: latestCalibration.label,
      direction: latestCalibration.direction,
      note: `${latestCalibration.note} Recent response length: ${latestCalibration.responseLength} characters.`,
    };
  }

  if (params.masteryLevel === "solid" && recentQuickResponses >= 4) {
    return {
      label: "under-challenged",
      direction: "increase challenge",
      note: "The user is handling critique quickly, so Penny can sharpen the attack a notch.",
    };
  }

  if (params.masteryLevel === "unmeasured" || params.teachBackGap.length > 0) {
    return {
      label: "scaffolded",
      direction: "keep support",
      note: "The user is still new enough here that Penny should scaffold more and keep the critique gentler.",
    };
  }

  if (shortResponses >= 3 || responseLength < 90) {
    return {
      label: "anxiety risk",
      direction: "reduce challenge",
      note: "Responses have gotten shorter, so Penny should notch difficulty down and ask one simpler question.",
    };
  }

  return {
    label: params.critiqueStrength === "strong" ? "in the flow zone" : "near the flow zone",
    direction: "hold steady",
    note: "The current challenge appears to match the user’s demonstrated skill closely enough to keep pressure honest.",
  };
}

function critiqueModeLabel(mode: CritiqueMode) {
  if (mode === "socratic") {
    return "Socratic";
  }

  if (mode === "red_team") {
    return "Red-team";
  }

  return "Direct";
}

function critiqueIntensityLabel(intensity: number) {
  if (intensity < 35) {
    return "gentle";
  }

  if (intensity < 70) {
    return "firm";
  }

  return "brutal";
}

function critiqueTypePrompt(critiqueType: CritiqueFailureType, nodeLabel: string) {
  switch (critiqueType) {
    case "weak evidence":
      return `What evidence would actually move the confidence on ${nodeLabel}?`;
    case "missing counterargument":
      return `What is the strongest counterargument to ${nodeLabel} that you have not yet written down?`;
    case "shaky assumption":
      return `Which assumption in ${nodeLabel} is carrying too much weight?`;
    case "analogy break":
      return `Where does the analogy around ${nodeLabel} stop matching reality?`;
    case "dependency risk":
      return `Which downstream dependency makes ${nodeLabel} fragile?`;
    case "unaddressed precedent":
      return `What real precedent would be uncomfortable to compare with ${nodeLabel}?`;
    case "premise rejection":
      return `If the premise behind ${nodeLabel} were false, what would collapse first?`;
    case "definition failure":
      return `Which term in ${nodeLabel} is still too vague to defend under pressure?`;
  }
}

function critiqueModePrompt(
  mode: CritiqueMode,
  critiqueType: CritiqueFailureType,
  target: string,
  intensity: number,
  biasContext?: string | null,
  steelManText?: string | null,
) {
  const intensityWord = critiqueIntensityLabel(intensity);
  const biasBridge = biasContext?.trim().length
    ? ` Bias context: ${biasContext.trim()}`
    : "";
  const steelManBridge = steelManText?.trim().length
    ? ` You already wrote a steel man: ${summarizeText(steelManText.trim(), 160)}. Penny should build from that version, name what it captured, and then push on what it still missed.`
    : "";

  if (mode === "socratic") {
    return [
      `What would have to be true for ${target} to fail?`,
      `What is the weakest part of ${target} that you have been avoiding?`,
      `If you had to kill ${target}, what would be the grounds?`,
      `${critiqueTypePrompt(critiqueType, target)} Answer this in your own words before Penny explains.${biasBridge}${steelManBridge}`,
    ].join(" ");
  }

  if (mode === "red_team") {
    return `Run a ${intensityWord} red-team session on the whole structure around ${target}. Attack the dependency chain, the precedent story, and the weakest assumption for 20-30 minutes before you let the synthesis move forward.${biasBridge}${steelManBridge}`;
  }

  return `${critiqueTypePrompt(critiqueType, target)} Penny should be ${intensityWord} about this pass and keep the failure type explicit.${biasBridge}${steelManBridge}`;
}

function critiqueVarietySuggestion(recentTypes: CritiqueFailureType[]) {
  const recent = recentTypes.slice(-5);
  const counts = recent.reduce<Record<string, number>>((acc, type) => {
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? null;

  if (!dominant) {
    return {
      dominant: null as CritiqueFailureType | null,
      next: "missing counterargument" as CritiqueFailureType,
      note: "No critique history yet. Start with a failure type that makes the claim defend itself.",
    };
  }

  const dominantType = dominant[0] as CritiqueFailureType;
  const dominantCount = dominant[1];
  const next = CRITIQUE_FAILURE_TYPES.find((type) => !recent.includes(type)) ?? CRITIQUE_FAILURE_TYPES[(CRITIQUE_FAILURE_TYPES.indexOf(dominantType) + 1) % CRITIQUE_FAILURE_TYPES.length];

  return {
    dominant: dominantType,
    next,
    note:
      dominantCount >= 4
        ? `You've been over-rotating on ${dominantType}. The next critique should force ${next} instead.`
        : `Recent critique mix: ${recent.join(", ") || "none yet"}. Penny should diversify toward ${next}.`,
  };
}

function nodeAgeDays(node: ThoughtNodeModel) {
  return Math.max(0, Math.floor((Date.now() - node.updatedAt.getTime()) / (1000 * 60 * 60 * 24)));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function structuralDensity(node: ThoughtNodeModel, childCount: number) {
  return clampPercent(childCount * 22 + (node.scores?.dependencyRisk ?? 0) * 42 + (node.scores?.centrality ?? 0) * 36);
}

function structuralSaturation(node: ThoughtNodeModel) {
  const metrics = [
    node.scores?.strength ?? 0,
    node.scores?.evidence ?? 0,
    node.scores?.specificity ?? 0,
    node.scores?.confidence ?? 0,
  ];

  return clampPercent(metrics.reduce((sum, value) => sum + value, 0) / metrics.length * 100);
}

function summarizeText(value: string, maxLength = 140) {
  const clean = value.trim().replace(/\s+/g, " ");

  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength - 1)}…`;
}

function knowledgeSurface(node: ThoughtNodeModel | null, genealogy: ReturnType<typeof buildBeliefGenealogy>) {
  if (!node) {
    return {
      understood: [] as string[],
      needsWork: [] as string[],
      masteryLevel: "unmeasured" as "unmeasured" | "growing" | "solid",
      teachBackGap: [] as string[],
      reviewPrompt: "Select a node to see what Penny thinks you already know and what still needs teach-back.",
    };
  }

  const understood = [
    node.scores?.evidence != null && node.scores.evidence >= 0.65 ? "evidence collection" : null,
    node.scores?.specificity != null && node.scores.specificity >= 0.65 ? "claim specificity" : null,
    node.scores?.testability != null && node.scores.testability >= 0.6 ? "test design" : null,
    genealogy.contradictions.length > 0 ? "counterargument handling" : null,
    genealogy.dependents.length > 0 ? "dependency tracing" : null,
    (node.psychology?.falsificationCoverageScore ?? 0) >= 0.65 ? "falsification" : null,
  ].filter((value): value is string => value != null);

  const needsWork = [
    node.scores?.evidence != null && node.scores.evidence < 0.65 ? "evidence collection" : null,
    node.scores?.specificity != null && node.scores.specificity < 0.65 ? "claim specificity" : null,
    node.scores?.testability != null && node.scores.testability < 0.6 ? "test design" : null,
    node.scores?.dependencyRisk != null && node.scores.dependencyRisk > 0.55 ? "dependency reasoning" : null,
    genealogy.contradictions.length === 0 ? "counterargument handling" : null,
    (node.psychology?.comparisonCoverageScore ?? 1) < 0.6 ? "comparison set quality" : null,
    (node.psychology?.falsificationCoverageScore ?? 1) < 0.6 ? "falsification" : null,
  ].filter((value): value is string => value != null);

  const uniqueUnderstood = Array.from(new Set(understood));
  const uniqueNeedsWork = Array.from(new Set(needsWork));
  const teachBackGap = uniqueNeedsWork.slice(0, 3);
  const masteryLevel: "unmeasured" | "growing" | "solid" =
    uniqueUnderstood.length >= 4 && uniqueNeedsWork.length <= 1
      ? "solid"
      : uniqueUnderstood.length >= 2
        ? "growing"
        : "unmeasured";

  return {
    understood: uniqueUnderstood,
    needsWork: uniqueNeedsWork,
    masteryLevel,
    teachBackGap,
    reviewPrompt:
      uniqueNeedsWork.length > 0
        ? `Teach-back gap: ${uniqueNeedsWork.slice(0, 2).join(" and ")} need another pass in this claim’s context.`
        : "Teach-back gap: none obvious. Explain the concept back at the same level of difficulty to prove it stays solid.",
  };
}

type TeachBackTone = "correct" | "needs-work" | "missing";

type TeachBackAnnotation = {
  phrase: string;
  note: string;
  tone: TeachBackTone;
};

type TeachBackAnalysis = {
  concept: string;
  scaffold: string;
  correction: string;
  whyItMatters: string;
  restatementPrompt: string;
  summary: string;
  annotations: TeachBackAnnotation[];
  responseStatus: "empty" | "partial" | "aligned";
  responseLength: number;
};

function teachBackFocusForNode(
  node: ThoughtNodeModel | null,
  surface: ReturnType<typeof knowledgeSurface>,
): {
  concept: string;
  scaffold: string;
  correction: string;
  whyItMatters: string;
  restatementPrompt: string;
  annotations: TeachBackAnnotation[];
} {
  const content = node?.content ?? "";

  if (/network effects|direct|indirect/i.test(content)) {
    return {
      concept: "direct vs indirect network effects",
      scaffold: "Direct network effects require users interacting with each other; indirect network effects come from complements or adjacent users.",
      correction:
        "You were tracking the direction of value correctly, but your wording fits indirect network effects better than direct ones. Direct effects need user-to-user interaction, so the competitive dynamics are different.",
      whyItMatters:
        "That changes the moat story: direct effects ask for interaction density, while indirect effects ask for two-sided or complementary adoption.",
      restatementPrompt: "Now restate the network effects in this claim using the correction: is this direct, indirect, or neither?",
      annotations: [
        {
          phrase: "more users",
          note: "This usually points to indirect network effects or complement-driven value, not necessarily direct interaction.",
          tone: "needs-work",
        },
        {
          phrase: "users interact with each other",
          note: "This is the direct-network-effects test: value rises because users directly create value for one another.",
          tone: "correct",
        },
        {
          phrase: "critical mass",
          note: "This is the consequence, not the definition. Direct and indirect effects reach it differently.",
          tone: "needs-work",
        },
      ],
    };
  }

  const focus = surface.teachBackGap[0] ?? "the core concept";

  return {
    concept: focus,
    scaffold: `Define ${focus}, connect it to the claim, and name one thing that would make the claim stronger or weaker.`,
    correction:
      `You had part of ${focus} right, but the explanation needs one tighter claim-specific link before it becomes durable.`,
    whyItMatters:
      "The correction matters because the user should be able to use the concept on this exact claim, not only in the abstract.",
    restatementPrompt: `Now restate ${focus} in the context of this claim, with the correction integrated.`,
    annotations: [
      {
        phrase: focus,
        note: "This is the concept Penny wants you to anchor in the current claim.",
        tone: "needs-work",
      },
    ],
  };
}

function analyzeTeachBackResponse(response: string, focus: ReturnType<typeof teachBackFocusForNode>) {
  const clean = response.trim();
  const responseLength = clean.length;

  if (!clean) {
    return {
      concept: focus.concept,
      scaffold: focus.scaffold,
      responseStatus: "empty" as const,
      summary: "Write your explanation in the same surface. Penny will annotate the specific gap once it can see your wording.",
      correction: focus.correction,
      whyItMatters: focus.whyItMatters,
      restatementPrompt: focus.restatementPrompt,
      annotations: focus.annotations,
      responseLength,
    };
  }

  const hasDirectLanguage = /direct/i.test(clean);
  const hasInteractionLanguage = /(interact|interaction|user-to-user)/i.test(clean);
  const hasIndirectLanguage = /(indirect|complement|complementary|adjacent users)/i.test(clean);
  const hasValueShiftLanguage = /(more users|more value|value rises|network effect|critical mass)/i.test(clean);
  const directMismatch = hasValueShiftLanguage && !hasInteractionLanguage && !hasDirectLanguage;
  const restatementAligned = hasDirectLanguage && hasInteractionLanguage && hasIndirectLanguage;

  const annotations: TeachBackAnnotation[] = [...focus.annotations];

  if (hasValueShiftLanguage) {
    annotations.unshift({
      phrase: clean.match(/[^.?!]*(more users[^.?!]*)/i)?.[1]?.trim() ?? "more users create more value",
      note: "This phrase describes value increasing with adoption. That is closer to indirect effects unless the users themselves are directly interacting.",
      tone: (directMismatch ? "needs-work" : "correct") as TeachBackTone,
    });
  }

  if (hasInteractionLanguage) {
    annotations.push({
      phrase: clean.match(/[^.?!]*(interaction[^.?!]*)/i)?.[1]?.trim() ?? "user-to-user interaction",
      note: "This is the direct-network-effects criterion Penny is looking for.",
      tone: "correct",
    });
  }

  if (directMismatch) {
    return {
      concept: focus.concept,
      scaffold: focus.scaffold,
      responseStatus: "partial" as const,
      summary: "You described the value increasing with more users, but you have not yet pinned down the direct-interaction part that makes it direct network effects.",
      correction: focus.correction,
      whyItMatters: focus.whyItMatters,
      restatementPrompt: focus.restatementPrompt,
      annotations,
      responseLength,
    };
  }

  if (restatementAligned || responseLength >= 90) {
    return {
      concept: focus.concept,
      scaffold: focus.scaffold,
      responseStatus: "aligned" as const,
      summary: "The explanation now separates interaction from adoption and ties the concept back to the claim.",
      correction: "Keep the distinction explicit so you can tell direct and indirect effects apart the next time the claim changes.",
      whyItMatters: focus.whyItMatters,
      restatementPrompt: "Try the same explanation one more time with a concrete example from your own claim.",
      annotations,
      responseLength,
    };
  }

  return {
    concept: focus.concept,
    scaffold: focus.scaffold,
    responseStatus: "partial" as const,
    summary: "You have part of it, but the explanation still needs the claim-specific distinction Penny asked for.",
    correction: focus.correction,
    whyItMatters: focus.whyItMatters,
    restatementPrompt: focus.restatementPrompt,
    annotations,
    responseLength,
  };
}

function highlightTeachBackResponse(response: string, annotations: TeachBackAnnotation[]) {
  if (!response.trim()) {
    return [<span key="empty" className="text-[var(--muted-ink)]">Your explanation will appear here once you write it.</span>];
  }

  const sorted = [...annotations]
    .filter((annotation) => annotation.phrase.trim().length > 0)
    .sort((a, b) => b.phrase.length - a.phrase.length);

  if (!sorted.length) {
    return [response];
  }

  const used = new Set<string>();
  const parts: ReactNode[] = [];
  let remaining = response;
  let cursor = 0;

  while (remaining.length > 0) {
    let match: TeachBackAnnotation | null = null;
    let matchIndex = -1;

    for (const annotation of sorted) {
      if (used.has(annotation.phrase)) {
        continue;
      }

      const index = remaining.toLowerCase().indexOf(annotation.phrase.toLowerCase());
      if (index !== -1 && (matchIndex === -1 || index < matchIndex)) {
        match = annotation;
        matchIndex = index;
      }
    }

    if (!match || matchIndex === -1) {
      parts.push(
        <span key={`teachback-${cursor}-${remaining.slice(0, 24)}`}>
          {remaining}
        </span>,
      );
      break;
    }

    if (matchIndex > 0) {
      const before = remaining.slice(0, matchIndex);
      parts.push(<span key={`teachback-before-${cursor}-${before.slice(0, 24)}`}>{before}</span>);
      cursor += before.length;
    }

    const phrase = remaining.slice(matchIndex, matchIndex + match.phrase.length);
    parts.push(
      <span
        key={`teachback-hit-${cursor}-${phrase.slice(0, 24)}`}
        className={cn(
          "rounded-md px-1.5 py-0.5 ring-1",
          match.tone === "correct"
            ? "bg-[#d9ead8] text-[#355b32] ring-[#9fc09a]"
            : match.tone === "needs-work"
              ? "bg-[#fff6ed] text-[#8b4d1f] ring-[#d7b07c]"
              : "bg-[var(--panel)] text-[var(--ink)] ring-black/10",
        )}
        title={match.note}
      >
        {phrase}
      </span>,
    );
    used.add(match.phrase);
    cursor += phrase.length;
    remaining = remaining.slice(matchIndex + match.phrase.length);
  }

  return parts;
}

function shapeMetacognition(shape: PennyShape | null) {
  if (!shape) {
    return null;
  }

  const pattern = shape.label;
  const research =
    shape.kind === "domain"
      ? "Domain shapes are derived from repeated critique and calibration signals."
      : "Cognitive shapes are derived from recurring self-protection, repetition, and revision patterns.";
  const response =
    shape.verdict === "confirmed"
      ? "Keep using this pattern as an active lens."
      : shape.verdict === "provisional"
        ? "Use it cautiously and keep testing for corroboration."
        : shape.verdict === "rejected"
          ? "Push back on the pattern when it appears again."
          : "Refine the pattern with more evidence and better counterexamples.";

  return { pattern, research, response };
}

export function ThoughtMapWorkspace({
  initialMap,
  initialView = "outline",
  initialFragments = [],
  availableMaps = [],
}: {
  initialMap: SerializableThoughtMap;
  initialView?: MapView;
  initialFragments?: MarginFragmentModel[];
  availableMaps?: SessionMapOption[];
}) {
  const [map, setMap] = useState(() => normalizeMap(initialMap));
  const [activeSession, setActiveSession] = useState<ThinkingSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionStartVisible, setSessionStartVisible] = useState(false);
  const [sessionCloseVisible, setSessionCloseVisible] = useState(false);
  const [sessionTimeWarningDismissed, setSessionTimeWarningDismissed] = useState(false);
  const [sessionNow, setSessionNow] = useState(() => new Date());
  const [biasProfile, setBiasProfile] = useState<CognitiveBiasProfile | null>(null);
  const [biasProfileLoading, setBiasProfileLoading] = useState(false);
  const [biasProfileRefreshing, setBiasProfileRefreshing] = useState(false);
  const [blindSpotMap, setBlindSpotMap] = useState<BlindSpotMap | null>(null);
  const [blindSpotMapLoading, setBlindSpotMapLoading] = useState(false);
  const [blindSpotMapRefreshing, setBlindSpotMapRefreshing] = useState(false);
  const [view, setView] = useState<MapView>(initialView);
  const [lastAction, setLastAction] = useState<ActionResponse | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(() =>
    preferredGraphNodeId(normalizeMap(initialMap)),
  );
  const [dependencyHealthClaimId, setDependencyHealthClaimId] = useState<string | null>(null);
  const [peerAudience, setPeerAudience] = useState<PeerAudience>("skeptical investor");
  const [specificAudienceName, setSpecificAudienceName] = useState("your board next Tuesday");
  const [specificAudienceContext, setSpecificAudienceContext] = useState(
    "They already know the history and will push on downside, timing, and what happens if this claim is wrong.",
  );
  const [advisorReviewerName, setAdvisorReviewerName] = useState("advisor");
  const [advisorReviewDraft, setAdvisorReviewDraft] = useState("");
  const [advisorReviewNotes, setAdvisorReviewNotes] = useState<string[]>([]);
  const [selectedPrecedentId, setSelectedPrecedentId] = useState<string | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [steelManDrafts, setSteelManDrafts] = useState<Record<string, string>>({});
  const [steelManAssessments, setSteelManAssessments] = useState<Record<string, SteelManQualityAssessment>>({});
  const [steelManGateBypassed, setSteelManGateBypassed] = useState<Record<string, boolean>>({});
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [evidenceEntryOpenClaimId, setEvidenceEntryOpenClaimId] = useState<string | null>(null);
  const [resolutionFlowOpen, setResolutionFlowOpen] = useState(false);
  const [revisitTriggerDrafts, setRevisitTriggerDrafts] = useState<
    Record<
      string,
      {
        triggerType: TriggerDefinition["triggerType"];
        dateTarget: string;
        eventKeyword: string;
        confidenceThreshold: string;
        dependencyClaimId: string;
      }
    >
  >({});
  const [teachBackDrafts, setTeachBackDrafts] = useState<Record<string, string>>({});
  const [teachBackFeedback, setTeachBackFeedback] = useState<Record<string, TeachBackAnalysis>>({});
  const [teachBackAttempts, setTeachBackAttempts] = useState<Record<string, string[]>>({});
  const [elicitationMode, setElicitationMode] = useState<ElicitationMode>("devils advocate");
  const [critiqueMode, setCritiqueMode] = useState<CritiqueMode>("direct");
  const [critiqueIntensity, setCritiqueIntensity] = useState(62);
  const [selectedCritiqueType, setSelectedCritiqueType] = useState<CritiqueFailureType>("weak evidence");
  const [openedCritiqueFeedbackRoundIds, setOpenedCritiqueFeedbackRoundIds] = useState<Record<string, boolean>>({});
  const [hiddenCritiqueFeedbackRoundIds, setHiddenCritiqueFeedbackRoundIds] = useState<Record<string, boolean>>({});
  const [shapeFeedback, setShapeFeedback] = useState<Record<string, PennyShapeFeedback>>(() =>
    collectShapeFeedback(normalizeMap(initialMap).events),
  );
  const [shapeFalsificationDrafts, setShapeFalsificationDrafts] = useState<Record<string, string>>({});
  const [shapeOverrideReasons, setShapeOverrideReasons] = useState<Record<string, string>>({});
  const [confidenceOverrideReasons, setConfidenceOverrideReasons] = useState<Record<string, string>>({});
  const [propagationFinalPosteriorDrafts, setPropagationFinalPosteriorDrafts] = useState<Record<string, number>>({});
  const [critiqueCorrectionDrafts, setCritiqueCorrectionDrafts] = useState<Record<string, string>>({});
  const [propagationAcknowledged, setPropagationAcknowledged] = useState<Record<string, string>>({});
  const [dialecticResponseDrafts, setDialecticResponseDrafts] = useState<Record<string, string>>({});
  const [dialecticRoundContextDrafts, setDialecticRoundContextDrafts] = useState<
    Record<
      string,
      {
        confidenceAtRoundEnd: number;
        concessionNote: string;
        connectedClaimsChanged: boolean | null;
        connectedClaimsNote: string;
        newEvidenceNote: string;
      }
    >
  >({});
  const [runningRecommendedMove, setRunningRecommendedMove] = useState(false);
  const [runningFounderBrief, setRunningFounderBrief] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [vaultDraft, setVaultDraft] = useState<VaultDraft | null>(null);
  const [founderBriefError, setFounderBriefError] = useState<string | null>(null);
  const [metaCognitionEventsSeen, setMetaCognitionEventsSeen] = useState<Record<string, boolean>>({});
  const [learningPrompt, setLearningPrompt] = useState<LearningPromptOutput | null>(null);
  const [learningPromptRoundId, setLearningPromptRoundId] = useState<string | null>(null);
  const [learningPromptDismissed, setLearningPromptDismissed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const lastOpenedClaimIdRef = useRef<string | null>(null);

  useEffect(() => {
    setLearningPrompt(null);
    setLearningPromptRoundId(null);
    setLearningPromptDismissed(false);
  }, [map.id]);

  const nodesByParent = useMemo(() => {
    return map.nodes.reduce<Record<string, ThoughtNodeModel[]>>((acc, node) => {
      const key = node.parentId ?? "root";
      acc[key] ??= [];
      acc[key].push(node);
      acc[key].sort((a, b) => a.branchOrder - b.branchOrder || a.createdAt.getTime() - b.createdAt.getTime());
      return acc;
    }, {});
  }, [map.nodes]);

  const rootNode = map.nodes.find((node) => node.kind === "root");
  const statusCounts = countByStatus(map.nodes);
  const nodesById = useMemo(() => new Map(map.nodes.map((node) => [node.id, node])), [map.nodes]);
  const lens = useMemo(() => buildPennyLens(map), [map]);
  const localBiasProfile = useMemo(() => buildCognitiveBiasProfile([map], map.userId), [map]);
  const displayedBiasProfile = biasProfile ?? localBiasProfile;
  const derivedShapes = useMemo(
    () => [...lens.effectiveShapes].sort((a, b) => b.confidence - a.confidence),
    [lens],
  );
  const selectedShape = useMemo(
    () => derivedShapes.find((shape) => shape.id === selectedShapeId) ?? derivedShapes[0] ?? null,
    [derivedShapes, selectedShapeId],
  );
  const selectedShapeFeedback = selectedShape ? shapeFeedback[selectedShape.id] ?? null : null;
  const selectedShapeFalsificationDraft = selectedShape
    ? shapeFalsificationDrafts[selectedShape.id] ?? selectedShape.falsificationCondition ?? ""
    : "";
  useEffect(() => {
    if (!selectedShapeId || !derivedShapes.some((shape) => shape.id === selectedShapeId)) {
      setSelectedShapeId(derivedShapes[0]?.id ?? null);
    }
  }, [derivedShapes, selectedShapeId]);
  const defaultGraphNodeId = preferredGraphNodeId(map);
  const activeNodes = map.nodes.filter((node) => node.nodeStatus !== "superseded");
  const unresolvedGaps = [
    ...(map.graphSnapshot?.weakestNodeIds.length
      ? [`${map.graphSnapshot.weakestNodeIds.length} weak ${map.graphSnapshot.weakestNodeIds.length === 1 ? "branch" : "branches"}`]
      : []),
    ...(map.graphSnapshot?.criticalDependencyIds.length
      ? [
          `${map.graphSnapshot.criticalDependencyIds.length} critical ${map.graphSnapshot.criticalDependencyIds.length === 1 ? "dependency" : "dependencies"}`,
        ]
      : []),
    ...map.founderBriefReadiness.missingRequirements.map((requirement) => `missing ${requirement.replaceAll("_", " ")}`),
    ...(map.founderBriefReadiness.evidenceGateMessage ? [map.founderBriefReadiness.evidenceGateMessage] : []),
  ];
  const weakEvidenceNodes = topNodesBy(
    activeNodes,
    (node) => 1 - (node.scores?.evidence ?? 0),
    (node) => (node.scores?.evidence ?? 1) < 0.55,
  );
  const contradictionNodes = topNodesBy(
    activeNodes,
    (node) =>
      Math.max(
        1 - (node.psychology?.falsificationCoverageScore ?? 1),
        node.psychology?.likelyBiases.includes("confirmation_bias") ? 0.95 : 0,
      ),
    (node) =>
      (node.psychology?.falsificationCoverageScore ?? 1) < 0.55 ||
      node.psychology?.likelyBiases.includes("confirmation_bias") === true,
  );
  const riskyDependencyNodes = topNodesBy(
    activeNodes,
    (node) => node.scores?.dependencyRisk ?? 0,
    (node) => (node.scores?.dependencyRisk ?? 0) > 0.55,
  );
  const missingComparisonNodes = topNodesBy(
    activeNodes,
    (node) =>
      Math.max(
        1 - (node.psychology?.comparisonCoverageScore ?? 1),
        node.psychology?.likelyBiases.includes("option_overload") ? 0.9 : 0,
      ),
    (node) =>
      (node.psychology?.comparisonCoverageScore ?? 1) < 0.55 ||
      node.psychology?.likelyBiases.includes("option_overload") === true,
  );
  const stressTestPasses = [
    {
      title: "Weak evidence",
      description: "Branches that still lack enough real support.",
      empty: "No obvious evidence gaps are dominating the map right now.",
      nodes: weakEvidenceNodes,
      metric: (node: ThoughtNodeModel) => `evidence ${formatScore(node.scores?.evidence ?? null)}`,
    },
    {
      title: "Contradictions",
      description: "Claims that still need stronger falsification or counterweight.",
      empty: "No major contradiction pressure is leading the map right now.",
      nodes: contradictionNodes,
      metric: (node: ThoughtNodeModel) =>
        node.psychology?.likelyBiases.includes("confirmation_bias")
          ? "confirmation bias risk"
          : `falsification ${formatScore(node.psychology?.falsificationCoverageScore ?? null)}`,
    },
    {
      title: "Risky dependencies",
      description: "Important branches that can break the map if they are wrong.",
      empty: "No dependency-risk hotspot is standing out yet.",
      nodes: riskyDependencyNodes,
      metric: (node: ThoughtNodeModel) => `dependency ${formatScore(node.scores?.dependencyRisk ?? null)}`,
    },
    {
      title: "Missing comparisons",
      description: "Places where the map still needs contrast, ranking, or alternatives.",
      empty: "Comparison coverage looks healthy in the current map slice.",
      nodes: missingComparisonNodes,
      metric: (node: ThoughtNodeModel) =>
        node.psychology?.likelyBiases.includes("option_overload")
          ? "option overload risk"
          : `comparison ${formatScore(node.psychology?.comparisonCoverageScore ?? null)}`,
    },
  ];
  const frameworkCritiques = [
    {
      label: "Game theory",
      focus: "How incentives change when the user, buyer, or rival can react strategically.",
      empty: "No strategic incentive mismatch is showing up as dominant.",
      nodes: topNodesBy(
        activeNodes,
        (node) => Math.max(node.scores?.dependencyRisk ?? 0, node.scores?.centrality ?? 0),
        (node) => (node.scores?.dependencyRisk ?? 0) > 0.5 || (node.scores?.centrality ?? 0) > 0.45,
      ),
    },
    {
      label: "Network effects",
      focus: "Where adoption loops, social reinforcement, or multi-sided pressure matter.",
      empty: "No obvious network-effect dependency is leading the map.",
      nodes: topNodesBy(
        activeNodes,
        (node) => Math.max(node.scores?.coverage ?? 0, node.scores?.centrality ?? 0),
        (node) => (node.scores?.coverage ?? 0) > 0.45 || (node.scores?.centrality ?? 0) > 0.5,
      ),
    },
    {
      label: "Operational",
      focus: "What breaks in the process, handoff, or day-to-day execution path.",
      empty: "No process bottleneck is standing out as the main failure point.",
      nodes: topNodesBy(
        activeNodes,
        (node) => Math.max(1 - (node.scores?.testability ?? 1), node.scores?.dependencyRisk ?? 0),
        (node) => (node.scores?.testability ?? 1) < 0.55 || (node.scores?.dependencyRisk ?? 0) > 0.55,
      ),
    },
    {
      label: "Psychological",
      focus: "What bias, self-deception, or motivation trap could distort the claim.",
      empty: "No obvious psychological trap is dominating the current slice.",
      nodes: topNodesBy(
        activeNodes,
        (node) => Math.max(node.psychology?.ambiguityScore ?? 0, node.scores?.confidence ? 1 - node.scores.confidence : 0),
        (node) => (node.psychology?.ambiguityScore ?? 0) > 0.45,
      ),
    },
    {
      label: "Political",
      focus: "Who gains, who resists, and where coalition or status pressure could block the idea.",
      empty: "No explicit power or coalition tension is leading the map.",
      nodes: topNodesBy(
        activeNodes,
        (node) => Math.max(node.scores?.centrality ?? 0, node.scores?.dependencyRisk ?? 0),
        (node) => (node.scores?.centrality ?? 0) > 0.5 && (node.scores?.dependencyRisk ?? 0) > 0.4,
      ),
    },
    {
      label: "Historical",
      focus: "What precedent says this structure usually collapses into or survives as.",
      empty: "No obvious precedent gap is dominating the map right now.",
      nodes: topNodesBy(
        activeNodes,
        (node) => Math.max(node.scores?.novelty ?? 0, 1 - (node.psychology?.falsificationCoverageScore ?? 1)),
        (node) => (node.scores?.novelty ?? 0) > 0.45 || (node.psychology?.falsificationCoverageScore ?? 1) < 0.55,
      ),
    },
  ];
  const namedVoices = [
    {
      label: "Skeptical investor",
      attack: "What has to be true for this to return outsized value, and where is the hidden burn?",
      attackStyle: "Looks for leverage, downside asymmetry, and the first broken business assumption.",
    },
    {
      label: "Thesis committee",
      attack: "What is the exact claim, what is the counterclaim, and where is the evidence chain weak?",
      attackStyle: "Presses for method, scope control, and defensible structure.",
    },
    {
      label: "Skeptical academic",
      attack: "What would a rigorous reviewer say is under-defined, unsupported, or non-generalizable?",
      attackStyle: "Challenges causality, definitions, and hidden leaps.",
    },
    {
      label: "GTM operator",
      attack: "What changes in the field, the customer workflow, or the sale if this is actually true?",
      attackStyle: "Tests distribution, adoption friction, and operational reality.",
    },
  ];
  const loadBearingAssumption = map.graphSnapshot?.criticalDependencyIds
    .map((nodeId) => nodesById.get(nodeId) ?? null)
    .find((node): node is ThoughtNodeModel => node != null) ?? null;
  const challengedActions = Array.from(
    new Set(
      map.nodes
        .map((node) => node.actionOrigin)
        .filter((action): action is NonNullable<ThoughtNodeModel["actionOrigin"]> => action != null),
    ),
  );
  const activeBiasDetectors = Array.from(new Set(map.interventions.map((intervention) => intervention.detector)));
  const weakestLearningNode =
    (map.graphSnapshot?.weakestNodeIds ?? [])
      .map((nodeId) => nodesById.get(nodeId) ?? null)
      .find((node): node is ThoughtNodeModel => node != null) ?? null;
  const missingLearningKinds = map.graphSnapshot?.missingNodeTypes.slice(0, 3) ?? [];
  const learningPrompts = [
    ...(weakestLearningNode
      ? [
          {
            label: "Learn next",
            title: `Understand why this ${kindLabel(weakestLearningNode.kind)} is still weak.`,
            body: weakestLearningNode.content,
            helper:
              weakestLearningNode.note ??
              "Study what evidence, specificity, or counterweight would make this branch hold up under pressure.",
          },
        ]
      : []),
    ...(missingLearningKinds.length
      ? [
          {
            label: "Fill the gap",
            title: `Add missing ${missingLearningKinds.map(kindLabel).join(", ")} coverage.`,
            body: "The map still lacks enough contrast across the key branch types Penny uses to judge quality.",
            helper: "Learning here means adding the missing branch type, not just reading more broadly.",
          },
        ]
      : []),
    ...(map.recommendedNextMove
      ? [
          {
            label: "Validate next",
            title: map.recommendedNextMove.headline,
            body: map.recommendedNextMove.targetNodeContent,
            helper: map.recommendedNextMove.explanation,
          },
        ]
      : []),
  ];
  const learningLoopSteps = [
    "Capture the rough note.",
    "Stress-test the weak branch.",
    "Learn what the weakest gap is actually asking for.",
    "Turn that learning into the next validation move.",
  ];
  const validationPreview = map.founderBrief?.nextValidationSteps.slice(0, 2) ?? [];
  const claimDependencyGraph = useMemo(() => buildClaimDependencyGraph(map), [map]);
  const founderBriefDependencyPreview = useMemo(() => {
    if (claimDependencyGraph.loadBearingNodeIds.length === 0) {
      return null;
    }

    return buildArtifactDependencyHealth(
      map,
      claimDependencyGraph.loadBearingNodeIds.slice(0, 5),
      `founder_brief:${map.id}:preview`,
    );
  }, [claimDependencyGraph.loadBearingNodeIds, map]);
  const graphCanvas = useMemo(() => {
    const sortedNodes = [...map.nodes].sort(
      (a, b) => a.branchOrder - b.branchOrder || a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const depthById = new Map<string, number>();
    const positionedColumns: ThoughtNodeModel[][] = [];
    const seen = new Set<string>();

    function placeNode(node: ThoughtNodeModel, depth: number) {
      if (seen.has(node.id)) {
        return;
      }

      seen.add(node.id);
      depthById.set(node.id, depth);
      positionedColumns[depth] ??= [];
      positionedColumns[depth].push(node);

      for (const child of nodesByParent[node.id] ?? []) {
        placeNode(child, depth + 1);
      }
    }

    if (rootNode) {
      placeNode(rootNode, 0);
    }

    for (const node of sortedNodes) {
      if (seen.has(node.id)) {
        continue;
      }

      const parentDepth = node.parentId ? depthById.get(node.parentId) ?? 0 : 0;
      placeNode(node, node.parentId ? parentDepth + 1 : 0);
    }

    const columns = positionedColumns.filter(Boolean);
    const maxRows = Math.max(...columns.map((column) => column.length), 1);
    const weakestNodeIds = new Set(map.graphSnapshot?.weakestNodeIds ?? []);
    const criticalDependencyIds = new Set(map.graphSnapshot?.criticalDependencyIds ?? []);
    const positions = new Map<string, { x: number; y: number; depth: number }>();

    columns.forEach((column, depth) => {
      const offset = ((maxRows - column.length) * GRAPH_ROW_GAP) / 2;

      column.forEach((node, index) => {
        positions.set(node.id, {
          depth,
          x: GRAPH_PADDING_X + depth * GRAPH_COLUMN_GAP,
          y: GRAPH_PADDING_Y + offset + index * GRAPH_ROW_GAP,
        });
      });
    });

    const maxDepth = Math.max(columns.length - 1, 0);
    const width = Math.max(720, GRAPH_PADDING_X * 2 + maxDepth * GRAPH_COLUMN_GAP + GRAPH_NODE_WIDTH);
    const height = Math.max(400, GRAPH_PADDING_Y * 2 + (maxRows - 1) * GRAPH_ROW_GAP + GRAPH_NODE_HEIGHT);
    const nodes: PositionedGraphNode[] = sortedNodes.flatMap((node) => {
      const position = positions.get(node.id);

      if (!position) {
        return [];
      }

      const childCount = (nodesByParent[node.id] ?? []).length;
      const ageDays = nodeAgeDays(node);

      return [
        {
          node,
          depth: position.depth,
          x: position.x,
          y: position.y,
          isWeak: weakestNodeIds.has(node.id),
          isCritical: criticalDependencyIds.has(node.id),
          childCount,
          ageDays,
          densityScore: structuralDensity(node, childCount),
          saturationScore: structuralSaturation(node),
        },
      ];
    });
    const edges: PositionedGraphEdge[] = claimDependencyGraph.edges
      .map((edge) => {
        const from = positions.get(edge.fromNodeId);
        const to = positions.get(edge.toNodeId);

        if (!from || !to) {
          return null;
        }

        return {
          id: `${edge.fromNodeId}-${edge.toNodeId}`,
          parentId: edge.fromNodeId,
          childId: edge.toNodeId,
          from,
          to,
          isWeak: weakestNodeIds.has(edge.toNodeId),
          isCritical: criticalDependencyIds.has(edge.toNodeId),
          strengthScore: edge.strengthScore,
          contradictionScore: edge.contradictionScore,
          recencyDays: edge.recencyDays,
        };
      })
      .filter((edge): edge is PositionedGraphEdge => edge != null);

    return {
      width,
      height,
      nodes,
      edges,
    };
  }, [claimDependencyGraph, map.graphSnapshot, map.nodes, nodesByParent, rootNode]);

  useEffect(() => {
    if (!selectedGraphNodeId || !nodesById.has(selectedGraphNodeId)) {
      setSelectedGraphNodeId(defaultGraphNodeId);
    }
  }, [defaultGraphNodeId, nodesById, selectedGraphNodeId]);

  const selectedGraphNode =
    graphCanvas.nodes.find((candidate) => candidate.node.id === selectedGraphNodeId) ?? null;
  const selectedGraphNodeModel = selectedGraphNode?.node ?? null;
  useEffect(() => {
    setDependencyHealthClaimId(null);
  }, [selectedGraphNodeId]);

  const activeShapeCallout = useMemo(
    () => findActiveShapeCallout(selectedGraphNodeModel, derivedShapes, lens),
    [derivedShapes, lens, selectedGraphNodeModel],
  );
  const activeShapeTeaching = useMemo(() => shapeMetacognition(activeShapeCallout), [activeShapeCallout]);
  const activeShapeReasoning = activeShapeCallout ? (shapeOverrideReasons[activeShapeCallout.id] ?? "").trim() : "";
  const selectedGenealogy = useMemo(
    () => buildBeliefGenealogy(map.nodes, selectedGraphNode?.node.id ?? defaultGraphNodeId ?? rootNode?.id ?? ""),
    [defaultGraphNodeId, map.nodes, rootNode?.id, selectedGraphNode?.node.id],
  );
  const selectedArchaeologyAxiom = selectedGenealogy.lineage[0] ?? null;
  const selectedPropagation = useMemo(
    () => buildBayesianPropagationSnapshot(map, selectedGraphNode?.node.id ?? defaultGraphNodeId ?? rootNode?.id ?? ""),
    [defaultGraphNodeId, map, rootNode?.id, selectedGraphNode?.node.id],
  );
  const selectedPropagationImplication = useMemo(() => {
    if (!selectedPropagation) {
      return null;
    }

    const strongestStep =
      [...selectedPropagation.cascade]
        .filter((step) => step.delta !== 0)
        .sort(
          (a, b) =>
            Math.abs(b.delta) - Math.abs(a.delta) ||
            Number(b.propagatedConfidence < b.baseConfidence) - Number(a.propagatedConfidence < a.baseConfidence),
        )[0] ?? selectedPropagation.cascade[0] ?? null;

    if (!strongestStep) {
      return null;
    }

    const sourceNode = nodesById.get(strongestStep.sourceNodeId) ?? null;
    const targetNode = nodesById.get(strongestStep.targetNodeId) ?? null;
    const confidenceMath = `${formatScore(strongestStep.sourceConfidence)}% × ${Math.round(strongestStep.edgeFactor * 100)}% = ${formatScore(
      strongestStep.propagatedConfidence,
    )}%`;

    return {
      sourceNodeId: strongestStep.sourceNodeId,
      targetNodeId: strongestStep.targetNodeId,
      sourceLabel: sourceNode?.content ?? strongestStep.pathLabel.split(" → ")[0] ?? "source claim",
      targetLabel: targetNode?.content ?? strongestStep.pathLabel.split(" → ")[1] ?? "downstream claim",
      beforeConfidence: strongestStep.baseConfidence,
      afterConfidence: strongestStep.propagatedConfidence,
      delta: strongestStep.delta,
      reasoning: strongestStep.reasoning,
      confidenceMath,
      dependencyWeight: strongestStep.edgeFactor,
      prior: strongestStep.prior ?? strongestStep.baseConfidence,
      posterior: strongestStep.posterior ?? strongestStep.propagatedConfidence,
      contributions: strongestStep.contributions ?? [],
      skipped: strongestStep.skipped ?? false,
      skippedReason: strongestStep.skippedReason ?? null,
    };
  }, [nodesById, selectedPropagation]);
  const selectedKnowledgeSurface = useMemo(
    () => knowledgeSurface(selectedGraphNode?.node ?? null, selectedGenealogy),
    [selectedGenealogy, selectedGraphNode?.node],
  );
  const selectedClaimStructure = useMemo<ClaimStructureSnapshot>(
    () => buildClaimStructureSnapshot(map, selectedGraphNode?.node ?? null),
    [map, selectedGraphNode?.node],
  );
  const selectedMetaCognitionPrompt = useMemo(
    () =>
      evaluateMetaCognitionTrigger({
        map,
        node: selectedGraphNode?.node ?? null,
        shapes: derivedShapes,
      }),
    [derivedShapes, map, selectedGraphNode?.node],
  );
  useEffect(() => {
    if (!selectedMetaCognitionPrompt || metaCognitionEventsSeen[selectedMetaCognitionPrompt.id]) {
      return;
    }

    setMetaCognitionEventsSeen((current) => ({
      ...current,
      [selectedMetaCognitionPrompt.id]: true,
    }));

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/meta-cognition`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            triggerId: selectedMetaCognitionPrompt.trigger.id,
            condition: selectedMetaCognitionPrompt.trigger.condition,
            prompt: selectedMetaCognitionPrompt.prompt,
            promptTone: selectedMetaCognitionPrompt.trigger.promptTone,
            sessionContext: selectedMetaCognitionPrompt.sessionContext,
            evidence: selectedMetaCognitionPrompt.evidence,
            shapesAssociated: selectedMetaCognitionPrompt.shapesAssociated,
            selectedNodeId: selectedMetaCognitionPrompt.selectedNodeId,
            responseType: null,
            responseText: null,
            tellMeMoreOpened: false,
            behaviorChangedWithinTenMinutes: null,
          }),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { event: SerializableThoughtMapEvent };
        mergeMetaCognitionEvent(payload.event);
      } catch {
        return;
      }
    });
  }, [map.id, metaCognitionEventsSeen, selectedMetaCognitionPrompt, startTransition]);
  const selectedOldSelves = useMemo(
    () => buildOldSelfTimeline(map.nodes, map.events, selectedGraphNode?.node.id ?? defaultGraphNodeId ?? rootNode?.id ?? ""),
    [defaultGraphNodeId, map.events, map.nodes, rootNode?.id, selectedGraphNode?.node.id],
  );
  const selectedMoveHistory = useMemo(
    () => buildClaimMoveHistory(map.nodes, map.events, selectedGraphNode?.node.id ?? defaultGraphNodeId ?? rootNode?.id ?? ""),
    [defaultGraphNodeId, map.events, map.nodes, rootNode?.id, selectedGraphNode?.node.id],
  );
  const quietFragility = useMemo(() => {
    if (!selectedGraphNode || !selectedGenealogy.lineage.length) {
      return null;
    }

    const supportConfidences = selectedGenealogy.lineage
      .map((node) => node.scores?.confidence ?? null)
      .filter((confidence): confidence is number => confidence != null);

    if (!supportConfidences.length) {
      return null;
    }

    const structuralCap = Math.min(...supportConfidences);
    const feltConfidence = selectedGraphNode.node.scores?.confidence ?? structuralCap;
    const gap = Math.max(0, feltConfidence - structuralCap);

    return {
      structuralCap,
      feltConfidence,
      gap,
      weakestLayer: selectedGenealogy.lineage.find((node) => (node.scores?.confidence ?? 1) <= structuralCap) ?? selectedGenealogy.lineage[0] ?? null,
      isFragile: gap >= 0.18 || structuralCap <= 0.35,
    };
  }, [selectedGenealogy.lineage, selectedGraphNode]);
  const mapTimeline = useMemo<MapTimelineSnapshot>(() => buildMapTimeline(map), [map]);
  const timelineShape = activeShapeCallout ?? derivedShapes[0] ?? null;
  const shapeTimeline = useMemo<ShapeTimelineSnapshot | null>(() => buildShapeTimeline(map, timelineShape), [map, timelineShape]);
  const dependencyTimeline = useMemo<DependencyChainTimelineSnapshot | null>(
    () => buildDependencyChainTimeline(map, selectedGraphNode?.node.id ?? defaultGraphNodeId ?? rootNode?.id ?? ""),
    [defaultGraphNodeId, map, rootNode?.id, selectedGraphNode?.node.id],
  );
  const selectedCritiqueStrength = critiqueStrengthLabel(selectedGraphNode?.node.scores?.strength ?? null);
  const selectedPrecedents = selectedGraphNode ? retrievePrecedentsForNode(selectedGraphNode.node, lens) : [];
  const selectedPrecedentSummary =
    selectedPrecedents.find((precedent) => precedent.id === selectedPrecedentId) ?? selectedPrecedents[0] ?? null;
  const selectedSurvivorPrecedents = selectedPrecedentSummary
    ? retrieveSurvivorPrecedentsForCase(selectedPrecedentSummary)
    : [];
  const selectedClaimEvidenceSummary = useMemo(
    () =>
      selectedGraphNode
        ? buildClaimEvidenceSummary({
            claimId: selectedGraphNode.node.id,
            evidence: map.evidence,
          })
        : null,
    [map.evidence, selectedGraphNode],
  );
  const selectedBiasContext = useMemo(
    () => biasProfileCritiqueContext(displayedBiasProfile, selectedGraphNode?.node ?? null),
    [displayedBiasProfile, selectedGraphNode?.node],
  );
  const selectedSteelMan = selectedGraphNode
    ? map.steelMans.find((steelMan) => steelMan.claimId === selectedGraphNode.node.id) ?? null
    : null;
  const selectedSteelManDraft = selectedGraphNode
    ? steelManDrafts[selectedGraphNode.node.id] ?? selectedSteelMan?.steelManText ?? ""
    : "";
  const selectedSteelManReady = selectedSteelMan
    ? selectedSteelMan.steelManText.trim().length >= 80
    : Boolean(selectedGraphNode?.node.id && steelManGateBypassed[selectedGraphNode.node.id]);
  const claimRepairSuggestions = useMemo(() => buildClaimRepairSuggestions(map), [map]);
  const dailyRevisitQueue = useMemo(() => buildRevisitQueue(map), [map]);
  const selectedRevisitTriggerDraft = selectedGraphNode?.node.id
    ? revisitTriggerDrafts[selectedGraphNode.node.id] ?? {
        triggerType: "manual_flag" as const,
        dateTarget: "",
        eventKeyword: "",
        confidenceThreshold: "",
        dependencyClaimId: selectedGraphNode.node.id,
      }
    : null;
  const selectedTeachBackFocus = useMemo(
    () => teachBackFocusForNode(selectedGraphNode?.node ?? null, selectedKnowledgeSurface),
    [selectedGraphNode?.node, selectedKnowledgeSurface],
  );
  const selectedTeachBackAnalysis = useMemo(
    () => analyzeTeachBackResponse(teachBackDrafts[selectedGraphNode?.node.id ?? ""] ?? "", selectedTeachBackFocus),
    [selectedGraphNode?.node.id, selectedTeachBackFocus, teachBackDrafts],
  );
  const currentTeachBackNodeId = selectedGraphNode?.node.id ?? null;
  const currentTeachBackDraft = currentTeachBackNodeId ? teachBackDrafts[currentTeachBackNodeId] ?? "" : "";
  const currentTeachBackFeedback = currentTeachBackNodeId ? teachBackFeedback[currentTeachBackNodeId] ?? null : null;
  const currentTeachBackAttempts = currentTeachBackNodeId ? teachBackAttempts[currentTeachBackNodeId] ?? [] : [];
  const currentTeachBackAnalysis = currentTeachBackFeedback ?? selectedTeachBackAnalysis;
  const handleTeachBackCheck = () => {
    if (!currentTeachBackNodeId) {
      return;
    }

    const response = currentTeachBackDraft;
    const analysis = analyzeTeachBackResponse(response, selectedTeachBackFocus);

    setTeachBackFeedback((prev) => ({
      ...prev,
      [currentTeachBackNodeId]: analysis,
    }));
    setTeachBackAttempts((prev) => ({
      ...prev,
      [currentTeachBackNodeId]: [...(prev[currentTeachBackNodeId] ?? []), response],
    }));
  };
  const elicitationPatterns = [
    {
      key: "devils advocate" as const,
      label: "Devil's advocate",
      prompt: selectedGraphNode
        ? `Attack ${kindLabel(selectedGraphNode.node.kind)} from the sharpest possible opposing angle.`
        : "Attack the active claim from the sharpest possible opposing angle.",
      description: "Useful when you want the strongest counterargument and the most explicit load-bearing failure point.",
      note: selectedPrecedentSummary
        ? `Ground the critique in ${selectedPrecedentSummary.name} so the pushback is precedent-backed instead of rhetorical.`
        : "If precedent is thin, Penny falls back to the dependency chain and the quiet keystone.",
    },
    {
      key: "naive questioner" as const,
      label: "Naive questioner",
      prompt: selectedGraphNode
        ? `Explain this like I have never heard of ${kindLabel(selectedGraphNode.node.kind)} before.`
        : "Explain the claim like I have never heard of the domain before.",
      description: "Useful when the structure feels obvious but may actually be hiding jargon, leaps, or missing steps.",
      note: selectedKnowledgeSurface.teachBackGap.length
        ? `The teach-back gaps suggest where a novice would get lost: ${selectedKnowledgeSurface.teachBackGap.join(", ")}.`
        : "This mode often exposes assumptions that expert-style critique misses.",
    },
    {
      key: "integrator" as const,
      label: "Integrator",
      prompt: selectedGraphNode
        ? `How does this connect to the claim you made in a different project, and what changes when the two are considered together?`
        : "How does this connect to a claim you made in a different project?",
      description: "Useful when the user needs cross-project pattern transfer or wants to combine separate lines of thought.",
      note: `Cross-project shape transfer is how Penny turns one map’s lesson into a reusable pattern on the next map.`,
    },
    {
      key: "skeptic" as const,
      label: "Skeptic",
      prompt: selectedGraphNode
        ? `What is the version of this claim that only a contrarian would say, and what would they attack first?`
        : "What is the version of this claim that only a contrarian would say?",
      description: "Useful when you want the contrarian version without letting the critique become performative.",
      note: activeShapeCallout
        ? `The active shape ${activeShapeCallout.label} decides whether Penny should sharpen the attack or change the line of questioning.`
        : "Skeptic mode should stay structurally grounded, not just oppositional.",
    },
  ];
  const critiqueArgument = useMemo(() => {
    const targetContent = selectedGraphNode?.node.content ?? "the active claim";
    const seedConfidence = selectedGraphNode?.node.scores?.confidence != null ? formatScore(selectedGraphNode.node.scores.confidence) : "n/a";
    const parentLabel = selectedGraphNode?.node.parentId ? nodesById.get(selectedGraphNode.node.parentId)?.content ?? "its parent claim" : "no parent claim";
    const axiomLabel = selectedArchaeologyAxiom?.content ?? parentLabel;
    const downstreamCount = selectedGenealogy.dependents.length;
    const precedentLabel = selectedPrecedentSummary
      ? `${selectedPrecedentSummary.name} (${selectedPrecedentSummary.failureMode})`
      : "no precedent case selected yet";
    const shapeLabel = activeShapeCallout?.label ?? "no active shape";
    const propagationStep = selectedPropagation?.cascade[0] ?? null;

    return {
      premise: `Penny starts from "${targetContent}" because it currently sits on ${downstreamCount} downstream claims and its seed confidence is ${seedConfidence}.`,
      assumption: `The load-bearing assumption underneath it is "${axiomLabel}", which Penny treats as the quiet point where the dependency chain can fail.`,
      pressure: propagationStep
        ? `Propagation shows the strongest downstream pressure when ${propagationStep.pathLabel} drops from ${formatScore(propagationStep.baseConfidence)} to ${formatScore(propagationStep.propagatedConfidence)}.`
        : `Penny has not yet computed a cascade step, so it explains the critique from the dependency structure and confidence score alone.`,
      precedent: `Penny pulls ${precedentLabel} to ground the critique in a real failure trajectory instead of a hypothetical objection.`,
      shape: `The active shape is ${shapeLabel}, so the critique also checks whether this is a recurring pattern in the user’s thinking.`,
      conclusion:
        "That combination means Penny is not just saying the claim is weak; it is explaining which dependency, precedent, and repeated user pattern make the critique load-bearing.",
    };
  }, [
    activeShapeCallout?.label,
    nodesById,
    selectedArchaeologyAxiom?.content,
    selectedGenealogy.dependents.length,
    selectedGraphNode?.node.content,
    selectedGraphNode?.node.parentId,
    selectedGraphNode?.node.scores?.confidence,
    selectedPropagation?.cascade,
    selectedPrecedentSummary,
  ]);
  const dialecticRoundEvents = useMemo(
    () =>
      map.events
        .filter((event) => event.eventType === "dialectic_round")
        .map((event) => {
          const payload = event.payload ?? {};
          const roundPayload =
            payload.dialecticRound && typeof payload.dialecticRound === "object"
              ? (payload.dialecticRound as Record<string, unknown>)
              : null;
          const priorRoundsPayload = Array.isArray(payload.priorRounds) ? payload.priorRounds : [];

          return {
            id: event.id,
            createdAt: event.createdAt,
            nodeId: event.nodeId,
            claimId:
              roundPayload && typeof roundPayload.claimId === "string" && roundPayload.claimId.trim().length > 0
                ? String(roundPayload.claimId)
                : event.nodeId,
            round: typeof payload.round === "string" ? String(payload.round) : "round",
            roundIndex: typeof payload.roundIndex === "number" ? Number(payload.roundIndex) : 0,
            title: typeof payload.title === "string" ? String(payload.title) : "Dialectic round",
            critiqueStrength:
              typeof payload.critiqueStrength === "string" ? String(payload.critiqueStrength) : "unknown",
            critiqueType:
              typeof payload.critiqueType === "string" && payload.critiqueType.trim().length > 0
                ? String(payload.critiqueType)
                : null,
            critiqueMode:
              roundPayload && typeof roundPayload.critiqueMode === "string" && roundPayload.critiqueMode.trim().length > 0
                ? String(roundPayload.critiqueMode)
                : typeof payload.critiqueMode === "string" && payload.critiqueMode.trim().length > 0
                  ? String(payload.critiqueMode)
                  : null,
            voiceLabel:
              roundPayload && typeof roundPayload.voiceLabel === "string" && roundPayload.voiceLabel.trim().length > 0
                ? String(roundPayload.voiceLabel)
                : typeof payload.voiceLabel === "string" && payload.voiceLabel.trim().length > 0
                  ? String(payload.voiceLabel)
                  : null,
            critiqueFailureTypes:
              roundPayload && Array.isArray(roundPayload.critiqueFailureTypes)
                ? roundPayload.critiqueFailureTypes.filter((item): item is string => typeof item === "string")
                : [],
            prompt: typeof payload.prompt === "string" ? String(payload.prompt) : "",
            why: typeof payload.why === "string" ? String(payload.why) : "",
            responsePath:
              payload.responsePath === "defend" || payload.responsePath === "revise" || payload.responsePath === "absorb"
                ? payload.responsePath
                : null,
            response: typeof payload.response === "string" ? String(payload.response) : "",
            priorRounds: priorRoundsPayload
              .filter((item): item is Record<string, unknown> => item != null && typeof item === "object")
              .map((item) => ({
                id: typeof item.id === "string" ? String(item.id) : "",
                round: typeof item.round === "string" ? String(item.round) : "round",
                roundIndex: typeof item.roundIndex === "number" ? Number(item.roundIndex) : 0,
                title: typeof item.title === "string" ? String(item.title) : "Dialectic round",
                critiqueStrength: typeof item.critiqueStrength === "string" ? String(item.critiqueStrength) : "mild",
                critiqueType:
                  typeof item.critiqueType === "string" && item.critiqueType.trim().length > 0
                    ? String(item.critiqueType)
                    : null,
                responsePath:
                  item.responsePath === "defend" || item.responsePath === "revise" || item.responsePath === "absorb"
                    ? item.responsePath
                    : null,
                prompt: typeof item.prompt === "string" ? String(item.prompt) : "",
                why: typeof item.why === "string" ? String(item.why) : "",
                response: typeof item.response === "string" ? String(item.response) : "",
                confidenceDelta:
                  typeof item.confidenceDelta === "number" ? Number(item.confidenceDelta) : null,
                engagementScore:
                  typeof item.engagementScore === "number" ? Number(item.engagementScore) : null,
              })),
            dialecticRound:
              roundPayload && typeof roundPayload === "object"
                ? (roundPayload as SerializableDialecticRound)
                : null,
          };
        })
        .sort((a, b) => a.roundIndex - b.roundIndex || a.createdAt.getTime() - b.createdAt.getTime()),
    [map.events],
  );
  const critiqueFeedbackEvents = useMemo(
    () => map.events.filter((event) => event.eventType === "critique_feedback"),
    [map.events],
  );
  const critiqueFeedbacks = useMemo(() => collectCritiqueFeedback(map.events), [map.events]);
  const critiqueCorrections = useMemo(() => collectCritiqueCorrections(map.events), [map.events]);
  const critiqueQualityProfile = useMemo(
    () => map.critiqueQualityProfile ?? buildCritiqueQualityProfile(map, critiqueFeedbacks),
    [critiqueFeedbacks, map],
  );
  const critiqueGenerationGuidance = useMemo(
    () => critiqueGenerationModifier(critiqueQualityProfile),
    [critiqueQualityProfile],
  );
  const personalizedCritiqueContext = useMemo<PersonalizedCritiqueContext | null>(
    () =>
      buildPersonalizedCritiqueContext({
        map,
        targetNode: selectedGraphNode?.node ?? null,
        biasProfile: displayedBiasProfile,
        calibration: buildCalibrationDashboard([map]),
        lens,
        critiqueQualityProfile,
      }),
    [critiqueQualityProfile, displayedBiasProfile, lens, map, selectedGraphNode?.node],
  );
  const personalizedCritiqueDisclosure = personalizedCritiqueContext
    ? generatePersonalizationDisclosure({
        knowledgeDepth: personalizedCritiqueContext.knowledgeDepth,
        confirmedBiases: personalizedCritiqueContext.confirmedBiases,
        dominantShapes: personalizedCritiqueContext.dominantShapes,
        weakDomains: personalizedCritiqueContext.weakDomains,
        strongDomains: personalizedCritiqueContext.strongDomains,
        intensityAdjustment: personalizedCritiqueContext.intensityAdjustment,
        dismissalPatterns: personalizedCritiqueContext.dismissalPatterns,
      })
    : null;
  const critiquePersonalizationBridge = [selectedBiasContext, personalizedCritiqueDisclosure].filter(Boolean).join(" ") || null;
  const critiqueFeedbackStatusByRoundId = useMemo(() => {
    return dialecticRoundEvents.reduce<Record<string, { dismissalCount: number; submitted: boolean; latestFeedback: SerializableThoughtMapEvent | null }>>(
      (accumulator, round) => {
        const feedbackEvents = critiqueFeedbackEvents
          .filter((event) => {
            const payload = event.payload ?? {};
            const roundId = typeof payload.roundId === "string" ? String(payload.roundId) : null;
            const critiqueId = typeof payload.critiqueId === "string" ? String(payload.critiqueId) : null;
            return roundId === round.id || critiqueId === round.id;
          })
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        let latestFeedback: SerializableThoughtMapEvent | null = null;
        let dismissalCount = 0;

        for (const event of feedbackEvents) {
          const payload = event.payload ?? {};
          const dismissed = Boolean(payload.dismissed);
          const ratings = Array.isArray(payload.ratings) ? payload.ratings : [];
          const submitted = !dismissed && ratings.length > 0;

          if (submitted) {
            latestFeedback = normalizeEvent(event);
            dismissalCount = 0;
            continue;
          }

          if (dismissed) {
            dismissalCount += 1;
          }
        }

        const latestSuccessful = feedbackEvents
          .filter((event) => {
            const payload = event.payload ?? {};
            return Boolean(payload.dismissed) === false && Array.isArray(payload.ratings) && payload.ratings.length > 0;
          })
          .at(-1);

        accumulator[round.id] = {
          dismissalCount: latestSuccessful ? dismissalCount : dismissalCount,
          submitted: Boolean(latestSuccessful),
          latestFeedback: latestFeedback ?? (latestSuccessful ? normalizeEvent(latestSuccessful) : null),
        };

        return accumulator;
      },
      {},
    );
  }, [critiqueFeedbackEvents, dialecticRoundEvents]);
  const selectedPrecedentAdherence = useMemo(() => {
    if (!selectedPrecedentSummary) {
      return null;
    }

    const evidenceText = [
      selectedGraphNode?.node.content ?? "",
      ...dialecticRoundEvents.flatMap((event) => [event.prompt, event.response, event.why]),
      selectedPrecedentSummary.name,
      selectedPrecedentSummary.failureMode,
      selectedPrecedentSummary.failureTrajectory,
      selectedPrecedentSummary.whatKilledIt,
      selectedPrecedentSummary.killAssumption,
      selectedPrecedentSummary.structuralLesson,
      ...selectedPrecedentSummary.loadBearingAssumptions,
    ]
      .join(" ")
      .toLowerCase();

    const addressedFailureModes = selectedPrecedentSummary.failureTypeTags.filter((tag) => {
      const normalizedTag = tag.toLowerCase().replaceAll("-", " ");
      const compactTag = tag.toLowerCase().replaceAll("-", "");
      const tokens = normalizedTag.split(/\s+/).filter((token) => token.length >= 4);

      return (
        evidenceText.includes(normalizedTag) ||
        evidenceText.includes(compactTag) ||
        tokens.some((token) => evidenceText.includes(token))
      );
    });
    const remainingFailureModes = selectedPrecedentSummary.failureTypeTags.filter((tag) => !addressedFailureModes.includes(tag));
    const addressedAssumptions = selectedPrecedentSummary.loadBearingAssumptions.filter((assumption) => {
      const fragments = assumption
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter((fragment) => fragment.length >= 5);

      return fragments.some((fragment) => evidenceText.includes(fragment));
    });

    return {
      addressedFailureModes,
      remainingFailureModes,
      addressedAssumptions,
      summary:
        addressedFailureModes.length || addressedAssumptions.length
          ? `You have started to answer ${selectedPrecedentSummary.name}'s failure profile, but some structural pressure is still open.`
          : `You have not yet addressed the specific failure modes that killed ${selectedPrecedentSummary.name}.`,
      nextPrompt: remainingFailureModes.length
        ? `Respond directly to ${remainingFailureModes[0]}: what in your claim keeps that failure from happening here?`
        : addressedAssumptions.length
          ? "You have addressed the named failure types. Now check whether the load-bearing assumptions themselves still hold."
          : "Take one specific failure mode and answer it in the context of your current claim, not in the abstract.",
    };
  }, [dialecticRoundEvents, selectedGraphNode?.node.content, selectedPrecedentSummary]);
  const challengeCalibrationEvents = useMemo(
    (): ChallengeCalibrationEntry[] =>
      map.events
        .filter((event) => event.eventType === "challenge_calibration")
        .map((event) => ({
          id: event.id,
          createdAt: event.createdAt,
          nodeId: event.nodeId,
          masteryLevel:
            event.payload?.masteryLevel === "solid" ||
            event.payload?.masteryLevel === "growing" ||
            event.payload?.masteryLevel === "unmeasured"
              ? (event.payload.masteryLevel as ChallengeCalibrationEntry["masteryLevel"])
              : "unmeasured",
          label: typeof event.payload?.label === "string" ? String(event.payload.label) : "challenge calibration",
          direction:
            event.payload?.direction === "increase challenge" ||
            event.payload?.direction === "reduce challenge" ||
            event.payload?.direction === "hold steady"
              ? (event.payload.direction as ChallengeCalibrationEntry["direction"])
              : "hold steady",
          note: typeof event.payload?.note === "string" ? String(event.payload.note) : "",
          responseLength:
            typeof event.payload?.responseLength === "number" ? Number(event.payload.responseLength) : 0,
          roundIndex: typeof event.payload?.roundIndex === "number" ? Number(event.payload.roundIndex) : 0,
        }))
        .sort((a, b) => b.roundIndex - a.roundIndex || b.createdAt.getTime() - a.createdAt.getTime()),
    [map.events],
  );
  const challengeSkill = useMemo(
    () =>
      challengeSkillState({
        masteryLevel: selectedKnowledgeSurface.masteryLevel,
        responseTrail: dialecticRoundEvents.map((event) => event.response).filter((response) => response.length > 0),
        critiqueStrength: selectedCritiqueStrength.label,
        teachBackGap: selectedKnowledgeSurface.teachBackGap,
        calibrationTrail: challengeCalibrationEvents,
      }),
    [
      challengeCalibrationEvents,
      dialecticRoundEvents,
      selectedCritiqueStrength.label,
      selectedKnowledgeSurface.masteryLevel,
      selectedKnowledgeSurface.teachBackGap,
    ],
  );
  const recentCritiqueTypes = useMemo(
    () =>
      dialecticRoundEvents
        .map((event) => event.critiqueType)
        .filter((critiqueType): critiqueType is CritiqueFailureType => critiqueType != null && CRITIQUE_FAILURE_TYPES.includes(critiqueType as CritiqueFailureType))
        .map((critiqueType) => critiqueType as CritiqueFailureType),
    [dialecticRoundEvents],
  );
  const critiqueVariety = useMemo(() => critiqueVarietySuggestion(recentCritiqueTypes), [recentCritiqueTypes]);
  const activeCritiqueType = useMemo(() => {
    const recent = recentCritiqueTypes.slice(-5);
    if (recent.length === 5 && recent.every((type) => type === selectedCritiqueType) && critiqueVariety.next !== selectedCritiqueType) {
      return critiqueVariety.next;
    }

    return selectedCritiqueType;
  }, [critiqueVariety.next, recentCritiqueTypes, selectedCritiqueType]);
  const critiqueEngagementStyle = useMemo(() => {
    const absorbCount = dialecticRoundEvents.filter((event) => event.responsePath === "absorb").length;
    const reviseCount = dialecticRoundEvents.filter((event) => event.responsePath === "revise").length;
    const defendCount = dialecticRoundEvents.filter((event) => event.responsePath === "defend").length;

    if (absorbCount >= reviseCount + defendCount && absorbCount >= 2) {
      return "defensive";
    }

    if (reviseCount >= defendCount + 2) {
      return "integrative";
    }

    if (dialecticRoundEvents.length >= 3 && challengeSkill.direction === "reduce challenge") {
      return "protective";
    }

    return "balanced";
  }, [challengeSkill.direction, dialecticRoundEvents]);
  const critiqueMetaCritique = useMemo(() => {
    if (!recentCritiqueTypes.length) {
      return {
        headline: "Critique history is still empty.",
        body: "Start with a failure type, then let Penny diversify away from it instead of repeating the same pressure.",
      };
    }

    const counts = recentCritiqueTypes.reduce<Record<string, number>>((acc, type) => {
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {});
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const dominantCount = dominant ? counts[dominant] ?? 0 : 0;

    return {
      headline:
        dominant && dominantCount >= 4
          ? `You have been overusing ${dominant}.`
          : "Your critique mix is still narrowing too much.",
      body:
        critiqueEngagementStyle === "defensive"
          ? `You've been stress-testing in a defensive way, so Penny should slow down and pivot to ${critiqueVariety.next}.`
          : critiqueEngagementStyle === "integrative"
            ? `You're integrating critique well, but the next pass should force ${critiqueVariety.next} so the lens stays sharp.`
            : `The next pass should force ${critiqueVariety.next} so Penny doesn't stay stuck on ${dominant ?? "one"} failure mode.`,
    };
  }, [critiqueEngagementStyle, critiqueVariety.next, recentCritiqueTypes]);
  const critiqueCorrectionNodeId = selectedGraphNode?.node.id ?? null;
  const currentCritiqueCorrectionDraft = critiqueCorrectionNodeId ? critiqueCorrectionDrafts[critiqueCorrectionNodeId] ?? "" : "";
  function captureCritiqueCorrection() {
    const correction = currentCritiqueCorrectionDraft.trim();

    if (!critiqueCorrectionNodeId || correction.length < 12) {
      return;
    }

    recordDialecticRound({
      round: "Correction capture",
      roundIndex: dialecticRoundEvents.length,
      title: "Penny is wrong",
      critiqueStrength: `high-priority correction · ${critiqueModeLabel(critiqueMode)}`,
      critiqueType: "correction",
      prompt: "Capture the factual correction Penny got wrong so it can be treated as high-priority signal.",
      why: "Dedicated correction capture is the highest-priority critique signal because it corrects the product’s own mistake.",
      critiqueMode,
      voiceLabel: selectedAudienceCritique?.audienceLabel ?? peerAudience,
      responsePath: "revise",
      response: correction,
    });

    setCritiqueCorrectionDrafts((current) => {
      const next = { ...current };
      delete next[critiqueCorrectionNodeId];
      return next;
    });
  }
  const dialecticRounds = useMemo(() => {
    const responseTrail = dialecticRoundEvents.map((event) => summarizeText(event.response, 96)).filter(Boolean);
    const lastResponse = responseTrail[responseTrail.length - 1] ?? null;
    const priorResponse = responseTrail[responseTrail.length - 2] ?? null;
    const nodeLabel = selectedGraphNode ? selectedGraphNode.node.content : "the active claim";
    const intensityLabel = critiqueIntensityLabel(critiqueIntensity);
    const currentConfidence = Math.round((selectedGraphNode?.node.scores?.confidence ?? 0) * 100);
    const roundEventsByIndex = new Map(dialecticRoundEvents.map((event) => [event.roundIndex, event] as const));
    const steelManSummary = selectedSteelManDraft.trim().length
      ? summarizeText(selectedSteelManDraft.trim(), 140)
      : "The steel-man gate is still open.";

    function buildRoundContext(roundIndex: number) {
      const event = roundEventsByIndex.get(roundIndex) ?? null;
      const priorEvents = dialecticRoundEvents.filter((candidate) => candidate.roundIndex < roundIndex);
      const priorSummary = priorEvents
        .slice(-2)
        .map((candidate) => {
          const classification = candidate.dialecticRound?.responseClassification?.type ?? candidate.responsePath ?? "response";
          const confidenceDelta = candidate.dialecticRound?.confidenceDelta ?? null;
          const confidenceLabel = confidenceDelta == null ? "" : ` (${confidenceDelta >= 0 ? "+" : ""}${formatPercentValue(confidenceDelta)})`;

          return `${candidate.round}: ${classification}${confidenceLabel} — ${summarizeText(candidate.response || candidate.prompt, 72)}`;
        })
        .join(" · ");
      const latestPrior = priorEvents.at(-1) ?? null;
      const priorRoundData = event?.dialecticRound ?? null;
      const confidenceStart =
        priorRoundData?.confidenceAtRoundStart ??
        latestPrior?.dialecticRound?.confidenceAtRoundEnd ??
        currentConfidence;
      const confidenceEnd = priorRoundData?.confidenceAtRoundEnd ?? confidenceStart;
      const confidenceDelta = priorRoundData?.confidenceDelta ?? confidenceEnd - confidenceStart;
      const followUpPrompt =
        priorRoundData?.followUpPrompt ??
        (priorEvents.length >= 2 && priorEvents.slice(-2).every((entry) => Number(entry.dialecticRound?.confidenceDelta ?? 0) === 0)
          ? "The next round should be a meta-prompt that names the lack of confidence change or new evidence."
          : roundIndex === 0
            ? "If you continue, round 2 will re-read your response and push on the new weak point it introduces."
            : roundIndex === 1
              ? "If you continue, round 3 will escalate from the recorded thread or pivot if the critique has already been answered."
              : "If you continue, Penny will either escalate, pivot, or name the stagnation if the thread is not changing.");
      const confidenceContext = `${formatPercentValue(confidenceStart)} → ${formatPercentValue(confidenceEnd)} (${confidenceDelta >= 0 ? "+" : ""}${formatPercentValue(confidenceDelta)})`;
      const concessions = priorRoundData?.concessions ?? [];
      const defenses = priorRoundData?.defenses ?? [];
      const dismissals = priorRoundData?.dismissals ?? [];

      return {
        priorSummary: priorSummary || "No prior rounds yet.",
        followUpPrompt:
          followUpPrompt ??
          (roundIndex >= 2 && !event
            ? "If the user continues, the next round should focus on whether the thread is actually changing or just replaying itself."
            : null),
        confidenceContext,
        confidenceStart,
        confidenceEnd,
        confidenceDelta,
        concessions,
        defenses,
        dismissals,
        responseClassification: priorRoundData?.responseClassification ?? null,
        engagementScore: priorRoundData?.engagementScore ?? null,
      };
    }

    const roundBlueprints = [
      {
        round: "Round 1",
        title: critiqueMode === "socratic" ? "Socratic opening" : critiqueMode === "red_team" ? "Red-team opening" : "Opening critique",
        strength: `${selectedCritiqueStrength.label === "weak" ? "mild" : selectedCritiqueStrength.label} · ${critiqueModeLabel(critiqueMode)} · ${intensityLabel} · ${selectedSteelManReady ? "steel-man ready" : "steel-man required"}`,
        prompt: critiqueModePrompt(
          critiqueMode,
          activeCritiqueType,
          nodeLabel,
          critiqueIntensity,
          critiquePersonalizationBridge,
          selectedSteelManDraft,
        ),
        why: lastAction?.reasoning.graphAnalysis?.primaryGap
          ? `Failure type: ${lastAction.reasoning.graphAnalysis.primaryGap.replaceAll("-", " ")} · critique type: ${activeCritiqueType}`
          : `Failure type: not yet selected · critique type: ${activeCritiqueType}`,
        argument: critiqueArgument,
        steelMan: steelManSummary,
        responsePath: "defend / revise / absorb",
      },
      {
        round: "Round 2",
        title: critiqueMode === "socratic" ? "Teach-back response" : "User response",
        strength: `moderate · response-driven · ${critiqueModeLabel(critiqueMode)}`,
        prompt: lastResponse
          ? `Penny re-reads the last response and pushes on the new weak point it introduced: ${lastResponse}.`
          : critiqueMode === "socratic"
            ? "The user explains the concept back in context, and Penny looks for the specific gap in that explanation."
            : "The user’s reply becomes a move. Penny reads the reasoning, stores the disagreement, and avoids repeating itself.",
        why: lastResponse
          ? `This round reacts to the prior recorded response: ${lastResponse}.`
          : selectedPrecedentSummary
            ? `Precedent source: ${selectedPrecedentSummary.name} · ${selectedPrecedentSummary.domain}`
            : critiqueMode === "socratic"
              ? "Precedent source: the user’s own explanation in context."
              : "Precedent source: none selected yet",
        argument: {
          premise: "The user’s response becomes a move, so Penny reads the reply as new evidence instead of replaying the original attack.",
          assumption: lastResponse
            ? `The response "${lastResponse}" still leaves an open causal gap, and Penny attacks that gap instead of the old one.`
            : "Until the user responds, Penny keeps the critique open and waits for a real move.",
          pressure: selectedPrecedentSummary
            ? `The next attack is tuned by ${selectedPrecedentSummary.name} and its failure mode ${selectedPrecedentSummary.failureMode}.`
            : "Without precedent, Penny explains the critique through the current dependency chain alone.",
          precedent: selectedPrecedentSummary
            ? `This round inherits the precedent lesson from ${selectedPrecedentSummary.name}, so the critique can move from abstract concern to concrete failure pattern.`
            : "No precedent case is attached yet, so the critique remains open-ended.",
          shape: activeShapeCallout
            ? `The current shape callout, ${activeShapeCallout.label}, tells Penny which recurring thinking pattern to test for in the reply.`
            : "No active shape has been selected yet, so the response is judged only against the claim structure.",
          conclusion: "The point of the round is not to repeat the opening attack. It is to explain why the user’s response changes what Penny should worry about next.",
        },
        steelMan: selectedSteelMan?.updateHistory.length
          ? "The steel man is already stored with the claim, so the reply should be judged against the captured opposing view rather than a generic objection."
          : steelManSummary,
        responsePath: "defend / revise / absorb",
      },
      {
        round: "Round 3",
        title: critiqueMode === "red_team" ? "Sustained red-team" : "Escalate or pivot",
        strength: `${critiqueMode === "red_team" ? "adversarial" : selectedPrecedentSummary ? "strong" : "moderate"} · ${
          selectedPrecedentSummary ? "precedent-backed" : "open"
        } · ${intensityLabel}`,
        prompt:
          lastResponse || priorResponse
            ? `Penny escalates from the recorded thread. Prior response: ${priorResponse ?? lastResponse}; current response: ${lastResponse ?? "none yet"}.`
            : selectedPrecedentSummary
              ? `Penny escalates using ${selectedPrecedentSummary.failureMode} precedent or pivots to the next risk angle.`
              : critiqueMode === "red_team"
                ? "Penny keeps pressure on the whole structure instead of stopping at a single claim."
                : "Penny escalates to a stronger critique or pivots to a different angle of attack.",
        why: activeShapeCallout ? `Shape pattern: ${activeShapeCallout.label}` : "Shape pattern: no active pattern yet",
        argument: {
          premise: "By round three, Penny should have enough response history to either escalate or pivot without repeating itself.",
          assumption: priorResponse || lastResponse
            ? `The remaining weak point is whatever the user's earlier responses did not resolve: ${priorResponse ?? lastResponse}.`
            : "With no prior response, the critique remains a first-pass structural attack.",
          pressure: selectedPropagation?.cascade.length
            ? `The cascade shows the sharpest remaining pressure through ${selectedPropagation.cascade[0]?.pathLabel}, so Penny can explain why the next attack lands there.`
            : "No cascade step is available yet, so Penny falls back to the strongest dependency and precedent signals.",
          precedent: selectedPrecedentSummary
            ? `The strongest precedent remains ${selectedPrecedentSummary.name}, which keeps the explanation tied to a concrete historical failure path.`
            : "No precedent is selected yet, so the escalation is driven by structure and shape history only.",
          shape: activeShapeCallout
            ? `The active shape, ${activeShapeCallout.label}, tells Penny whether to deepen the same critique or pivot to a different pattern of concern.`
            : "No active shape is available yet, so Penny defaults to the structural dependency chain.",
          conclusion:
            "This is the point where the critique should feel like an explanation of the argument's failure surface, not a repetition of an earlier warning.",
        },
        steelMan: selectedSteelMan?.updateHistory.length
          ? "Before round three, Penny should ask whether the user’s understanding of the opposing view has changed and prompt a revision if needed."
          : steelManSummary,
        responsePath: "future rounds inherit prior responses",
      },
    ] as const;

    return roundBlueprints.map((round, index) => {
      const context = buildRoundContext(index);

      return {
        id: round.round,
        ...round,
        dialecticRound: roundEventsByIndex.get(index)?.dialecticRound ?? null,
        critiqueFailureTypes: roundEventsByIndex.get(index)?.dialecticRound?.critiqueFailureTypes ?? [],
        priorRoundSummary: context.priorSummary,
        followUpPrompt: context.followUpPrompt,
        confidenceContext: context.confidenceContext,
        confidenceAtRoundStart: context.confidenceStart,
        confidenceAtRoundEnd: context.confidenceEnd,
        confidenceDelta: context.confidenceDelta,
        responseClassification: context.responseClassification,
        engagementScore: context.engagementScore,
        concessions: context.concessions,
        defenses: context.defenses,
        dismissals: context.dismissals,
        roundContextDraft: dialecticRoundContextDrafts[round.round] ?? {
          confidenceAtRoundEnd: context.confidenceEnd,
          concessionNote: "",
          connectedClaimsChanged: null,
          connectedClaimsNote: "",
          newEvidenceNote: "",
        },
      };
    });
  }, [
    activeShapeCallout,
    dialecticRoundEvents,
    dialecticRoundContextDrafts,
    activeCritiqueType,
    lastAction?.reasoning.graphAnalysis?.primaryGap,
    critiqueIntensity,
    critiqueMode,
    selectedCritiqueStrength.label,
    selectedGraphNode,
    selectedSteelMan?.updateHistory.length,
    selectedSteelManDraft,
    selectedSteelManReady,
    selectedPrecedentSummary,
    critiqueArgument,
    critiquePersonalizationBridge,
    selectedPropagation?.cascade,
  ]);
  const selectedReceiptVoices = useMemo(
    () => buildDevilsAdvocateReceipts(selectedGraphNodeModel),
    [selectedGraphNodeModel],
  );
  const selectedAudienceCritique = useMemo(
    () =>
      buildAudienceCritiqueSurface(
        selectedGraphNodeModel,
        specificAudienceName,
        specificAudienceContext,
        selectedReceiptVoices[0] ?? null,
      ),
    [selectedGraphNodeModel, selectedReceiptVoices, specificAudienceContext, specificAudienceName],
  );
  const selectedAdvisorReview = useMemo(
    () => buildAdvisorReviewSurface(selectedGraphNodeModel, advisorReviewerName, selectedAudienceCritique),
    [advisorReviewerName, selectedAudienceCritique, selectedGraphNodeModel],
  );
  const selectedGraphNodeParent = selectedGraphNode?.node.parentId
    ? nodesById.get(selectedGraphNode.node.parentId) ?? null
    : null;
  const vaultedClaimIds = useMemo(
    () =>
      new Set(
        map.vaultEntries
          .filter((entry) => entry.entryType === "claim" && entry.claimId)
          .map((entry) => entry.claimId as string),
      ),
    [map.vaultEntries],
  );
  const selectedGraphNodeVaulted = Boolean(selectedGraphNode && vaultedClaimIds.has(selectedGraphNode.node.id));
  const mapVaultRegistered = map.vaultEntries.some((entry) => entry.entryType === "map" && entry.mapId === map.id);
  const sessionVaultRegistered = Boolean(
    activeSession && map.vaultEntries.some((entry) => entry.entryType === "session" && entry.sessionId === activeSession.id),
  );
  const selectedDecay = selectedGraphNode
    ? buildConfidenceDecaySnapshot(selectedGraphNode.node, selectedGenealogy.dependents.length)
    : null;
  const selectedCascade = useMemo(
    () => traceContradictionCascade(map.nodes, selectedGraphNode?.node.id ?? defaultGraphNodeId ?? rootNode?.id ?? ""),
    [defaultGraphNodeId, map.nodes, rootNode?.id, selectedGraphNode?.node.id],
  );
  const interleavedStressQueue = useMemo(() => interleaveStressNodes(activeNodes).slice(0, 8), [activeNodes]);
  const claimCapture = useMemo(() => captureSnapshotForMap(map), [map]);
  const inheritedClaimAudit = useMemo(() => inheritedClaimSnapshots([map]), [map]);
  const rhythm = useMemo(() => buildSessionRhythmSnapshot(map), [map]);
  const confusionLog = useMemo(() => buildConfusionLog(map), [map]);
  const claimResolutionEvents = useMemo(
    () =>
      map.events.filter(
        (event) =>
          event.eventType === "claim_resolution" &&
          event.payload &&
          typeof event.payload === "object" &&
          (selectedGraphNode?.node.id == null ? true : event.nodeId === selectedGraphNode.node.id),
      ),
    [map.events, selectedGraphNode?.node.id],
  );
  const resolutionLessons = useMemo(
    () =>
      claimResolutionEvents.flatMap((event) => {
        const payload = event.payload as Record<string, unknown>;
        const lessons = Array.isArray(payload.lessonsCaptured)
          ? payload.lessonsCaptured.filter((lesson): lesson is string => typeof lesson === "string" && lesson.trim().length > 0)
          : [];

        return lessons;
      }),
    [claimResolutionEvents],
  );
  const resolutionTargetNode = selectedGraphNode?.node ?? rootNode ?? null;
  const resolutionCandidateDate =
    claimCapture?.resolutionDate && !Number.isNaN(Date.parse(claimCapture.resolutionDate))
      ? new Date(claimCapture.resolutionDate)
      : null;
  const resolutionDue =
    Boolean(resolutionCandidateDate) &&
    Boolean(claimCapture) &&
    (claimCapture?.status === "open" || claimCapture?.status === "revisiting") &&
    resolutionCandidateDate!.getTime() <= Date.now();
  const resolutionDownstreamClaims = useMemo(() => {
    if (!resolutionTargetNode) {
      return [];
    }

    const adjacency = new Map<string, string[]>();
    for (const edge of claimDependencyGraph.edges) {
      const bucket = adjacency.get(edge.fromNodeId) ?? [];
      bucket.push(edge.toNodeId);
      adjacency.set(edge.fromNodeId, bucket);
    }

    const queue: Array<{ id: string; relation: "direct" | "transitive" }> = [{ id: resolutionTargetNode.id, relation: "direct" }];
    const seen = new Set<string>([resolutionTargetNode.id]);
    const results: ResolutionDownstreamClaim[] = [];

    while (queue.length) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      for (const childId of adjacency.get(current.id) ?? []) {
        if (seen.has(childId)) {
          continue;
        }

        seen.add(childId);
        const node = nodesById.get(childId) ?? null;
        if (node) {
          results.push({
            claimId: node.id,
            claimText: node.content,
            relation: current.id === resolutionTargetNode.id ? "direct" : "transitive",
            currentConfidence: node.scores?.confidence != null ? Math.round(node.scores.confidence * 100) : null,
            suggestedConfidence: node.scores?.confidence != null ? Math.round(node.scores.confidence * 100) : null,
            downstreamArtifacts: [
              ...(map.repairActions.some((repairAction) => repairAction.sourceClaimIds.includes(node.id)) ? ["repair_action"] : []),
              ...(map.revisitSchedules.some((schedule) => schedule.claimId === node.id) ? ["revisit_schedule"] : []),
              ...(map.interventions.some((intervention) => intervention.targetNodeId === node.id) ? ["intervention"] : []),
            ],
          });
        }

        queue.push({ id: childId, relation: "transitive" });
      }
    }

    return results;
  }, [claimDependencyGraph.edges, map.interventions, map.repairActions, map.revisitSchedules, nodesById, resolutionTargetNode]);

  const sessionSummaryPreview = useMemo(() => {
    if (!activeSession) {
      return null;
    }

    return generateSessionSummary({
      sessionId: activeSession.id,
      events: activeSession.sessionEvents,
      scopedClaimIds: activeSession.scopedClaimIds,
      generatedAt: sessionNow,
    });
  }, [activeSession, sessionNow]);

  const sessionTimeBudgetMinutes = activeSession?.timeBudgetMinutes ?? null;
  const sessionElapsedMinutes = activeSession
    ? Math.max(0, (sessionNow.getTime() - activeSession.startedAt.getTime()) / (1000 * 60))
    : 0;
  const sessionRemainingMinutes =
    sessionTimeBudgetMinutes != null ? Math.max(0, sessionTimeBudgetMinutes - sessionElapsedMinutes) : null;
  const sessionProgress =
    sessionTimeBudgetMinutes != null && sessionTimeBudgetMinutes > 0
      ? sessionElapsedMinutes / sessionTimeBudgetMinutes
      : 0;
  const sessionTimeWarning =
    Boolean(activeSession) &&
    activeSession?.endedAt == null &&
    sessionTimeBudgetMinutes != null &&
    sessionProgress >= 0.8 &&
    !sessionTimeWarningDismissed;
  const sessionTimeExpired =
    Boolean(activeSession) &&
    activeSession?.endedAt == null &&
    sessionTimeBudgetMinutes != null &&
    sessionElapsedMinutes >= sessionTimeBudgetMinutes;

  async function appendSessionEventToServer(params: {
    sessionId: string;
    eventType: SessionEvent["eventType"];
    claimId?: string | null;
    description: string;
  }) {
    try {
      await fetch("/api/sessions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: params.sessionId,
          eventType: params.eventType,
          claimId: params.claimId ?? null,
          description: params.description,
        }),
      });
    } catch {
      return;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      setSessionLoading(true);

      try {
        const response = await fetch(`/api/sessions?mapId=${map.id}`);
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { session?: SerializableThinkingSession | null };
        if (cancelled) {
          return;
        }

        const nextSession = payload.session ? normalizeSession(payload.session) : null;
        setActiveSession(nextSession);
        setSessionStartVisible(!nextSession);
        setSessionCloseVisible(false);
        setSessionTimeWarningDismissed(false);
      } catch {
        if (!cancelled) {
          setSessionStartVisible(true);
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [map.id]);

  useEffect(() => {
    if (!activeSession || activeSession.endedAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setSessionNow(new Date());
    }, 15000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeSession, activeSession?.id, activeSession?.endedAt]);

  useEffect(() => {
    if (!activeSession || activeSession.endedAt || sessionTimeBudgetMinutes == null) {
      return;
    }

    if (sessionTimeExpired) {
      setSessionCloseVisible(true);
    }
  }, [activeSession, sessionTimeBudgetMinutes, sessionTimeExpired]);

  useEffect(() => {
    if (!activeSession || activeSession.endedAt) {
      lastOpenedClaimIdRef.current = null;
      return;
    }

    if (selectedGraphNodeId && lastOpenedClaimIdRef.current !== selectedGraphNodeId) {
      lastOpenedClaimIdRef.current = selectedGraphNodeId;
      void appendSessionEventToServer({
        sessionId: activeSession.id,
        eventType: "claim_opened",
        claimId: selectedGraphNodeId,
        description: `Opened claim ${nodesById.get(selectedGraphNodeId)?.content ?? selectedGraphNodeId}.`,
      });
    }
  }, [activeSession, nodesById, selectedGraphNodeId]);

  async function refreshBlindSpotMap() {
    if (!map.userId) {
      return;
    }

    setBlindSpotMapRefreshing(true);

    try {
      const response = await fetch(`/api/users/${map.userId}/blind-spots`, {
        method: "POST",
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { blindSpotMap?: SerializableBlindSpotMap | null };
      if (payload.blindSpotMap) {
        setBlindSpotMap(normalizeBlindSpotMap(payload.blindSpotMap));
        if (activeSession && !activeSession.endedAt) {
          void appendSessionEventToServer({
            sessionId: activeSession.id,
            eventType: "blind_spot_reviewed",
            claimId: null,
            description: "Refreshed the blind spot map from the workspace.",
          });
        }
      }
    } catch {
      return;
    } finally {
      setBlindSpotMapRefreshing(false);
      setBlindSpotMapLoading(false);
    }
  }

  async function refreshBiasProfile() {
    if (!map.userId) {
      return;
    }

    setBiasProfileRefreshing(true);

    try {
      const response = await fetch(`/api/users/${map.userId}/bias-profile`, {
        method: "POST",
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { profile?: SerializableCognitiveBiasProfile | null };
      if (payload.profile) {
        setBiasProfile(normalizeBiasProfile(payload.profile));
      }
    } catch {
      return;
    } finally {
      setBiasProfileRefreshing(false);
      setBiasProfileLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadBiasProfile() {
      if (!map.userId) {
        if (!cancelled) {
          setBiasProfileLoading(false);
        }
        return;
      }

      setBiasProfileRefreshing(true);

      try {
        const response = await fetch(`/api/users/${map.userId}/bias-profile`, {
          method: "POST",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { profile?: SerializableCognitiveBiasProfile | null };
        if (payload.profile) {
          setBiasProfile(normalizeBiasProfile(payload.profile));
        }
      } catch {
        return;
      } finally {
        if (!cancelled) {
          setBiasProfileRefreshing(false);
          setBiasProfileLoading(false);
        }
      }
    }

    setBiasProfileLoading(true);
    void loadBiasProfile();

    return () => {
      cancelled = true;
    };
  }, [map.updatedAt, map.userId]);

  useEffect(() => {
    let cancelled = false;

    setBlindSpotMapLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/users/${map.userId}/blind-spots`);
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { blindSpotMap?: SerializableBlindSpotMap | null };
        if (!cancelled && payload.blindSpotMap) {
          setBlindSpotMap(normalizeBlindSpotMap(payload.blindSpotMap));
        }
      } catch {
        return;
      } finally {
        if (!cancelled) {
          setBlindSpotMapLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [map.updatedAt, map.userId]);
  const bestSteelmanTarget = map.recommendedNextMove
    ? map.nodes.find((node) => node.id === map.recommendedNextMove?.targetNodeId) ?? null
    : selectedGraphNode?.node ?? weakestLearningNode ?? map.nodes.find((node) => node.kind === "core_claim") ?? rootNode ?? null;
  const steelmanTargetText = bestSteelmanTarget?.content ?? map.rawThought;
  const steelmanPrompt = `Argue the strongest possible version of this position: ${steelmanTargetText}`;
  const selectedNormChallengeNode =
    selectedGraphNode?.node ?? map.nodes.find((node) => /norm|should|must|rule/i.test(node.content)) ?? null;
  const synthesisPreMortemBase = selectedGraphNode?.node.content ?? map.recommendedNextMove?.summary ?? map.rawThought;
  const synthesisPreMortem = resolutionLessons.length
    ? `${synthesisPreMortemBase} Lesson to carry forward: ${resolutionLessons[0]}.`
    : synthesisPreMortemBase;
  const synthesisIfRight = selectedGraphNode
    ? `If this claim holds, what becomes possible and what becomes necessary for ${kindLabel(selectedGraphNode.node.kind)} work?`
    : "If this claim holds, what becomes possible and what becomes necessary?";
  const synthesisTwinCheck = steelmanTargetText;
  const synthesisDependencyCount = claimDependencyGraph.loadBearingNodeIds.length;
  const synthesisStakesLevel =
    synthesisDependencyCount >= 6 || map.founderBriefReadiness.missingRequirements.length >= 2
      ? "heavy"
      : synthesisDependencyCount >= 3 || map.founderBriefReadiness.missingRequirements.length === 1
        ? "moderate"
        : "light";
  const adversarialFinalPass = useMemo(() => buildAdversarialFinalPass(map), [map]);
  const synthesisMissingCoverage = map.founderBriefReadiness.missingRequirements.map((requirement) =>
    requirement.replaceAll("_", " "),
  );
  if (map.founderBriefReadiness.evidenceGateMessage) {
    synthesisMissingCoverage.push(map.founderBriefReadiness.evidenceGateMessage);
  }
  const quietKeystoneCascade = useMemo(
    () =>
      adversarialFinalPass.loadBearingAssumption
        ? traceContradictionCascade(map.nodes, adversarialFinalPass.loadBearingAssumption.id)
        : [],
    [adversarialFinalPass.loadBearingAssumption, map.nodes],
  );
  const inspectorScores = selectedGraphNode
    ? [
        { label: "Strength", value: selectedGraphNode.node.scores?.strength ?? null },
        { label: "Evidence", value: selectedGraphNode.node.scores?.evidence ?? null },
        { label: "Specificity", value: selectedGraphNode.node.scores?.specificity ?? null },
        { label: "Dependency risk", value: selectedGraphNode.node.scores?.dependencyRisk ?? null },
      ]
    : [];

  function mergeMapUpdate(response: ActionResponse) {
    const updatedNodes = response.updatedNodes.map(normalizeNode);
    const createdNodes = response.createdNodes.map(normalizeNode);
    const normalizedInterventions = response.interventions?.map(normalizeIntervention);
    const normalizedRecommendedIntervention = response.recommendedIntervention
      ? normalizeIntervention(response.recommendedIntervention)
      : response.recommendedIntervention === null
        ? null
        : undefined;
    const syntheticMoveEvent: SerializableThoughtMapEvent = {
      id: `local:${response.action}:${response.execution.targetNodeId}:${Date.now()}`,
      mapId: map.id,
      nodeId: response.execution.targetNodeId,
      interventionId: null,
      eventType: "move_applied",
      payload: {
        action: response.action,
        executionMode: response.execution.mode,
        targetNodeKind: response.execution.targetNodeKind,
        targetParentId: response.execution.targetParentId,
        supersededNodeId: response.execution.supersededNodeId,
        createdNodeIds: response.createdNodes.map((node) => node.id),
        updatedNodeIds: response.updatedNodes.map((node) => node.id),
      },
      createdAt: new Date(),
    };

    setMap((currentMap) => {
      const updatedLookup = new Map(updatedNodes.map((node) => [node.id, node]));
      const baseNodes = currentMap.nodes.map((node) => updatedLookup.get(node.id) ?? node);
      const deduped = new Map(baseNodes.map((node) => [node.id, node]));

      for (const node of createdNodes) {
        deduped.set(node.id, node);
      }

      return {
        ...currentMap,
        nodes: Array.from(deduped.values()).sort(
          (a, b) => a.branchOrder - b.branchOrder || a.createdAt.getTime() - b.createdAt.getTime(),
        ),
        graphSnapshot: response.graphSnapshot ?? currentMap.graphSnapshot,
        interventions: normalizedInterventions ?? currentMap.interventions,
        recommendedIntervention:
          normalizedRecommendedIntervention === undefined
            ? currentMap.recommendedIntervention
            : normalizedRecommendedIntervention,
        recommendedNextMove: response.recommendedNextMove ?? currentMap.recommendedNextMove,
        events: [...currentMap.events, normalizeEvent(syntheticMoveEvent)].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        ),
        updatedAt: new Date(),
      };
    });
  }

  function mergeShapeFeedbackEvent(event: SerializableThoughtMapEvent) {
    const normalizedEvent = normalizeEvent(event);

    setMap((currentMap) => ({
      ...currentMap,
      events: [...currentMap.events, normalizedEvent].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      ),
      updatedAt: new Date(),
    }));
  }

  function mergeDialecticRoundEvent(event: SerializableThoughtMapEvent) {
    const normalizedEvent = normalizeEvent(event);

    setMap((currentMap) => ({
      ...currentMap,
      events: [...currentMap.events, normalizedEvent].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      ),
      updatedAt: new Date(),
    }));
  }

  function mergeBeliefPropagationEvent(event: SerializableThoughtMapEvent) {
    const normalizedEvent = normalizeEvent(event);

    setMap((currentMap) => ({
      ...currentMap,
      events: [...currentMap.events, normalizedEvent].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      ),
      updatedAt: new Date(),
    }));
  }

  function mergeMetaCognitionEvent(event: SerializableThoughtMapEvent) {
    const normalizedEvent = normalizeEvent(event);

    setMap((currentMap) => ({
      ...currentMap,
      events: [...currentMap.events, normalizedEvent].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      ),
      updatedAt: new Date(),
    }));
  }

  function mergeCritiqueFeedbackEvent(event: SerializableThoughtMapEvent) {
    const normalizedEvent = normalizeEvent(event);

    setMap((currentMap) => ({
      ...currentMap,
      events: [...currentMap.events, normalizedEvent].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      ),
      critiqueFeedbacks: collectCritiqueFeedback([...currentMap.events, normalizedEvent]),
      critiqueCorrections: collectCritiqueCorrections([...currentMap.events, normalizedEvent]),
      critiqueQualityProfile: buildCritiqueQualityProfile(
        {
          ...currentMap,
          events: [...currentMap.events, normalizedEvent].sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          ),
        } as ThoughtMapModel,
      ),
      updatedAt: new Date(),
    }));
  }

  function mergeSteelMan(steelMan: SerializableSteelMan) {
    const normalizedSteelMan = normalizeSteelMan(steelMan);

    setMap((currentMap) => {
      const nextSteelMans = currentMap.steelMans.filter(
        (existing) => !(existing.claimId === normalizedSteelMan.claimId && existing.userId === normalizedSteelMan.userId),
      );

      nextSteelMans.push(normalizedSteelMan);
      nextSteelMans.sort(
        (a, b) =>
          (b.updatedAt?.getTime() ?? b.writtenAt.getTime()) - (a.updatedAt?.getTime() ?? a.writtenAt.getTime()) ||
          b.writtenAt.getTime() - a.writtenAt.getTime(),
      );

      return {
        ...currentMap,
        steelMans: nextSteelMans,
        updatedAt: new Date(),
      };
    });
  }

  function recordBeliefPropagationDecision(params: {
    seedClaimId: string;
    targetClaimId: string;
    decisionType: "accept" | "override" | "decouple";
    reasoning: string;
    oldPosterior: number;
    proposedPosterior: number;
    finalPosterior: number;
    arithmetic: {
      parentId: string;
      parentPrior: number;
      parentPosterior: number;
      edgeProbability: number;
      formula: string;
    };
  }) {
    const trimmedReasoning = params.reasoning.trim();
    if (trimmedReasoning.length < 8) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/propagate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            seedClaimId: params.seedClaimId,
            action: params.decisionType,
            targetClaimId: params.targetClaimId,
            decisionType: params.decisionType,
            reason: trimmedReasoning,
            oldPosterior: params.oldPosterior,
            proposedPosterior: params.proposedPosterior,
            finalPosterior: params.finalPosterior,
            arithmetic: params.arithmetic,
          }),
        });

        if (!response.ok && response.status !== 409) {
          return;
        }

        const payload = (await response.json()) as { events?: SerializableThoughtMapEvent[] };
        payload.events?.forEach((event) => mergeBeliefPropagationEvent(event));
        setPropagationAcknowledged((current) => ({
          ...current,
          [params.targetClaimId]: params.decisionType,
        }));
        if (activeSession && !activeSession.endedAt) {
          void appendSessionEventToServer({
            sessionId: activeSession.id,
            eventType: "confidence_update",
            claimId: params.targetClaimId,
            description: `Recorded a ${params.decisionType} confidence propagation for ${params.targetClaimId}.`,
          });
        }
        setConfidenceOverrideReasons((current) => ({ ...current, [params.targetClaimId]: "" }));
        setPropagationFinalPosteriorDrafts((current) => {
          const next = { ...current };
          delete next[params.targetClaimId];
          return next;
        });
      } catch {
        return;
      }
    });
  }

  function persistBeliefPropagation(seedClaimId: string, updatedPosterior: number | null) {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/propagate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            seedClaimId,
            updatedPosterior,
            action: "compute",
          }),
        });

        if (!response.ok && response.status !== 409) {
          return;
        }

        const payload = (await response.json()) as { events?: SerializableThoughtMapEvent[] };
        payload.events?.forEach((event) => mergeBeliefPropagationEvent(event));
      } catch {
        return;
      }
    });
  }

  function recordConfidenceOverride(
    sourceNodeId: string,
    targetNodeId: string,
    reasoning: string,
    mode: "hold" | "reduce" | "decouple" = "hold",
  ) {
    const step = selectedPropagation?.cascade.find((candidate) => candidate.targetNodeId === targetNodeId) ?? null;
    const seedClaimId = sourceNodeId;
    const decisionType = mode === "decouple" ? "decouple" : mode === "reduce" ? "override" : "accept";
    const oldPosterior = step?.baseConfidence ?? selectedGraphNode?.node.scores?.confidence ?? 0;
    const proposedPosterior = step?.propagatedConfidence ?? selectedGraphNode?.node.scores?.confidence ?? 0;
    const finalPosteriorDraft = propagationFinalPosteriorDrafts[targetNodeId];
    const finalPosterior =
      finalPosteriorDraft != null
        ? finalPosteriorDraft / 100
        : decisionType === "accept"
          ? proposedPosterior
          : decisionType === "decouple"
            ? oldPosterior
            : proposedPosterior;
    const sourceConfidence = step?.sourceConfidence ?? selectedGraphNode?.node.scores?.confidence ?? 0;

    recordBeliefPropagationDecision({
      seedClaimId: selectedPropagation?.seedNodeId ?? seedClaimId,
      targetClaimId: targetNodeId,
      decisionType,
      reasoning,
      oldPosterior,
      proposedPosterior,
      finalPosterior,
      arithmetic: {
        parentId: seedClaimId,
        parentPrior: oldPosterior,
        parentPosterior: sourceConfidence,
        edgeProbability: step?.edgeFactor ?? 0,
        formula: step
          ? `${formatScore(step.sourceConfidence)}% × ${Math.round(step.edgeFactor * 100)}% = ${formatScore(proposedPosterior)}%`
          : `${formatScore(oldPosterior)}% → ${formatScore(finalPosterior)}%`,
      },
    });
  }

  function recordShapeFeedback(
    shape: { id: string; label: string; primaryMapId: string | null },
    verdict: PennyShapeFeedback,
    reasoning: string,
    falsificationCondition?: string | null,
  ) {
    const mapId = shape.primaryMapId ?? map.id;
    const previousVerdict = shapeFeedback[shape.id];
    const restoreFeedback = () =>
      setShapeFeedback((current) => {
        const next = { ...current };

        if (previousVerdict) {
          next[shape.id] = previousVerdict;
        } else {
          delete next[shape.id];
        }

        return next;
      });

    setShapeFeedback((current) => ({ ...current, [shape.id]: verdict }));

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${mapId}/shape-feedback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shapeId: shape.id,
            verdict,
            shapeLabel: shape.label,
            source: "workspace",
            reasoning,
            falsificationCondition: falsificationCondition ?? null,
            nodeId: selectedGraphNode?.node.id ?? selectedGraphNodeModel?.id ?? null,
          }),
        });

        if (!response.ok) {
          restoreFeedback();
          return;
        }

        const payload = (await response.json()) as { event: SerializableThoughtMapEvent };
        mergeShapeFeedbackEvent(payload.event);
        setShapeOverrideReasons((current) => {
          const next = { ...current };
          delete next[shape.id];
          return next;
        });
      } catch {
        restoreFeedback();
        return;
      }
    });
  }

  function recordMetaCognitionResponse(
    prompt: MetaCognitionPromptSnapshot | null,
    responseType: MetaCognitionResponseType,
    responseText: string | null,
    tellMeMoreOpened: boolean,
  ) {
    if (!prompt) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/meta-cognition`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            triggerId: prompt.trigger.id,
            condition: prompt.trigger.condition,
            prompt: prompt.prompt,
            promptTone: prompt.trigger.promptTone,
            sessionContext: prompt.sessionContext,
            evidence: prompt.evidence,
            shapesAssociated: prompt.shapesAssociated,
            selectedNodeId: prompt.selectedNodeId,
            responseType,
            responseText,
            tellMeMoreOpened,
            behaviorChangedWithinTenMinutes: null,
          }),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { event: SerializableThoughtMapEvent };
        mergeMetaCognitionEvent(payload.event);
      } catch {
        return;
      }
    });
  }

  function buildLearningPromptAfterRound(params: {
    response: string;
    round: SerializableDialecticRound | null;
    critiqueFailureTypes: string[];
  }) {
    const selectedNode = selectedGraphNode?.node ?? selectedGraphNodeModel;
    if (!selectedNode) {
      return null;
    }

    const claim: LearningPromptClaim = {
      id: selectedNode.id,
      mapId: map.id,
      userId: map.userId,
      text: selectedNode.content,
      confidence: Math.round((selectedNode.scores?.confidence ?? 0) * 100),
      structureKind: "assertion",
      provenance: "intuition",
      stakes: [],
      domain: classifyCalibrationDomain(`${selectedNode.content} ${selectedNode.note ?? ""}`),
    };

    const round: LearningPromptRound | null = params.round
      ? {
          id: params.round.id,
          claimId: params.round.claimId ?? claim.id,
          roundNumber: params.round.roundNumber,
          critiqueFailureTypes: params.round.critiqueFailureTypes ?? params.critiqueFailureTypes ?? [],
          confidenceAtRoundStart: params.round.confidenceAtRoundStart,
          confidenceAtRoundEnd: params.round.confidenceAtRoundEnd,
          confidenceDelta: params.round.confidenceDelta,
          engagementScore: params.round.engagementScore,
          userResponse: params.round.userResponse,
          responseClassification: params.round.responseClassification,
        }
      : {
          id: `${map.id}:${claim.id}:round`,
          claimId: claim.id,
          roundNumber: params.critiqueFailureTypes.length + 1,
          critiqueFailureTypes: params.critiqueFailureTypes,
          confidenceAtRoundStart: Math.round((selectedNode.scores?.confidence ?? 0) * 100),
          confidenceAtRoundEnd: Math.round((selectedNode.scores?.confidence ?? 0) * 100),
          confidenceDelta: 0,
          engagementScore: 0,
          userResponse: params.response,
          responseClassification: null,
        };

    const triggerType =
      round.confidenceDelta <= -10
        ? "confidence_drop"
        : params.response.trim().length < 24 || round.responseClassification?.type === "dismissal"
          ? "low_engagement"
          : "post_challenge";

    return generateLearningPrompt({
      claim,
      round,
      userResponse: params.response,
      triggerType,
    });
  }

  function recordCritiqueFeedback(params: {
    round: SerializableDialecticRound | null;
    dismissed?: boolean;
    ratings?: Array<{ dimension: CritiqueFeedbackModel["ratings"][number]["dimension"]; score: number; comment: string | null }>;
    overallUsefulness?: number;
    freeTextFeedback?: string | null;
    correctionText?: string | null;
    correctionType?: CritiqueCorrectionModel["correctionType"];
    isCorrectionFlagged?: boolean;
    shapeId?: string | null;
  }) {
    const round = params.round;
    if (!round) {
      return;
    }
    const critiqueId = round.id;
    const dismissed = params.dismissed ?? false;
    const ratings =
      params.ratings ??
      ([
        "relevance",
        "novelty",
        "strength",
        "specificity",
        "actionability",
        "timing",
      ] as const).map((dimension) => ({
        dimension,
        score: 3,
        comment: null,
      }));
    const overallUsefulness =
      params.overallUsefulness ?? Math.max(1, Math.min(5, Math.round(ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length)));

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/critique-feedback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roundId: round.id,
            critiqueId,
            userId: map.userId,
            ratings,
            overallUsefulness,
            freeTextFeedback: params.freeTextFeedback ?? null,
            correctionText: params.correctionText ?? null,
            correctionType: params.correctionType ?? "other",
            isCorrectionFlagged: params.isCorrectionFlagged ?? false,
            dismissed,
            shapeId: params.shapeId ?? selectedShape?.id ?? null,
            critiqueMode: critiqueMode,
            voiceLabel: selectedAudienceCritique?.audienceLabel ?? peerAudience,
            failureTypes: round.critiqueFailureTypes ?? [],
          }),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          feedback: SerializableThoughtMapEvent;
          correction?: SerializableThoughtMapEvent | null;
          profileEvent?: SerializableThoughtMapEvent | null;
        };
        mergeCritiqueFeedbackEvent(payload.feedback);
        if (payload.correction) {
          mergeCritiqueFeedbackEvent(payload.correction);
        }
        if (payload.profileEvent) {
          mergeCritiqueFeedbackEvent(payload.profileEvent);
        }
      } catch {
        return;
      }
    });
  }

  function updateDialecticRoundContext(
    roundKey: string,
    patch: Partial<{
      confidenceAtRoundEnd: number;
      concessionNote: string;
      connectedClaimsChanged: boolean | null;
      connectedClaimsNote: string;
      newEvidenceNote: string;
    }>,
  ) {
    const fallbackConfidence = Math.round((selectedGraphNode?.node.scores?.confidence ?? 0) * 100);

    setDialecticRoundContextDrafts((current) => {
      const existing = current[roundKey] ?? {
        confidenceAtRoundEnd: fallbackConfidence,
        concessionNote: "",
        connectedClaimsChanged: null,
        connectedClaimsNote: "",
        newEvidenceNote: "",
      };

      return {
        ...current,
        [roundKey]: {
          ...existing,
          ...patch,
        },
      };
    });
  }

  function recordDialecticRound(params: {
    round: string;
    roundIndex: number;
    title: string;
    critiqueStrength: string;
    critiqueType?: CritiqueFailureType | string;
    critiqueFailureTypes?: string[];
    critiqueMode?: "direct" | "socratic" | "red_team";
    voiceLabel?: string | null;
    prompt: string;
    why: string;
    responsePath: "defend" | "revise" | "absorb";
    response?: string;
  }) {
    const response = (params.response ?? dialecticResponseDrafts[params.round] ?? "").trim();
    const currentConfidence = Math.round((selectedGraphNode?.node.scores?.confidence ?? 0) * 100);
    const roundContext = dialecticRoundContextDrafts[params.round] ?? {
      confidenceAtRoundEnd: currentConfidence,
      concessionNote: "",
      connectedClaimsChanged: null,
      connectedClaimsNote: "",
      newEvidenceNote: "",
    };

    if (response.length < 8) {
      return;
    }

    startTransition(async () => {
      const claimId = selectedGraphNode?.node.id ?? selectedGraphNodeModel?.id ?? null;

      void track(
        {
          event: "challenge_started",
          properties: {
            claimId: claimId ?? "unknown",
            roundNumber: params.roundIndex + 1,
          },
        },
        map.userId,
      );

      try {
        const responsePayload = await fetch(`/api/maps/${map.id}/dialectic-rounds`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nodeId: selectedGraphNode?.node.id ?? selectedGraphNodeModel?.id ?? null,
            round: params.round,
            roundIndex: params.roundIndex,
            title: params.title,
            critiqueStrength: params.critiqueStrength,
            critiqueType: params.critiqueType ?? null,
            critiqueFailureTypes: params.critiqueFailureTypes ?? (params.critiqueType ? [params.critiqueType] : []),
            critiqueMode: params.critiqueMode ?? critiqueMode,
            voiceLabel: params.voiceLabel ?? (selectedAudienceCritique?.audienceLabel ?? peerAudience),
            prompt: params.prompt,
            why: params.why,
            responsePath: params.responsePath,
            response,
            roundContext: {
              currentConfidence,
              confidenceAtRoundEnd: roundContext.confidenceAtRoundEnd,
              concessionNote: roundContext.concessionNote,
              connectedClaimsChanged: roundContext.connectedClaimsChanged,
              connectedClaimsNote: roundContext.connectedClaimsNote,
              newEvidenceNote: roundContext.newEvidenceNote,
            },
          }),
        });

        if (!responsePayload.ok) {
          return;
        }

        const payload = (await responsePayload.json()) as {
          event: SerializableThoughtMapEvent;
          round?: SerializableDialecticRound | null;
          roundContext?: unknown;
        };
        mergeDialecticRoundEvent(payload.event);
        const prompt = buildLearningPromptAfterRound({
          response,
          round: payload.round ?? null,
          critiqueFailureTypes: params.critiqueFailureTypes ?? (params.critiqueType ? [params.critiqueType] : []),
        });
        setLearningPrompt(prompt);
        setLearningPromptRoundId(payload.round?.id ?? null);
        setLearningPromptDismissed(false);
        setDialecticResponseDrafts((current) => {
          const next = { ...current };
          delete next[params.round];
          return next;
        });
        if (activeSession && !activeSession.endedAt) {
          void appendSessionEventToServer({
            sessionId: activeSession.id,
            eventType: "critique_round",
            claimId,
            description: `${params.title}: ${response.slice(0, 160)}`,
          });
        }
        void track(
          {
            event: "challenge_completed",
            properties: {
              claimId: claimId ?? "unknown",
              roundNumber: params.roundIndex + 1,
              engagementScore: Math.min(1, Math.max(0, response.length / 240)),
            },
          },
          map.userId,
        );
        setDialecticRoundContextDrafts((current) => {
          const next = { ...current };
          delete next[params.round];
          return next;
        });
      } catch {
        return;
      }
    });
  }

  function recordClaimRepair(submission: {
    actionType: string;
    initiatedBy: "user" | "penny_suggestion";
    sourceClaimIds: string[];
    reasoning: string;
    details: Record<string, unknown>;
    propagationTriggered: boolean;
  }) {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/repair`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(submission),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { map: SerializableThoughtMap };
        setMap(normalizeMap(payload.map));
        setRepairModalOpen(false);
      } catch {
        return;
      }
    });
  }

  function recordClaimResolution(submission: ResolutionSubmission) {
    const claimId = resolutionTargetNode?.id ?? selectedGraphNode?.node.id ?? rootNode?.id ?? null;

    if (!claimId) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/claims/${claimId}/resolve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(submission),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { map: SerializableThoughtMap };
        setMap(normalizeMap(payload.map));
        setResolutionFlowOpen(false);
        if (activeSession && !activeSession.endedAt) {
          void appendSessionEventToServer({
            sessionId: activeSession.id,
            eventType: "confidence_update",
            claimId,
            description: `Recorded a resolution for ${claimId}.`,
          });
        }
      } catch {
        return;
      }
    });
  }

  function updateRevisitTriggerDraft(
    claimId: string,
    patch: Partial<{
      triggerType: TriggerDefinition["triggerType"];
      dateTarget: string;
      eventKeyword: string;
      confidenceThreshold: string;
      dependencyClaimId: string;
    }>,
  ) {
    setRevisitTriggerDrafts((current) => {
      const existing = current[claimId] ?? {
        triggerType: "manual_flag" as const,
        dateTarget: "",
        eventKeyword: "",
        confidenceThreshold: "",
        dependencyClaimId: claimId,
      };

      return {
        ...current,
        [claimId]: {
          ...existing,
          ...patch,
        },
      };
    });
  }

  function submitRevisitTrigger(claimId: string) {
    const draft = revisitTriggerDrafts[claimId];

    if (!draft) {
      return;
    }

    const triggerDefinition = {
      triggerType: draft.triggerType,
      dateTarget: draft.dateTarget ? new Date(draft.dateTarget).toISOString() : null,
      eventKeyword: draft.eventKeyword.trim() || null,
      confidenceThreshold: draft.confidenceThreshold ? Number(draft.confidenceThreshold) : null,
      dependencyClaimId: draft.dependencyClaimId.trim() || null,
    };

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/revisits`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            operation: "set_trigger",
            claimId,
            triggerDefinition,
          }),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { map: SerializableThoughtMap };
        setMap(normalizeMap(payload.map));
      } catch {
        return;
      }
    });
  }

  function recordRevisitAction(
    claimId: string,
    type: "reviewed_no_change" | "confidence_updated" | "claim_updated" | "claim_retired" | "snoozed" | "triggered_repair" | "triggered_dialectic",
  ) {
    const draft = revisitTriggerDrafts[claimId] ?? null;
    const triggerDefinition = draft
      ? {
          triggerType: draft.triggerType,
          dateTarget: draft.dateTarget ? new Date(draft.dateTarget).toISOString() : null,
          eventKeyword: draft.eventKeyword.trim() || null,
          confidenceThreshold: draft.confidenceThreshold ? Number(draft.confidenceThreshold) : null,
          dependencyClaimId: draft.dependencyClaimId.trim() || null,
        }
      : null;

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/revisits`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            operation: "act",
            claimId,
            type,
            notes: type === "snoozed" ? "Snoozed from the queue" : null,
            triggerDefinition,
            snoozedUntil: type === "snoozed" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
          }),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { map: SerializableThoughtMap };
        setMap(normalizeMap(payload.map));
        if (activeSession && !activeSession.endedAt) {
          void appendSessionEventToServer({
            sessionId: activeSession.id,
            eventType: "revisit_completed",
            claimId,
            description: `Marked revisit action ${type} for ${claimId}.`,
          });
        }
      } catch {
        return;
      }
    });
  }

  function runAction(nodeId: string, action: (typeof ACTIONS)[number]["key"]) {
    setActiveNodeId(nodeId);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/nodes/${nodeId}/actions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as ActionResponse;
        setLastAction(payload);
        mergeMapUpdate(payload);
        for (const node of payload.createdNodes) {
          void track(
            {
              event: "claim_created",
              properties: {
                claimId: node.id,
                mapId: map.id,
                domain: classifyCalibrationDomain(node.content),
              },
            },
            map.userId,
          );
        }
        if (activeSession && !activeSession.endedAt && payload.createdNodes.length > 0) {
          void appendSessionEventToServer({
            sessionId: activeSession.id,
            eventType: "claim_created",
            claimId: nodeId,
            description: `Created ${payload.createdNodes.length} new claim${payload.createdNodes.length === 1 ? "" : "s"} from ${nodeId}.`,
          });
        }
      } catch {
        return;
      } finally {
        setActiveNodeId(null);
      }
    });
  }

  function runRecommendedNextMove() {
    if (!map.recommendedNextMove) {
      return;
    }

    setRunningRecommendedMove(true);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/recommended-next-move`, {
          method: "POST",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as ActionResponse;
        setLastAction(payload);
        mergeMapUpdate(payload);
        for (const node of payload.createdNodes) {
          void track(
            {
              event: "claim_created",
              properties: {
                claimId: node.id,
                mapId: map.id,
                domain: classifyCalibrationDomain(node.content),
              },
            },
            map.userId,
          );
        }
        if (activeSession && !activeSession.endedAt && payload.createdNodes.length > 0) {
          void appendSessionEventToServer({
            sessionId: activeSession.id,
            eventType: "claim_created",
            claimId: map.recommendedNextMove?.targetNodeId ?? null,
            description: `Executed the recommended move and created ${payload.createdNodes.length} claim${payload.createdNodes.length === 1 ? "" : "s"}.`,
          });
        }
      } catch {
        return;
      } finally {
        setRunningRecommendedMove(false);
      }
    });
  }

  function founderBriefReadinessMessage() {
    const dependencyHealthSentence = founderBriefDependencyPreview
      ? `Current load-bearing claims average dependency health is ${founderBriefDependencyPreview.averageHealth}/100, and the weakest link is ${founderBriefDependencyPreview.health.weakestLink.claimText}.`
      : "The map does not yet expose enough load-bearing claims for a dependency-health preview.";

    if (map.founderBriefReadiness.eligible) {
      return `Ready to generate. ${dependencyHealthSentence} The map has at least one active assumption, counterargument, and research branch, but Penny still keeps the synthesis gates visible so the user can judge the risk.`;
    }

    return `Still at risk: ${synthesisMissingCoverage.join(", ")}. ${dependencyHealthSentence} Penny should warn the user and let them choose to proceed anyway if the output is worth the risk.`;
  }

  function runFounderBrief() {
    setFounderBriefError(null);
    setRunningFounderBrief(true);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/maps/${map.id}/founder-brief`, {
          method: "POST",
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          setFounderBriefError(
            response.status === 409
              ? payload?.message ?? founderBriefReadinessMessage()
              : payload?.message ?? "Penny could not generate the founder brief.",
          );
          return;
        }

        const payload = (await response.json()) as FounderBriefResponse;
        setMap(normalizeMap(payload.map));
        if (activeSession && !activeSession.endedAt) {
          void appendSessionEventToServer({
            sessionId: activeSession.id,
            eventType: "artifact_generated",
            claimId: null,
            description: "Generated a founder brief from the map.",
          });
        }
      } catch {
        setFounderBriefError("Penny could not generate the founder brief.");
      } finally {
        setRunningFounderBrief(false);
      }
    });
  }

  function openVaultManager() {
    setVaultDraft(null);
    setVaultModalOpen(true);
  }

  function openVaultDraft(draft: VaultDraft) {
    setVaultDraft(draft);
    setVaultModalOpen(true);
  }

  function makeVaultPayload(
    entryType: VaultContentPayload["entryType"],
    title: string,
    description: string,
    content: unknown,
    sourceMapId: string | null,
    sourceClaimId: string | null,
    sourceSessionId: string | null,
  ): VaultContentPayload {
    return {
      entryType,
      title,
      description,
      sourceMapId,
      sourceClaimId,
      sourceSessionId,
      capturedAt: new Date().toISOString(),
      content,
    };
  }

  function vaultClaim(node: ThoughtNodeModel) {
    if (vaultedClaimIds.has(node.id)) {
      openVaultManager();
      return;
    }

    openVaultDraft({
      entryType: "claim",
      mapId: map.id,
      claimId: node.id,
      sessionId: activeSession?.id ?? null,
      title: `Vault claim: ${node.content.slice(0, 64)}`,
      description: "Store this claim only on the current device and keep the server copy redacted from future views.",
      payload: makeVaultPayload(
        "claim",
        node.content,
        node.note ?? "Sensitive claim moved to local-only storage.",
        {
          node,
          map: {
            id: map.id,
            title: map.title,
            rawThought: map.rawThought,
          },
          parentId: node.parentId,
          status: node.nodeStatus,
          score: node.scores,
        },
        map.id,
        node.id,
        activeSession?.id ?? null,
      ),
    });
  }

  function vaultMap() {
    if (mapVaultRegistered) {
      openVaultManager();
      return;
    }

    openVaultDraft({
      entryType: "map",
      mapId: map.id,
      sessionId: activeSession?.id ?? null,
      title: `Vault map: ${map.title}`,
      description: "Store the map snapshot locally. The encrypted version never syncs to the server.",
      payload: makeVaultPayload(
        "map",
        map.title,
        map.rawThought,
        {
          map,
          selectedClaimId: selectedGraphNode?.node.id ?? null,
          selectedSessionId: activeSession?.id ?? null,
        },
        map.id,
        null,
        activeSession?.id ?? null,
      ),
    });
  }

  function vaultSession() {
    if (!activeSession || activeSession.endedAt) {
      return;
    }

    if (sessionVaultRegistered) {
      openVaultManager();
      return;
    }

    openVaultDraft({
      entryType: "session",
      mapId: map.id,
      sessionId: activeSession.id,
      title: `Vault session: ${activeSession.declaredIntention}`,
      description: "Store the session snapshot locally so it never syncs to another device.",
      payload: makeVaultPayload(
        "session",
        activeSession.declaredIntention,
        activeSession.declaredIntention,
        {
          session: activeSession,
          map: {
            id: map.id,
            title: map.title,
          },
          selectedClaimId: selectedGraphNode?.node.id ?? null,
        },
        map.id,
        selectedGraphNode?.node.id ?? null,
        activeSession.id,
      ),
    });
  }

  function visibleActions(node: ThoughtNodeModel) {
    if (map.recommendedIntervention?.type !== "reduce_choices" || map.recommendedIntervention.targetNodeId !== node.id) {
      return ACTIONS;
    }

    const preferred = map.recommendedNextMove?.action;
    const ordered = [
      ...(preferred ? ACTIONS.filter((action) => action.key === preferred) : []),
      ...ACTIONS.filter((action) => action.key !== preferred),
    ];

    return ordered.slice(0, 3);
  }

  function changeView(nextView: MapView) {
    setView(nextView);

    if (nextView === "graph" && !selectedGraphNodeId) {
      setSelectedGraphNodeId(defaultGraphNodeId);
    }
  }

  function renderNode(node: ThoughtNodeModel, depth = 0): React.ReactNode {
    const children = nodesByParent[node.id] ?? [];
    const supersededNode =
      node.supersedesNodeId ? map.nodes.find((candidate) => candidate.id === node.supersedesNodeId) : null;
    const isVaulted = vaultedClaimIds.has(node.id);

    return (
      <div key={node.id} className={depth > 0 ? "pl-4 sm:pl-6" : ""}>
        <div className={`rounded-[24px] border p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)] ${statusTone(node.nodeStatus)}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusBadge(node.nodeStatus)}>{node.nodeStatus}</Badge>
            <Badge>{kindLabel(node.kind)}</Badge>
            {node.supersedesNodeId ? <Badge className="bg-[#e7defa] text-[#5c4c88]">replacement</Badge> : null}
            {isVaulted ? (
              <Badge className="bg-[#1f5d73] text-white">
                <Lock className="mr-1 size-3.5" />
                Vault
              </Badge>
            ) : null}
          </div>

          <p className="mt-3 text-sm leading-7 text-[var(--ink)] sm:text-base">
            {isVaulted ? "This claim lives in Vault on this device. Unlock it in the vault manager to inspect the content." : node.content}
          </p>

          {node.note && !isVaulted ? <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{node.note}</p> : null}

          {supersededNode ? (
            <p className="mt-3 text-xs leading-6 text-[var(--muted-ink)]">
              Replaces: <span className="font-medium text-[var(--ink)]">{supersededNode.content}</span>
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {visibleActions(node).map((action) => (
              <Button
                key={action.key}
                variant="secondary"
                className="gap-2 px-3 py-2 text-xs"
                disabled={isPending && activeNodeId === node.id}
                onClick={() => runAction(node.id, action.key)}
              >
                <action.icon className="size-3.5" />
                {action.label}
              </Button>
            ))}
            <Button variant="secondary" className="gap-2 px-3 py-2 text-xs" onClick={() => vaultClaim(node)}>
              <Lock className="size-3.5" />
              {isVaulted ? "Open Vault" : "Move to Vault"}
            </Button>
          </div>
        </div>

        {children.length ? (
          <div className="mt-4 space-y-4">
            {children.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  if (!rootNode) {
    return null;
  }

  const graphMinimapScale = 0.36;

  return (
    <div className="space-y-8">
      <MarginRail
        scopeLabel="Map margin"
        fragments={initialFragments}
        currentStage={view === "graph" ? "graph" : "outline"}
        currentFocus={selectedGraphNodeModel?.content ?? map.recommendedNextMove?.targetNodeContent ?? map.rawThought}
        currentSphere="work"
        currentContext={selectedGraphNodeModel?.note ?? map.recommendedNextMove?.summary ?? map.rawThought}
        currentResponse={map.recommendedNextMove?.summary ?? lastAction?.reasoning.graphAnalysis?.primaryGap ?? null}
        recentSessionMinutes={Math.max(0, Math.round((map.updatedAt.getTime() - map.createdAt.getTime()) / (1000 * 60)))}
        sourceMapId={map.id}
      />
      {activeSession && !activeSession.endedAt ? (
        <div className="rounded-[24px] border border-black/10 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-[#dff0f7] text-[#1f5d73]">Thinking session</Badge>
                <Badge className="bg-[var(--panel)] text-[var(--ink)]">{activeSession.intentionType.replaceAll("_", " ")}</Badge>
                {activeSession.timeBudgetMinutes != null ? (
                  <Badge className="bg-[#fff6ed] text-[#8b4d1f]">
                    {Math.max(0, Math.ceil(sessionRemainingMinutes ?? 0))} min left
                  </Badge>
                ) : (
                  <Badge className="bg-[var(--panel)] text-[var(--ink)]">No time budget</Badge>
                )}
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-[var(--ink)]">{activeSession.declaredIntention}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                {activeSession.scopedClaimIds.length
                  ? `Scoped to ${activeSession.scopedClaimIds.length} claim${activeSession.scopedClaimIds.length === 1 ? "" : "s"}.`
                  : "No claims were scoped when the session started."}
              </p>
              {sessionTimeWarning ? (
                <div className="mt-4 rounded-[18px] border border-[#d7c06c] bg-[#fff9df] px-4 py-3 text-sm leading-6 text-[#6f5612]">
                  You are approaching your time limit. You have covered {Math.max(0, Math.ceil(sessionElapsedMinutes))} minutes.
                  Wrap up or extend if you want to keep going.
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="gap-2" onClick={() => setSessionCloseVisible(true)}>
                End session
              </Button>
              <Button className="gap-2" variant="secondary" onClick={vaultSession}>
                <Lock className="size-4" />
                {sessionVaultRegistered ? "Open Vault" : "Move to Vault"}
              </Button>
              {activeSession.timeBudgetMinutes != null ? (
                <Button
                  className="gap-2"
                  variant="ghost"
                  onClick={() => setSessionTimeWarningDismissed(true)}
                >
                  Dismiss reminder
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : !sessionLoading ? (
        <div className="flex flex-col gap-3 rounded-[24px] border border-dashed border-black/12 bg-white/70 p-4 text-sm leading-6 text-[var(--muted-ink)] lg:flex-row lg:items-center lg:justify-between">
          <p>No active thinking session. Start one to capture intention, scope, and closing ritual.</p>
          <Button className="gap-2" variant="secondary" onClick={() => setSessionStartVisible(true)}>
            Start session
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Thought Map</p>
          <h1 className="mt-2 max-w-4xl text-4xl font-semibold text-[var(--ink)]">{map.title}</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted-ink)]">
            A knowledge-card workbench: keep a single claim visible, tighten weak branches, and let the graph act as a structural minimap instead of the hero.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Badge className="bg-[#d9ead8] text-[#355b32]">Active {statusCounts.active}</Badge>
          <Badge className="bg-[#f5d6b3] text-[#8b4d1f]">Weak {statusCounts.weak}</Badge>
          <Badge className="bg-black/8 text-[var(--muted-ink)]">Superseded {statusCounts.superseded}</Badge>
        </div>
      </div>

      <Card className="p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Best next move</Badge>
              {map.recommendedNextMove ? (
                <>
                  <Badge className="bg-[#e7defa] text-[#5c4c88]">{map.recommendedNextMove.action.replaceAll("_", " ")}</Badge>
                  <Badge>{map.recommendedNextMove.targetNodeKind.replaceAll("_", " ")}</Badge>
                </>
              ) : (
                <Badge className="bg-[var(--panel)] text-[var(--ink)]">Needs more map structure</Badge>
              )}
            </div>
            {map.recommendedNextMove?.uncertainty ? (
              <div className="mt-3">
                <UncertaintyIndicator uncertainty={map.recommendedNextMove.uncertainty} />
              </div>
            ) : null}
            <h2 className="mt-4 text-3xl font-semibold text-[var(--ink)]">
              {map.recommendedNextMove?.headline ?? "Keep shaping the map until Penny can point to one decisive next move."}
            </h2>
            <p className="mt-3 text-base leading-7 text-[var(--muted-ink)]">
              {map.recommendedNextMove?.explanation ??
                "The map is still gathering enough structure to decide what to do next. Add clearer branches, stronger contrast, or more evidence so Penny can recommend the next action."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {unresolvedGaps.slice(0, 4).map((gap) => (
              <Badge key={`next-gap-${gap}`} className="bg-[var(--panel)] text-[var(--ink)]">
                {gap}
              </Badge>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="grid gap-4">
            <div className="rounded-[24px] bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Target branch</p>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                {map.recommendedNextMove?.targetNodeContent ?? map.rawThought}
              </p>
              <div className="mt-4 space-y-2">
                {map.recommendedNextMove?.reasoning.why.slice(0, 2).map((reason) => (
                  <p key={reason} className="text-sm leading-6 text-[var(--muted-ink)]">
                    {reason}
                  </p>
                ))}
                {map.recommendedIntervention ? (
                  <p className="text-sm leading-6 text-[var(--muted-ink)]">
                    Intervention: <span className="font-medium text-[var(--ink)]">{map.recommendedIntervention.type.replaceAll("_", " ")}</span>{" "}
                    because {map.recommendedIntervention.triggerReason.toLowerCase()}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Teach-back</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Explain it in the context of this claim.</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
                Penny gives the minimum scaffold, then asks you to generate the explanation yourself so the gap shows up where it matters.
              </p>
              {selectedGraphNode ? (
                <>
                  <div className="mt-4 rounded-[20px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Concept handle</p>
                    <p className="mt-2 text-sm font-medium text-[var(--ink)]">{selectedTeachBackFocus.concept}</p>
                    <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{selectedTeachBackFocus.scaffold}</p>
                    <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                      Apply it to <span className="font-medium text-[var(--ink)]">{selectedGraphNode.node.content}</span>
                    </p>
                  </div>
                  <div className="mt-4 rounded-[20px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Explain it back</p>
                    <textarea
                      className="mt-3 min-h-28 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition placeholder:text-[var(--muted-ink)] focus:border-black/20"
                      placeholder={`Before I explain, tell me what you think ${selectedTeachBackFocus.concept} means in this claim.`}
                      value={currentTeachBackDraft}
                      onChange={(event) =>
                        setTeachBackDrafts((prev) => ({
                          ...prev,
                          [currentTeachBackNodeId ?? ""]: event.target.value,
                        }))
                      }
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button className="gap-2" onClick={handleTeachBackCheck} disabled={!currentTeachBackNodeId || isPending}>
                        Check explanation
                      </Button>
                      <Button
                        variant="secondary"
                        className="gap-2"
                        onClick={() => {
                          if (!currentTeachBackNodeId) {
                            return;
                          }

                          setTeachBackDrafts((prev) => ({ ...prev, [currentTeachBackNodeId]: selectedTeachBackFocus.scaffold }));
                        }}
                        disabled={!currentTeachBackNodeId}
                      >
                        Use scaffold
                      </Button>
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Your text, annotated</p>
                    <div className="mt-2 rounded-[18px] border border-black/8 bg-white p-4 text-sm leading-7 text-[var(--ink)]">
                      {highlightTeachBackResponse(currentTeachBackDraft, currentTeachBackAnalysis.annotations)}
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-4 rounded-[20px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                  Select a node to turn this into a claim-anchored teach-back prompt.
                </p>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Gap detection</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedKnowledgeSurface.teachBackGap.length ? (
                      selectedKnowledgeSurface.teachBackGap.map((gap) => (
                        <Badge key={gap} className="bg-[#fff6ed] text-[#8b4d1f]">
                          {gap}
                        </Badge>
                      ))
                    ) : (
                      <Badge className="bg-[#d9ead8] text-[#355b32]">No obvious gap</Badge>
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">{currentTeachBackAnalysis.summary}</p>
                </div>
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Why it matters</p>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{currentTeachBackAnalysis.whyItMatters}</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Restate with the correction</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{currentTeachBackAnalysis.restatementPrompt}</p>
                </div>
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Correction</p>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{currentTeachBackAnalysis.correction}</p>
                  {currentTeachBackAnalysis.annotations.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {currentTeachBackAnalysis.annotations.map((annotation) => (
                        <Badge
                          key={`${annotation.phrase}-${annotation.note}`}
                          className={
                            annotation.tone === "correct"
                              ? "bg-[#d9ead8] text-[#355b32]"
                              : annotation.tone === "needs-work"
                                ? "bg-[#fff6ed] text-[#8b4d1f]"
                                : "bg-white text-[var(--ink)]"
                          }
                          title={annotation.note}
                        >
                          {annotation.phrase}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Level match</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge className="bg-white text-[var(--ink)]">{selectedKnowledgeSurface.masteryLevel}</Badge>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">{selectedKnowledgeSurface.understood.length} mastered</Badge>
                    <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{selectedKnowledgeSurface.needsWork.length} to relearn</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                    Future critique pitches at this level instead of repeating basics or skipping the missing pieces.
                  </p>
                  {currentTeachBackAttempts.length ? (
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                      {currentTeachBackAttempts.length} teach-back round{currentTeachBackAttempts.length === 1 ? "" : "s"} logged
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Knowledge shape</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">What Penny thinks you already know here.</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Demonstrated</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedKnowledgeSurface.understood.length ? (
                      selectedKnowledgeSurface.understood.map((concept) => (
                        <Badge key={concept} className="bg-white text-[var(--ink)]">
                          {concept}
                        </Badge>
                      ))
                    ) : (
                      <Badge className="bg-white text-[var(--ink)]">No demonstrated concepts yet</Badge>
                    )}
                  </div>
                </div>
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Needs work</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedKnowledgeSurface.needsWork.length ? (
                      selectedKnowledgeSurface.needsWork.map((concept) => (
                        <Badge key={concept} className="bg-[#fff6ed] text-[#8b4d1f]">
                          {concept}
                        </Badge>
                      ))
                    ) : (
                      <Badge className="bg-[#d9ead8] text-[#355b32]">No obvious gaps</Badge>
                    )}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">
                {selectedKnowledgeSurface.reviewPrompt}
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {learningPrompts.length ? (
                learningPrompts.slice(0, 2).map((prompt) => (
                  <div key={prompt.label + prompt.title} className="rounded-[24px] border border-black/8 bg-white p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{prompt.label}</p>
                    <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">{prompt.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{prompt.body}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{prompt.helper}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-black/8 bg-white p-5 lg:col-span-2">
                  <p className="text-sm leading-6 text-[var(--muted-ink)]">
                    Keep building the map. Once Penny can see a weak branch or missing branch type, this section will tell you what to learn next, which precedent to compare against, and what to validate after that.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-white p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Operating loop</p>
            <div className="mt-4 space-y-3">
              {learningLoopSteps.map((step, index) => (
                <div key={step} className="rounded-[20px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Step {index + 1}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{step}</p>
                </div>
              ))}
            </div>

            {validationPreview.length ? (
              <>
                <p className="mt-5 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Validation path</p>
                <div className="mt-3 space-y-2">
                  {validationPreview.map((step) => (
                    <p key={step} className="text-sm leading-6 text-[var(--muted-ink)]">
                      {step}
                    </p>
                  ))}
                </div>
              </>
            ) : null}

            <p className="mt-5 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Steel-manning gym</p>
            <div className="mt-3 rounded-[20px] bg-[var(--panel)] p-4">
              <p className="text-sm leading-6 text-[var(--ink)]">{steelmanPrompt}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Practice mode: argue the strongest version of a position you disagree with, then compare your version to Penny’s best version.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge className="bg-white text-[var(--ink)]">Scored against Penny’s best version</Badge>
                {bestSteelmanTarget ? <Badge className="bg-white text-[var(--ink)]">{kindLabel(bestSteelmanTarget.kind)}</Badge> : null}
              </div>
            </div>

            <div className="mt-5">
              <Button
                className="gap-2"
                disabled={!map.recommendedNextMove || runningRecommendedMove || isPending}
                onClick={runRecommendedNextMove}
              >
                <Sparkles className="size-4" />
                {map.recommendedNextMove ? "Do the best next move" : "Best next move pending"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Source entry</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">The original wiki note stays in view.</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{map.rawThought}</p>
            <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">
              Penny turns that entry into claims, assumptions, counterarguments, research paths, and decision support without losing the original thought that started the map.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[24px] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Unresolved gaps</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {unresolvedGaps.length ? (
                  unresolvedGaps.slice(0, 4).map((gap) => (
                    <Badge key={gap} className="bg-white text-[var(--ink)]">
                      {gap}
                    </Badge>
                  ))
                ) : (
                  <Badge className="bg-white text-[var(--ink)]">No major gap flags yet</Badge>
                )}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                Weak branches, dependency pressure, and missing map coverage stay visible so the note keeps getting sharpened instead of archived.
              </p>
            </div>

            <div className="rounded-[24px] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Next action</p>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                {map.recommendedNextMove?.headline ?? "Keep building the map until Penny can recommend the next move."}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                {map.recommendedNextMove?.explanation ??
                  "The next move card below will become the operating loop once the map has enough structure to judge."}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Weak-node triage</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Push the weakest branches first, then widen to the rest of the map.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-ink)]">
              Penny now treats triage as a visible lane on the workspace: weak evidence, contradictions, risky dependencies, and missing comparisons are prioritized before they become a bigger repair job.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {challengedActions.length ? (
              challengedActions.map((action) => (
                <Badge key={action} className="bg-[var(--panel)] text-[var(--ink)]">
                  challenged via {labelAction(action)}
                </Badge>
              ))
            ) : (
              <Badge className="bg-[var(--panel)] text-[var(--ink)]">No prior challenge actions yet</Badge>
            )}
            {activeBiasDetectors.map((detector) => (
              <Badge key={detector} className="bg-[#fff6ed] text-[#8b4d1f]">
                override signal {labelBias(detector)}
              </Badge>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {frameworkCritiques.map((framework) => (
            <div key={framework.label} className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{framework.label}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{framework.focus}</p>
              <div className="mt-4 space-y-3">
                {framework.nodes.length ? (
                  framework.nodes.slice(0, 3).map((node) => (
                    <div key={`${framework.label}-${node.id}`} className="rounded-[20px] bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusBadge(node.nodeStatus)}>{node.nodeStatus}</Badge>
                        <Badge>{kindLabel(node.kind)}</Badge>
                        <Badge className="bg-[#e7defa] text-[#5c4c88]">critique {critiqueDepthLabel(node)}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                      <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
                        {node.psychology?.likelyBiases.length
                          ? `Lens pressure: ${node.psychology.likelyBiases.map(labelBias).join(" · ")}`
                          : framework.label === "Historical"
                            ? "Search for precedent before shipping the claim."
                            : framework.label === "Game theory"
                              ? "Trace who benefits, who reacts, and where incentives break."
                              : framework.label === "Network effects"
                                ? "Check whether adoption compounds or stalls at the edge."
                                : framework.label === "Operational"
                                  ? "Find the handoff or process step most likely to fail."
                            : framework.label === "Psychological"
                              ? "Ask what bias or self-protection is steering the answer."
                              : "Identify the coalition or resistance pressure first."}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{critiqueDepthNote(node)}</p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-[20px] bg-white p-4 text-sm leading-6 text-[var(--muted-ink)]">{framework.empty}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {namedVoices.map((voice) => (
            <div key={voice.label} className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{voice.label}</p>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{voice.attack}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{voice.attackStyle}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[24px] border border-black/8 bg-white p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Collaborative elicitation</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Solo versions of collaborative network-building moves.</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Different elicitation patterns reveal different structure. Penny can switch between them on demand instead of forcing every claim through one critique style.
              </p>
            </div>
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">On-demand roles</Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {elicitationPatterns.map((pattern) => (
              <Button
                key={pattern.key}
                variant={elicitationMode === pattern.key ? "primary" : "secondary"}
                className="px-4 py-2 text-xs"
                onClick={() => setElicitationMode(pattern.key)}
              >
                {pattern.label}
              </Button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            {elicitationPatterns
              .filter((pattern) => pattern.key === elicitationMode)
              .map((pattern) => (
                <div key={pattern.key} className="rounded-[20px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{pattern.label}</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{pattern.prompt}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{pattern.description}</p>
                </div>
              ))}
            {elicitationPatterns
              .filter((pattern) => pattern.key === elicitationMode)
              .map((pattern) => (
                <div key={`${pattern.key}-note`} className="rounded-[20px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Why this role helps</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{pattern.note}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                    That makes the elicitation pattern explicit, so the user can choose the structural lens they need instead of getting one generic critique mode.
                  </p>
                </div>
              ))}
          </div>
        </div>

        <div className="mt-6 rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Specific audience critique</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Critique this claim for the exact audience you are about to face.</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Penny uses the audience, the context you give it, and the current precedent set to make the pushback concrete instead of generic.
              </p>
            </div>
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">{selectedAudienceCritique.lensLabel}</Badge>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="rounded-[20px] bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Audience</span>
                  <input
                    className="mt-2 w-full rounded-[16px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
                    value={specificAudienceName}
                    onChange={(event) => setSpecificAudienceName(event.target.value)}
                    placeholder="your board next Tuesday"
                  />
                </label>
                <label className="block">
                  <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Context</span>
                  <input
                    className="mt-2 w-full rounded-[16px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
                    value={specificAudienceContext}
                    onChange={(event) => setSpecificAudienceContext(event.target.value)}
                    placeholder="what they already know, fear, or expect"
                  />
                </label>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">{selectedAudienceCritique.reviewPrompt}</p>
              <div className="mt-4 space-y-3">
                {selectedPrecedents.length ? (
                  selectedPrecedents.map((precedent) => (
                    <div
                      key={precedent.id}
                      className={cn(
                        "rounded-[18px] bg-[var(--panel)] p-4",
                        selectedPrecedentSummary?.id === precedent.id ? "ring-2 ring-[#5c4c88]/35" : "",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-[var(--ink)]">{precedent.name}</p>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                            {precedent.domain} · {precedent.failureMode}
                          </p>
                        </div>
                        <Button
                          variant={selectedPrecedentSummary?.id === precedent.id ? "primary" : "secondary"}
                          className="px-3 py-1 text-[11px]"
                          onClick={() => setSelectedPrecedentId(precedent.id)}
                        >
                          Compare this case
                        </Button>
                      </div>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Claim equivalent</p>
                      <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{precedent.claimEquivalent}</p>
                      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Failure trajectory</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{precedent.failureTrajectory}</p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                    Select a claim to retrieve precedent-backed critique.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-[20px] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">What this audience will do</p>
              <div className="mt-3 space-y-3">
                <div className="rounded-[16px] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Push on</p>
                  <div className="mt-2 space-y-2">
                    {selectedAudienceCritique.pushOn.map((item) => (
                      <p key={item} className="rounded-[14px] bg-[var(--panel)] px-3 py-2 text-sm leading-6 text-[var(--ink)]">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="rounded-[16px] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Likely to skip</p>
                  <div className="mt-2 space-y-2">
                    {selectedAudienceCritique.likelySkip.map((item) => (
                      <p key={item} className="rounded-[14px] bg-[var(--panel)] px-3 py-2 text-sm leading-6 text-[var(--ink)]">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="rounded-[16px] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Likely objections</p>
                  <div className="mt-2 space-y-2">
                    {selectedAudienceCritique.likelyObjections.map((item) => (
                      <p key={item} className="rounded-[14px] bg-[var(--panel)] px-3 py-2 text-sm leading-6 text-[var(--ink)]">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">{selectedAudienceCritique.audienceContext}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Advisor review mode</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Let an advisor critique without editing the claim graph.</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Review stays critique-only. The advisor can add pressure, but the owner still controls the claims themselves.
              </p>
            </div>
            <Badge className="bg-[#d9ead8] text-[#355b32]">review-only</Badge>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
            <div className="rounded-[20px] bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Reviewer</span>
                  <input
                    className="mt-2 w-full rounded-[16px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
                    value={advisorReviewerName}
                    onChange={(event) => setAdvisorReviewerName(event.target.value)}
                    placeholder="advisor"
                  />
                </label>
                <div className="rounded-[16px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Permissions</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{selectedAdvisorReview.permissionsNote}</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">{selectedAdvisorReview.reviewPrompt}</p>
              <textarea
                className="mt-4 min-h-[108px] w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
                placeholder="Write the critique-only note your advisor should see."
                value={advisorReviewDraft}
                onChange={(event) => setAdvisorReviewDraft(event.target.value)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="px-3 py-2 text-xs"
                  disabled={advisorReviewDraft.trim().length < 12}
                  onClick={() => {
                    const note = advisorReviewDraft.trim();

                    if (note.length < 12) {
                      return;
                    }

                    setAdvisorReviewNotes((current) => [note, ...current].slice(0, 4));
                    setAdvisorReviewDraft("");
                  }}
                >
                  Add critique-only note
                </Button>
                <Badge className="bg-white text-[var(--ink)]">no claim edits</Badge>
              </div>
            </div>

            <div className="rounded-[20px] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Advisor review surface</p>
              <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{selectedAdvisorReview.critiqueOnly}</p>
              <div className="mt-4 space-y-3">
                {advisorReviewNotes.length ? (
                  advisorReviewNotes.map((note, index) => (
                    <div key={`${index}-${note}`} className="rounded-[18px] bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Recorded note</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{note}</p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-[18px] bg-white p-4 text-sm leading-6 text-[var(--muted-ink)]">
                    No critique-only advisor notes captured yet.
                  </p>
                )}
              </div>
              {selectedSurvivorPrecedents.length ? (
                <div className="mt-4 rounded-[18px] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">What survived this structure</p>
                  <div className="mt-2 space-y-2">
                    {selectedSurvivorPrecedents.map((survivor) => (
                      <div key={survivor.id} className="rounded-[16px] bg-[var(--panel)] px-4 py-3">
                        <p className="text-sm font-medium text-[var(--ink)]">{survivor.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{survivor.domain}</p>
                        <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{survivor.whatSavedIt}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[24px] border border-black/8 bg-white p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Devil&apos;s advocate with receipts</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Critique the claim through thinkers who already warned about this shape.</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Penny picks a thinker whose position matches the failure mode, then attaches a precedent showing what happened when people took the optimistic side anyway.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {selectedReceiptVoices.length ? (
              selectedReceiptVoices.map((receipt) => (
                <div key={receipt.thinker} className="rounded-[18px] bg-[var(--panel)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-white text-[var(--ink)]">{receipt.thinker}</Badge>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">receipt-backed</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{receipt.position}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{receipt.precedent}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{receipt.lesson}</p>
                </div>
              ))
            ) : (
              <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                Select a claim to see which historical thinkers would attack it with receipts.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Peer simulation</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Critique this claim as a named audience</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Penny uses how this audience historically attacks similar structures, then grounds the response in the matching precedent set.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["skeptical investor", "thesis advisor", "skeptical academic", "gtm operator"] as PeerAudience[]).map((audience) => (
                <Button
                  key={audience}
                  variant={peerAudience === audience ? "primary" : "secondary"}
                  className="px-4 py-2 text-xs"
                  onClick={() => setPeerAudience(audience)}
                >
                  {audience}
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
            <div className="rounded-[20px] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Precedent-grounded critique</p>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                {selectedGraphNode
                  ? `${peerAudience} mode: Penny searches for failure cases that match this claim’s risk profile before it gives the critique.`
                  : "Select a claim to retrieve failure cases that match its risk profile."}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Pick the precedent that feels most structurally similar. Penny will then compare it with the cases that survived the same shape.
              </p>
              {selectedGraphNode ? (
                <Badge className="mt-3 bg-[#e7defa] text-[#5c4c88]">critique {critiqueDepthLabel(selectedGraphNode.node)}</Badge>
              ) : null}
              {selectedPrecedents.length ? (
                <div className="mt-4 space-y-3">
                  {selectedPrecedents.map((precedent) => (
                    <div
                      key={precedent.id}
                      className={cn(
                        "rounded-[18px] bg-[var(--panel)] p-4",
                        selectedPrecedentSummary?.id === precedent.id ? "ring-2 ring-[#5c4c88]/35" : "",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-[var(--ink)]">{precedent.name}</p>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                            {precedent.domain} · {precedent.failureMode}
                          </p>
                        </div>
                        <Button
                          variant={selectedPrecedentSummary?.id === precedent.id ? "primary" : "secondary"}
                          className="px-3 py-1 text-[11px]"
                          onClick={() => setSelectedPrecedentId(precedent.id)}
                        >
                          Compare this case
                        </Button>
                      </div>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                        Claim equivalent
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{precedent.claimEquivalent}</p>
                      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                        Failure trajectory
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{precedent.failureTrajectory}</p>
                      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                        Load-bearing assumptions
                      </p>
                      <div className="mt-2 space-y-2">
                        {precedent.loadBearingAssumptions.map((assumption) => (
                          <p key={`${precedent.id}-${assumption}`} className="rounded-[14px] bg-white px-3 py-2 text-sm leading-6 text-[var(--ink)]">
                            {assumption}
                          </p>
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{precedent.whatKilledIt}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{precedent.killAssumption}</p>
                      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Structural lesson</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{precedent.structuralLesson}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {precedent.failureTypeTags.map((tag) => (
                          <Badge key={`${precedent.id}-type-${tag}`} className="bg-[#efe7fc] text-[#5c4c88]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {precedent.riskTags.map((tag) => (
                          <Badge key={`${precedent.id}-${tag}`} className="bg-white text-[var(--ink)]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">
                  Penny will show the cases that most closely match the claim’s risk profile once a node is selected.
                </p>
              )}
            </div>

            <div className="rounded-[20px] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Audience attacks</p>
              <div className="mt-3 space-y-2">
                {(selectedPrecedentSummary?.audienceAttacks ?? [])[0] ? (
                  selectedPrecedentSummary!.audienceAttacks.map((attack) => (
                    <p key={attack} className="rounded-[16px] bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)]">
                      {attack}
                    </p>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-[var(--muted-ink)]">
                    Choose an audience to simulate how that audience historically attacks similar structures.
                  </p>
                )}
              </div>
              <div className="mt-6 rounded-[18px] bg-[var(--panel)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">What survived this structure</p>
                {selectedPrecedentSummary ? (
                  <>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                      {selectedPrecedentSummary.name} is the failure case. These are the cases that survived similar structural pressure.
                    </p>
                    {selectedSurvivorPrecedents.length ? (
                      <div className="mt-3 space-y-2">
                        {selectedSurvivorPrecedents.map((survivor) => (
                          <div key={survivor.id} className="rounded-[16px] bg-white px-4 py-3">
                            <p className="text-sm font-medium text-[var(--ink)]">{survivor.name}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{survivor.domain}</p>
                            <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{survivor.whatSavedIt}</p>
                            <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{survivor.structuralLesson}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                        No survivor analog found yet for this structural shape.
                      </p>
                    )}
                    <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                      Which of these surviving structures is closest to what you’re trying to do?
                    </p>
                  </>
              ) : (
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                    Select a failure precedent to see what survived the same shape.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-[20px] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Precedent adherence tracking</p>
              {selectedPrecedentSummary ? (
                <>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{selectedPrecedentAdherence?.summary}</p>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                    Penny checks whether your current replies actually address the failure modes from {selectedPrecedentSummary.name}, not just whether the case sounded familiar.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] bg-[var(--panel)] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Addressed</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedPrecedentAdherence?.addressedFailureModes.length ? (
                          selectedPrecedentAdherence.addressedFailureModes.map((tag) => (
                            <Badge key={`${selectedPrecedentSummary.id}-addressed-${tag}`} className="bg-[#d9ead8] text-[#355b32]">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <Badge className="bg-white text-[var(--ink)]">No precedent mode addressed yet</Badge>
                        )}
                      </div>
                    </div>
                    <div className="rounded-[18px] bg-[var(--panel)] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Still open</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedPrecedentAdherence?.remainingFailureModes.length ? (
                          selectedPrecedentAdherence.remainingFailureModes.map((tag) => (
                            <Badge key={`${selectedPrecedentSummary.id}-remaining-${tag}`} className="bg-[#fff6ed] text-[#8b4d1f]">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <Badge className="bg-white text-[var(--ink)]">All tagged failure modes have been touched</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{selectedPrecedentAdherence?.nextPrompt}</p>
                </>
              ) : (
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                  Select a failure precedent to see whether the current critique actually addresses the same collapse pattern.
                </p>
              )}
            </div>

            <div className="rounded-[20px] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Norm-challenge scrutiny</p>
              {selectedNormChallengeNode ? (
                <>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                    {selectedNormChallengeNode.content}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                    Penny holds the strongest case for the norm in view, then checks whether the counter-case actually addresses the reason the norm exists.
                  </p>
                  <div className="mt-4 rounded-[18px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Why this norm exists</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                      Norms usually exist because they protect trust, coordination, or safety. The scrutiny pass asks whether the objection also handles those load-bearing concerns.
                    </p>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                  No explicit norm claim is selected yet. Pick a claim that frames a rule, should, must, or policy to surface this scrutiny pass.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[24px] border border-black/8 bg-white p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Interleaved stress-testing</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Alternate across related claims instead of drilling one branch at a time.</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Penny mixes weak-evidence, falsification, dependency, and comparison pressure so the critique discriminates between nearby claims instead of pattern-matching one branch to death.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {interleavedStressQueue.length ? (
              interleavedStressQueue.map((node, index) => (
                <div key={node.id} className="rounded-[18px] bg-[var(--panel)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={statusBadge(node.nodeStatus)}>{node.nodeStatus}</Badge>
                    <Badge>{kindLabel(node.kind)}</Badge>
                    <Badge className="bg-white text-[var(--ink)]">pass {index + 1}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                    {node.scores?.evidence != null ? `evidence ${formatScore(node.scores.evidence)}` : "evidence n/a"} ·{" "}
                    {node.psychology?.falsificationCoverageScore != null
                      ? `falsification ${formatScore(node.psychology.falsificationCoverageScore)}`
                      : "falsification n/a"}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                No stress nodes yet. Add more claims so Penny can alternate pressure across the map.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {stressTestPasses.map((pass) => (
            <div key={pass.title} className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{pass.title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{pass.description}</p>
              <div className="mt-4 space-y-3">
                {pass.nodes.length ? (
                  pass.nodes.map((node) => (
                    <div key={`${pass.title}-${node.id}`} className="rounded-[20px] bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusBadge(node.nodeStatus)}>{node.nodeStatus}</Badge>
                        <Badge>{kindLabel(node.kind)}</Badge>
                        <Badge className="bg-[var(--panel)] text-[var(--ink)]">{pass.metric(node)}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                      {node.psychology?.likelyBiases.length ? (
                        <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
                          Bias signals: {node.psychology.likelyBiases.map(labelBias).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="rounded-[20px] bg-white p-4 text-sm leading-6 text-[var(--muted-ink)]">{pass.empty}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[24px] bg-white p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Quiet keystone moment</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Penny attacks the dependency structure before synthesis so it can find the single claim the rest of the map is leaning on.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {adversarialFinalPass.isQuietKeystone ? (
                <Badge className="bg-[#fff6ed] text-[#8b4d1f] animate-pulse">rare moment</Badge>
              ) : (
                <Badge className="bg-[var(--panel)] text-[var(--ink)]">keystone candidate</Badge>
              )}
              <Badge className="bg-[#e7defa] text-[#5c4c88]">{adversarialFinalPass.loadBearingCount} load-bearing claims</Badge>
            </div>
          </div>
          {loadBearingAssumption ? (
            <div className={cn("mt-4 rounded-[20px] p-4", adversarialFinalPass.isQuietKeystone ? "bg-[#fff6ed]" : "bg-[var(--panel)]")}>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Load-bearing assumption</p>
              <p className="mt-2 text-sm leading-7 text-[var(--ink)]">
                {adversarialFinalPass.isQuietKeystone
                  ? `This one. If #${adversarialFinalPass.quietKeystoneIndex} fails, the map collapses: ${loadBearingAssumption.content}`
                  : loadBearingAssumption.content}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{adversarialFinalPass.quietKeystoneReason}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                {adversarialFinalPass.collapseWarning} It currently has {adversarialFinalPass.dependentCount} direct dependents.
              </p>
              {adversarialFinalPass.isQuietKeystone ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-white text-[var(--ink)]">score {adversarialFinalPass.keystoneScore != null ? formatScore(adversarialFinalPass.keystoneScore) : "n/a"}</Badge>
                    <Badge className="bg-white text-[var(--ink)]">
                      gap {adversarialFinalPass.scoreGap != null ? formatScore(adversarialFinalPass.scoreGap) : "n/a"}
                    </Badge>
                  </div>
                  <div className="rounded-[18px] bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Cascade preview</p>
                    <div className="mt-3 space-y-2">
                      {quietKeystoneCascade.slice(1, 5).map((step) => (
                        <div key={step.nodeId} className="rounded-[16px] border border-[#d7c06c] bg-[#fffaf0] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[#8b4d1f]">depth {step.depth}</p>
                          <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{step.content}</p>
                          <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{step.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button
                    className="gap-2"
                    disabled={isPending || !loadBearingAssumption}
                    onClick={() => runAction(loadBearingAssumption.id, "challenge")}
                  >
                    <AlertCircle className="size-4" />
                    Stress-test the keystone
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 rounded-[20px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
              Keep building the map until Penny can identify the load-bearing assumption behind the output.
            </p>
          )}
          <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Override trail</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Already-challenged branches stay visible here so future pressure can go deeper instead of repeating the same surface critique.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {challengedActions.length ? (
              challengedActions.map((action) => (
                <Badge key={`history-${action}`} className="bg-[var(--panel)] text-[var(--ink)]">
                  {labelAction(action)}
                </Badge>
              ))
            ) : (
              <Badge className="bg-[var(--panel)] text-[var(--ink)]">No challenge history yet</Badge>
            )}
            {map.interventions.length ? (
              <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{map.interventions.length} active intervention prompts</Badge>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Critique layer</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--ink)]">Mode, intensity, and variety need to be explicit.</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              Socratic mode asks the user to critique their own claim, intensity sets how sharp the attack should be, and the failure-type selector keeps Penny from repeating the same critique surface.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-[#e7defa] text-[#5c4c88]">{critiqueModeLabel(critiqueMode)} mode</Badge>
            <Badge className="bg-[#d9ead8] text-[#355b32]">{critiqueIntensityLabel(critiqueIntensity)} intensity</Badge>
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">forced {critiqueVariety.next}</Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
          <div className="rounded-[20px] bg-[var(--panel)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Critique mode</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                ["direct", "Direct"],
                ["socratic", "Socratic"],
                ["red_team", "Red-team"],
              ] as const).map(([mode, label]) => (
                <Button
                  key={mode}
                  variant={critiqueMode === mode ? "primary" : "secondary"}
                  className="px-4 py-2 text-xs"
                  onClick={() => setCritiqueMode(mode)}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Critique intensity</p>
                <Badge className="bg-white text-[var(--ink)]">{critiqueIntensityLabel(critiqueIntensity)}</Badge>
              </div>
              <input
                className="mt-3 w-full accent-[var(--ink)]"
                type="range"
                min={0}
                max={100}
                step={1}
                value={critiqueIntensity}
                onChange={(event) => setCritiqueIntensity(Number(event.target.value))}
              />
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                {critiqueIntensity < 35 ? "Gentle probing" : critiqueIntensity < 70 ? "Firm attack" : "Brutal pressure"}
              </p>
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Failure type</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {CRITIQUE_FAILURE_TYPES.map((type) => (
                  <Button
                    key={type}
                    variant={selectedCritiqueType === type ? "primary" : "secondary"}
                    className="px-3 py-2 text-[11px]"
                    onClick={() => setSelectedCritiqueType(type)}
                  >
                    {type}
                  </Button>
                ))}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">{critiqueVariety.note}</p>
              {activeCritiqueType !== selectedCritiqueType ? (
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#8b4d1f]">
                  Penny is forcing variety: {activeCritiqueType}
                </p>
              ) : (
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#355b32]">
                  Active failure type: {activeCritiqueType}
                </p>
              )}
            </div>

            <div className="mt-4 rounded-[18px] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Critique quality profile</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{critiqueGenerationGuidance.uncertaintyNote}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {critiqueGenerationGuidance.avoidVoices.length ? (
                  critiqueGenerationGuidance.avoidVoices.slice(0, 3).map((voice) => (
                    <Badge key={`avoid-${voice}`} className="bg-[#fff6ed] text-[#8b4d1f]">
                      avoid {voice}
                    </Badge>
                  ))
                ) : (
                  <Badge className="bg-[var(--panel)] text-[var(--ink)]">no voice downgrade yet</Badge>
                )}
                {critiqueGenerationGuidance.prioritizeFailureTypes.length ? (
                  critiqueGenerationGuidance.prioritizeFailureTypes.slice(0, 3).map((failureType) => (
                    <Badge key={`priority-${failureType}`} className="bg-[#d9ead8] text-[#355b32]">
                      prioritize {failureType}
                    </Badge>
                  ))
                ) : (
                  <Badge className="bg-[var(--panel)] text-[var(--ink)]">no failure-type preference yet</Badge>
                )}
              </div>
            </div>

            <PersonalizedCritiquePanel context={personalizedCritiqueContext} />
          </div>

          <div className="space-y-4">
            <div className="rounded-[20px] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Socratic mode</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                {critiqueMode === "socratic"
                  ? critiqueModePrompt(
                      "socratic",
                      activeCritiqueType,
                      selectedGraphNode?.node.content ?? "the active claim",
                      critiqueIntensity,
                      critiquePersonalizationBridge,
                    )
                  : `When selected, Socratic mode asks the user to critique their own claim instead of letting Penny generate the critique directly.`}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Self-generated critique tends to produce more durable reasoning change, so this stays selectable rather than becoming the default.
              </p>
            </div>

            <div className="rounded-[20px] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Meta-critique</p>
              <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">{critiqueMetaCritique.headline}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{critiqueMetaCritique.body}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {recentCritiqueTypes.length ? (
                  recentCritiqueTypes.slice(-5).map((type, index) => (
                    <Badge key={`${type}-${index}`} className="bg-white text-[var(--ink)]">
                      {type}
                    </Badge>
                  ))
                ) : (
                  <Badge className="bg-white text-[var(--ink)]">No critique history yet</Badge>
                )}
                {critiqueCorrections.length ? (
                  <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{critiqueCorrections.length} corrections logged</Badge>
                ) : null}
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                Engagement style: {critiqueEngagementStyle}
              </p>
            </div>

            <div className="rounded-[20px] border border-[#e0cfa8] bg-[#fffaf0] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Penny is wrong</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                If Penny mis-cited a precedent or mis-described a mechanism, capture the correction here as a high-priority signal.
              </p>
              <textarea
                className="mt-3 min-h-[92px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
                placeholder="State the factual correction, the mis-described mechanism, or the inaccurate precedent."
                value={currentCritiqueCorrectionDraft}
                onChange={(event) =>
                  setCritiqueCorrectionDrafts((current) => ({
                    ...current,
                    [critiqueCorrectionNodeId ?? "global"]: event.target.value,
                  }))
                }
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="px-3 py-2 text-xs"
                  disabled={!critiqueCorrectionNodeId || currentCritiqueCorrectionDraft.trim().length < 12}
                  onClick={captureCritiqueCorrection}
                >
                  Capture correction
                </Button>
                <Badge className="bg-white text-[var(--ink)]">high-priority signal</Badge>
              </div>
            </div>

            <div className="rounded-[20px] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Red-team session</p>
              <h3 className="mt-2 text-lg font-semibold text-[var(--ink)]">Attack the whole structure for 20-30 minutes.</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                {critiqueMode === "red_team"
                  ? "Penny is in sustained attack mode: no single-claim hopping, no soft landings, just dependency-structure pressure until the board-level failure surface is visible."
                  : "Switch here when the stakes are high and the normal round-by-round critique is too shallow."}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Dialectic rounds</Badge>
          <Badge className="bg-[#e7defa] text-[#5c4c88]">round-tracked</Badge>
          <Badge className="bg-[#d9ead8] text-[#355b32]">{selectedCritiqueStrength.label}</Badge>
          <Badge className={challengeSkill.direction === "increase challenge" ? "bg-[#d9ead8] text-[#355b32]" : challengeSkill.direction === "reduce challenge" ? "bg-[#fff6ed] text-[#8b4d1f]" : "bg-white text-[var(--ink)]"}>
            {challengeSkill.label}
          </Badge>
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--ink)]">Counterargument as explicit rounds, not a one-shot critique.</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
          Penny should remember every round, carry the user’s response history forward, and change the next attack instead of reusing the same line.
        </p>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">{challengeSkill.note}</p>
        <div className="mt-5">
          <SteelManGate
            claim={{
              id: selectedGraphNode?.node.id ?? "",
              mapId: map.id,
              text: selectedGraphNode?.node.content ?? "",
              confidence: Math.round((selectedGraphNode?.node.scores?.confidence ?? 0) * 100),
            }}
            existingSteelMan={
              selectedSteelMan
                ? {
                    steelManText: selectedSteelMan.steelManText,
                    qualityScore: selectedSteelMan.qualityScore,
                    qualityScoreReason: selectedSteelMan.qualityScoreReason ?? null,
                  }
                : null
            }
            initialText={selectedSteelManDraft}
            onTextChange={(nextText) => {
              if (!selectedGraphNode?.node.id) {
                return;
              }
              setSteelManGateBypassed((current) => ({
                ...current,
                [selectedGraphNode.node.id]: false,
              }));
              setSteelManDrafts((current) => ({
                ...current,
                [selectedGraphNode.node.id]: nextText,
              }));
            }}
            onSavedSteelMan={(steelMan: SteelManGateSavedSteelMan) => {
              if (selectedGraphNode?.node.id) {
                setSteelManGateBypassed((current) => ({
                  ...current,
                  [selectedGraphNode.node.id]: false,
                }));
              }
              mergeSteelMan(steelMan as unknown as SerializableSteelMan);
              if (selectedGraphNode?.node.id) {
                setSteelManDrafts((current) => ({
                  ...current,
                  [selectedGraphNode.node.id]: steelMan.steelManText,
                }));
                setSteelManAssessments((current) => ({
                  ...current,
                  [selectedGraphNode.node.id]: {
                    specificityScore: steelMan.qualityScore ?? 0,
                    evidentialBasisScore: steelMan.qualityScore ?? 0,
                    engagementDepthScore: steelMan.qualityScore ?? 0,
                    qualityScore: steelMan.qualityScore ?? 0,
                    qualityScoreReason: steelMan.qualityScoreReason ?? "Steel man saved.",
                    revisionPrompt: null,
                  },
                }));
              }
            }}
            onComplete={(steelManText, score) => {
              if (!selectedGraphNode?.node.id) {
                return;
              }
              setSteelManGateBypassed((current) => ({
                ...current,
                [selectedGraphNode.node.id]: false,
              }));
              setSteelManDrafts((current) => ({
                ...current,
                [selectedGraphNode.node.id]: steelManText,
              }));
              if (score) {
                setSteelManAssessments((current) => ({
                  ...current,
                  [selectedGraphNode.node.id]: {
                    specificityScore: score.overallScore,
                    evidentialBasisScore: score.overallScore,
                    engagementDepthScore: score.overallScore,
                    qualityScore: score.overallScore,
                    qualityScoreReason: score.overallFeedback,
                    revisionPrompt: score.reviseSuggestion,
                  },
                }));
              }
            }}
            onSkip={() => {
              if (!selectedGraphNode?.node.id) {
                return;
              }
              setSteelManGateBypassed((current) => ({
                ...current,
                [selectedGraphNode.node.id]: true,
              }));
            }}
            isFirstRound={dialecticRoundEvents.length === 0}
          />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {dialecticRounds.map((round) => {
            const draft = dialecticResponseDrafts[round.round] ?? "";
            const roundContextDraft = round.roundContextDraft;
            const critiqueFeedbackStatus = critiqueFeedbackStatusByRoundId[round.id] ?? {
              dismissalCount: 0,
              submitted: false,
              latestFeedback: null,
            };
            const hasPersistedRound = Boolean(round.dialecticRound);
            const feedbackManualOnly = critiqueFeedbackStatus.dismissalCount >= 3 && !critiqueFeedbackStatus.submitted;
            const feedbackVisible =
              hasPersistedRound &&
              !hiddenCritiqueFeedbackRoundIds[round.id] &&
              (critiqueFeedbackStatus.submitted ||
                critiqueFeedbackStatus.dismissalCount < 3 ||
                Boolean(openedCritiqueFeedbackRoundIds[round.id]));

            return (
            <div key={round.round} className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-white text-[var(--ink)]">{round.round}</Badge>
                <Badge className="bg-[#e7defa] text-[#5c4c88]">{round.strength}</Badge>
                <Badge className="bg-white text-[var(--ink)]">{round.confidenceContext}</Badge>
                {round.responseClassification ? (
                  <Badge className="bg-[#d9ead8] text-[#355b32]">{round.responseClassification.type}</Badge>
                ) : null}
                {round.engagementScore != null ? (
                  <Badge className="bg-[#fff6ed] text-[#8b4d1f]">engagement {Math.round(round.engagementScore)}</Badge>
                ) : null}
                {round.dialecticRound?.uncertainty ? <UncertaintyIndicator uncertainty={round.dialecticRound.uncertainty} /> : null}
              </div>
              <p className="mt-3 text-sm font-medium text-[var(--ink)]">{round.title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{round.prompt}</p>
              <div className="mt-3 rounded-[18px] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Prior rounds</p>
                <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{round.priorRoundSummary}</p>
                {round.followUpPrompt ? (
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                    <span className="font-medium text-[var(--ink)]">Follow-up preview:</span> {round.followUpPrompt}
                  </p>
                ) : null}
              </div>
              <details className="mt-3 rounded-[18px] bg-white p-4">
                <summary className="cursor-pointer text-sm font-medium text-[var(--ink)]">Why this critique</summary>
                <div className="mt-3 space-y-3">
                  <p className="text-sm leading-6 text-[var(--muted-ink)]">{round.why}</p>
                  <div className="rounded-[16px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Argument as explanation</p>
                    <div className="mt-3 space-y-2">
                      <p className="text-sm leading-6 text-[var(--ink)]">
                        <span className="font-medium">Premise:</span> {round.argument.premise}
                      </p>
                      <p className="text-sm leading-6 text-[var(--ink)]">
                        <span className="font-medium">Assumption:</span> {round.argument.assumption}
                      </p>
                      <p className="text-sm leading-6 text-[var(--ink)]">
                        <span className="font-medium">Pressure:</span> {round.argument.pressure}
                      </p>
                      <p className="text-sm leading-6 text-[var(--ink)]">
                        <span className="font-medium">Precedent:</span> {round.argument.precedent}
                      </p>
                      <p className="text-sm leading-6 text-[var(--ink)]">
                        <span className="font-medium">Shape:</span> {round.argument.shape}
                      </p>
                      <p className="text-sm leading-6 text-[var(--ink)]">
                        <span className="font-medium">Conclusion:</span> {round.argument.conclusion}
                      </p>
                      <p className="text-sm leading-6 text-[var(--ink)]">
                        <span className="font-medium">Steel man:</span> {round.steelMan}
                      </p>
                    </div>
                  </div>
                  {round.responseClassification ? (
                    <div className="rounded-[16px] bg-[#f7f2ff] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#5c4c88]">Structured reading</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                        Penny read this response as <span className="font-medium">{round.responseClassification.type}</span>
                        {round.responseClassification.classifiedBy === "user_explicit"
                          ? " from your explicit path choice."
                          : " by inference from the text."}
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                        Confidence at start {formatPercentValue(round.confidenceAtRoundStart)} · end {formatPercentValue(round.confidenceAtRoundEnd)}
                        · delta {round.confidenceDelta >= 0 ? "+" : ""}
                        {formatPercentValue(round.confidenceDelta)}
                      </p>
                      {round.concessions.length || round.defenses.length || round.dismissals.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {round.concessions.length ? (
                            <Badge className="bg-white text-[var(--ink)]">{round.concessions.length} concessions</Badge>
                          ) : null}
                          {round.defenses.length ? (
                            <Badge className="bg-white text-[var(--ink)]">{round.defenses.length} defenses</Badge>
                          ) : null}
                          {round.dismissals.length ? (
                            <Badge className="bg-white text-[var(--ink)]">{round.dismissals.length} dismissals</Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </details>
              {feedbackVisible ? (
                <div className="mt-4">
                  <CritiqueFeedbackCard
                    roundLabel={round.round}
                    critiqueText={round.prompt}
                    critiqueMode={round.dialecticRound?.critiqueMode ?? critiqueMode}
                    voiceLabel={round.dialecticRound?.voiceLabel ?? selectedAudienceCritique?.audienceLabel ?? peerAudience}
                    failureTypes={round.critiqueFailureTypes ?? []}
                    shapeId={selectedShape?.id ?? null}
                    manualOnly={feedbackManualOnly && !openedCritiqueFeedbackRoundIds[round.id]}
                    submitted={critiqueFeedbackStatus.submitted}
                    onSubmit={(payload) =>
                      recordCritiqueFeedback({
                        round: round.dialecticRound ?? null,
                        dismissed: payload.dismissed,
                        ratings: payload.ratings,
                        overallUsefulness: payload.overallUsefulness,
                        freeTextFeedback: payload.freeTextFeedback,
                        correctionText: payload.correctionText,
                        correctionType: payload.correctionType,
                        isCorrectionFlagged: payload.isCorrectionFlagged,
                        shapeId: payload.shapeId,
                      })
                    }
                    onDismiss={() => {
                      if (feedbackManualOnly && !openedCritiqueFeedbackRoundIds[round.id]) {
                        setOpenedCritiqueFeedbackRoundIds((current) => ({
                          ...current,
                          [round.id]: true,
                        }));
                        return;
                      }

                      setHiddenCritiqueFeedbackRoundIds((current) => ({
                        ...current,
                        [round.id]: true,
                      }));
                      recordCritiqueFeedback({
                        round: round.dialecticRound ?? null,
                        dismissed: true,
                        overallUsefulness: 3,
                        ratings: [],
                        freeTextFeedback: null,
                        correctionText: null,
                        isCorrectionFlagged: false,
                        shapeId: selectedShape?.id ?? null,
                      });
                    }}
                  />
                </div>
              ) : feedbackManualOnly ? (
                <div className="mt-4 rounded-[20px] border border-dashed border-black/10 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Critique feedback</p>
                      <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">
                        Penny stopped auto-showing this after three dismissals.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      className="px-3 py-2 text-xs"
                      onClick={() => {
                        setHiddenCritiqueFeedbackRoundIds((current) => ({
                          ...current,
                          [round.id]: false,
                        }));
                        setOpenedCritiqueFeedbackRoundIds((current) => ({
                          ...current,
                          [round.id]: true,
                        }));
                      }}
                    >
                      Rate this critique
                    </Button>
                  </div>
                </div>
              ) : null}
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{round.responsePath}</p>
              <textarea
                className="mt-3 min-h-[88px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
                placeholder="Capture the response that should persist with this round."
                value={draft}
                onChange={(event) =>
                  setDialecticResponseDrafts((current) => ({
                    ...current,
                    [round.round]: event.target.value,
                  }))
                }
              />
              <div className="mt-3 rounded-[18px] border border-black/8 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Concession capture</p>
                <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                  Did you update your confidence?
                </label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={roundContextDraft.confidenceAtRoundEnd}
                    onChange={(event) =>
                      updateDialecticRoundContext(round.round, {
                        confidenceAtRoundEnd: Number(event.target.value),
                      })
                    }
                    className="h-2 w-full accent-[var(--ink)]"
                  />
                  <Badge className="bg-[var(--panel)] text-[var(--ink)]">{formatPercentValue(roundContextDraft.confidenceAtRoundEnd)}</Badge>
                </div>
                <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                  What specifically did you concede?
                </label>
                <textarea
                  className="mt-2 min-h-[64px] w-full rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
                  placeholder="Optional: name the exact point you conceded."
                  value={roundContextDraft.concessionNote}
                  onChange={(event) =>
                    updateDialecticRoundContext(round.round, {
                      concessionNote: event.target.value,
                    })
                  }
                />
                <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                  Did this critique change connected claims?
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {([
                    ["yes", "Yes"],
                    ["no", "No"],
                    ["unsure", "Unsure"],
                  ] as const).map(([value, label]) => (
                    <Button
                      key={`${round.round}-connected-${value}`}
                      variant={roundContextDraft.connectedClaimsChanged === (value === "yes" ? true : value === "no" ? false : null) ? "primary" : "secondary"}
                      className="px-3 py-2 text-xs"
                      onClick={() =>
                        updateDialecticRoundContext(round.round, {
                          connectedClaimsChanged: value === "yes" ? true : value === "no" ? false : null,
                        })
                      }
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <textarea
                  className="mt-3 min-h-[56px] w-full rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
                  placeholder="Optional: name the claims affected."
                  value={roundContextDraft.connectedClaimsNote}
                  onChange={(event) =>
                    updateDialecticRoundContext(round.round, {
                      connectedClaimsNote: event.target.value,
                    })
                  }
                />
                <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">New evidence added?</label>
                <textarea
                  className="mt-2 min-h-[56px] w-full rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
                  placeholder="Optional: paste the new evidence or source you added."
                  value={roundContextDraft.newEvidenceNote}
                  onChange={(event) =>
                    updateDialecticRoundContext(round.round, {
                      newEvidenceNote: event.target.value,
                    })
                  }
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["defend", "revise", "absorb"] as const).map((path) => (
                  <Button
                    key={`${round.round}-${path}`}
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    disabled={isPending || !selectedSteelManReady || draft.trim().length < 8}
                      onClick={() =>
                        recordDialecticRound({
                          round: round.round,
                          roundIndex: Number(round.round.replace(/[^0-9]/g, "")) || 0,
                          title: round.title,
                          critiqueStrength: round.strength,
                          critiqueType: activeCritiqueType,
                          critiqueFailureTypes: [activeCritiqueType],
                          critiqueMode,
                          voiceLabel: selectedAudienceCritique?.audienceLabel ?? peerAudience,
                          prompt: round.prompt,
                          why: round.why,
                          responsePath: path,
                          response: draft,
                        })
                      }
                    >
                    {path}
                  </Button>
                ))}
              </div>
            </div>
          )})}
        </div>
        <div className="mt-4 rounded-[24px] border border-black/8 bg-white p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Round audit trail</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Each persisted round keeps the critique strength, response path, and reasoning note together so the thread can be audited instead of reconstructed from memory.
          </p>
          <div className="mt-4 space-y-3">
            {dialecticRoundEvents.length ? (
              dialecticRoundEvents.map((entry) => (
                <div key={entry.id} className="rounded-[20px] bg-[var(--panel)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-white text-[var(--ink)]">{entry.round}</Badge>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">{entry.critiqueStrength}</Badge>
                    {entry.critiqueType ? <Badge className="bg-white text-[var(--ink)]">{entry.critiqueType}</Badge> : null}
                    {entry.responsePath ? (
                      <Badge className="bg-[#d9ead8] text-[#355b32]">{entry.responsePath}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm font-medium text-[var(--ink)]">{entry.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{entry.prompt}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{entry.why}</p>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{entry.response}</p>
                  {entry.dialecticRound ? (
                    <div className="mt-3 rounded-[16px] bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-[var(--panel)] text-[var(--ink)]">
                          {entry.dialecticRound.responseClassification.type}
                        </Badge>
                        <Badge className="bg-[var(--panel)] text-[var(--ink)]">
                          {formatPercentValue(entry.dialecticRound.confidenceAtRoundStart)} → {formatPercentValue(entry.dialecticRound.confidenceAtRoundEnd)}
                        </Badge>
                        <Badge className="bg-[var(--panel)] text-[var(--ink)]">
                          engagement {Math.round(entry.dialecticRound.engagementScore)}
                        </Badge>
                      </div>
                      {entry.dialecticRound.followUpPrompt ? (
                        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                          <span className="font-medium text-[var(--ink)]">Follow-up:</span> {entry.dialecticRound.followUpPrompt}
                        </p>
                      ) : null}
                      {entry.dialecticRound.concessions.length || entry.dialecticRound.defenses.length || entry.dialecticRound.dismissals.length ? (
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                          {entry.dialecticRound.concessions.length ? `${entry.dialecticRound.concessions.length} concessions` : null}
                          {entry.dialecticRound.concessions.length && (entry.dialecticRound.defenses.length || entry.dialecticRound.dismissals.length) ? " · " : null}
                          {entry.dialecticRound.defenses.length ? `${entry.dialecticRound.defenses.length} defenses` : null}
                          {(entry.dialecticRound.concessions.length || entry.dialecticRound.defenses.length) && entry.dialecticRound.dismissals.length ? " · " : null}
                          {entry.dialecticRound.dismissals.length ? `${entry.dialecticRound.dismissals.length} dismissals` : null}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="rounded-[20px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                No round audit has been persisted yet.
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Adversarial final pass</Badge>
          <Badge className="bg-[#e7defa] text-[#5c4c88]">pre-synthesis</Badge>
          <Badge className="bg-[#d9ead8] text-[#355b32]">{adversarialFinalPass.claimCount} claims</Badge>
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--ink)]">Attack the dependency structure before anything is synthesized.</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
          Penny doesn’t critique individual claims here. It finds the quiet load-bearing assumption in the full argument and asks whether the whole structure survives if that one claim fails.
        </p>
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Quiet keystone</p>
            {adversarialFinalPass.loadBearingAssumption ? (
              <>
                <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                  The quiet keystone is #{adversarialFinalPass.quietKeystoneIndex}: {adversarialFinalPass.loadBearingAssumption.content}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{adversarialFinalPass.quietKeystoneReason}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                  {adversarialFinalPass.collapseWarning} It currently has {adversarialFinalPass.dependentCount} direct dependents.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                {adversarialFinalPass.collapseWarning}
              </p>
            )}
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Named voices</p>
            <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
              Optional critique voices stay grounded in the precedent corpus, so a skeptical VC does not sound like a thesis committee member.
            </p>
            <div className="mt-4 space-y-2">
              {namedVoices.map((voice) => (
                <div key={`final-pass-${voice.label}`} className="rounded-[18px] bg-white p-4">
                  <p className="text-sm font-medium text-[var(--ink)]">{voice.label}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{voice.attackStyle}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Override trail</p>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
          Already-challenged branches stay visible here so future pressure can go deeper instead of repeating the same surface critique.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {challengedActions.length ? (
            challengedActions.map((action) => (
              <Badge key={`history-${action}`} className="bg-[var(--panel)] text-[var(--ink)]">
                {labelAction(action)}
              </Badge>
            ))
          ) : (
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">No challenge history yet</Badge>
          )}
          {map.interventions.length ? (
            <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{map.interventions.length} active intervention prompts</Badge>
          ) : null}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Calibration gate</Badge>
          <Badge className="bg-[#e7defa] text-[#5c4c88]">synthesis</Badge>
          <Badge className="bg-[#d9ead8] text-[#355b32]">{synthesisDependencyCount} load-bearing claims</Badge>
          <Badge className="bg-white text-[var(--ink)]">stakes {synthesisStakesLevel}</Badge>
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--ink)]">
          Pre-mortem, if-you-were-right, twin-check, and dependency completeness.
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
          These gates keep synthesis honest by forcing failure thinking, consequence thinking, a calibrated steelman, and a visible review of what is still at risk.
        </p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Pre-mortem</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">Six months later, this failed because {synthesisPreMortem}.</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              This should be short, stored, and reviewed before Penny synthesizes any artifact.
            </p>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">If you were right</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{synthesisIfRight}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              If the user cannot generate consequences, the belief is still performative rather than load-bearing.
            </p>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-white p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Twin-check</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{synthesisTwinCheck}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              Penny should expose its strongest version of the user’s thinking and let the user decide whether it actually matches their intent.
            </p>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-white p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Dependency completeness</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              {synthesisDependencyCount
                ? `${synthesisDependencyCount} load-bearing claims are visible here.`
                : "No load-bearing claims have been isolated yet."}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              {synthesisMissingCoverage.length
                ? `Still at risk: ${synthesisMissingCoverage.join(", ")}. Penny should ask whether to proceed anyway.`
                : "The map has the minimum structure Penny expects before synthesis."}
            </p>
          </div>
        </div>
      </Card>

      {lastAction?.reasoning.graphAnalysis ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Last move</Badge>
            <Badge className="bg-[#e7defa] text-[#5c4c88]">{lastAction.execution.mode.replaceAll("_", " ")}</Badge>
            <Badge>{lastAction.reasoning.graphAnalysis.primaryGap.replaceAll("-", " ")}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {lastAction.reasoning.graphAnalysis.critiqueTags.map((tag) => (
              <Badge key={tag} className="bg-[var(--panel)] text-[var(--ink)]">
                {tag.replaceAll("-", " ")}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
            Penny targeted <span className="font-medium">{lastAction.execution.targetNodeKind.replaceAll("_", " ")}</span> because the graph’s weakest gap was{" "}
            <span className="font-medium">{lastAction.reasoning.graphAnalysis.primaryGap.replaceAll("-", " ")}</span>.
          </p>
          <div className="mt-4 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Why this move</p>
              <div className="mt-2 space-y-2">
                {lastAction.reasoning.graphAnalysis.actionSelection.why.map((reason) => (
                  <p key={reason} className="text-sm leading-6 text-[var(--ink)]">
                    {reason}
                  </p>
                ))}
                {lastAction.reasoning.graphAnalysis.reasons.map((reason) => (
                  <p key={reason} className="text-sm leading-6 text-[var(--muted-ink)]">
                    {reason}
                  </p>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Weak branches</p>
              <div className="mt-2 space-y-3">
                {lastAction.reasoning.graphAnalysis.weakNodes.slice(0, 3).map((node) => (
                  <div key={node.nodeId} className="rounded-[20px] bg-[var(--panel)] p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                      {node.kind.replaceAll("_", " ")} · score {node.score}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{node.issues.join(" · ")}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {selectedMetaCognitionPrompt ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Meta-cognition prompt</Badge>
            <Badge className="bg-[#e7defa] text-[#5c4c88]">{selectedMetaCognitionPrompt.trigger.condition.replaceAll("_", " ")}</Badge>
            <Badge className="bg-white text-[var(--ink)]">{selectedMetaCognitionPrompt.trigger.promptTone.replaceAll("_", " ")}</Badge>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--ink)]">The lens is talking back.</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            This is not a critique. It is an observational nudge about the session state that Penny thinks is worth naming.
          </p>
          <div className="mt-4">
            <MetaCognitionPrompt
              key={selectedMetaCognitionPrompt.id}
              prompt={selectedMetaCognitionPrompt}
              onRespond={(responseType, responseText, tellMeMoreOpened) =>
                recordMetaCognitionResponse(selectedMetaCognitionPrompt, responseType, responseText, tellMeMoreOpened)
              }
              onDismiss={() => recordMetaCognitionResponse(selectedMetaCognitionPrompt, "not_now", null, false)}
            />
          </div>
        </Card>
      ) : null}

      {learningPrompt && !learningPromptDismissed ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Learning prompt</Badge>
            <Badge className="bg-[#e7f3ea] text-[#2f6d47]">{learningPrompt.promptType.replaceAll("_", " ")}</Badge>
            {learningPrompt.source ? <Badge className="bg-white text-[var(--ink)]">{learningPrompt.source}</Badge> : null}
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--ink)]">A useful thing to learn right now.</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Penny is surfacing this because the current round or claim suggests a specific correction, not just a generic critique.
          </p>
          <div className="mt-4">
            <LearningPromptCard
              prompt={learningPrompt}
              claimId={selectedGraphNode?.node.id ?? selectedGraphNodeModel?.id ?? map.id}
              roundId={learningPromptRoundId}
              onDismiss={() => setLearningPromptDismissed(true)}
            />
          </div>
        </Card>
      ) : null}

      <Card className="p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Memory layer</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Old selves, belief genealogy, and shape feedback.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-ink)]">
              Penny turns the move history into something you can actually feel: how a claim changed, what depended on it, and which thinking pattern is active in the current critique.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {derivedShapes.slice(0, 4).map((shape) => (
              <Button
                key={shape.id}
                variant={selectedShape?.id === shape.id ? "primary" : "secondary"}
                className="px-3 py-2 text-xs"
                onClick={() => setSelectedShapeId(shape.id)}
              >
                {shape.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <ShapeDetail
            shape={selectedShape}
            falsificationDraft={selectedShapeFalsificationDraft}
            onFalsificationDraftChange={(value) => {
              if (!selectedShape) {
                return;
              }

              setShapeFalsificationDrafts((current) => ({
                ...current,
                [selectedShape.id]: value,
              }));
            }}
            onSaveFalsificationCondition={() => {
              if (!selectedShape) {
                return;
              }

              const falsificationCondition = selectedShapeFalsificationDraft.trim();
              recordShapeFeedback(
                {
                  id: selectedShape.id,
                  label: selectedShape.label,
                  primaryMapId: selectedShape.primaryMapId,
                },
                selectedShapeFeedback ?? "refined",
                selectedShape.derivation?.counterfactual.description ?? "Updated falsification condition.",
                falsificationCondition,
              );
            }}
          />
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-[24px] border border-black/8 bg-white p-5 xl:col-span-2">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Timeline views</p>
                <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Watch the map move in time.</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-ink)]">
                  Penny already stores the move layer, so the same history can become a time-lapse of claims appearing,
                  shapes hardening, and dependency chains changing shape.
                </p>
              </div>
              <Badge className="bg-[#e7defa] text-[#5c4c88]">{mapTimeline.entries.length} visible events</Badge>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              <TimelinePanel
                title="Whole map timeline"
                subtitle={mapTimeline.summary}
                count={`${mapTimeline.entries.length} entries`}
                highlight="Claims, stress tests, revisions, confidence shifts, and shape feedback."
              >
                {mapTimeline.entries.slice(-6).map((entry) => (
                  <TimelineRow key={entry.id} accent={entry.accent} label={entry.label} when={entry.createdAt} summary={entry.summary} />
                ))}
              </TimelinePanel>

              <TimelinePanel
                title="Shape timeline"
                subtitle={
                  shapeTimeline
                    ? `Follow when ${shapeTimeline.label} first showed up, how its confidence moved, and what confirmed or weakened it.`
                    : "Select a shape to see how Penny noticed it over time."
                }
                count={shapeTimeline ? `${shapeTimeline.trail.length} steps` : "No active shape"}
                highlight={
                  shapeTimeline
                    ? `Confidence now ${shapeTimeline.confidence}%. Range ${shapeTimeline.confidenceRange.min ?? "n/a"}-${shapeTimeline.confidenceRange.max ?? "n/a"}.`
                    : "Shape timelines appear when a live pattern is active."
                }
              >
                {shapeTimeline ? (
                  shapeTimeline.trail.slice(-5).map((step) => (
                    <TimelineRow
                      key={step.id}
                      accent={step.tone === "feedback" ? "shape" : step.tone === "strengthened" ? "revision" : step.tone === "weakened" ? "stress" : "confidence"}
                      label={step.label}
                      when={step.createdAt}
                      summary={step.summary}
                      note={step.confidence != null ? `Confidence ${step.confidence}%` : null}
                    />
                  ))
                ) : (
                  <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                    No shape selected yet.
                  </p>
                )}
              </TimelinePanel>

              <TimelinePanel
                title="Dependency chain timeline"
                subtitle={
                  dependencyTimeline
                    ? `Watch the load-bearing structure for ${selectedGraphNode ? kindLabel(selectedGraphNode.node.kind) : "this claim"}.`
                    : "Select a claim to inspect its dependency chain."
                }
                count={dependencyTimeline ? `${dependencyTimeline.steps.length} steps` : "No chain"}
                highlight={
                  dependencyTimeline
                    ? dependencyTimeline.steps.some((step) => step.loadBearing)
                      ? "Load-bearing claims are marked along the chain."
                      : "No obvious load-bearing node yet, but the chain is still readable."
                    : "Dependency timelines follow the selected claim."
                }
              >
                {dependencyTimeline ? (
                  dependencyTimeline.steps.slice(-5).map((step) => (
                    <TimelineRow
                      key={step.id}
                      accent={step.relation === "root" ? "claim" : step.loadBearing ? "revision" : "stress"}
                      label={`${step.label}${step.loadBearing ? " · load-bearing" : ""}`}
                      when={step.createdAt}
                      summary={step.summary}
                    />
                  ))
                ) : (
                  <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                    No dependency chain yet.
                  </p>
                )}
              </TimelinePanel>
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Old selves</p>
                <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Timeline of this claim</h3>
              </div>
              <Badge className="bg-white text-[var(--ink)]">{selectedOldSelves.length} versions</Badge>
            </div>

            <div className="mt-4 space-y-3">
              {selectedOldSelves.map((snapshot, index) => {
                const previousConfidence = index > 0 ? selectedOldSelves[index - 1]?.confidence : null;
                const drift =
                  previousConfidence != null && snapshot.confidence != null ? snapshot.confidence - previousConfidence : null;

                return (
                <div key={snapshot.id} className={cn("rounded-[20px] bg-white p-4", snapshot.isCurrent && "ring-2 ring-[var(--ink)] ring-offset-1")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-[var(--panel)] text-[var(--ink)]">{snapshot.versionLabel}</Badge>
                    <Badge className={statusBadge(snapshot.status)}>{snapshot.status}</Badge>
                    {snapshot.confidence != null ? (
                      <Badge className="bg-[#d9ead8] text-[#355b32]">confidence {formatScore(snapshot.confidence)}</Badge>
                    ) : null}
                    {drift != null && drift !== 0 ? (
                      <Badge className={drift > 0 ? "bg-[#d9ead8] text-[#355b32]" : "bg-[#fff6ed] text-[#8b4d1f]"}>
                        {drift > 0 ? "↑" : "↓"} {Math.round(Math.abs(drift) * 100)} drift
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{snapshot.content}</p>
                  {snapshot.note ? <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{snapshot.note}</p> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">{snapshot.moveLabel}</Badge>
                    <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{snapshot.updatedAt.toLocaleDateString()}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{snapshot.moveSummary}</p>
                </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Belief archaeology</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Layer the claim until it hits an axiom.</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Penny traces the current claim down through its parents so the hidden assumption stack stays visible instead of feeling self-evident.
              </p>
              {selectedArchaeologyAxiom ? (
                <div className="mt-4 space-y-2">
                  <div className="rounded-[18px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Deepest layer</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{selectedArchaeologyAxiom.content}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                      {selectedArchaeologyAxiom.kind.replaceAll("_", " ")} · {selectedArchaeologyAxiom.nodeStatus}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {selectedGenealogy.lineage.map((node, index) => (
                      <div key={`${node.id}:${index}`} className="rounded-[18px] bg-white px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={statusBadge(node.nodeStatus)}>{kindLabel(node.kind)}</Badge>
                          {index === 0 ? (
                            <Badge className="bg-[#d9ead8] text-[#355b32]">axiom</Badge>
                          ) : index === selectedGenealogy.lineage.length - 1 ? (
                            <Badge className="bg-[#e7defa] text-[#5c4c88]">current claim</Badge>
                          ) : (
                            <Badge className="bg-[var(--panel)] text-[var(--ink)]">layer {index + 1}</Badge>
                          )}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">Select a claim to peel back the deepest assumption it rests on.</p>
              )}
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Bayesian propagation</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Confidence should cascade through the graph.</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                When the seed claim moves, dependents should move too. Overrides let the user explain why a specific drop should be softened instead of blindly accepted.
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                Why now: {selectedClaimStructure.whyNowTrigger}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  className="px-3 py-2 text-xs"
                  onClick={() =>
                    persistBeliefPropagation(
                      selectedPropagation?.seedNodeId ?? selectedGraphNode?.node.id ?? defaultGraphNodeId ?? "",
                      selectedGraphNode?.node.scores?.confidence ?? null,
                    )
                  }
                >
                  Persist cascade
                </Button>
                {selectedPropagation?.cycleError ? (
                  <Badge className="bg-[#fff6ed] text-[#8b4d1f]">
                    cycle detected · {selectedPropagation.cycleError.nodeIds.length} nodes
                  </Badge>
                ) : null}
              </div>
              {selectedPropagation?.cycleError ? (
                <div className="mt-3 rounded-[18px] border border-[#d7c06c] bg-[#fff9df] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#8b4d1f]">Structural error</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{selectedPropagation.cycleError.message}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                    Cycle nodes: {selectedPropagation.cycleError.nodeIds.join(" → ")}.
                  </p>
                </div>
              ) : null}

              {selectedPropagation ? (
                <>
                  {selectedPropagationImplication ? (
                    <div className="mt-4 rounded-[18px] border border-[#e0cfa8] bg-[#fffaf0] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Propagated implication</p>
                      <h4 className="mt-2 text-lg font-semibold text-[var(--ink)]">
                        Because you changed {selectedPropagationImplication.sourceLabel.slice(0, 72)}
                        {selectedPropagationImplication.sourceLabel.length > 72 ? "…" : ""}, {selectedPropagationImplication.targetLabel.slice(0, 72)}
                        {selectedPropagationImplication.targetLabel.length > 72 ? "…" : ""} moved from{" "}
                        {formatScore(selectedPropagationImplication.beforeConfidence)} to {formatScore(selectedPropagationImplication.afterConfidence)}.
                      </h4>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                        Penny is surfacing the downstream update instead of hiding it. Do you accept this implication, or do you want to argue that the propagation is too strong?
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                        Why now: {selectedClaimStructure.whyNowReason}
                      </p>
                      <div className="mt-3 rounded-[16px] bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Confidence math</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{selectedPropagationImplication.confidenceMath}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">
                          Dependency weight {Math.round(selectedPropagationImplication.dependencyWeight * 100)}% · change {formatScore(Math.abs(selectedPropagationImplication.delta))} points
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">
                          Posterior moved from {formatScore(selectedPropagationImplication.beforeConfidence)}% to{" "}
                          {formatScore(selectedPropagationImplication.afterConfidence)}%.
                        </p>
                        {selectedPropagationImplication.contributions.length ? (
                          <div className="mt-3 space-y-2 rounded-[14px] bg-[var(--panel)] p-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                              Parent contributions
                            </p>
                            {selectedPropagationImplication.contributions.map((contribution) => (
                              <div key={`${contribution.parentId}:${contribution.edgeId}`} className="rounded-[12px] bg-white p-3">
                                <p className="text-sm font-medium text-[var(--ink)]">
                                  Parent {nodesById.get(contribution.parentId)?.content ?? contribution.parentId}
                                </p>
                                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                                  {formatPercentValue(contribution.parentPrior * 100)} → {formatPercentValue(contribution.parentPosterior * 100)}
                                </p>
                                <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">{contribution.explanation}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {propagationAcknowledged[selectedPropagationImplication.targetNodeId] ? (
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#355b32]">
                          Decision recorded: {propagationAcknowledged[selectedPropagationImplication.targetNodeId]}
                        </p>
                      ) : null}
                      <div className="mt-4 space-y-3">
                        <div className="rounded-[18px] bg-white px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Final posterior</p>
                            <Badge className="bg-[var(--panel)] text-[var(--ink)]">
                              {formatPercentValue(
                                propagationFinalPosteriorDrafts[selectedPropagationImplication.targetNodeId] ??
                                  selectedPropagationImplication.afterConfidence * 100,
                              )}
                            </Badge>
                          </div>
                          <div className="mt-3">
                            <ConfidenceSlider
                              value={
                                propagationFinalPosteriorDrafts[selectedPropagationImplication.targetNodeId] ??
                                Math.round(selectedPropagationImplication.afterConfidence * 100)
                              }
                              onChange={(value) =>
                                setPropagationFinalPosteriorDrafts((current) => ({
                                  ...current,
                                  [selectedPropagationImplication.targetNodeId]: value,
                                }))
                              }
                              showLabel={false}
                              showAnchors={false}
                            />
                          </div>
                          <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
                            Accept keeps the propagated posterior. Override uses this slider value. Decouple keeps the claim
                            at its own base confidence.
                          </p>
                        </div>
                        <textarea
                          className="min-h-[84px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
                          placeholder="If the propagation is too strong, explain why the downstream confidence should stay higher."
                          value={confidenceOverrideReasons[selectedPropagationImplication.targetNodeId] ?? ""}
                          onChange={(event) =>
                            setConfidenceOverrideReasons((current) => ({
                              ...current,
                              [selectedPropagationImplication.targetNodeId]: event.target.value,
                            }))
                          }
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            className="px-3 py-2 text-xs"
                            onClick={() => {
                              setPropagationAcknowledged((current) => ({
                                ...current,
                                [selectedPropagationImplication.targetNodeId]: "accepted",
                              }));
                              recordConfidenceOverride(
                                selectedPropagationImplication.sourceNodeId,
                                selectedPropagationImplication.targetNodeId,
                                confidenceOverrideReasons[selectedPropagationImplication.targetNodeId]?.trim() ||
                                  "Accepted the propagated implication.",
                                "hold",
                              );
                            }}
                          >
                            Accept
                          </Button>
                          <Button
                            variant="secondary"
                            className="px-3 py-2 text-xs"
                            disabled={isPending || (confidenceOverrideReasons[selectedPropagationImplication.targetNodeId] ?? "").trim().length < 8}
                            onClick={() =>
                              recordConfidenceOverride(
                                selectedPropagationImplication.sourceNodeId,
                                selectedPropagationImplication.targetNodeId,
                                confidenceOverrideReasons[selectedPropagationImplication.targetNodeId] ?? "",
                                "reduce",
                              )
                            }
                          >
                            Override
                          </Button>
                          <Button
                            variant="secondary"
                            className="px-3 py-2 text-xs"
                            disabled={isPending || (confidenceOverrideReasons[selectedPropagationImplication.targetNodeId] ?? "").trim().length < 8}
                            onClick={() =>
                              recordConfidenceOverride(
                                selectedPropagationImplication.sourceNodeId,
                                selectedPropagationImplication.targetNodeId,
                                confidenceOverrideReasons[selectedPropagationImplication.targetNodeId] ?? "",
                                "decouple",
                              )
                            }
                          >
                            Decouple
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge className="bg-[#d9ead8] text-[#355b32]">
                      Seed {formatScore(selectedPropagation.seedConfidence)}
                    </Badge>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">{selectedPropagation.overrideCount} overrides</Badge>
                    <Badge className="bg-[var(--panel)] text-[var(--ink)]">
                      {selectedPropagation.cascade.length} cascade steps
                    </Badge>
                  </div>
                  <div className="mt-4 rounded-[18px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Support chain</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedPropagation.supporterChain.map((step) => (
                        <Badge key={step.nodeId} className="bg-white text-[var(--ink)]">
                          {step.label} · {step.confidence != null ? formatScore(step.confidence) : "n/a"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {quietFragility && quietFragility.isFragile ? (
                    <div className="mt-4 rounded-[18px] border border-[#d7c06c] bg-[#fff9df] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#8b4d1f]">Quiet fragility</p>
                      <p className="mt-2 text-sm leading-7 text-[var(--ink)]">
                        You feel {formatScore(quietFragility.feltConfidence)} confident here, but the support chain caps this at about{" "}
                        {formatScore(quietFragility.structuralCap)}.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                        That gap is {formatScore(quietFragility.gap)}. Penny is surfacing the mismatch between felt confidence and the math of the dependency chain.
                      </p>
                      {quietFragility.weakestLayer ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge className="bg-white text-[var(--ink)]">weakest layer: {kindLabel(quietFragility.weakestLayer.kind)}</Badge>
                          <Badge className="bg-white text-[var(--ink)]">{quietFragility.weakestLayer.scores?.confidence != null ? formatScore(quietFragility.weakestLayer.scores.confidence) : "n/a"}</Badge>
                          <Button
                            variant="secondary"
                            className="px-3 py-2 text-xs"
                            onClick={() => setSelectedGraphNodeId(quietFragility.weakestLayer?.id ?? selectedGraphNode?.node.id ?? defaultGraphNodeId ?? null)}
                          >
                            Inspect weakest support
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-4 space-y-3">
                    {selectedPropagation.cascade.slice(0, 4).map((step) => (
                      <div key={`${step.sourceNodeId}:${step.targetNodeId}`} className="rounded-[18px] bg-[var(--panel)] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-white text-[var(--ink)]">{step.pathLabel}</Badge>
                          <Badge className="bg-[#d9ead8] text-[#355b32]">base {formatScore(step.baseConfidence)}</Badge>
                          <Badge className="bg-[#e7defa] text-[#5c4c88]">
                            propagated {formatScore(step.propagatedConfidence)}
                          </Badge>
                          <Badge className={step.delta >= 0 ? "bg-[#d9ead8] text-[#355b32]" : "bg-[#fff6ed] text-[#8b4d1f]"}>
                            {step.delta >= 0 ? "+" : "-"}
                            {Math.abs(Math.round(step.delta * 100))}
                          </Badge>
                          {step.uncertainty ? <UncertaintyIndicator uncertainty={step.uncertainty} /> : null}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{step.reasoning}</p>
                        {step.overrideReasoning ? (
                          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                            Override reasoning: {step.overrideReasoning}
                          </p>
                        ) : null}
                        <form
                          className="mt-3 space-y-3"
                          onSubmit={(event) => {
                            event.preventDefault();
                            recordConfidenceOverride(
                              step.sourceNodeId,
                              step.targetNodeId,
                              confidenceOverrideReasons[step.targetNodeId] ?? "",
                            );
                          }}
                        >
                          <textarea
                            className="min-h-[84px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
                            placeholder="Explain why this downstream confidence should be held higher than the raw cascade suggests."
                            value={confidenceOverrideReasons[step.targetNodeId] ?? ""}
                            onChange={(event) =>
                              setConfidenceOverrideReasons((current) => ({
                                ...current,
                                [step.targetNodeId]: event.target.value,
                              }))
                            }
                          />
                          <Button
                            type="submit"
                            variant="secondary"
                            className="px-3 py-2 text-xs"
                            disabled={isPending || (confidenceOverrideReasons[step.targetNodeId] ?? "").trim().length < 8}
                          >
                            Override this drop
                          </Button>
                        </form>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">Select a claim to inspect the propagation cascade.</p>
              )}
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Inheritance claims</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">How this belief entered the map</h3>
              {claimCapture ? (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge className="bg-[var(--panel)] text-[var(--ink)]">{claimCapture.provenance}</Badge>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">confidence {claimCapture.confidence}%</Badge>
                    <Badge className="bg-[#d9ead8] text-[#355b32]">{claimCapture.status}</Badge>
                    {claimCapture.resolutionDate ? (
                      <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{claimCapture.resolutionDate}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
                    {claimCapture.provenance === "inherited"
                      ? `Inherited from ${claimCapture.provenanceDetail || "another person"}.`
                      : "This claim started from your own capture instead of a source you inherited."}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                    {claimCapture.provenance === "inherited"
                      ? "Scrutiny automatically goes up on the source chain because inherited beliefs can hide borrowed errors."
                      : "Penny still records provenance so later revisions can trace where the belief came from."}
                  </p>
                  <div className="mt-4 rounded-[18px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Claim structure</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {claimCapture.temporalScope ? (
                        <Badge className="bg-white text-[var(--ink)]">{claimCapture.temporalScope}</Badge>
                      ) : (
                        <Badge className="bg-white text-[var(--ink)]">No temporal scope yet</Badge>
                      )}
                      <Badge className="bg-[#e7defa] text-[#5c4c88]">{claimCapture.structureKind?.replaceAll("_", " ") ?? "assertion"}</Badge>
                      {claimCapture.conditionalStatement ? (
                        <Badge className="bg-[#fff6ed] text-[#8b4d1f]">conditional claim</Badge>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                      Temporal scope keeps forecasts honest, and conditional structure keeps the if-part visible instead of flattening it into a single assertion.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-[16px] bg-white p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Merge candidates</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedClaimStructure.mergeCandidates.length ? (
                            selectedClaimStructure.mergeCandidates.map((candidate) => (
                              <Badge key={candidate} className="bg-[var(--panel)] text-[var(--ink)]">
                                {candidate}
                              </Badge>
                            ))
                          ) : (
                            <Badge className="bg-[var(--panel)] text-[var(--ink)]">No merge candidate yet</Badge>
                          )}
                        </div>
                      </div>
                      <div className="rounded-[16px] bg-white p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Split candidates</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedClaimStructure.splitCandidates.length ? (
                            selectedClaimStructure.splitCandidates.map((candidate) => (
                              <Badge key={candidate} className="bg-[#fff6ed] text-[#8b4d1f]">
                                {candidate}
                              </Badge>
                            ))
                          ) : (
                            <Badge className="bg-[#fff6ed] text-[#8b4d1f]">No split candidate yet</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Badge className="bg-white text-[var(--ink)]">
                        {resolutionDue ? "resolution ready" : resolutionCandidateDate ? `due ${claimCapture.resolutionDate}` : "manual resolution"}
                      </Badge>
                      <Button
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        onClick={() => setResolutionFlowOpen(true)}
                      >
                        {resolutionDue ? "Resolve now" : "Open resolution flow"}
                      </Button>
                    </div>
                  </div>
                  {resolutionDue ? (
                    <div className="mt-4 rounded-[18px] border border-[#d7c06c] bg-[#fff9df] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#8b4d1f]">Resolution due</p>
                      <h4 className="mt-2 text-lg font-semibold text-[var(--ink)]">
                        This claim is ready for outcome capture.
                      </h4>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                        Penny should score the outcome, write down what changed, and propagate the signal to the claims that depend on it.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge className="bg-white text-[var(--ink)]">predicted {claimCapture.confidence}%</Badge>
                        <Badge className="bg-white text-[var(--ink)]">{resolutionTargetNode?.kind.replaceAll("_", " ") ?? "claim"}</Badge>
                        <Button
                          variant="secondary"
                          className="px-3 py-2 text-xs"
                          onClick={() => setResolutionFlowOpen(true)}
                        >
                          Resolve now
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {resolutionLessons.length ? (
                    <div className="mt-4 rounded-[18px] bg-[var(--panel)] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Resolution lessons</p>
                      <div className="mt-3 space-y-2">
                        {resolutionLessons.slice(0, 3).map((lesson) => (
                          <p key={lesson} className="rounded-[16px] bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)]">
                            {lesson}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                  No capture metadata is available for this map yet.
                </p>
              )}
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Belief genealogy</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Supersession chain and source contradictions</h3>

              {selectedGenealogy.lineage.length ? (
                <div className="mt-4 space-y-3">
                  {selectedGenealogy.lineage.map((node, index) => (
                    <div key={node.id} className="rounded-[18px] bg-[var(--panel)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusBadge(node.nodeStatus)}>{node.nodeStatus}</Badge>
                        <Badge>{kindLabel(node.kind)}</Badge>
                        {index === selectedGenealogy.lineage.length - 1 ? (
                          <Badge className="bg-[#d9ead8] text-[#355b32]">current source</Badge>
                        ) : (
                          <Badge className="bg-[#e7defa] text-[#5c4c88]">ancestor</Badge>
                        )}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                        {node.scores?.confidence != null ? `Confidence ${formatScore(node.scores.confidence)}` : "No confidence score"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">No genealogy available for the current selection.</p>
              )}

              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Downstream claims</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedGenealogy.dependents.length ? (
                    selectedGenealogy.dependents.slice(0, 4).map((node) => (
                      <Badge key={node.id} className="bg-[var(--panel)] text-[var(--ink)]">
                        {kindLabel(node.kind)} · {node.nodeStatus}
                      </Badge>
                    ))
                  ) : (
                    <Badge className="bg-[var(--panel)] text-[var(--ink)]">No direct dependents yet</Badge>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Contradicted by</p>
                <div className="mt-3 space-y-2">
                  {selectedGenealogy.contradictions.length ? (
                    selectedGenealogy.contradictions.slice(0, 4).map((node) => (
                      <div key={node.id} className="rounded-[18px] bg-[var(--panel)] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={statusBadge(node.nodeStatus)}>{node.nodeStatus}</Badge>
                          <Badge>{kindLabel(node.kind)}</Badge>
                          {node.nodeStatus === "superseded" ? (
                            <Badge className="bg-[#f5d6b3] text-[#8b4d1f]">source contradicted</Badge>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                      </div>
                    ))
                  ) : (
                    <Badge className="bg-[var(--panel)] text-[var(--ink)]">No contradicted source found yet</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Source/session audit</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Trace where this claim came from and how it moved.</h3>
              {claimCapture ? (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge className="bg-[var(--panel)] text-[var(--ink)]">{claimCapture.provenance}</Badge>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">confidence {claimCapture.confidence}%</Badge>
                    <Badge className="bg-[#d9ead8] text-[#355b32]">{claimCapture.status}</Badge>
                    {claimCapture.resolutionDate ? (
                      <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{claimCapture.resolutionDate}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
                    {claimCapture.provenance === "inherited"
                      ? `Inherited from ${claimCapture.provenanceDetail || "another person"} and tracked through the source chain.`
                      : "This claim started from your own capture, but Penny still keeps the provenance and session trail visible."}
                  </p>
                  <div className="mt-4 space-y-2">
                    {inheritedClaimAudit.length ? (
                      inheritedClaimAudit.map((snapshot) => (
                        <div key={`${snapshot.mapId}-${snapshot.sourceLabel}`} className="rounded-[18px] bg-[var(--panel)] p-4">
                          <p className="text-sm font-medium text-[var(--ink)]">{snapshot.sourceLabel}</p>
                          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{snapshot.scrutinyNote}</p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                        No inherited source chain is present yet.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                  No capture metadata is available for this map yet.
                </p>
              )}
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Claim dependency graph</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Load-bearing claims and edges</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Roots</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{claimDependencyGraph.rootNodeIds.length}</p>
                </div>
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Load-bearing</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{claimDependencyGraph.loadBearingNodeIds.length}</p>
                </div>
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Edges</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{claimDependencyGraph.edges.length}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {claimDependencyGraph.loadBearingNodeIds.slice(0, 4).map((nodeId) => {
                  const node = nodesById.get(nodeId);

                  if (!node) {
                    return null;
                  }

                  return (
                    <div key={nodeId} className="rounded-[18px] bg-[var(--panel)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusBadge(node.nodeStatus)}>{node.nodeStatus}</Badge>
                        <Badge className="bg-white text-[var(--ink)]">{kindLabel(node.kind)}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{node.content}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Lens freshness</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">How current the working lens is</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Active shapes</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{lens.activeShapes.length}</p>
                </div>
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Overrides</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{lens.comparison.overrideShapeCount}</p>
                </div>
                <div className="rounded-[18px] bg-[var(--panel)] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Lag</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                    {lens.freshness.lagMinutes != null ? `${lens.freshness.lagMinutes}m` : "n/a"}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--ink)]">
                {lens.freshness.stale
                  ? "The lens is stale enough to deserve a refresh before more synthesis work."
                  : "The current lens is still tracking the latest move and override signals."}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Generic shapes: {lens.comparison.genericShapeCount}. Effective lens shapes: {lens.effectiveShapes.length}.
                {lens.comparison.suppressedShapeIds.length
                  ? ` Suppressed by override: ${lens.comparison.suppressedShapeIds.slice(0, 3).join(", ")}.`
                  : " No shape has been suppressed by override yet."}
              </p>
            </div>

            <BlindSpotMapView
              blindSpotMap={blindSpotMap}
              loading={blindSpotMapLoading}
              refreshing={blindSpotMapRefreshing}
              onRefresh={refreshBlindSpotMap}
              onOpenClaim={(claimId) => {
                setSelectedGraphNodeId(claimId);
                setView("graph");
              }}
            />

            <BiasProfile
              profile={displayedBiasProfile}
              loading={biasProfileLoading}
              refreshing={biasProfileRefreshing}
              onRefresh={refreshBiasProfile}
            />

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Move history</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">What happened to this claim</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                The move log makes the self-iteration visible: what Penny changed, what signals fired, and when the user pushed back.
              </p>
              <div className="mt-4 space-y-3">
                {selectedMoveHistory.length ? (
                  selectedMoveHistory.slice(-5).map((entry) => (
                    <div key={entry.id} className="rounded-[18px] bg-[var(--panel)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-white text-[var(--ink)]">{entry.label}</Badge>
                        <Badge
                          className={
                            entry.accent === "move"
                              ? "bg-[#d9ead8] text-[#355b32]"
                              : entry.accent === "feedback"
                                ? "bg-[#e7defa] text-[#5c4c88]"
                                : "bg-[#fff6ed] text-[#8b4d1f]"
                          }
                        >
                          {entry.accent}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{entry.summary}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                        {entry.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                    No move history yet for this claim.
                  </p>
                )}
              </div>
            </div>

            <RevisitQueue
              items={dailyRevisitQueue}
              onOpenClaim={(claimId) => setSelectedGraphNodeId(claimId)}
              onReviewNoChange={(claimId) => recordRevisitAction(claimId, "reviewed_no_change")}
              onSnooze={(claimId) => recordRevisitAction(claimId, "snoozed")}
            />

            <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Move query lens</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Query the move layer like a real substrate.</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                The view should be addressable by claim, time range, event type, decision outcome, override, and recency so the same event log can power timelines and review.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge className="bg-white text-[var(--ink)]">Claim: {selectedGraphNode?.node.kind.replaceAll("_", " ") ?? "current node"}</Badge>
                <Badge className="bg-white text-[var(--ink)]">Time: recent history</Badge>
                <Badge className="bg-white text-[var(--ink)]">Events: move / feedback / signal</Badge>
                <Badge className="bg-white text-[var(--ink)]">Decision: {lastAction?.action ?? "n/a"}</Badge>
                <Badge className="bg-white text-[var(--ink)]">Override: {shapeFeedback[activeShapeCallout?.id ?? ""] ? "logged" : "pending"}</Badge>
                <Badge className="bg-white text-[var(--ink)]">Recency: {selectedMoveHistory.length ? `${selectedMoveHistory.slice(-5).length} visible` : "n/a"}</Badge>
              </div>
            </div>

            <div className="rounded-[24px] border border-black/8 bg-[linear-gradient(180deg,#fffdf8_0%,#f8f2e8_100%)] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Shape callout</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">
                {activeShapeCallout ? activeShapeCallout.label : "No active shape"}
              </h3>

              {activeShapeCallout ? (
                <>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{activeShapeCallout.summary}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{activeShapeCallout.explanation}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge className="bg-white text-[var(--ink)]">
                      {formatShapeVerdict(activeShapeCallout.verdict)} · {activeShapeCallout.confidence}%
                    </Badge>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">
                      {activeShapeCallout.evidenceNodeIds.length} prior claim
                      {activeShapeCallout.evidenceNodeIds.length === 1 ? "" : "s"}
                    </Badge>
                    {activeShapeCallout.uncertainty ? <UncertaintyIndicator uncertainty={activeShapeCallout.uncertainty} /> : null}
                  </div>
                  <div className="mt-4 space-y-3">
                    <textarea
                      className="min-h-[96px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
                      placeholder="Why do you disagree? What load-bearing assumption or precedent are you testing?"
                      value={shapeOverrideReasons[activeShapeCallout.id] ?? ""}
                      onChange={(event) =>
                        setShapeOverrideReasons((current) => ({
                          ...current,
                          [activeShapeCallout.id]: event.target.value,
                        }))
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        disabled={isPending || activeShapeReasoning.length < 8}
                        onClick={() =>
                          recordShapeFeedback(
                            activeShapeCallout,
                            "confirmed",
                            activeShapeReasoning,
                          )
                        }
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        disabled={isPending || activeShapeReasoning.length < 8}
                        onClick={() =>
                          recordShapeFeedback(
                            activeShapeCallout,
                            "rejected",
                            activeShapeReasoning,
                          )
                        }
                      >
                        Reject
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        disabled={isPending || activeShapeReasoning.length < 8}
                        onClick={() =>
                          recordShapeFeedback(
                            activeShapeCallout,
                            "refined",
                            activeShapeReasoning,
                          )
                        }
                      >
                        Refine
                      </Button>
                    </div>
                  </div>
                  {shapeFeedback[activeShapeCallout.id] ? (
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                      Marked as {shapeFeedback[activeShapeCallout.id]}
                    </p>
                  ) : null}
                  {activeShapeTeaching ? (
                    <div className="mt-4 rounded-[18px] bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Metacognition teaching</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                        Pattern: <span className="font-medium">{activeShapeTeaching.pattern}</span>
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{activeShapeTeaching.research}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">Response: {activeShapeTeaching.response}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                  When a shape is active in a critique, Penny will name it here and show the pattern it is using.
                </p>
              )}
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Steel man memory</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Original opposition and revision live alongside the claim.</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                When the opposing view changes after critique, Penny keeps the first version and the revision side by side so the thread can be reviewed later.
              </p>
              {selectedSteelMan?.updateHistory.length ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-[18px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Original steel man</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{selectedSteelMan.updateHistory[0]?.versionText}</p>
                  </div>
                  <div className="rounded-[18px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Latest revision</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                      {selectedSteelMan.updateHistory[selectedSteelMan.updateHistory.length - 1]?.versionText}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">
                  No steel man has been saved for this claim yet.
                </p>
              )}
              {selectedSteelMan?.usedInRound.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedSteelMan.usedInRound.map((roundLabel) => (
                    <Badge key={roundLabel} className="bg-[#fff6ed] text-[#8b4d1f]">
                      Used in {roundLabel}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Aging foundations monitor</p>
              <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">
                {selectedDecay ? `${selectedDecay.untouchedDays} days untouched` : "Select a node to track revisit decay"}
              </h3>

              {selectedDecay ? (
                <>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
                    {selectedDecay.isFoundational
                      ? "Foundational beliefs at the base of large dependency structures decay faster because their failure cascades through the rest of the map."
                      : "Non-foundational claims decay more slowly, but still surface for revisit after enough time passes."}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] bg-[var(--panel)] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Revisit threshold</p>
                      <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{selectedDecay.revisitThresholdDays} days</p>
                    </div>
                    <div className="rounded-[18px] bg-[var(--panel)] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Decayed confidence</p>
                      <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                        {selectedDecay.decayedConfidence != null ? formatScore(selectedDecay.decayedConfidence) : "n/a"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                    Confidence multiplier now sits at {Math.round(selectedDecay.decayMultiplier * 100)}%. Untouched beliefs are flagged before they go stale.
                  </p>

                  <div className="mt-4 rounded-[18px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Contradiction cascade tracer</p>
                    <div className="mt-3 space-y-2">
                      {selectedCascade.slice(0, 4).map((step) => (
                        <div key={step.nodeId} className="rounded-[16px] bg-white px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={step.depth === 0 ? "bg-[#e7defa] text-[#5c4c88]" : "bg-[var(--panel)] text-[var(--ink)]"}>
                              depth {step.depth}
                            </Badge>
                            <Badge className="bg-white text-[var(--ink)]">{step.label}</Badge>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{step.content}</p>
                          <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{step.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 rounded-[18px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Session rhythm</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge className={rhythm.shouldStop ? "bg-[#fff6ed] text-[#8b4d1f]" : "bg-[#d9ead8] text-[#355b32]"}>
                        {rhythm.depletionScore}% depletion
                      </Badge>
                      {rhythm.signals.map((signal) => (
                        <Badge key={signal} className="bg-white text-[var(--ink)]">
                          {signal}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{rhythm.note}</p>
                  </div>

                  <div className="mt-4 rounded-[18px] bg-[var(--panel)] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Confusion log</p>
                    <div className="mt-3 space-y-2">
                  {confusionLog.length ? (
                    confusionLog.map((entry) => (
                          <div key={entry.nodeId} className="rounded-[16px] bg-white px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className="bg-[#e7defa] text-[#5c4c88]">severity {entry.severity}</Badge>
                              <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{entry.ageDays} days old</Badge>
                              <Badge className="bg-white text-[var(--ink)]">{entry.title}</Badge>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{entry.confusion}</p>
                            <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{entry.nextStep}</p>
                            <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{entry.revisitPrompt}</p>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-[16px] bg-white px-4 py-3 text-sm leading-6 text-[var(--muted-ink)]">
                          No strong confusion signals are surfacing right now.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                  Select a node in the graph to see how long it has gone untouched and when Penny should revisit it.
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Map view</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">
              {view === "outline" ? "Outline view keeps the active workflow intact." : "Graph view keeps one claim primary while the graph becomes a minimap."}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-ink)]">
              {view === "outline"
                ? "Keep expanding, challenging, or connecting branches here while Penny’s best-next-move and founder-brief guidance stay visible above and below the map."
                : "Select a node to inspect the graph card first. The graph stays available as a structural overview, while outline actions remain available from the card."}
            </p>
          </div>
          <div className="inline-flex rounded-full border border-black/10 bg-white p-1 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
            <Button
              variant={view === "outline" ? "primary" : "ghost"}
              className={cn("px-4", view === "outline" && "shadow-none")}
              onClick={() => changeView("outline")}
            >
              Outline view
            </Button>
            <Button
              variant={view === "graph" ? "primary" : "ghost"}
              className={cn("px-4", view === "graph" && "shadow-none")}
              onClick={() => changeView("graph")}
            >
              Graph view
            </Button>
          </div>
        </div>

        {view === "outline" ? (
          <>
            <div className="mt-6 flex items-center gap-2">
              <CircleDot className="size-4 text-[var(--muted-ink)]" />
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Outline</p>
            </div>
            <div className="mt-6 space-y-4">{renderNode(rootNode)}</div>
          </>
        ) : (
          <>
            <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-[var(--muted-ink)]" />
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Structure minimap</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>Card first</Badge>
                {map.graphSnapshot ? (
                  <>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">Overall score {formatScore(map.graphSnapshot.overallScore)}</Badge>
                    <Badge>Weak nodes {map.graphSnapshot.weakestNodeIds.length}</Badge>
                    <Badge>Critical dependencies {map.graphSnapshot.criticalDependencyIds.length}</Badge>
                  </>
                ) : (
                  <Badge>Derived from parent links</Badge>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.45fr)]">
              <div className="overflow-hidden rounded-[28px] border border-black/10 bg-[linear-gradient(180deg,#fffdf8_0%,#f7f2ea_100%)]">
                <div className="border-b border-black/8 px-5 py-4 text-sm leading-6 text-[var(--muted-ink)]">
                  Structure minimap highlights weak branches and dependency pressure. Use <span className="font-medium text-[var(--ink)]">Outline view</span> to run actions.
                </div>
                <div className="overflow-x-auto">
                  <div
                    className="relative overflow-hidden"
                    style={{
                      width: Math.max(320, Math.round(graphCanvas.width * graphMinimapScale)),
                      height: Math.max(220, Math.round(graphCanvas.height * graphMinimapScale)),
                    }}
                  >
                    <div
                      className="relative origin-top-left"
                      style={{
                        width: graphCanvas.width,
                        height: graphCanvas.height,
                        transform: `scale(${graphMinimapScale})`,
                      }}
                    >
                      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
                      {graphCanvas.edges.map((edge) => {
                        const startX = edge.from.x + GRAPH_NODE_WIDTH / 2 - 8;
                        const endX = edge.to.x - GRAPH_NODE_WIDTH / 2 + 8;
                        const controlOffset = Math.max((endX - startX) / 2, 36);
                        const isRelated = edge.parentId === selectedGraphNodeId || edge.childId === selectedGraphNodeId;
                        const stroke = edge.contradictionScore >= 60
                          ? "#8b4d1f"
                          : edge.strengthScore >= 70
                            ? "#4a5565"
                            : edge.isCritical
                              ? "#5c4c88"
                              : edge.isWeak
                                ? "#c97d39"
                                : "#c6bfb4";
                        const strokeWidth = isRelated
                          ? 2.9
                          : edge.contradictionScore >= 60
                            ? 2.5
                            : edge.strengthScore >= 70
                              ? 2.2
                              : edge.isCritical
                                ? 2
                                : 1.5;
                        const strokeDasharray =
                          edge.contradictionScore >= 60
                            ? "6 5"
                            : edge.recencyDays >= 30
                              ? "4 7"
                              : undefined;
                        const opacity = Math.max(0.45, 1 - Math.min(edge.recencyDays, 90) / 200);

                        return (
                          <path
                            key={edge.id}
                            d={`M ${startX} ${edge.from.y} C ${startX + controlOffset} ${edge.from.y}, ${endX - controlOffset} ${edge.to.y}, ${endX} ${edge.to.y}`}
                            fill="none"
                            stroke={isRelated ? "#4a5565" : stroke}
                            strokeLinecap="round"
                            strokeWidth={strokeWidth}
                            strokeDasharray={strokeDasharray}
                            opacity={isRelated ? 1 : opacity}
                          />
                        );
                      })}
                      </svg>

                      {graphCanvas.nodes.map((graphNode) => {
                        const isSelected = graphNode.node.id === selectedGraphNodeId;

                        return (
                          <button
                            key={graphNode.node.id}
                            type="button"
                            aria-pressed={isSelected}
                        className={cn(
                          "absolute -translate-x-1/2 -translate-y-1/2 rounded-[24px] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2",
                          "w-[188px] shadow-[0_16px_36px_rgba(15,23,42,0.08)]",
                          statusTone(graphNode.node.nodeStatus),
                          graphNode.ageDays >= 30 && "ring-1 ring-[#8b4d1f]/25",
                          isSelected && "border-[var(--ink)] ring-2 ring-[var(--ink)] ring-offset-2",
                          !isSelected && "hover:border-black/25",
                        )}
                        style={{ left: graphNode.x, top: graphNode.y }}
                        onClick={() => setSelectedGraphNodeId(graphNode.node.id)}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={statusBadge(graphNode.node.nodeStatus)}>{graphNode.node.nodeStatus}</Badge>
                            {graphNode.isWeak ? <Badge className="bg-[#f5d6b3] text-[#8b4d1f]">weak focus</Badge> : null}
                            {graphNode.isCritical ? <Badge className="bg-[#e7defa] text-[#5c4c88]">dependency</Badge> : null}
                          </div>
                          <div className="mt-3">
                            <DependencyHealthBar health={graphNode.node.dependencyHealth} label="Health" />
                          </div>
                          <p className="mt-3 text-sm font-medium leading-5 text-[var(--ink)]">{kindLabel(graphNode.node.kind)}</p>
                          <p className="mt-2 max-h-[3.6rem] overflow-hidden text-sm leading-6 text-[var(--muted-ink)]">
                            {graphNode.node.content}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <Badge className="bg-white text-[var(--ink)]">strength {formatScore(graphNode.node.scores?.strength ?? null)}</Badge>
                            <Badge className="bg-white text-[var(--ink)]">age {graphNode.ageDays}d</Badge>
                            <Badge className="bg-white text-[var(--ink)]">density {graphNode.densityScore}%</Badge>
                            <Badge className="bg-white text-[var(--ink)]">saturation {graphNode.saturationScore}%</Badge>
                          </div>
                        </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-black/10 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Knowledge card</p>
                    <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">
                      {selectedGraphNode ? "Selected claim" : "Select a claim"}
                    </h3>
                  </div>
                  {selectedGraphNode ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{kindLabel(selectedGraphNode.node.kind)}</Badge>
                      {selectedGraphNodeVaulted ? (
                        <Badge className="bg-[#1f5d73] text-white">
                          <Lock className="mr-1 size-3.5" />
                          Vault
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {selectedGraphNode ? (
                  <>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge className={statusBadge(selectedGraphNode.node.nodeStatus)}>{selectedGraphNode.node.nodeStatus}</Badge>
                      {selectedGraphNode.isWeak ? <Badge className="bg-[#f5d6b3] text-[#8b4d1f]">weak focus</Badge> : null}
                      {selectedGraphNode.isCritical ? <Badge className="bg-[#e7defa] text-[#5c4c88]">critical dependency</Badge> : null}
                      <Badge>Children {selectedGraphNode.childCount}</Badge>
                    </div>

                    <p className="mt-4 text-sm leading-7 text-[var(--ink)]">
                      {selectedGraphNodeVaulted
                        ? "This claim is in Vault on this device. Open the vault manager to reveal it with the passphrase."
                        : selectedGraphNode.node.content}
                    </p>
                    {selectedGraphNode.node.note ? (
                      <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                        {selectedGraphNodeVaulted
                          ? "This claim is stored locally in Vault. Unlock it in the vault manager to inspect the note."
                          : selectedGraphNode.node.note}
                      </p>
                    ) : null}
                    {selectedGraphNodeParent ? (
                      <p className="mt-4 text-xs leading-5 text-[var(--muted-ink)]">
                        Parent: <span className="font-medium text-[var(--ink)]">{selectedGraphNodeParent.content}</span>
                      </p>
                    ) : null}

                    <div className="mt-6">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Score highlights</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {inspectorScores.map((score) => (
                          <div key={score.label} className="rounded-[20px] bg-[var(--panel)] px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{score.label}</p>
                            <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{formatScore(score.value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Structural health</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[20px] bg-[var(--panel)] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Age</p>
                          <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{selectedGraphNode.ageDays} days</p>
                        </div>
                        <div className="rounded-[20px] bg-[var(--panel)] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Density</p>
                          <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{selectedGraphNode.densityScore}%</p>
                        </div>
                        <div className="rounded-[20px] bg-[var(--panel)] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Saturation</p>
                          <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{selectedGraphNode.saturationScore}%</p>
                        </div>
                        <div className="rounded-[20px] bg-[var(--panel)] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Drift</p>
                          <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                            {selectedDecay?.decayedConfidence != null && selectedGraphNode.node.scores?.confidence != null
                              ? `${Math.round((selectedGraphNode.node.scores.confidence - selectedDecay.decayedConfidence) * 100)}`
                              : "n/a"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6">
                      <DependencyHealthBar
                        health={selectedGraphNode.node.dependencyHealth}
                        interactive
                        onClick={() => setDependencyHealthClaimId(selectedGraphNode.node.id)}
                      />
                      {dependencyHealthClaimId === selectedGraphNode.node.id ? (
                        <div className="mt-4">
                          <DependencyHealthPanel
                            map={map}
                            claimId={selectedGraphNode.node.id}
                            onClose={() => setDependencyHealthClaimId(null)}
                            onRunCritiqueWeakestLink={(claimId) => {
                              setSelectedGraphNodeId(claimId);
                              setView("outline");
                              setDependencyHealthClaimId(null);
                            }}
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-6">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Evidence quality</p>
                        <Button
                          className="h-8 gap-2"
                          variant="secondary"
                          onClick={() =>
                            setEvidenceEntryOpenClaimId((current) =>
                              current === selectedGraphNode.node.id ? null : selectedGraphNode.node.id,
                            )
                          }
                        >
                          <Sparkles className="size-4" />
                          Add evidence
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[20px] bg-[var(--panel)] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Average score</p>
                          <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                            {selectedClaimEvidenceSummary?.averageQualityScore != null
                              ? `${Math.round(selectedClaimEvidenceSummary.averageQualityScore)}/100`
                              : "n/a"}
                          </p>
                        </div>
                        <div className="rounded-[20px] bg-[var(--panel)] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Evidence count</p>
                          <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                            {selectedClaimEvidenceSummary?.evidenceCount ?? 0}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(selectedClaimEvidenceSummary?.evidenceTypeDistribution ?? [])
                          .filter((entry) => entry.count > 0)
                          .map((entry) => (
                            <Badge key={entry.evidenceType} className="bg-[var(--panel)] text-[var(--ink)]">
                              {entry.evidenceType.replaceAll("_", " ")} · {entry.count}
                            </Badge>
                          ))}
                      </div>
                      {selectedClaimEvidenceSummary?.warnings.length ? (
                        <div className="mt-3 space-y-2 rounded-[20px] border border-[#c97d39]/25 bg-[#fff6ed] px-4 py-3 text-sm leading-6 text-[#8b4d1f]">
                          {selectedClaimEvidenceSummary.warnings.map((warning) => (
                            <p key={warning}>{warning}</p>
                          ))}
                        </div>
                      ) : null}
                      {evidenceEntryOpenClaimId === selectedGraphNode.node.id ? (
                        <EvidenceEntry
                          mapId={map.id}
                          claimId={selectedGraphNode.node.id}
                          claimText={selectedGraphNode.node.content}
                          onSaved={({ map: nextMap }) => {
                            setMap(normalizeMap(nextMap));
                            setEvidenceEntryOpenClaimId(null);
                          }}
                          onCancel={() => setEvidenceEntryOpenClaimId(null)}
                        />
                      ) : null}
                    </div>

                    <div className="mt-6">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Available in Outline</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {visibleActions(selectedGraphNode.node).map((action) => (
                          <Badge key={action.key} className="bg-[var(--panel)] text-[var(--ink)]">
                            {action.label}
                          </Badge>
                        ))}
                        <Badge className="bg-[#1f5d73] text-white">
                          <Lock className="mr-1 size-3.5" />
                          {selectedGraphNodeVaulted ? "Vaulted" : "Vault available in Outline"}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                        Keep graph interactions selection-only in this slice. Switch back to <span className="font-medium text-[var(--ink)]">Outline view</span> to run a move.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{claimRepairSuggestions.length} suggestions</Badge>
                      </div>
                      <div className="mt-4 rounded-[20px] bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Revisit trigger</p>
                          <Badge className="bg-[var(--panel)] text-[var(--ink)]">{selectedRevisitTriggerDraft?.triggerType ?? "manual_flag"}</Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                          Attach a date, keyword, dependency, or confidence trigger so Penny can surface this claim again.
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <select
                            className="rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none"
                            value={selectedRevisitTriggerDraft?.triggerType ?? "manual_flag"}
                            onChange={(event) =>
                              selectedGraphNode?.node.id
                                ? updateRevisitTriggerDraft(selectedGraphNode.node.id, {
                                    triggerType: event.target.value as TriggerDefinition["triggerType"],
                                  })
                                : null
                            }
                          >
                            <option value="manual_flag">manual flag</option>
                            <option value="date">date</option>
                            <option value="event_keyword">event keyword</option>
                            <option value="dependency_update">dependency update</option>
                            <option value="confidence_threshold">confidence threshold</option>
                          </select>
                          {selectedRevisitTriggerDraft?.triggerType === "date" ? (
                            <input
                              className="rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none"
                              type="date"
                              value={selectedRevisitTriggerDraft.dateTarget}
                              onChange={(event) =>
                                selectedGraphNode?.node.id
                                  ? updateRevisitTriggerDraft(selectedGraphNode.node.id, { dateTarget: event.target.value })
                                  : null
                              }
                            />
                          ) : selectedRevisitTriggerDraft?.triggerType === "event_keyword" ? (
                            <input
                              className="rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none"
                              placeholder="keyword or phrase"
                              value={selectedRevisitTriggerDraft.eventKeyword}
                              onChange={(event) =>
                                selectedGraphNode?.node.id
                                  ? updateRevisitTriggerDraft(selectedGraphNode.node.id, { eventKeyword: event.target.value })
                                  : null
                              }
                            />
                          ) : selectedRevisitTriggerDraft?.triggerType === "dependency_update" ? (
                            <select
                              className="rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none"
                              value={selectedRevisitTriggerDraft.dependencyClaimId}
                              onChange={(event) =>
                                selectedGraphNode?.node.id
                                  ? updateRevisitTriggerDraft(selectedGraphNode.node.id, { dependencyClaimId: event.target.value })
                                  : null
                              }
                            >
                              <option value="">Select dependency</option>
                              {map.nodes
                                .filter((candidate) => candidate.id !== selectedGraphNode.node.id)
                                .map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.content}
                                  </option>
                                ))}
                            </select>
                          ) : selectedRevisitTriggerDraft?.triggerType === "confidence_threshold" ? (
                            <input
                              className="rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none"
                              type="number"
                              min={0}
                              max={100}
                              placeholder="40"
                              value={selectedRevisitTriggerDraft.confidenceThreshold}
                              onChange={(event) =>
                                selectedGraphNode?.node.id
                                  ? updateRevisitTriggerDraft(selectedGraphNode.node.id, { confidenceThreshold: event.target.value })
                                  : null
                              }
                            />
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            className="gap-2"
                            variant="secondary"
                            disabled={!selectedGraphNode}
                            onClick={() => (selectedGraphNode?.node.id ? submitRevisitTrigger(selectedGraphNode.node.id) : null)}
                          >
                            <Link2 className="size-4" />
                            Attach trigger
                          </Button>
                          <Button
                            className="gap-2"
                            variant="secondary"
                            disabled={!selectedGraphNode}
                            onClick={() => (selectedGraphNode?.node.id ? recordRevisitAction(selectedGraphNode.node.id, "reviewed_no_change") : null)}
                          >
                            <CircleDot className="size-4" />
                            Still accurate
                          </Button>
                          <Button
                            className="gap-2"
                            variant="secondary"
                            disabled={!selectedGraphNode}
                            onClick={() => (selectedGraphNode?.node.id ? recordRevisitAction(selectedGraphNode.node.id, "snoozed") : null)}
                          >
                            <ArrowRightLeft className="size-4" />
                            Snooze 7 days
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 rounded-[20px] bg-[var(--panel)] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Challenge-skill calibration</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge className="bg-white text-[var(--ink)]">{challengeSkill.label}</Badge>
                        <Badge className="bg-[#e7defa] text-[#5c4c88]">{challengeSkill.direction}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">{challengeSkill.note}</p>
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">
                    Select a node in the graph to inspect its content, status, score highlights, and outline actions.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Founder brief</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Turn the map into a decision artifact.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-ink)]">{founderBriefReadinessMessage()}</p>
            {founderBriefError ? <p className="mt-2 text-sm leading-6 text-[#8b4d1f]">{founderBriefError}</p> : null}
          </div>

          <div className="flex flex-col items-end gap-2">
            <Badge className="bg-white text-[var(--ink)]">Stakes {synthesisStakesLevel}</Badge>
            <div className="flex flex-wrap justify-end gap-2">
              <Button className="gap-2" disabled={runningFounderBrief || isPending} onClick={runFounderBrief}>
                <Sparkles className="size-4" />
                Generate founder brief
              </Button>
              <Button className="gap-2" variant="secondary" onClick={vaultMap}>
                <Lock className="size-4" />
                {mapVaultRegistered ? "Open Vault" : "Move to Vault"}
              </Button>
              <Button variant="secondary" className="gap-2" onClick={() => setExportModalOpen(true)}>
                <Download className="size-4" />
                Export
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {map.founderBrief ? <FounderBriefCard brief={map.founderBrief} /> : null}
      <ArtifactBuilder mapId={map.id} />
      <DocumentImport mapId={map.id} />
      <ExportModal
        open={exportModalOpen}
        userId={map.userId}
        mapId={map.id}
        mapTitle={map.title}
        claimId={selectedGraphNode?.node.id ?? null}
        claimLabel={selectedGraphNode?.node.content ?? null}
        onClose={() => setExportModalOpen(false)}
      />
      <VaultModal
        open={vaultModalOpen}
        userId={map.userId}
        draft={vaultDraft}
        onClose={() => {
          setVaultModalOpen(false);
          setVaultDraft(null);
        }}
      onSaved={(_entry, nextMap) => {
        setMap(normalizeMap(nextMap as SerializableThoughtMap));
        setVaultModalOpen(false);
        setVaultDraft(null);
      }}
      />
      <ResolutionFlow
        key={resolutionFlowOpen ? `resolution:${resolutionTargetNode?.id ?? "claim"}` : "resolution:closed"}
        open={resolutionFlowOpen}
        claim={resolutionTargetNode}
        resolutionDate={claimCapture?.resolutionDate ?? null}
        predictedConfidence={claimCapture?.confidence ?? Math.round((resolutionTargetNode?.scores?.confidence ?? 0) * 100)}
        steelManText={selectedSteelMan?.steelManText ?? null}
        activeShapes={lens.activeShapes.map((shape) => shape.label)}
        activeBiases={selectedBiasContext ? [selectedBiasContext] : []}
        downstreamClaims={resolutionDownstreamClaims}
        onClose={() => setResolutionFlowOpen(false)}
        onSubmit={recordClaimResolution}
        isSubmitting={isPending}
      />
      <ClaimRepairModal
        open={repairModalOpen}
        currentClaim={selectedGraphNode?.node ?? null}
        claimOptions={map.nodes.filter((node) => node.kind !== "root")}
        suggestions={claimRepairSuggestions}
        onClose={() => setRepairModalOpen(false)}
        onSubmit={recordClaimRepair}
      />
      {sessionLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
          <div className="max-w-md rounded-[28px] border border-black/10 bg-[var(--paper)] p-6 text-center shadow-[0_30px_80px_rgba(15,23,42,0.22)]">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Session gate</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Loading your thinking session</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
              Penny is checking whether to resume an active session or start a new one.
            </p>
          </div>
        </div>
      ) : null}
      {sessionStartVisible && !sessionLoading ? (
        <SessionStart
          mapId={map.id}
          mapTitle={map.title}
          maps={availableMaps}
          onStarted={(session) => {
            setActiveSession(normalizeSession(session as SerializableThinkingSession));
            setSessionStartVisible(false);
            setSessionTimeWarningDismissed(false);
          }}
          onDismissed={(session) => {
            setActiveSession(normalizeSession(session as SerializableThinkingSession));
            setSessionStartVisible(false);
            setSessionTimeWarningDismissed(false);
          }}
        />
      ) : null}
      {sessionCloseVisible && activeSession && !activeSession.endedAt ? (
        <SessionClose
          session={activeSession}
          summary={sessionSummaryPreview}
          onClosed={(session) => {
            setActiveSession(normalizeSession(session as SerializableThinkingSession));
            setSessionCloseVisible(false);
            setSessionTimeWarningDismissed(false);
          }}
          onSkipped={(session) => {
            setActiveSession(normalizeSession(session as SerializableThinkingSession));
            setSessionCloseVisible(false);
            setSessionTimeWarningDismissed(false);
          }}
        />
      ) : null}
    </div>
  );
}

function TimelinePanel({
  title,
  subtitle,
  count,
  highlight,
  children,
}: {
  title: string;
  subtitle: string;
  count: string;
  highlight: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-black/8 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{title}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{subtitle}</p>
        </div>
        <Badge className="bg-[var(--panel)] text-[var(--ink)]">{count}</Badge>
      </div>
      <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{highlight}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function TimelineRow({
  accent,
  label,
  summary,
  when,
  note,
}: {
  accent: "claim" | "stress" | "revision" | "confidence" | "shape" | "resolution";
  label: string;
  summary: string;
  when: Date;
  note?: string | null;
}) {
  const accentClass =
    accent === "claim"
      ? "bg-[#d9ead8] text-[#355b32]"
      : accent === "stress"
        ? "bg-[#fff6ed] text-[#8b4d1f]"
        : accent === "revision"
          ? "bg-[#e7defa] text-[#5c4c88]"
          : accent === "confidence"
            ? "bg-[#dff0f7] text-[#1f5d73]"
            : accent === "resolution"
              ? "bg-white text-[var(--ink)]"
              : "bg-[var(--panel)] text-[var(--ink)]";

  return (
    <div className="rounded-[18px] border-l-2 border-dashed border-black/10 bg-[var(--panel)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={accentClass}>{label}</Badge>
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{when.toLocaleDateString()}</span>
        {note ? <Badge className="bg-white text-[var(--ink)]">{note}</Badge> : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{summary}</p>
    </div>
  );
}
