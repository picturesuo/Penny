import { NextResponse } from "next/server";
import { UserParamsSchema } from "@/lib/validation/schemas";
import { getCognitiveBiasProfile, refreshCognitiveBiasProfile } from "@/server/thought-map";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const profile = await getCognitiveBiasProfile(id);

  return NextResponse.json({ profile });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const profile = await refreshCognitiveBiasProfile(id);

  return NextResponse.json({ profile }, { status: 201 });
}
