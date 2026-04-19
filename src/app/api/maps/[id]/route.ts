import { NextResponse } from "next/server";
import { MapParamsSchema } from "@/lib/validation/schemas";
import { getThoughtMap } from "@/server/thought-map";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = MapParamsSchema.parse(await context.params);
  const map = await getThoughtMap(id);

  if (!map) {
    return NextResponse.json(
      {
        error: "not_found",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ map });
}
