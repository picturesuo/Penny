import { NextResponse } from "next/server";
import { z } from "zod";
import { recordCritiqueFeedback } from "@/server/thought-map";

const ratingSchema = z.object({
  dimension: z.enum(["relevance", "novelty", "strength", "specificity", "actionability", "timing"]),
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).nullable().optional(),
});

const critiqueFeedbackSchema = z.object({
  roundId: z.string().min(1),
  critiqueId: z.string().min(1),
  userId: z.string().min(1),
  ratings: z.array(ratingSchema),
  overallUsefulness: z.number().int().min(1).max(5),
  freeTextFeedback: z.string().trim().max(1000).nullable().optional(),
  correctionText: z.string().trim().max(1000).nullable().optional(),
  correctionType: z.enum(["factual_error", "wrong_target", "wrong_tone", "missing_context", "already_addressed", "other"]).optional(),
  isCorrectionFlagged: z.boolean().optional(),
  dismissed: z.boolean().optional(),
  shapeId: z.string().min(1).nullable().optional(),
  critiqueMode: z.enum(["direct", "socratic", "red_team"]).nullable().optional(),
  voiceLabel: z.string().trim().max(200).nullable().optional(),
  failureTypes: z.array(z.string().min(1)).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const json = await request.json();
    const input = critiqueFeedbackSchema.parse(json);
    const result = await recordCritiqueFeedback({
      mapId: id,
      roundId: input.roundId,
      critiqueId: input.critiqueId,
      userId: input.userId,
      ratings: input.ratings.map((rating) => ({
        ...rating,
        comment: rating.comment ?? null,
      })),
      overallUsefulness: input.overallUsefulness,
      freeTextFeedback: input.freeTextFeedback ?? null,
      correctionText: input.correctionText ?? null,
      correctionType: input.correctionType ?? "other",
      isCorrectionFlagged: input.isCorrectionFlagged ?? false,
      dismissed: input.dismissed ?? false,
      shapeId: input.shapeId ?? null,
      critiqueMode: input.critiqueMode ?? null,
      voiceLabel: input.voiceLabel ?? null,
      failureTypes: input.failureTypes ?? [],
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "invalid_request",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    if (error instanceof Error && /not found/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "not_found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        error: "internal_error",
      },
      { status: 500 },
    );
  }
}
