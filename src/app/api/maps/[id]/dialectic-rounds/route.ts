import { NextResponse } from "next/server";
import { z } from "zod";
import { recordDialecticRound } from "@/server/thought-map";

const dialecticRoundSchema = z.object({
  nodeId: z.string().min(1).optional().nullable(),
  round: z.string().min(1),
  roundIndex: z.number().int().nonnegative(),
  title: z.string().min(1),
  critiqueStrength: z.string().min(1),
  critiqueType: z.string().min(1).optional(),
  prompt: z.string().min(1),
  why: z.string().min(1),
  responsePath: z.enum(["defend", "revise", "absorb"]),
  response: z.string().min(1).max(1000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
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
      prompt: input.prompt,
      why: input.why,
      responsePath: input.responsePath,
      response: input.response,
    });

    return NextResponse.json({ event }, { status: 201 });
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
