import { NextResponse } from "next/server";
import { z } from "zod";
import { generateArtifactForMap } from "@/server/thought-map";
import { buildRateLimitResponse, isRateLimitError } from "@/lib/rate-limiter";

const artifactTypeIdSchema = z.enum([
  "founder_brief",
  "decision_memo",
  "investment_thesis",
  "research_proposal",
  "risk_register",
  "personal_decision_audit",
  "hypothesis_brief",
]);

const artifactGenerationSchema = z.object({
  artifactTypeId: artifactTypeIdSchema,
  audience: z.string().trim().max(120).nullable().optional().default(null),
  sectionOrder: z.array(z.string().trim().min(1)).optional().default([]),
  narrativeGlue: z.string().trim().max(2000).nullable().optional().default(null),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const json = await request.json();
    const input = artifactGenerationSchema.parse(json);
    const result = await generateArtifactForMap({
      mapId: id,
      artifactTypeId: input.artifactTypeId,
      audience: input.audience ?? null,
      sectionOrder: input.sectionOrder,
      narrativeGlue: input.narrativeGlue ?? null,
    });

    return NextResponse.json(
      {
        artifact: result.artifact,
        map: result.map,
      },
      { status: 201 },
    );
  } catch (error) {
    if (isRateLimitError(error)) {
      return buildRateLimitResponse(error);
    }

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

    if (error instanceof Error && /not ready/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "invalid_state",
          message: error.message,
        },
        { status: 409 },
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
