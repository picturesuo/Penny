import "server-only";

import { randomUUID } from "node:crypto";
import type { DialecticCritiqueStrength, DialecticResponsePath, ResponseClassification } from "@/types/thought-map";
import { prisma } from "@/db/prisma";
import { logger } from "@/lib/logger";
import { generateChallengeWithFallback, peekPrimaryChallengeProviderMeta } from "@/lib/ai/challenge-provider";
import { buildCalibrationDashboard, buildClaimStructureSnapshot, buildPennyLens } from "@/lib/penny-insights";
import { buildPersonalizedCritiqueContext } from "@/lib/personalized-critique-engine";
import { logChallengeFlow, type ChallengeFlowLogFields, withChallengeFlowLogFields } from "@/lib/challenge-flow-logger";
import { getClaim, getDialecticRoundsForClaim, getMap, recordMove } from "@/server/mvp";
import { classifyCalibrationDomain } from "@/lib/calibration";

export type ChallengeDraftRecord = {
  id: string;
  mapId: string;
  claimId: string;
  roundIndex: number;
  roundNumber: number;
  title: string;
  critiqueStrength: DialecticCritiqueStrength;
  critiqueType: string;
  critiqueMode: "direct" | "socratic" | "red_team";
  voiceLabel: string | null;
  critiqueIntensity: number;
  prompt: string;
  why: string;
  generationStatus: "generated" | "fallback";
  generationProvider: "mock" | "openai" | "anthropic";
  generationProviderLabel: string;
  generationFallbackReason: string | null;
  selectedVoice: string | null;
  steelManText: string | null;
  confidenceAtRoundStart: number;
  targetDomain: string;
  targetClaimType: string | null;
  knowledgeDepth: string;
  disclosure: string;
  summary: string;
  status: "started" | "completed";
  completedRoundId: string | null;
  completedAt: string | null;
  responsePath: DialecticResponsePath | null;
  userResponse: string | null;
  confidenceAtRoundEnd: number | null;
  confidenceDelta: number | null;
  engagementScore: number | null;
  responseClassification: ResponseClassification | null;
  createdAt: string;
};

type ChallengeDraftPayload = Omit<ChallengeDraftRecord, "id">;

function parsePayload(payload: string | null | undefined): Record<string, unknown> | null {
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function confidenceToPercent(score: number | null | undefined): number {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return 0;
  }

  return score <= 1 ? Math.round(score * 100) : Math.round(score);
}

function deriveCritiqueStrength(intensity: number): DialecticCritiqueStrength {
  if (intensity <= 1) return "mild";
  if (intensity === 2) return "moderate";
  if (intensity === 3) return "strong";
  return "adversarial";
}

function deriveCritiqueType(structureKind: string | null, claimText: string): string {
  if (structureKind === "conditional") return "dependency risk";
  if (structureKind === "temporal") return "premise rejection";
  if (structureKind === "compound") return "missing counterargument";
  if (/\bif\b|\bwhen\b|\bdepends on\b/i.test(claimText)) return "dependency risk";
  if (/\bmust\b|\bwill\b|\bshould\b/i.test(claimText)) return "weak evidence";
  return "weak evidence";
}

function summarizePriorRound(round: Awaited<ReturnType<typeof getDialecticRoundsForClaim>>[number]) {
  const classification = round.responseClassification?.type ?? "response";
  const confidenceDelta = round.confidenceDelta ?? null;
  const confidenceLabel = confidenceDelta == null ? "" : ` (${confidenceDelta >= 0 ? "+" : ""}${confidenceDelta}%)`;
  const trailText = round.userResponse?.trim().length ? round.userResponse : round.critiqueGenerated;
  const snippet = trailText.trim().length > 96 ? `${trailText.trim().slice(0, 95).trimEnd()}…` : trailText.trim();

  return `Round ${round.roundNumber}: ${classification}${confidenceLabel} — ${snippet}`;
}

