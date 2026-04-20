import { NextResponse } from "next/server";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import { checkRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { track } from "@/lib/analytics";
import { createChallengeDraftRound } from "@/server/dialectic-challenges";
import {
  getChallengeDraftRound,
  inferChallengeResponsePath,
  markChallengeDraftCompleted,
} from "@/server/dialectic-challenges";
import { generateChallengeSummaryArtifact } from "@/server/challenge-summary";
import { recordDialecticRound } from "@/server/thought-map";
import { updateConfidence } from "@/server/mvp";
import {
  ChallengeResponseSchema,
  ChallengeStartSchema,
  MapClaimParamsSchema,
  RoundIdSchema,
  validateBody,
  ValidationError,
} from "@/lib/validation/schemas";
import type { ArtifactRecord, ResponseClassification } from "@/types/thought-map";

type CompletedChallengeRound = {
  engagementScore?: number | null;
  responseClassification?: ResponseClassification | null;
};

export async function POST(request: Request, context: { params: Promise<{ id: string; claimId: string }> }) {
  try {
    const userId = await getCurrentAuthenticatedUserId();

    const { id, claimId } = MapClaimParamsSchema.parse(await context.params);
    const json = await request.json();

    if (
      json &&
      typeof json === "object" &&
      "roundId" in json &&
      typeof (json as { roundId?: unknown }).roundId === "string"
    ) {
      const roundId = RoundIdSchema.parse((json as { roundId: string }).roundId);
      const parsedResponse = ChallengeResponseSchema.safeParse(json);

      if (!parsedResponse.success) {
        return NextResponse.json(
          { error: parsedResponse.error.issues[0]?.message ?? "Invalid challenge response" },
          { status: 400 },
        );
      }

      const input = parsedResponse.data;
      const draft = await getChallengeDraftRound(roundId, userId);

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
        await updateConfidence(claimId, userId, input.newConfidence, input.confidenceChangeReason ?? null);
      }
      const updatedClaimConfidence = confidenceDelta !== 0 ? input.newConfidence : null;

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
          userId,
        })).artifact;
      } catch (summaryError) {
        logger.warn("Failed to generate challenge summary artifact", {
          userId,
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
        userId,
      );

      logger.info("Challenge round completed", {
        userId,
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
          event: finalEvent,
          round: completedRound ?? finalEvent.payload?.dialecticRound ?? null,
          updatedClaimConfidence,
          summaryArtifact,
        },
        { status: 201 },
      );
    }

    const rateLimit = checkRateLimit(userId, "ai_critique");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit reached. You can run 20 challenge rounds per hour. Resets at ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`,
        },
        { status: 429 },
      );
    }

    const input = await validateBody(ChallengeStartSchema)(json);

    const round = await createChallengeDraftRound({
      userId,
      mapId: id,
      claimId,
      critiqueMode: input.critiqueMode,
      critiqueIntensity: input.critiqueIntensity,
      selectedVoice: input.selectedVoice ?? null,
      forceRegenerate: input.forceRegenerate,
    });

    await track(
      {
        event: "challenge_started",
        properties: {
          claimId,
          roundNumber: round.roundNumber,
        },
      },
      userId,
    );

    logger.info("Challenge draft started", {
      userId,
      featureId: "challenge-rounds",
      data: {
        mapId: id,
        claimId,
        roundNumber: round.roundNumber,
        roundId: round.id,
      },
    });

    return NextResponse.json(
      {
        challengeId: round.id,
        round,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Error && /steel man/i.test(error.message)) {
      return NextResponse.json({ error: error.message, code: "STEEL_MAN_REQUIRED" }, { status: 422 });
    }

    if (error instanceof Error && /not found/i.test(error.message)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    logger.error("Failed to start challenge draft", {
      error: error instanceof Error ? error.message : String(error),
      featureId: "challenge-rounds",
    });

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
