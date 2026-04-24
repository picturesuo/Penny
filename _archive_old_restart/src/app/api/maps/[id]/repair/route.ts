import { NextResponse } from "next/server";
import { MapParamsSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { buildClaimRepairSuggestions } from "@/lib/penny-insights";
import { getThoughtMap, recordClaimRepairAction } from "@/server/thought-map";

const repairActionSchema = z.object({
  actionType: z.enum(["merge", "split", "promote", "demote", "reclassify", "reroute_edge", "reroot"]),
  initiatedBy: z.enum(["user", "penny_suggestion"]).optional(),
  sourceClaimIds: z.array(z.string().min(1)).min(1),
  reasoning: z.string().min(1),
  propagationTriggered: z.boolean().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = MapParamsSchema.parse(await context.params);
    const map = await getThoughtMap(id);

    if (!map) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        repairActions: map.repairActions,
        suggestions: buildClaimRepairSuggestions(map),
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = MapParamsSchema.parse(await context.params);
    const json = await request.json();
    const input = repairActionSchema.parse(json);
    const result = await recordClaimRepairAction({
      mapId: id,
      actionType: input.actionType,
      initiatedBy: input.initiatedBy ?? "user",
      sourceClaimIds: input.sourceClaimIds,
      reasoning: input.reasoning,
      details: input.details ?? {},
      propagationTriggered: input.propagationTriggered ?? true,
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
