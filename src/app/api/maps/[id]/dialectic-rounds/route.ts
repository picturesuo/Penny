import { NextResponse } from "next/server";
import { MapParamsSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { recordDialecticRound } from "@/server/thought-map";

const roundContextSchema = z
  .object({
    currentConfidence: z.number().min(0).max(100).optional().nullable(),
    confidenceAtRoundEnd: z.number().min(0).max(100).optional().nullable(),
    concessionNote: z.string().max(500).optional().nullable(),
    connectedClaimsChanged: z.boolean().optional().nullable(),
    connectedClaimsNote: z.string().max(500).optional().nullable(),
    newEvidenceNote: z.string().max(500).optional().nullable(),
  })
  .optional();

const dialecticRoundSchema = z.object({
  nodeId: z.string().min(1).optional().nullable(),
  round: z.string().min(1),
  roundIndex: z.number().int().nonnegative(),
  title: z.string().min(1),
  critiqueStrength: z.string().min(1),
  critiqueType: z.string().min(1).optional(),
  critiqueFailureTypes: z.array(z.string().min(1)).optional(),
  critiqueMode: z.enum(["direct", "socratic", "red_team"]).optional().nullable(),
  voiceLabel: z.string().min(1).optional().nullable(),
  prompt: z.string().min(1),
  why: z.string().min(1),
  responsePath: z.enum(["defend", "revise", "absorb"]),
  response: z.string().min(10).max(1000),
  roundContext: roundContextSchema,
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = MapParamsSchema.parse(await context.params);
    const json = await request.json();
    const input = dialecticRoundSchema.parse(json);
    const event = await recordDialecticRound({
      mapId: id,
      nodeId: input.nodeId ?? null,
      round: input.round,
      roundIndex: input.roundIndex,
      title: input.title,
      critiqueStrength: input.critiqueStrength,
      critiqueType: input.critiqueType ?? null,
      critiqueFailureTypes: input.critiqueFailureTypes ?? (input.critiqueType ? [input.critiqueType] : []),
      critiqueMode: input.critiqueMode ?? null,
      voiceLabel: input.voiceLabel ?? null,
      prompt: input.prompt,
      why: input.why,
      responsePath: input.responsePath,
      response: input.response,
      confidenceAtRoundEnd: input.roundContext?.confidenceAtRoundEnd ?? null,
    });

    const round = event.payload?.dialecticRound ?? null;

    return NextResponse.json(
      {
        event,
        round,
        roundContext: input.roundContext ?? null,
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
