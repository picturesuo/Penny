import { NextResponse } from "next/server";
import { MapParamsSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { recordShapeFeedback } from "@/server/thought-map";

const shapeFeedbackSchema = z.object({
  shapeId: z.string().min(1),
  verdict: z.enum(["confirmed", "rejected", "refined"]),
  shapeLabel: z.string().min(1),
  source: z.string().min(1),
  reasoning: z.string().trim().min(8).max(1000),
  falsificationCondition: z.string().trim().max(500).nullable().optional(),
  nodeId: z.string().min(1).optional().nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = MapParamsSchema.parse(await context.params);
    const json = await request.json();
    const input = shapeFeedbackSchema.parse(json);
    const event = await recordShapeFeedback({
      mapId: id,
      shapeId: input.shapeId,
      verdict: input.verdict,
      shapeLabel: input.shapeLabel,
      source: input.source,
      reasoning: input.reasoning,
      falsificationCondition: input.falsificationCondition ?? null,
      nodeId: input.nodeId ?? null,
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
