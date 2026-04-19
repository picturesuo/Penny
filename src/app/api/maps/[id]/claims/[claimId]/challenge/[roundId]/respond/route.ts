import { NextResponse } from "next/server";
import { getAuthenticatedUserFromCookies } from "@/server/auth";
import { logger } from "@/lib/logger";
import { track } from "@/lib/analytics";
import {
  ChallengeResponseSchema,
  MapClaimParamsSchema,
  RoundIdSchema,
  validateBody,
  ValidationError,
} from "@/lib/validation/schemas";
import {
  getChallengeDraftRound,
  inferChallengeResponsePath,
  markChallengeDraftCompleted,
} from "@/server/dialectic-challenges";
import { generateChallengeSummaryArtifact } from "@/server/challenge-summary";
import { recordDialecticRound } from "@/server/thought-map";
import { updateConfidence } from "@/server/mvp";
import type { ArtifactRecord, ResponseClassification } from "@/types/thought-map";

type CompletedChallengeRound = {
  engagementScore?: number | null;
  responseClassification?: ResponseClassification | null;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; claimId: string; roundId: string }> },
) {
  try {
    const user = await getAuthenticatedUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await context.params;
    const { id, claimId } = MapClaimParamsSchema.parse(params);
    const roundId = RoundIdSchema.parse(params.roundId);
    const input = await validateBody(ChallengeResponseSchema)(await request.json());
    const draft = await getChallengeDraftRound(roundId, user.id);

    if (!draft || draft.mapId !== id || draft.claimId !== claimId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (draft.status === "completed") {
      return NextResponse.json({ error: "challenge_already_completed" }, { status: 409 });
    }

    const confidenceDelta = Number((input.newConfidence - draft.confidenceAtRoundStart).toFixed(2));
    const responsePath = inferChallengeResponsePath(input.userResponse, confidenceDelta, input.responsePath ?? null);

    const finalEvent = await recordDialecticRound({
      mapId: id,
      nodeId: claimId,
      round: draft.title,
      roundIndex: draft.roundIndex,
      title: draft.title,
      critiqueStrength: draft.critiqueStrength,
      critiqueType: draft.critiqueType,
      critiqueFailureTypes: [draft.critiqueType],
      critiqueMode: draft.critiqueMode,
      voiceLabel: draft.voiceLabel,
      prompt: draft.prompt,
      why: draft.why,
      responsePath,
      response: input.userResponse,
      confidenceAtRoundEnd: input.newConfidence,
    });

    const completedRound = (finalEvent.payload?.dialecticRound ?? null) as CompletedChallengeRound | null;

    if (confidenceDelta !== 0) {
      await updateConfidence(claimId, user.id, input.newConfidence, input.confidenceChangeReason ?? null);
    }

    await markChallengeDraftCompleted({
      roundId,
      completedRoundId: finalEvent.id,
      responsePath,
      userResponse: input.userResponse,
      confidenceAtRoundEnd: input.newConfidence,
      confidenceDelta,
      engagementScore: completedRound && typeof completedRound.engagementScore === "number" ? completedRound.engagementScore : 0,
      responseClassification:
        completedRound && completedRound.responseClassification && typeof completedRound.responseClassification === "object"
          ? completedRound.responseClassification
          : {
              type: "defense",
              confidence: 0,
              classifiedBy: "inferred",
            },
    });

    let summaryArtifact: ArtifactRecord | null = null;
    try {
      summaryArtifact = (await generateChallengeSummaryArtifact({
        mapId: id,
        claimId,
        userId: user.id,
      })).artifact;
    } catch (summaryError) {
      logger.warn("Failed to generate challenge summary artifact", {
        userId: user.id,
        featureId: "challenge-rounds",
        data: {
          mapId: id,
          claimId,
          challengeId: roundId,
          error: summaryError instanceof Error ? summaryError.message : String(summaryError),
        },
      });
    }

    await track(
      {
        event: "challenge_completed",
        properties: {
          claimId,
          roundNumber: draft.roundNumber,
          engagementScore: completedRound && typeof completedRound.engagementScore === "number" ? completedRound.engagementScore : 0,
        },
      },
      user.id,
    );

    logger.info("Challenge round completed", {
      userId: user.id,
      featureId: "challenge-rounds",
      data: {
        mapId: id,
        claimId,
        challengeId: roundId,
        completedRoundId: finalEvent.id,
        roundNumber: draft.roundNumber,
        engagementScore: completedRound && typeof completedRound.engagementScore === "number" ? completedRound.engagementScore : 0,
        confidenceDelta,
      },
    });

    return NextResponse.json(
      {
        challengeId: roundId,
        completedRoundId: finalEvent.id,
        round: completedRound ?? finalEvent.payload?.dialecticRound ?? null,
        summaryArtifact,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Error && /not found/i.test(error.message)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    logger.error("Failed to submit challenge response", {
      error: error instanceof Error ? error.message : String(error),
      featureId: "challenge-rounds",
    });

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
