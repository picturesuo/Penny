import { NextResponse } from "next/server";
import { z } from "zod";
import { updateMarginFragment } from "@/server/penny";

const updateMarginFragmentSchema = z.object({
  status: z.enum(["floating", "surfaced", "promoted", "merged", "archived"]).optional(),
  priorityDelta: z.number().min(-1).max(1).optional(),
  mergedInto: z.string().max(120).nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const json = await request.json();
    const input = updateMarginFragmentSchema.parse(json);
    const fragment = await updateMarginFragment({
      fragmentId: id,
      status: input.status,
      priorityDelta: input.priorityDelta,
      mergedInto: input.mergedInto ?? null,
    });

    return NextResponse.json({ fragment }, { status: 200 });
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
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
