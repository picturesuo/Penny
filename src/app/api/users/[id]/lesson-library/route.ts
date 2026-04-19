import { NextResponse } from "next/server";
import { z } from "zod";
import { findRelevantLessons, getLessonLibrary, recordLessonApplication, serializeLessonLibrary } from "@/server/lesson-library";
import { getRequestUserId, normalizeError, reportError } from "@/lib/error-reporting";
import { LessonLibraryQuerySchema, UserParamsSchema } from "@/lib/validation/schemas";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const url = new URL(request.url);
  const query = LessonLibraryQuerySchema.parse({
    claimText: url.searchParams.get("claimText") ?? undefined,
    claimDomain: url.searchParams.get("claimDomain") ?? undefined,
    claimType: url.searchParams.get("claimType") ?? undefined,
  });
  const claimText = query.claimText?.trim() ?? "";
  const claimDomain = query.claimDomain?.trim() ?? "general";
  const claimType = query.claimType?.trim() ?? "assertion";

  if (claimText.length > 0) {
    const relevance = await findRelevantLessons(id, claimText, claimDomain, claimType);
    return NextResponse.json(relevance);
  }

  const library = await getLessonLibrary(id);
  return NextResponse.json({ library: serializeLessonLibrary(library) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = UserParamsSchema.parse(await context.params);
    const body = z.object({
      lessonId: z.string().cuid(),
      appliedInContext: z.string().min(1).max(400),
      wasUseful: z.boolean().nullable().optional(),
      userNote: z.string().max(1000).nullable().optional(),
    }).parse(await request.json());

    const application = await recordLessonApplication({
      userId: id,
      lessonId: body.lessonId,
      appliedInContext: body.appliedInContext,
      wasUseful: body.wasUseful ?? null,
      userNote: body.userNote ?? null,
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "not_found",
        },
        { status: 404 },
      );
    }

    reportError(normalizeError(error), {
      userId: getRequestUserId({ path: new URL(request.url).pathname, headers: request.headers }),
      requestPath: request.url,
      requestMethod: request.method,
      featureId: "lesson-library",
    });

    return NextResponse.json(
      {
        error: "internal_error",
      },
      { status: 500 },
    );
  }
}
