import { NextResponse } from "next/server";
import { MapNodeParamsSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { applyNodeAction } from "@/server/thought-map";
import { NODE_ACTIONS } from "@/types/thought-map";

const applyNodeActionSchema = z.object({
  action: z.enum(NODE_ACTIONS),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; nodeId: string }> },
) {
  try {
    const { id, nodeId } = MapNodeParamsSchema.parse(await context.params);
    const json = await request.json();
    const input = applyNodeActionSchema.parse(json);
    const result = await applyNodeAction({
      mapId: id,
      nodeId,
      action: input.action,
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
