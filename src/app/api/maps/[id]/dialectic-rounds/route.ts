import { NextResponse } from "next/server";
import { MapParamsSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import { recordDialecticRound } from "@/server/thought-map";
import { updateConfidence } from "@/server/mvp";

const roundContextSchema = z
  .object({
    currentConfidence: z.number().min(0).max(100).optional().nullable(),
    confidenceAtRoundEnd: z.number().min(0).max(100).optional().nullable(),
    concessionNote: z.string().max(500).optional().nullable(),
    connectedClaimsChanged: z.boolean().optional().nullable(),
    connectedClaimsNote: z.string().max(500).optional().nullable(),
    newEvidenceNote: z.string().max(500).optional().nullable(),
  })
  .optional();

const dialecticRoundSchema = z.object({
  nodeId: z.string().min(1).optional().nullable(),
  round: z.string().min(1),
  roundIndex: z.number().int().nonnegative(),
  title: z.string().min(1),
  critiqueStrength: z.string().min(1),
  critiqueType: z.string().min(1).optional(),
  critiqueFailureTypes: z.array(z.string().min(1)).optional(),
  critiqueMode: z.enum(["direct", "socratic", "red_team"]).optional().nullable(),
  voiceLabel: z.string().min(1).optional().nullable(),
  prompt: z.string().min(1),
  why: z.string().min(1),
  responsePath: z.enum(["defend", "revise", "absorb"]),
  response: z.string().trim().min(10, "Response must be at least 10 characters.").max(1000),
  roundContext: roundContextSchema,
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentAuthenticatedUserId();
    const { id } = MapParamsSchema.parse(await context.params);
    const json = await request.json();
    const parsed = dialecticRoundSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid challenge round request.",
        },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const event = await recordDialecticRound({
      mapId: id,
      nodeId: input.nodeId ?? null,
      round: input.round,
      roundIndex: input.roundIndex,
      title: input.title,
      critiqueStrength: input.critiqueStrength,
      critiqueType: input.critiqueType ?? null,
      critiqueFailureTypes: input.critiqueFailureTypes ?? (input.critiqueType ? [input.critiqueType] : []),
      critiqueMode: input.critiqueMode ?? null,
      voiceLabel: input.voiceLabel ?? null,
      prompt: input.prompt,
      why: input.why,
      responsePath: input.responsePath,
      response: input.response,
      confidenceAtRoundEnd: input.roundContext?.confidenceAtRoundEnd ?? null,
    });

    const currentConfidence =
      typeof input.roundContext?.currentConfidence === "number" && Number.isFinite(input.roundContext.currentConfidence)
        ? Math.max(0, Math.min(100, Math.round(input.roundContext.currentConfidence)))
        : null;
    const nextConfidence =
      typeof input.roundContext?.confidenceAtRoundEnd === "number" && Number.isFinite(input.roundContext.confidenceAtRoundEnd)
        ? Math.max(0, Math.min(100, Math.round(input.roundContext.confidenceAtRoundEnd)))
        : null;
    let updatedClaimConfidence: number | null = null;

    if (input.nodeId && currentConfidence != null && nextConfidence != null && currentConfidence !== nextConfidence) {
      const updatedClaim = await updateConfidence(
        input.nodeId,
        userId,
        nextConfidence,
        buildConfidenceChangeReason(input.round, input.roundContext),
      );
      updatedClaimConfidence =
        typeof updatedClaim.scores?.confidence === "number"
          ? Math.round(updatedClaim.scores.confidence * 100)
          : nextConfidence;
    }

    const round = event.payload?.dialecticRound ?? null;

    return NextResponse.json(
      {
        event,
        round,
        roundContext: input.roundContext ?? null,
        updatedClaimConfidence,
      },
      { status: 201 },
    );
  } catch (error) {
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

function buildConfidenceChangeReason(
  roundLabel: string,
  roundContext:
    | {
        concessionNote?: string | null;
        connectedClaimsNote?: string | null;
        newEvidenceNote?: string | null;
      }
    | undefined,
) {
  const details = [
    roundContext?.concessionNote?.trim(),
    roundContext?.connectedClaimsNote?.trim(),
    roundContext?.newEvidenceNote?.trim(),
  ].filter((value): value is string => Boolean(value));

  if (details.length) {
    return details.join(" ");
  }

  return `Updated after ${roundLabel}.`;
}
