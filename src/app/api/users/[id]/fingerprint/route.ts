import { NextResponse } from "next/server";
import { UserParamsSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { getCognitiveFingerprint, upsertFingerprintReview } from "@/server/cognitive-fingerprint";

const fingerprintReviewSchema = z.object({
  patternId: z.string().min(1),
  disputeText: z.string().max(4000).nullable().optional(),
  falsificationCondition: z.string().max(2000).nullable().optional(),
  acknowledged: z.boolean().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const fingerprint = await getCognitiveFingerprint(id);

  return NextResponse.json({ fingerprint });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = UserParamsSchema.parse(await context.params);
    const payload = fingerprintReviewSchema.parse(await request.json());
    const review = await upsertFingerprintReview({
      userId: id,
      patternId: payload.patternId,
      disputeText: payload.disputeText ?? null,
      falsificationCondition: payload.falsificationCondition ?? null,
      acknowledged: payload.acknowledged,
    });
    const fingerprint = await getCognitiveFingerprint(id);

    return NextResponse.json({ review, fingerprint }, { status: 201 });
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

    return NextResponse.json(
      {
        error: "internal_error",
      },
      { status: 500 },
    );
  }
}
