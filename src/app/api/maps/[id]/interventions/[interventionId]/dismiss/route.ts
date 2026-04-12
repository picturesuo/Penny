import { NextResponse } from "next/server";
import { dismissThoughtMapIntervention } from "@/server/thought-map";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; interventionId: string }> },
) {
  try {
    const { id, interventionId } = await context.params;
    const intervention = await dismissThoughtMapIntervention({
      mapId: id,
      interventionId,
    });

    return NextResponse.json({ intervention }, { status: 200 });
  } catch (error) {
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
