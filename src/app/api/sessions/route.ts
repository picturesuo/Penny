import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendSessionEvent,
  closeThinkingSession,
  createThinkingSession,
  getActiveThinkingSession,
  updateThinkingSession,
} from "@/server/penny";
import { DEMO_USER_ID } from "@/lib/penny";

const sessionIntentionTypes = [
  "stress_test",
  "explore_new_claim",
  "resolve_pending",
  "generate_artifact",
  "review_blind_spots",
  "revisit_queue",
  "open_exploration",
] as const;

const sessionEventTypes = [
  "session_started",
  "session_dismissed",
  "session_closed",
  "claim_opened",
  "critique_round",
  "confidence_update",
  "claim_created",
  "artifact_generated",
  "blind_spot_reviewed",
  "revisit_completed",
] as const;

const createSchema = z.object({
  userId: z.string().min(1).optional().default(DEMO_USER_ID),
  mapId: z.string().min(1).nullable().optional().default(null),
  declaredIntention: z.string().min(1).max(500),
  intentionType: z.enum(sessionIntentionTypes),
  scopedClaimIds: z.array(z.string().min(1)).default([]),
  timeBudgetMinutes: z.number().int().min(1).max(480).nullable().optional().default(null),
});

const updateSchema = z.object({
  sessionId: z.string().min(1),
  declaredIntention: z.string().min(1).max(500).optional(),
  intentionType: z.enum(sessionIntentionTypes).optional(),
  scopedClaimIds: z.array(z.string().min(1)).optional(),
  timeBudgetMinutes: z.number().int().min(1).max(480).nullable().optional(),
  energyRating: z.enum(["low", "medium", "high"]).nullable().optional(),
  focusRating: z.enum(["scattered", "moderate", "deep"]).nullable().optional(),
  productivityRating: z.number().int().min(1).max(5).nullable().optional(),
  eventType: z.enum(sessionEventTypes).optional(),
  claimId: z.string().min(1).nullable().optional(),
  description: z.string().min(1).max(500).optional(),
});

const closeSchema = z.object({
  sessionId: z.string().min(1),
  skipClosingRitual: z.boolean().optional().default(false),
  questionsAnswered: z
    .array(
      z.object({
        question: z.string().min(1).max(240),
        answer: z.string().min(1).max(1000),
      }),
    )
    .default([]),
  openItemsNoted: z.array(z.string().min(1).max(400)).default([]),
  nextSessionIntention: z.string().min(1).max(400).nullable().optional().default(null),
  energyRating: z.enum(["low", "medium", "high"]).nullable().optional().default(null),
  focusRating: z.enum(["scattered", "moderate", "deep"]).nullable().optional().default(null),
  productivityRating: z.number().int().min(1).max(5).nullable().optional().default(null),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mapId = url.searchParams.get("mapId");

  if (!mapId) {
    return NextResponse.json({ session: null });
  }

  const session = await getActiveThinkingSession({ mapId });
  return NextResponse.json({ session });
}

export async function POST(request: Request) {
  try {
    const input = createSchema.parse(await request.json());
    const createdSession = await createThinkingSession({
      userId: input.userId,
      mapId: input.mapId,
      declaredIntention: input.declaredIntention,
      intentionType: input.intentionType,
      scopedClaimIds: input.scopedClaimIds,
      timeBudgetMinutes: input.timeBudgetMinutes,
    });
    await appendSessionEvent({
      sessionId: createdSession.id,
      eventType: "session_started",
      claimId: null,
      description: input.declaredIntention,
    });
    const session = await getActiveThinkingSession({ mapId: input.mapId, userId: input.userId });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request", details: error.flatten() }, { status: 400 });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const input = updateSchema.parse(await request.json());
    const session = await updateThinkingSession(input);

    if (input.eventType && input.description) {
      await appendSessionEvent({
        sessionId: input.sessionId,
        eventType: input.eventType,
        claimId: input.claimId ?? null,
        description: input.description,
      });
    }

    const refreshed = await getActiveThinkingSession({ mapId: session.mapId, userId: session.userId });
    return NextResponse.json({ session: refreshed ?? session }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request", details: error.flatten() }, { status: 400 });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const input = closeSchema.parse(await request.json());
    const session = await closeThinkingSession({
      sessionId: input.sessionId,
      skipClosingRitual: input.skipClosingRitual,
      closingRitual: {
        questionsAnswered: input.questionsAnswered,
        openItemsNoted: input.openItemsNoted,
        nextSessionIntention: input.nextSessionIntention,
      },
      energyRating: input.energyRating,
      focusRating: input.focusRating,
      productivityRating: input.productivityRating,
    });

    return NextResponse.json({ session }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request", details: error.flatten() }, { status: 400 });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
