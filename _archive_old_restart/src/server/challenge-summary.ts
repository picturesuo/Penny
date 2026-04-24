import { randomUUID } from "node:crypto";
import { prisma } from "@/db/prisma";
import { track } from "@/lib/analytics";
import { generateChallengeSummary } from "@/lib/artifact-generator";
import { logger } from "@/lib/logger";
import { getClaim, getDialecticRoundsForClaim, getMap } from "@/server/mvp";
import type {
  ArtifactRecord,
  ClaimOutcomePair,
  DialecticRound,
  SteelMan,
  ThoughtMapModel,
  ThoughtNodeModel,
} from "@/types/thought-map";
import { getCurrentAuthenticatedUserId } from "@/server/auth";

function confidenceToPercent(score: number | null | undefined): number {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return 0;
  }

  return score <= 1 ? Math.round(score * 100) : Math.round(score);
}

function toChallengeSummaryClaim(claim: ThoughtNodeModel) {
  return {
    id: claim.id,
    text: claim.content,
    confidence: confidenceToPercent(claim.scores?.confidence),
  };
}

function toChallengeSummaryRound(round: DialecticRound) {
  return {
    roundNumber: round.roundNumber,
    critiqueGenerated: round.critiqueGenerated,
    critiqueFailureTypes: round.critiqueFailureTypes,
    userResponse: round.userResponse ?? "",
    responseClassification: round.responseClassification,
    confidenceAtRoundStart: round.confidenceAtRoundStart,
    confidenceAtRoundEnd: round.confidenceAtRoundEnd,
    confidenceDelta: round.confidenceDelta,
    followUpPrompt: round.followUpPrompt,
  };
}

function findSteelMan(map: ThoughtMapModel, claimId: string): SteelMan | null {
  return map.steelMans.find((entry) => entry.claimId === claimId) ?? null;
}

function buildClaimOutcomePair(claim: ThoughtNodeModel): ClaimOutcomePair {
  return {
    claimId: claim.id,
    claimText: claim.content,
    wasClaimCorrect: null,
    confidenceAtArtifactTime: confidenceToPercent(claim.scores?.confidence),
    actualOutcome: null,
  };
}

export async function generateChallengeSummaryArtifact(params: {
  mapId: string;
  claimId: string;
  userId?: string;
}) {
  const startedAt = Date.now();
  const activeUserId = params.userId ?? (await getCurrentAuthenticatedUserId());
  const [map, claim, rounds] = await Promise.all([
    getMap(params.mapId, activeUserId),
    getClaim(params.claimId, activeUserId),
    getDialecticRoundsForClaim(params.claimId),
  ]);

  if (!map || !claim || claim.mapId !== params.mapId) {
    throw new Error("Claim not found");
  }

  const steelMan = findSteelMan(map, params.claimId);
  const challengeSummary = generateChallengeSummary({
    claim: toChallengeSummaryClaim(claim),
    rounds: rounds.map(toChallengeSummaryRound),
    steelMan: steelMan ? { steelManText: steelMan.steelManText } : null,
    mapTitle: map.title,
  });

  const artifactId = `${map.id}:challenge_summary:${randomUUID()}`;
  const version = map.artifacts.filter((artifact) => artifact.artifactTypeId === "challenge_summary").length + 1;
  const artifact: ArtifactRecord = {
    id: artifactId,
    artifactTypeId: "challenge_summary",
    artifactTypeName: "Challenge summary",
    title: `Challenge summary: ${map.title}`,
    audience: "self",
    sourceMapId: map.id,
    generatedAt: new Date(),
    version,
    sectionOrder: challengeSummary.sections.map((section) => section.id),
    narrativeGlue: null,
    sections: challengeSummary.sections,
    loadBearingClaims: [buildClaimOutcomePair(claim)],
    dependencyHealth: null,
    outcomes: [],
    latestOutcome: null,
  };

  await prisma.$transaction(async (tx) => {
    await tx.thoughtMapEvent.create({
      data: {
        mapId: params.mapId,
        nodeId: params.claimId,
        eventType: "artifact_generated",
        payload: JSON.stringify(artifact),
      },
    });
  });

  const updatedMap = await getMap(params.mapId, activeUserId);
  if (!updatedMap) {
    throw new Error("Map not found after challenge summary generation");
  }

  void track(
    {
      event: "artifact_generated",
      properties: {
        artifactType: "challenge_summary",
        mapId: params.mapId,
      },
    },
    activeUserId,
  );

  logger.info("challenge_summary_generated", {
    userId: activeUserId,
    featureId: "challenge-rounds",
    durationMs: Date.now() - startedAt,
    data: {
      mapId: params.mapId,
      claimId: params.claimId,
      artifactId,
      version,
      roundCount: rounds.length,
    },
  });

  return {
    artifact,
    map: updatedMap,
  };
}
