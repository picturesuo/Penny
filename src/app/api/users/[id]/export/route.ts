import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { buildExportData } from "@/server/thought-map";
import { buildExportFilename, buildExportPayloadForType, EXPORT_PORTABILITY_GUARANTEE } from "@/lib/export";
import { EXPORT_FORMATS, EXPORT_TYPES } from "@/types/thought-map";

const exportQuerySchema = z.object({
  exportType: z.enum(EXPORT_TYPES),
  format: z.enum(EXPORT_FORMATS),
  includeHistory: z.enum(["true", "false"]).default("true"),
  includePrivate: z.enum(["true", "false"]).default("false"),
  mapId: z.string().trim().min(1).optional(),
  claimId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
});

function exportHeaders(filename: string, contentType: string) {
  return {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "X-Export-Portability": EXPORT_PORTABILITY_GUARANTEE,
  };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const parsed = exportQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
    const now = new Date();
    const exportRequest = {
      id: randomUUID(),
      userId: id,
      exportType: parsed.exportType,
      format: parsed.format,
      includeHistory: parsed.includeHistory === "true",
      includePrivate: parsed.includePrivate === "true",
      requestedAt: now,
      completedAt: now,
      downloadUrl: url.toString(),
      expiresAt: null,
      mapId: parsed.mapId ?? null,
      claimId: parsed.claimId ?? null,
      sessionId: parsed.sessionId ?? null,
    };

    const bundle = await buildExportData({
      userId: id,
      exportType: parsed.exportType,
      includeHistory: exportRequest.includeHistory,
      includePrivate: exportRequest.includePrivate,
      mapId: exportRequest.mapId,
      claimId: exportRequest.claimId,
      sessionId: exportRequest.sessionId,
      exportRequest,
    });
    const payload = buildExportPayloadForType(bundle);
    const filename = buildExportFilename(
      exportRequest,
      parsed.format === "markdown" ? "md" : parsed.format,
      bundle.maps[0]?.map.title ?? bundle.request.exportType,
    );

    if (parsed.format === "json") {
      return NextResponse.json(payload, {
        status: 200,
        headers: exportHeaders(filename, "application/json"),
      });
    }

    return new NextResponse(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2), {
      status: 200,
      headers: exportHeaders(filename, parsed.format === "csv" ? "text/csv" : "text/markdown"),
    });
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
          message: error.message,
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
