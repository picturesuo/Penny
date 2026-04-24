import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import { markLearningPromptEngaged } from "@/server/mvp";
import { logger } from "@/lib/logger";

const engageSchema = z.object({
  claimId: z.string().trim().min(1),
  roundId: z.string().trim().min(1).nullable().optional(),
  promptType: z.string().trim().min(1),
  wasUseful: z.boolean(),
});

export async function POST(request: Request) {
  try {
    const userId = await getCurrentAuthenticatedUserId();
    const input = engageSchema.parse(await request.json());
    const promptId = `${input.claimId}:${input.roundId ?? "draft"}:${input.promptType}`;

    await markLearningPromptEngaged(promptId);
    logger.info("learning_prompt_engaged", {
      userId,
      featureId: "learning-prompts",
      data: {
        claimId: input.claimId,
        roundId: input.roundId ?? null,
        promptType: input.promptType,
        wasUseful: input.wasUseful,
      },
    });

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_request", details: error.flatten() },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
