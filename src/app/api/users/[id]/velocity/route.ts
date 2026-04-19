import { NextResponse } from "next/server";
import { z } from "zod";
import { buildVelocityReport } from "@/lib/intellectual-velocity";
import { listThoughtMaps } from "@/server/thought-map";

const velocityQuerySchema = z.object({
  periodDays: z.coerce.number().int().min(7).max(365).default(30),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const periodDays = velocityQuerySchema.parse({
    periodDays: url.searchParams.get("periodDays") ?? undefined,
  }).periodDays;
  const maps = await listThoughtMaps();
  const report = buildVelocityReport(id, maps, periodDays);

  return NextResponse.json({ report });
}
