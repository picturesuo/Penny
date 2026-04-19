import { NextResponse } from "next/server";
import { MapClaimParamsSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { recordClaimResolution } from "@/server/thought-map";

const resolutionEvidenceSchema = z.object({
  evidenceText: z.string().trim().min(1),
  sourceType: z.enum(["observation", "report", "third_party", "personal_experience", "data"]),
  sourceUrl: z.string().trim().url().nullable().optional(),
  addedAt: z.coerce.date().optional(),
});

const postMortemSchema = z.object({
  whatHappened: z.string().trim().min(1),
  whatWasMissed: z.string().trim().min(1),
  shapesActiveAtPrediction: z.array(z.string().trim().min(1)).default([]),
  biasesActiveAtPrediction: z.array(z.string().trim().min(1)).default([]),
  keyAssumptionsThatWereWrong: z.array(z.string().trim().min(1)).default([]),
  whatToDoNextTime: z.string().trim().min(1),
  emotionalAssessment: z.enum(["relieved", "unsurprised", "surprised", "frustrated", "uncertain"]).nullable(),
  createdAt: z.coerce.date().optional(),
});

const propagationResultSchema = z.object({
  claimId: z.string().min(1),
  claimText: z.string().trim().min(1),
  relation: z.enum(["direct", "transitive"]),
  currentConfidence: z.number().min(0).max(100).nullable(),
  suggestedConfidence: z.number().min(0).max(100).nullable(),
  decision: z.enum(["accept", "override", "decouple"]),
  confidenceDelta: z.number().nullable(),
  downstreamArtifacts: z.array(z.string().min(1)).default([]),
});

const resolutionSchema = z.object({
  resolutionType: z.enum(["confirmed", "disconfirmed", "partially_confirmed", "inconclusive", "reframed", "superseded"]),
  actualOutcome: z.string().trim().min(1),
  resolutionEvidence: z.array(resolutionEvidenceSchema).default([]),
  postMortem: postMortemSchema.nullable().optional(),
  propagationTriggered: z.boolean().optional(),
  lessonsCaptured: z.array(z.string().trim().min(1)).default([]),
  propagationResults: z.array(propagationResultSchema).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; claimId: string }> },
) {
  try {
    const { id, claimId } = MapClaimParamsSchema.parse(await context.params);
    const json = await request.json();
    const input = resolutionSchema.parse(json);
    const result = await recordClaimResolution({
      mapId: id,
      claimId,
      resolutionType: input.resolutionType,
      actualOutcome: input.actualOutcome,
      resolutionEvidence: input.resolutionEvidence.map((evidence) => ({
        ...evidence,
        sourceUrl: evidence.sourceUrl ?? null,
        addedAt: evidence.addedAt ?? new Date(),
      })),
      postMortem: input.postMortem
        ? {
            ...input.postMortem,
            emotionalAssessment: input.postMortem.emotionalAssessment ?? null,
            createdAt: input.postMortem.createdAt ?? new Date(),
          }
        : null,
      propagationTriggered: input.propagationTriggered ?? true,
      lessonsCaptured: input.lessonsCaptured,
      propagationResults: input.propagationResults,
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
