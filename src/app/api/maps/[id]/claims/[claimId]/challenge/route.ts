import { NextResponse } from "next/server";
import { getAuthenticatedUserFromCookies } from "@/server/auth";
import { checkRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { track } from "@/lib/analytics";
import { createChallengeDraftRound } from "@/server/dialectic-challenges";
import {
  ChallengeStartSchema,
  MapClaimParamsSchema,
  validateBody,
  ValidationError,
} from "@/lib/validation/schemas";

export async function POST(request: Request, context: { params: Promise<{ id: string; claimId: string }> }) {
  try {
    const user = await getAuthenticatedUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(user.id, "ai_critique");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit reached. You can run 20 challenge rounds per hour. Resets at ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`,
        },
        { status: 429 },
      );
    }

    const { id, claimId } = MapClaimParamsSchema.parse(await context.params);
    const input = await validateBody(ChallengeStartSchema)(await request.json());

    const round = await createChallengeDraftRound({
      userId: user.id,
      mapId: id,
      claimId,
      critiqueMode: input.critiqueMode,
      critiqueIntensity: input.critiqueIntensity,
      selectedVoice: input.selectedVoice ?? null,
    });

    await track(
      {
        event: "challenge_started",
        properties: {
          claimId,
          roundNumber: round.roundNumber,
        },
      },
      user.id,
    );

    logger.info("Challenge draft started", {
      userId: user.id,
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
