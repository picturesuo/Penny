import { NextResponse } from "next/server";
import { getBlindSpotMap, refreshBlindSpotMap } from "@/server/thought-map";
import { UserParamsSchema } from "@/lib/validation/schemas";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const blindSpotMap = await getBlindSpotMap(id);

  return NextResponse.json({ blindSpotMap });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const blindSpotMap = await refreshBlindSpotMap(id);

  return NextResponse.json({ blindSpotMap }, { status: 201 });
}
