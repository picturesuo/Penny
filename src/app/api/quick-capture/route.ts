import { NextResponse } from "next/server";
import { z } from "zod";
import { createQuickCapture, listQuickCaptures, updateQuickCapture } from "@/server/quick-capture";
import { QUICK_CAPTURE_SOURCES } from "@/types/quick-capture";
import { SESSION_STAGES } from "@/types/penny";
import { getRequestUserId, normalizeError, reportError } from "@/lib/error-reporting";
import { logger } from "@/lib/logger";

const createQuickCaptureSchema = z.object({
  userId: z.string().min(1).optional(),
  rawText: z.string().trim().min(1).max(500),
  captureSource: z.enum(QUICK_CAPTURE_SOURCES).optional(),
  sphere: z.string().trim().max(120).optional(),
  mapId: z.string().trim().max(120).nullable().optional(),
  sourceSessionId: z.string().trim().max(120).nullable().optional(),
  sourceMapId: z.string().trim().max(120).nullable().optional(),
  currentStage: z.enum([...SESSION_STAGES, "outline", "graph", "dashboard"]).optional(),
  currentFocus: z.string().trim().max(500).optional(),
  currentContext: z.string().trim().max(1000).optional(),
  currentResponse: z.string().trim().max(1000).nullable().optional(),
  recentSessionMinutes: z.number().nonnegative().max(1000).nullable().optional(),
  extractedStructureKind: z.string().trim().max(120).nullable().optional(),
  extractedDomain: z.string().trim().max(120).nullable().optional(),
  extractedConfidence: z.number().min(0).max(100).nullable().optional(),
  extractionConfidence: z.number().min(0).max(100).nullable().optional(),
});

const updateQuickCaptureSchema = z.object({
  captureId: z.string().min(1),
  userId: z.string().min(1).optional(),
  status: z.enum(["floating", "surfaced", "archived"]).optional(),
  processedIntoClaimId: z.string().nullable().optional(),
  processedIntoMapId: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId") || undefined;
    const captures = await listQuickCaptures(userId);
    logger.info("quick_capture_listed", {
      userId: userId ?? undefined,
      featureId: "quick-capture-get",
      data: { count: captures.length },
    });
    return NextResponse.json({ captures }, { status: 200 });
  } catch (error) {
    reportError(normalizeError(error), {
      userId: getRequestUserId({ path: new URL(request.url).pathname, headers: request.headers }),
      requestPath: request.url,
      requestMethod: request.method,
      featureId: "quick-capture-get",
    });

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const input = createQuickCaptureSchema.parse(json);
    const capture = await createQuickCapture({
      userId: input.userId,
      rawText: input.rawText,
      captureSource: input.captureSource,
      sphere: input.sphere,
      sourceSessionId: input.sourceSessionId ?? null,
      sourceMapId: input.sourceMapId ?? input.mapId ?? null,
      currentStage: input.currentStage as Parameters<typeof createQuickCapture>[0]["currentStage"],
      currentFocus: input.currentFocus,
      currentContext: input.currentContext,
      currentResponse: input.currentResponse ?? null,
      recentSessionMinutes: input.recentSessionMinutes ?? null,
      extractedStructureKind: input.extractedStructureKind ?? null,
      extractedDomain: input.extractedDomain ?? null,
      extractedConfidence: input.extractedConfidence ?? null,
      extractionConfidence: input.extractionConfidence ?? null,
    });
    logger.info("quick_capture_created", {
      userId: capture.userId,
      featureId: "quick-capture-post",
      data: {
        captureId: capture.id,
        source: capture.captureSource,
      },
    });

    return NextResponse.json({ capture }, { status: 201 });
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

    reportError(normalizeError(error), {
      userId: getRequestUserId({ path: new URL(request.url).pathname, headers: request.headers }),
      requestPath: request.url,
      requestMethod: request.method,
      featureId: "quick-capture-post",
    });

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const json = await request.json();
    const input = updateQuickCaptureSchema.parse(json);
    const capture = await updateQuickCapture({
      captureId: input.captureId,
      userId: input.userId,
      status: input.status,
      processedIntoClaimId: input.processedIntoClaimId ?? null,
      processedIntoMapId: input.processedIntoMapId ?? null,
    });
    logger.info("quick_capture_updated", {
      userId: capture.userId,
      featureId: "quick-capture-patch",
      data: {
        captureId: capture.id,
        status: capture.status,
      },
    });

    return NextResponse.json({ capture }, { status: 200 });
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
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    reportError(normalizeError(error), {
      userId: getRequestUserId({ path: new URL(request.url).pathname, headers: request.headers }),
      requestPath: request.url,
      requestMethod: request.method,
      featureId: "quick-capture-patch",
    });

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
