import { NextResponse } from "next/server";
import { findRelevantLessons, getLessonLibrary, recordLessonApplication, serializeLessonLibrary } from "@/server/lesson-library";
import { getRequestUserId, normalizeError, reportError } from "@/lib/error-reporting";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const claimText = url.searchParams.get("claimText")?.trim() ?? "";
  const claimDomain = url.searchParams.get("claimDomain")?.trim() ?? "general";
  const claimType = url.searchParams.get("claimType")?.trim() ?? "assertion";

  if (claimText.length > 0) {
    const relevance = await findRelevantLessons(id, claimText, claimDomain, claimType);
    return NextResponse.json(relevance);
  }

  const library = await getLessonLibrary(id);
  return NextResponse.json({ library: serializeLessonLibrary(library) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      lessonId?: string;
      appliedInContext?: string;
      wasUseful?: boolean | null;
      userNote?: string | null;
    };

    if (!body.lessonId || !body.appliedInContext?.trim()) {
      return NextResponse.json(
        {
          error: "invalid_request",
        },
        { status: 400 },
      );
    }

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
