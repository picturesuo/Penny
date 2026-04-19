import { NextResponse } from "next/server";
import { z } from "zod";
import { sendAnalyticsEvent } from "@/lib/analytics";
import { logger } from "@/lib/logger";

const userIdSchema = z.string().trim().min(1).nullable().optional();

const analyticsEventSchema = z.union([
  z.object({
    event: z.literal("page_view"),
    properties: z.object({ path: z.string() }),
    userId: userIdSchema,
  }),
  z.object({
    event: z.literal("sign_up"),
    properties: z.object({ method: z.string() }),
    userId: userIdSchema,
  }),
  z.object({
    event: z.literal("map_created"),
    properties: z.object({ mapId: z.string() }),
    userId: userIdSchema,
  }),
  z.object({
    event: z.literal("claim_created"),
    properties: z.object({ claimId: z.string(), mapId: z.string(), domain: z.string() }),
    userId: userIdSchema,
  }),
  z.object({
    event: z.literal("challenge_started"),
    properties: z.object({ claimId: z.string(), roundNumber: z.number() }),
    userId: userIdSchema,
  }),
  z.object({
    event: z.literal("challenge_completed"),
    properties: z.object({ claimId: z.string(), roundNumber: z.number(), engagementScore: z.number() }),
    userId: userIdSchema,
  }),
  z.object({
    event: z.literal("confidence_updated"),
    properties: z.object({ claimId: z.string(), delta: z.number() }),
    userId: userIdSchema,
  }),
  z.object({
    event: z.literal("artifact_generated"),
    properties: z.object({ artifactType: z.string(), mapId: z.string() }),
    userId: userIdSchema,
  }),
  z.object({
    event: z.literal("session_completed"),
    properties: z.object({ sessionId: z.string(), durationMinutes: z.number() }),
    userId: userIdSchema,
  }),
  z.object({
    event: z.literal("steel_man_written"),
    properties: z.object({ claimId: z.string(), qualityScore: z.number() }),
    userId: userIdSchema,
  }),
  z.object({
    event: z.literal("learning_prompt_opened"),
    properties: z.object({ promptType: z.string(), claimId: z.string() }),
    userId: userIdSchema,
  }),
]);

export async function POST(request: Request) {
  try {
    const input = analyticsEventSchema.parse(await request.json());
    await sendAnalyticsEvent(input, input.userId ?? undefined);
    logger.info("analytics_event_received", {
      userId: input.userId ?? undefined,
      featureId: "analytics",
      data: {
        event: input.event,
      },
    });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request", details: error.flatten() }, { status: 400 });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
