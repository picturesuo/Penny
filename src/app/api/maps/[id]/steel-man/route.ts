import { NextResponse } from "next/server";
import { MapParamsSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { recordSteelMan } from "@/server/thought-map";

const steelManSchema = z.object({
  claimId: z.string().min(1),
  steelManText: z.string().min(100),
  roundContext: z.string().min(1).optional().nullable(),
  usedInRound: z.array(z.string().min(1)).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = MapParamsSchema.parse(await context.params);
    const json = await request.json();
    const input = steelManSchema.parse(json);
    const result = await recordSteelMan({
      mapId: id,
      claimId: input.claimId,
      steelManText: input.steelManText,
      roundContext: input.roundContext ?? null,
      usedInRound: input.usedInRound ?? [],
    });

    return NextResponse.json(
      {
        steelMan: result.steelMan,
        assessment: result.assessment,
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
