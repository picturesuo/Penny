import { NextResponse } from "next/server";
import { ArtifactParamsSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import { recordArtifactOutcome } from "@/server/thought-map";

const claimResolutionSchema = z.object({
  claimId: z.string().min(1),
  claimText: z.string().min(1),
  confidenceAtArtifactTime: z.number().min(0).max(100),
  wasClaimCorrect: z.enum(["correct", "incorrect", "unclear"]),
  actualOutcome: z.string().trim().max(1000).nullable().optional().default(null),
});

const artifactOutcomeSchema = z.object({
  actionTaken: z.string().trim().min(1).max(500),
  outcomeDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  outcomeDescription: z.string().trim().min(1).max(4000),
  outcomeType: z.enum(["success", "partial_success", "failure", "inconclusive", "pending"]),
  loadBearingClaimResolutions: z.array(claimResolutionSchema).default([]),
  artifactQualityRating: z.number().int().min(1).max(5),
  qualityDimensions: z
    .array(
      z.object({
        dimension: z.enum(["accuracy", "completeness", "persuasiveness", "actionability", "structure"]),
        score: z.number().int().min(1).max(5),
        comment: z.string().trim().max(500).nullable().optional().default(null),
      }),
    )
    .default([]),
  wouldUseAgain: z.boolean(),
  lessonsLearned: z.string().trim().max(4000).nullable().optional().default(null),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = ArtifactParamsSchema.parse(await context.params);
    const json = await request.json();
    const input = artifactOutcomeSchema.parse(json);
    const userId = await getCurrentAuthenticatedUserId();
    const result = await recordArtifactOutcome({
      artifactId: id,
      userId,
      actionTaken: input.actionTaken,
      outcomeDate: new Date(input.outcomeDate),
      outcomeDescription: input.outcomeDescription,
      outcomeType: input.outcomeType,
      loadBearingClaimResolutions: input.loadBearingClaimResolutions.map((claim) => ({
        claimId: claim.claimId,
        claimText: claim.claimText,
        wasClaimCorrect:
          claim.wasClaimCorrect === "correct" ? true : claim.wasClaimCorrect === "incorrect" ? false : null,
        confidenceAtArtifactTime: claim.confidenceAtArtifactTime,
        actualOutcome: claim.actualOutcome ?? null,
      })),
      artifactQualityRating: input.artifactQualityRating,
      qualityDimensions: input.qualityDimensions,
      wouldUseAgain: input.wouldUseAgain,
      lessonsLearned: input.lessonsLearned ?? null,
    });

    return NextResponse.json(
      {
        outcome: result.outcome,
        retrospectivePrompt: result.retrospectivePrompt,
        map: result.map,
      },
      { status: 201 },
    );
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
