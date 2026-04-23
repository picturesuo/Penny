import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { normalizeError, reportError } from "@/lib/error-reporting";
import { checkRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { getCurrentAuthenticatedUserId } from "@/server/auth";

export const WorkspaceViewSchema = z.enum(["shell", "brain", "challenge", "learn"]);
export const WorkspaceCommandSchema = z.enum([
  "create-claim",
  "update-workspace-selection",
  "start-challenge",
  "respond-to-challenge",
  "submit-teachback",
]);
export const WorkspaceProjectionQuerySchema = z.object({
  workspaceContextId: z.string().uuid("Invalid workspaceContextId.").nullable().optional().default(null),
  contextKey: z.string().trim().min(1).max(160).nullable().optional().default(null),
  mapId: z.string().uuid("Invalid mapId.").nullable().optional().default(null),
  mode: z.enum(["brain", "challenge", "learn"]).nullable().optional().default(null),
});

const JsonObjectSchema = z.record(z.string(), z.unknown());

type RouteErrorShape = {
  body: Record<string, unknown>;
  report: boolean;
  status: number;
};

export async function getAuthenticatedRouteUserId() {
  return getCurrentAuthenticatedUserId();
}

export function checkWorkspaceRouteRateLimit(userId: string) {
  return checkRateLimit(userId, "api_general");
}

export function buildRateLimitJsonResponse(rateLimit: ReturnType<typeof checkWorkspaceRouteRateLimit>) {
  return NextResponse.json(
    {
      error: "rate_limited",
      retryAfterSeconds: Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
      resetAt: new Date(rateLimit.resetAt).toISOString(),
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
      },
    },
  );
}

export function parseWorkspaceProjectionInput(request: NextRequest, mode: "shell" | "brain" | "challenge" | "learn") {
  const searchParams = request.nextUrl.searchParams;
  const parsed = WorkspaceProjectionQuerySchema.parse({
    workspaceContextId: searchParams.get("workspaceContextId") ?? undefined,
    contextKey: searchParams.get("contextKey") ?? undefined,
    mapId: searchParams.get("mapId") ?? undefined,
    mode: mode === "shell" ? searchParams.get("mode") ?? undefined : mode,
  });

  return parsed;
}

export async function parseJsonObjectBody(request: Request) {
  const parsed = JsonObjectSchema.parse(await request.json());
  return parsed;
}

export function withUserId<T extends Record<string, unknown>>(body: T, userId: string) {
  return {
    ...body,
    userId,
  };
}

export function createWorkspaceReadResponse(
  view: z.infer<typeof WorkspaceViewSchema>,
  payload: unknown,
) {
  return NextResponse.json({ [view]: payload }, { status: 200 });
}

export function createWorkspaceCommandResponse(
  name: string,
  payload: Record<string, unknown>,
  status: number,
) {
  return NextResponse.json({ [name]: payload }, { status });
}

export function createRouteErrorResponse(
  error: unknown,
  request: Request,
  options: {
    featureId: string;
    userId?: string;
    logMessage: string;
  },
) {
  const normalized = normalizeError(error);
  const routeError = classifyRouteError(error, normalized);

  if (routeError.status >= 500 && routeError.report) {
    reportError(normalized, {
      userId: options.userId,
      requestPath: request.url,
      requestMethod: request.method,
      featureId: options.featureId,
    });
  } else {
    logger.warn(options.logMessage, {
      userId: options.userId,
      featureId: options.featureId,
      error: normalized.message,
    });
  }

  return NextResponse.json(routeError.body, { status: routeError.status });
}

function classifyRouteError(error: unknown, normalized: Error): RouteErrorShape {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      report: false,
      body: {
        error: "invalid_request",
        details: error.flatten(),
      },
    };
  }

  if (error instanceof SyntaxError) {
    return {
      status: 400,
      report: false,
      body: {
        error: "invalid_request",
        message: "Request body must be valid JSON.",
      },
    };
  }

  if (/not found/i.test(normalized.message)) {
    return {
      status: 404,
      report: false,
      body: {
        error: "not_found",
        message: normalized.message,
      },
    };
  }

  if (/does not belong|invalid uuid|invalid mapid|invalid workspacecontextid|request body must be valid json/i.test(normalized.message)) {
    return {
      status: 400,
      report: false,
      body: {
        error: "invalid_request",
        message: normalized.message,
      },
    };
  }

  return {
    status: 500,
    report: true,
    body: {
      error: "internal_error",
    },
  };
}
