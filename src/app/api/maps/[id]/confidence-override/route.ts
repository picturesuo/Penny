import { NextResponse } from "next/server";
import { z } from "zod";
import { recordConfidenceOverride } from "@/server/thought-map";

const confidenceOverrideSchema = z.object({
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  mode: z.enum(["hold", "reduce"]),
  reasoning: z.string().trim().min(8).max(1000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const json = await request.json();
    const input = confidenceOverrideSchema.parse(json);
    const event = await recordConfidenceOverride({
      mapId: id,
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      mode: input.mode,
      reasoning: input.reasoning,
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
