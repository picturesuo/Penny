import { NextResponse } from "next/server";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { classifyCalibrationDomain } from "@/lib/calibration";
import { CreateClaimCaptureSchema } from "@/lib/validation/schemas";
import { createClaim } from "@/server/mvp";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import { recordConfidenceOverride } from "@/server/thought-map";

const claimCaptureSchema = CreateClaimCaptureSchema.extend({
  note: z.string().max(500).nullable().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const userId = await getCurrentAuthenticatedUserId();
    const input = claimCaptureSchema.parse(await request.json());

    const claim = await createClaim(userId, id, {
      content: input.text,
      note: input.provenance,
      kind: "core_claim",
      nodeStatus: "active",
      structureKind: "assertion",
    });

    await recordConfidenceOverride({
      mapId: id,
      sourceNodeId: claim.id,
      targetNodeId: claim.id,
      mode: input.confidence >= 50 ? "hold" : "reduce",
      reasoning: `Initial capture at ${input.confidence}% confidence. ${input.provenance}.${input.stakes.length > 0 ? ` Stakes: ${input.stakes.join(", ")}.` : ""}`,
    });

    void track(
      {
        event: "claim_created",
        properties: {
          claimId: claim.id,
          mapId: id,
          domain: classifyCalibrationDomain(input.text),
        },
      },
      userId,
    );

    return NextResponse.json(
      {
        claim,
      },
      { status: 201 },
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
