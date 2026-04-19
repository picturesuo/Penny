import { NextResponse } from "next/server";
import { UserParamsSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import type { CalibrationCoachingRejection } from "@/types/thought-map";
import { getCalibrationCoaching, recordCalibrationRejection, refreshCalibrationCoaching } from "@/server/thought-map";

const calibrationActionSchema = z.object({
  action: z.enum(["refresh", "reject"]).default("refresh"),
  domain: z.string().min(1).optional(),
  claimType: z.string().min(1).optional(),
  originalConfidence: z.number().min(0).max(100).optional(),
  suggestedAdjustment: z.number().optional(),
  recommendationText: z.string().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const coaching = await getCalibrationCoaching(id);

  return NextResponse.json({ coaching });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const payload = calibrationActionSchema.parse(await request.json());

  if (payload.action === "reject") {
    if (
      payload.domain == null ||
      payload.claimType == null ||
      payload.originalConfidence == null ||
      payload.suggestedAdjustment == null ||
      payload.recommendationText == null
    ) {
      return NextResponse.json(
        { error: "Calibration rejection needs domain, claim type, confidence, adjustment, and recommendation text." },
        { status: 400 },
      );
    }

    const coaching = await recordCalibrationRejection({
      userId: id,
      domain: payload.domain as CalibrationCoachingRejection["domain"],
      claimType: payload.claimType as CalibrationCoachingRejection["claimType"],
      originalConfidence: payload.originalConfidence,
      suggestedAdjustment: payload.suggestedAdjustment,
      recommendationText: payload.recommendationText,
    });

    return NextResponse.json({ coaching }, { status: 201 });
  }

  const coaching = await refreshCalibrationCoaching(id);
  return NextResponse.json({ coaching }, { status: 201 });
}
