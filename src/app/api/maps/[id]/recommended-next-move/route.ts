import { NextResponse } from "next/server";
import { applyRecommendedNextMove } from "@/server/thought-map";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const result = await applyRecommendedNextMove(id);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "not_found",
        },
        { status: 404 },
      );
    }

    if (error instanceof Error && /unavailable/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "invalid_state",
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
