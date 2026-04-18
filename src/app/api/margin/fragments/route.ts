import { NextResponse } from "next/server";
import { z } from "zod";
import { createMarginFragment, listMarginFragments } from "@/server/penny";
import { SESSION_STAGES } from "@/types/penny";

const marginContextSchema = z.object({
  currentStage: z.enum([...SESSION_STAGES, "outline", "graph", "dashboard"]).default("dashboard"),
  currentFocus: z.string().max(500).optional().default(""),
  currentSphere: z.string().max(120).optional().default("work"),
  currentContext: z.string().max(1000).optional().default(""),
  currentResponse: z.string().max(1000).optional().nullable().default(null),
  recentSessionMinutes: z.number().nonnegative().max(1000).nullable().optional().default(null),
  sourceSessionId: z.string().max(120).nullable().optional().default(null),
  sourceMapId: z.string().max(120).nullable().optional().default(null),
});

const createMarginFragmentSchema = z.object({
  content: z.string().trim().min(1).max(500),
  sphere: z.string().trim().max(120).optional().default("work"),
  sourceSessionId: z.string().trim().max(120).nullable().optional().default(null),
  sourceMapId: z.string().trim().max(120).nullable().optional().default(null),
  contextSnapshot: marginContextSchema,
});

export async function GET() {
  try {
    const fragments = await listMarginFragments();
    return NextResponse.json({ fragments }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const input = createMarginFragmentSchema.parse(json);
    const fragment = await createMarginFragment({
      content: input.content,
      sphere: input.sphere,
      sourceSessionId: input.sourceSessionId,
      sourceMapId: input.sourceMapId,
      contextSnapshot: input.contextSnapshot,
    });

    return NextResponse.json({ fragment }, { status: 201 });
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

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
