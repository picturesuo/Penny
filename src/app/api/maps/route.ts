import { NextResponse } from "next/server";
import { z } from "zod";
import { createThoughtMap } from "@/server/thought-map";
import { CLAIM_PROVENANCES, CLAIM_STATUSES, CLAIM_STAKES } from "@/types/thought-map";

const createThoughtMapSchema = z.object({
  rawThought: z
    .string()
    .min(12, "Give Penny one real thought, not a slogan.")
    .max(400, "Keep the first thought under 400 characters."),
  claim: z.object({
    confidence: z.number().int().min(0).max(100),
    resolutionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional()
      .default(null),
    provenance: z.enum(CLAIM_PROVENANCES),
    provenanceDetail: z.string().max(200).optional().default(""),
    stakes: z.array(z.enum(CLAIM_STAKES)).default([]),
    dependencyNotes: z.string().max(300).optional().default(""),
    status: z.enum(CLAIM_STATUSES),
    temporalScope: z.string().max(120).optional().default(""),
    conditionalStatement: z.string().max(200).optional().default(""),
    structureKind: z.enum(["assertion", "conditional", "compound", "temporal", "merged_candidate", "split_candidate"]).optional().default("assertion"),
  }),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const input = createThoughtMapSchema.parse(json);
    const map = await createThoughtMap(input);
    return NextResponse.json({ map }, { status: 201 });
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
