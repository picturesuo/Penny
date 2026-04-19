import { NextResponse } from "next/server";
import { z } from "zod";
import { detectHereBeforeSignal } from "@/lib/here-before-detection";

const hereBeforeDraftSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  domain: z.string().min(1),
  claimType: z.string().min(1),
  stakesLevel: z.enum(["light", "moderate", "heavy"]),
  structureKind: z.string().min(1),
  provenance: z.string().min(1),
  confidence: z.number().int().min(0).max(100),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = hereBeforeDraftSchema.parse(await request.json());
    const signal = await detectHereBeforeSignal(id, payload);

    return NextResponse.json({ signal });
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

