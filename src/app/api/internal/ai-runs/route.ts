import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { listInternalAiRuns, parseInternalAiRunFilters } from "@/server/internal-ai-runs";
import type { InternalAiRunsResponse } from "@/types/ai-runs";

export const dynamic = "force-dynamic";

const INTERNAL_ADMIN_API_KEY_ENV = "PENNY_INTERNAL_ADMIN_API_KEY";
const INTERNAL_ADMIN_HEADER = "x-penny-internal-admin-key";
const cacheHeaders = {
  "Cache-Control": "no-store",
};

export async function GET(request: NextRequest) {
  const authFailure = validateInternalAdminRequest(request);

  if (authFailure) {
    return NextResponse.json(authFailure.body, {
      status: authFailure.status,
      headers: cacheHeaders,
    });
  }

  try {
    const filters = parseInternalAiRunFilters(request.nextUrl.searchParams);
    const response: InternalAiRunsResponse = await listInternalAiRuns(filters);

    return NextResponse.json(response, {
      status: 200,
      headers: cacheHeaders,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "invalid_request",
          details: error.flatten(),
        },
        {
          status: 400,
          headers: cacheHeaders,
        },
      );
    }

    logger.error("internal_ai_runs_failed", {
      featureId: "internal_ai_runs",
      error: error instanceof Error ? error.message : "Unknown error",
      data: {
        path: request.nextUrl.pathname,
      },
    });

    return NextResponse.json(
      {
        error: "internal_error",
      },
      {
        status: 500,
        headers: cacheHeaders,
      },
    );
  }
}

function validateInternalAdminRequest(request: NextRequest) {
  const configuredKey = process.env[INTERNAL_ADMIN_API_KEY_ENV];

  if (!configuredKey) {
    logger.warn("internal_ai_runs_not_configured", {
      featureId: "internal_ai_runs",
      data: {
        envVar: INTERNAL_ADMIN_API_KEY_ENV,
      },
    });

    return {
      status: 503,
      body: {
        error: "internal_admin_api_not_configured",
      },
    };
  }

  const suppliedKey = request.headers.get(INTERNAL_ADMIN_HEADER) ?? extractBearerToken(request.headers.get("authorization"));

  if (suppliedKey !== configuredKey) {
    logger.warn("internal_ai_runs_unauthorized", {
      featureId: "internal_ai_runs",
      data: {
        path: request.nextUrl.pathname,
      },
    });

    return {
      status: 401,
      body: {
        error: "unauthorized",
      },
    };
  }

  return null;
}

function extractBearerToken(value: string | null) {
  if (!value?.startsWith("Bearer ")) {
    return null;
  }

  const token = value.slice("Bearer ".length).trim();
  return token.length ? token : null;
}
