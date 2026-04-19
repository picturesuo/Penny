import { NextResponse } from "next/server";
import { MapParamsSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { buildRevisitQueue } from "@/lib/revisit-scheduler";
import { getThoughtMap, recordRevisitAction, setRevisitTrigger } from "@/server/thought-map";

const triggerDefinitionSchema = z.object({
  triggerType: z.enum(["date", "event_keyword", "dependency_update", "confidence_threshold", "manual_flag"]),
  dateTarget: z.coerce.date().nullable().optional(),
  eventKeyword: z.string().min(1).nullable().optional(),
  confidenceThreshold: z.number().min(0).max(100).nullable().optional(),
  dependencyClaimId: z.string().min(1).nullable().optional(),
});

const revisitActionSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("set_trigger"),
    claimId: z.string().min(1),
    triggerDefinition: triggerDefinitionSchema,
  }),
  z.object({
    operation: z.literal("act"),
    claimId: z.string().min(1),
    type: z.enum([
      "reviewed_no_change",
      "confidence_updated",
      "claim_updated",
      "claim_retired",
      "snoozed",
      "triggered_repair",
      "triggered_dialectic",
    ]),
    notes: z.string().optional().nullable(),
    newConfidence: z.number().min(0).max(100).nullable().optional(),
    triggerDefinition: triggerDefinitionSchema.nullable().optional(),
    snoozedUntil: z.coerce.date().nullable().optional(),
  }),
]);

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
        schedules: map.revisitSchedules,
        queue: buildRevisitQueue(map),
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
    const input = revisitActionSchema.parse(json);

    if (input.operation === "set_trigger") {
      const result = await setRevisitTrigger({
        mapId: id,
        claimId: input.claimId,
        triggerDefinition: {
          triggerType: input.triggerDefinition.triggerType,
          dateTarget: input.triggerDefinition.dateTarget ?? null,
          eventKeyword: input.triggerDefinition.eventKeyword ?? null,
          confidenceThreshold: input.triggerDefinition.confidenceThreshold ?? null,
          dependencyClaimId: input.triggerDefinition.dependencyClaimId ?? null,
        },
      });

      return NextResponse.json(result, { status: 201 });
    }

    const result = await recordRevisitAction({
      mapId: id,
      claimId: input.claimId,
      type: input.type,
      notes: input.notes ?? null,
      newConfidence: input.newConfidence ?? null,
      triggerDefinition: input.triggerDefinition
        ? {
            triggerType: input.triggerDefinition.triggerType,
            dateTarget: input.triggerDefinition.dateTarget ?? null,
            eventKeyword: input.triggerDefinition.eventKeyword ?? null,
            confidenceThreshold: input.triggerDefinition.confidenceThreshold ?? null,
            dependencyClaimId: input.triggerDefinition.dependencyClaimId ?? null,
          }
        : null,
      snoozedUntil: input.snoozedUntil ?? null,
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
