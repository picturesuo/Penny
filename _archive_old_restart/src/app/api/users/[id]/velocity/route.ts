import { NextResponse } from "next/server";
import { z } from "zod";
import { buildVelocityReport } from "@/lib/intellectual-velocity";
import { listThoughtMaps } from "@/server/thought-map";
import { UserParamsSchema, VelocityQuerySchema } from "@/lib/validation/schemas";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const url = new URL(request.url);
  const periodDays = VelocityQuerySchema.parse({
    periodDays: url.searchParams.get("periodDays") ?? undefined,
  }).periodDays;
  const maps = await listThoughtMaps();
  const report = buildVelocityReport(id, maps, periodDays);

  return NextResponse.json({ report });
}
