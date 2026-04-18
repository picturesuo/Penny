import { NextResponse } from "next/server";
import { z } from "zod";
import { recordBeliefPropagation, recordBeliefPropagationDecision } from "@/server/thought-map";

const arithmeticSchema = z.object({
  parentId: z.string().min(1),
  parentPrior: z.number().min(0).max(1),
  parentPosterior: z.number().min(0).max(1),
  edgeProbability: z.number().min(0).max(1),
  formula: z.string().trim().min(1).max(500),
});

const propagateSchema = z.object({
  seedClaimId: z.string().min(1),
  updatedPosterior: z.number().min(0).max(1).optional().nullable(),
  action: z.enum(["compute", "accept", "override", "decouple"]).default("compute"),
  targetClaimId: z.string().min(1).optional().nullable(),
  decisionType: z.enum(["accept", "override", "decouple"]).optional().nullable(),
  reason: z.string().trim().max(1000).optional().nullable(),
  oldPosterior: z.number().min(0).max(1).optional().nullable(),
  proposedPosterior: z.number().min(0).max(1).optional().nullable(),
  finalPosterior: z.number().min(0).max(1).optional().nullable(),
  arithmetic: arithmeticSchema.optional().nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const json = await request.json();
    const input = propagateSchema.parse(json);

    const action = input.action ?? "compute";
    let decisionPayload:
      | {
          decisionEvent: {
            id: string;
            mapId: string;
            nodeId: string | null;
            interventionId: string | null;
            eventType: string;
            payload: Record<string, unknown> | null;
            createdAt: Date;
          };
          compatibilityEvent: {
            id: string;
            mapId: string;
            nodeId: string | null;
            interventionId: string | null;
            eventType: string;
            payload: Record<string, unknown> | null;
            createdAt: Date;
          };
        }
      | null = null;

    if (action !== "compute") {
      if (!input.targetClaimId || !input.decisionType || !input.reason || input.oldPosterior == null || input.proposedPosterior == null) {
        return NextResponse.json(
          {
            error: "invalid_request",
            details: "Decision propagation requires targetClaimId, decisionType, reason, oldPosterior, and proposedPosterior.",
          },
          { status: 400 },
        );
      }

      if (input.finalPosterior == null) {
        return NextResponse.json(
          {
            error: "invalid_request",
            details: "Decision propagation requires a finalPosterior.",
          },
          { status: 400 },
        );
      }

      decisionPayload = await recordBeliefPropagationDecision({
        mapId: id,
        seedClaimId: input.seedClaimId,
        targetClaimId: input.targetClaimId,
        decisionType: input.decisionType,
        oldPosterior: input.oldPosterior,
        proposedPosterior: input.proposedPosterior,
        finalPosterior: input.finalPosterior,
        reason: input.reason,
        arithmetic: input.arithmetic ?? {
          parentId: input.seedClaimId,
          parentPrior: input.oldPosterior,
          parentPosterior: input.proposedPosterior,
          edgeProbability: input.proposedPosterior,
          formula: `${Math.round(input.oldPosterior * 100)}% → ${Math.round(input.finalPosterior * 100)}%`,
        },
      });
    }

    const propagation = await recordBeliefPropagation({
      mapId: id,
      seedClaimId: input.seedClaimId,
      updatedPosterior: input.updatedPosterior ?? null,
    });

    const events = [
      ...(decisionPayload
        ? [decisionPayload.decisionEvent, decisionPayload.compatibilityEvent]
        : []),
      propagation.graphEvent,
      propagation.propagationEvent,
      ...(propagation.cycleEvent ? [propagation.cycleEvent] : []),
    ];

    return NextResponse.json(
      {
        decision: decisionPayload,
        events,
        result: propagation.result,
        cycleError: propagation.cycleError,
      },
      { status: propagation.cycleError ? 409 : 201 },
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