function parseChallengeDraftEvent(event: { id: string; mapId: string; nodeId: string | null; payload: unknown; createdAt: Date }): ChallengeDraftRecord | null {
  const payload = parsePayload(typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload ?? null));

  if (!payload) {
    return null;
  }

  return {
    id: event.id,
    mapId: event.mapId,
    claimId: typeof payload.claimId === "string" ? payload.claimId : event.nodeId ?? "",
    roundIndex: typeof payload.roundIndex === "number" ? payload.roundIndex : 0,
    roundNumber: typeof payload.roundNumber === "number" ? payload.roundNumber : 1,
    title: typeof payload.title === "string" ? payload.title : "Opening critique",
    critiqueStrength:
      payload.critiqueStrength === "mild" ||
      payload.critiqueStrength === "moderate" ||
      payload.critiqueStrength === "strong" ||
      payload.critiqueStrength === "adversarial"
        ? payload.critiqueStrength
        : "moderate",
    critiqueType: typeof payload.critiqueType === "string" ? payload.critiqueType : "weak evidence",
    critiqueMode:
      payload.critiqueMode === "direct" || payload.critiqueMode === "socratic" || payload.critiqueMode === "red_team"
        ? payload.critiqueMode
        : "direct",
    voiceLabel: typeof payload.voiceLabel === "string" ? payload.voiceLabel : null,
    critiqueIntensity: typeof payload.critiqueIntensity === "number" ? payload.critiqueIntensity : 3,
    prompt: typeof payload.prompt === "string" ? payload.prompt : "",
    why: typeof payload.why === "string" ? payload.why : "",
    generationStatus: payload.generationStatus === "fallback" ? "fallback" : "generated",
    generationProvider:
      payload.generationProvider === "anthropic" || payload.generationProvider === "openai" || payload.generationProvider === "mock"
        ? payload.generationProvider
        : "mock",
    generationProviderLabel: typeof payload.generationProviderLabel === "string" ? payload.generationProviderLabel : "Mock AI",
    generationFallbackReason: typeof payload.generationFallbackReason === "string" ? payload.generationFallbackReason : null,
    selectedVoice: typeof payload.selectedVoice === "string" ? payload.selectedVoice : null,
    steelManText: typeof payload.steelManText === "string" ? payload.steelManText : null,
    confidenceAtRoundStart: typeof payload.confidenceAtRoundStart === "number" ? payload.confidenceAtRoundStart : 0,
    targetDomain: typeof payload.targetDomain === "string" ? payload.targetDomain : "general",
    targetClaimType: typeof payload.targetClaimType === "string" ? payload.targetClaimType : null,
    knowledgeDepth: typeof payload.knowledgeDepth === "string" ? payload.knowledgeDepth : "surface",
    disclosure: typeof payload.disclosure === "string" ? payload.disclosure : "",
    summary: typeof payload.summary === "string" ? payload.summary : "",
    status: payload.status === "started" || payload.status === "completed" ? payload.status : "started",
    completedRoundId: typeof payload.completedRoundId === "string" ? payload.completedRoundId : null,
    completedAt: typeof payload.completedAt === "string" ? payload.completedAt : null,
    responsePath:
      payload.responsePath === "defend" || payload.responsePath === "revise" || payload.responsePath === "absorb"
        ? payload.responsePath
        : null,
    userResponse: typeof payload.userResponse === "string" ? payload.userResponse : null,
    confidenceAtRoundEnd: typeof payload.confidenceAtRoundEnd === "number" ? payload.confidenceAtRoundEnd : null,
    confidenceDelta: typeof payload.confidenceDelta === "number" ? payload.confidenceDelta : null,
    engagementScore: typeof payload.engagementScore === "number" ? payload.engagementScore : null,
    responseClassification:
      payload.responseClassification && typeof payload.responseClassification === "object"
        ? (payload.responseClassification as ResponseClassification)
        : null,
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : event.createdAt.toISOString(),
  };
}

