import { NextResponse } from "next/server";
import { MapParamsSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { recordMetaCognitionEvent } from "@/server/thought-map";

const metaCognitionPayloadSchema = z.object({
  triggerId: z.string().min(1),
  condition: z.enum([
    "rapid_dismissal_pattern",
    "emotional_language",
    "speed_pattern",
    "confidence_stickiness",
    "sunk_cost_signal",
    "positive_pattern_recognition",
  ]),
  prompt: z.string().min(1),
  promptTone: z.enum(["curious", "gentle_challenge", "observation", "pattern_notice"]),
  sessionContext: z.object({
    roundNumber: z.number().int().min(0),
    claimsOpen: z.number().int().min(0),
    minutesElapsed: z.number().int().min(0),
  }),
  evidence: z.array(z.string().min(1)),
  shapesAssociated: z.array(z.string().min(1)),
  selectedNodeId: z.string().min(1).nullable().optional(),
  responseType: z.enum(["that's_useful", "disagree", "not_now"]).nullable().optional(),
  responseText: z.string().trim().max(1000).nullable().optional(),
  tellMeMoreOpened: z.boolean().optional(),
  behaviorChangedWithinTenMinutes: z.boolean().nullable().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = MapParamsSchema.parse(await context.params);
    const json = await request.json();
    const input = metaCognitionPayloadSchema.parse(json);
    const event = await recordMetaCognitionEvent({
      mapId: id,
      nodeId: input.selectedNodeId ?? null,
      payload: {
        ...input,
        tellMeMoreOpened: input.tellMeMoreOpened ?? false,
        behaviorChangedWithinTenMinutes: input.behaviorChangedWithinTenMinutes ?? null,
        createdAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ event }, { status: 201 });
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
