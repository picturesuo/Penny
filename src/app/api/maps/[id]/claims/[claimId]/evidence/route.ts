import { NextResponse } from "next/server";
import { z } from "zod";
import { recordClaimEvidence } from "@/server/thought-map";

const evidenceSubmissionSchema = z.object({
  mapId: z.string().min(1),
  claimId: z.string().min(1),
  evidenceText: z.string().trim().min(1),
  evidenceType: z.enum([
    "peer_reviewed",
    "expert_opinion",
    "case_study",
    "survey_data",
    "first_hand_observation",
    "anecdote",
    "intuition",
    "hearsay",
    "analogy",
  ]),
  sourceUrl: z.string().trim().url().nullable().optional().default(null),
  sourceName: z.string().trim().max(240).nullable().optional().default(null),
  publicationDate: z.coerce.date().nullable().optional().default(null),
  authorCredentials: z.string().trim().max(240).nullable().optional().default(null),
  sampleSize: z.coerce.number().int().positive().nullable().optional().default(null),
  replicationStatus: z.enum(["replicated", "unreplicated", "contested", "unknown"]).nullable().optional().default(null),
});

export async function POST(request: Request, context: { params: Promise<{ id: string; claimId: string }> }) {
  try {
    const { id, claimId } = await context.params;
    const json = await request.json();
    const input = evidenceSubmissionSchema.parse(json);

    if (input.mapId !== id || input.claimId !== claimId) {
      return NextResponse.json({ error: "route_mismatch" }, { status: 400 });
    }

    const result = await recordClaimEvidence({
      mapId: input.mapId,
      claimId: input.claimId,
      evidenceText: input.evidenceText,
      evidenceType: input.evidenceType,
      sourceUrl: input.sourceUrl ?? null,
      sourceName: input.sourceName ?? null,
      publicationDate: input.publicationDate ?? null,
      authorCredentials: input.authorCredentials ?? null,
      sampleSize: input.sampleSize ?? null,
      replicationStatus: input.replicationStatus ?? null,
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