async function findReusableChallengeDraft(params: {
  mapId: string;
  claimId: string;
  roundIndex: number;
  critiqueMode: ChallengeDraftPayload["critiqueMode"];
  critiqueIntensity: number;
  selectedVoice: string | null;
}) {
  const events = await prisma.thoughtMapEvent.findMany({
    where: {
      mapId: params.mapId,
      nodeId: params.claimId,
      eventType: "challenge_calibration",
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 12,
  });

  for (const event of events) {
    const draft = parseChallengeDraftEvent(event);

    if (!draft || draft.status !== "started") {
      continue;
    }

    if (draft.roundIndex !== params.roundIndex) {
      continue;
    }

    if (draft.critiqueMode !== params.critiqueMode || draft.critiqueIntensity !== params.critiqueIntensity) {
      continue;
    }

    if ((draft.selectedVoice ?? null) !== params.selectedVoice) {
      continue;
    }

    return draft;
  }

  return null;
}

export function inferChallengeResponsePath(
  response: string,
  confidenceDelta: number,
  override?: DialecticResponsePath | null,
): DialecticResponsePath {
  if (override) {
    return override;
  }

  const text = response.toLowerCase();
  const concessionSignals = /(i concede|fair point|you're right|you are right|i was wrong|i hadn't considered|that's fair|i agree|good point)/.test(text);
  const dismissalSignals = /(irrelevant|doesn't matter|does not matter|i don't buy it|that's a strawman|this doesn't apply|not the point)/.test(text);
  const defenseSignals = /(however|but|still think|i disagree|the reason is|what i'm saying|because)/.test(text);

  if (dismissalSignals && !concessionSignals) {
    return "defend";
  }

  if (concessionSignals && confidenceDelta <= 0) {
    return "absorb";
  }

  if (defenseSignals || confidenceDelta >= 5) {
    return "defend";
  }

  if (confidenceDelta < 0) {
    return "revise";
  }

  return "defend";
}

export async function createChallengeDraftRound(params: {
  userId: string;
  mapId: string;
  claimId: string;
  critiqueMode: "direct" | "socratic" | "red_team";
  critiqueIntensity: number;
  selectedVoice: string | null;
  forceRegenerate?: boolean;
  logFields?: ChallengeFlowLogFields;
}) {
  const selectedVoice = params.selectedVoice?.trim().length ? params.selectedVoice.trim() : null;
  const [map, claim, priorRounds] = await Promise.all([
    getMap(params.mapId, params.userId),
    getClaim(params.claimId, params.userId),
    getDialecticRoundsForClaim(params.claimId),
  ]);

  if (!map || !claim || claim.mapId !== params.mapId) {
    throw new Error("Claim not found");
  }

  const steelMan = map.steelMans.find((item) => item.claimId === params.claimId) ?? null;

  if (!steelMan && priorRounds.length === 0) {
    throw new Error("Please write a steel man before starting the first challenge round.");
  }

  const structure = buildClaimStructureSnapshot(map, claim);
  const calibrationDomain = classifyCalibrationDomain(claim.content);
  const confidenceAtRoundStart = confidenceToPercent(claim.scores?.confidence);
  const critiqueStrength = deriveCritiqueStrength(params.critiqueIntensity);
  const critiqueType = deriveCritiqueType(structure.structureKind, claim.content);
  const personalization = buildPersonalizedCritiqueContext({
    map,
    targetNode: claim,
    biasProfile: null,
    calibration: buildCalibrationDashboard([map]),
    lens: buildPennyLens(map),
  });

  const roundNumber = priorRounds.length + 1;
  const roundIndex = priorRounds.length;
  const resolvedVoice = selectedVoice ?? personalization?.voiceSelected ?? null;

  if (!params.forceRegenerate) {
    const existingDraft = await findReusableChallengeDraft({
      mapId: params.mapId,
      claimId: params.claimId,
      roundIndex,
      critiqueMode: params.critiqueMode,
      critiqueIntensity: params.critiqueIntensity,
      selectedVoice: resolvedVoice,
    });

    if (existingDraft) {
      return existingDraft;
    }
  }

  const aiRunId = randomUUID();
  const selectedProvider = peekPrimaryChallengeProviderMeta();
  const aiRunLogFields = params.logFields
    ? withChallengeFlowLogFields(params.logFields, {
        status: "created",
        provider: selectedProvider.provider,
        model: selectedProvider.model,
      })
    : null;

  if (aiRunLogFields) {
    logChallengeFlow("info", "challenge_ai_run_created", aiRunLogFields, {
      ai_run_id: aiRunId,
      round_number: roundNumber,
      critique_mode: params.critiqueMode,
      critique_intensity: params.critiqueIntensity,
    });
  }

  const generatedChallenge = await generateChallengeWithFallback({
    claimText: claim.content,
    steelManText: steelMan?.steelManText ?? null,
    critiqueMode: params.critiqueMode,
    critiqueType,
    critiqueStrength,
    critiqueIntensity: params.critiqueIntensity,
    roundNumber,
    selectedVoice: resolvedVoice,
    targetDomain: personalization?.targetDomain ?? calibrationDomain,
    targetClaimType: personalization?.targetClaimType ?? structure.structureKind,
    knowledgeDepth: personalization?.knowledgeDepth ?? "surface",
    knowledgeDepthMessage: personalization?.knowledgeDepthMessage ?? "Penny is still learning how you think here.",
    disclosure: personalization?.disclosure ?? "Penny is using the current claim context to focus the critique.",
    summary: personalization?.summary ?? "This critique is derived from the current map context.",
    confidenceAtRoundStart,
    priorRoundSummaries: priorRounds.slice(-2).map(summarizePriorRound),
  });

  if (params.logFields) {
    logChallengeFlow(
      generatedChallenge.status === "fallback" ? "warn" : "info",
      "challenge_provider_selected",
      withChallengeFlowLogFields(params.logFields, {
        status: "selected",
        provider: generatedChallenge.provider,
        model: generatedChallenge.model,
      }),
      {
        ai_run_id: aiRunId,
        fallback_reason: generatedChallenge.fallbackReason,
        generation_status: generatedChallenge.status,
      },
    );
  }

  if (generatedChallenge.status === "fallback") {
    logger.warn("challenge_generation_fallback", {
      featureId: "challenge-rounds",
      data: {
        mapId: params.mapId,
        claimId: params.claimId,
        roundNumber,
        reason: generatedChallenge.fallbackReason,
      },
    });
  }

  const challengePayload: ChallengeDraftPayload = {
    mapId: params.mapId,
    claimId: params.claimId,
    roundIndex,
    roundNumber,
    title: generatedChallenge.output.title,
    critiqueStrength: generatedChallenge.output.critiqueStrength,
    critiqueType: generatedChallenge.output.critiqueType,
    critiqueMode: params.critiqueMode,
    voiceLabel: generatedChallenge.output.voiceLabel,
    critiqueIntensity: params.critiqueIntensity,
    prompt: generatedChallenge.output.prompt,
    why: generatedChallenge.output.why,
    generationStatus: generatedChallenge.status,
    generationProvider: generatedChallenge.provider,
    generationProviderLabel: generatedChallenge.providerLabel,
    generationFallbackReason: generatedChallenge.fallbackReason,
    selectedVoice: resolvedVoice,
    steelManText: steelMan?.steelManText ?? null,
    confidenceAtRoundStart,
    targetDomain: personalization?.targetDomain ?? calibrationDomain,
    targetClaimType: personalization?.targetClaimType ?? structure.structureKind,
    knowledgeDepth: personalization?.knowledgeDepth ?? "surface",
    disclosure: personalization?.disclosure ?? "",
    summary: personalization?.summary ?? "",
    status: "started",
    completedRoundId: null,
    completedAt: null,
    responsePath: null,
    userResponse: null,
    confidenceAtRoundEnd: null,
    confidenceDelta: null,
    engagementScore: null,
    responseClassification: null,
    createdAt: new Date().toISOString(),
  };

  const event = await recordMove({
    mapId: params.mapId,
    nodeId: params.claimId,
    eventType: "challenge_calibration",
    payload: {
      ...challengePayload,
      challengeId: null,
    },
  });

  if (params.logFields) {
    logChallengeFlow(
      "info",
      "challenge_event_written",
      withChallengeFlowLogFields(params.logFields, {
        round_id: event.id,
        provider: generatedChallenge.provider,
        model: generatedChallenge.model,
        status: "written",
      }),
      {
        event_id: event.id,
        generation_status: generatedChallenge.status,
      },
    );
  }

  return {
    id: event.id,
    ...challengePayload,
  } satisfies ChallengeDraftRecord;
}

export async function getChallengeDraftRound(roundId: string, userId: string): Promise<ChallengeDraftRecord | null> {
  const event = await prisma.thoughtMapEvent.findUnique({
    where: { id: roundId },
  });

  if (!event || event.eventType !== "challenge_calibration") {
    return null;
  }

  const map = await getMap(event.mapId, userId);
  if (!map) {
    return null;
  }

  return parseChallengeDraftEvent(event);
}

export async function markChallengeDraftCompleted(params: {
  roundId: string;
  completedRoundId: string;
  responsePath: DialecticResponsePath;
  userResponse: string;
  confidenceAtRoundEnd: number;
  confidenceDelta: number;
  engagementScore: number;
  responseClassification: ResponseClassification;
  logFields?: ChallengeFlowLogFields;
}) {
  const event = await prisma.thoughtMapEvent.findUnique({
    where: { id: params.roundId },
  });

  if (!event || event.eventType !== "challenge_calibration") {
    throw new Error("Challenge draft not found");
  }

  const payload = parsePayload(event.payload);
  if (!payload) {
    throw new Error("Challenge draft payload missing");
  }

  await prisma.thoughtMapEvent.update({
    where: { id: params.roundId },
    data: {
      payload: JSON.stringify({
        ...payload,
        status: "completed",
        completedRoundId: params.completedRoundId,
        completedAt: new Date().toISOString(),
        responsePath: params.responsePath,
        userResponse: params.userResponse,
        confidenceAtRoundEnd: params.confidenceAtRoundEnd,
        confidenceDelta: params.confidenceDelta,
        engagementScore: params.engagementScore,
        responseClassification: params.responseClassification,
      }),
    },
  });

  logger.info("challenge_round_completed", {
    featureId: "challenge-rounds",
    data: {
      roundId: params.roundId,
      completedRoundId: params.completedRoundId,
      engagementScore: params.engagementScore,
    },
  });

  if (params.logFields) {
    logChallengeFlow(
      "info",
      "challenge_round_projection_event_written",
      withChallengeFlowLogFields(params.logFields, {
        status: "written",
        round_id: params.roundId,
      }),
      {
        completed_round_id: params.completedRoundId,
        engagement_score: params.engagementScore,
      },
    );
  }
}
