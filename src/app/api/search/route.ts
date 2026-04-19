import { NextResponse } from "next/server";
import { z } from "zod";
import { globalSearch } from "@/lib/search";
import { getRequestUserId, normalizeError, reportError } from "@/lib/error-reporting";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import type { SearchFilters } from "@/types/search";

const searchFiltersSchema = z.object({
  entityTypes: z.array(z.enum(["claim", "map", "artifact", "lesson", "session", "shape"])).default([]),
  domains: z.array(z.string().trim().min(1)).default([]),
  confidenceRange: z.tuple([z.number(), z.number()]).nullable().optional().default(null),
  dateRange: z
    .tuple([z.string(), z.string()])
    .nullable()
    .optional()
    .default(null),
  status: z.array(z.string().trim().min(1)).default([]),
  hasDialecticRounds: z.boolean().nullable().optional().default(null),
  hasResolutionDate: z.boolean().nullable().optional().default(null),
  stakeLevel: z.array(z.string().trim().min(1)).default([]),
});

const searchSchema = z.object({
  query: z.string().trim().default(""),
  userId: z.string().trim().min(1).optional(),
  requestedAt: z.string().datetime().optional(),
  filters: searchFiltersSchema.partial().optional().default({}),
});

function normalizeFilters(filters: z.infer<typeof searchFiltersSchema>): SearchFilters {
  return {
    entityTypes: filters.entityTypes,
    domains: filters.domains,
    confidenceRange: filters.confidenceRange,
    dateRange:
      filters.dateRange == null
        ? null
        : [new Date(filters.dateRange[0]), new Date(filters.dateRange[1])],
    status: filters.status,
    hasDialecticRounds: filters.hasDialecticRounds,
    hasResolutionDate: filters.hasResolutionDate,
    stakeLevel: filters.stakeLevel,
  };
}

export async function POST(request: Request) {
  try {
    const input = searchSchema.parse(await request.json());
    const userId = await getCurrentAuthenticatedUserId();
    const response = await globalSearch({
      query: input.query,
      userId: input.userId ?? userId,
      requestedAt: input.requestedAt ? new Date(input.requestedAt) : new Date(),
      filters: normalizeFilters({
        entityTypes: input.filters.entityTypes ?? [],
        domains: input.filters.domains ?? [],
        confidenceRange: input.filters.confidenceRange ?? null,
        dateRange: input.filters.dateRange ?? null,
        status: input.filters.status ?? [],
        hasDialecticRounds: input.filters.hasDialecticRounds ?? null,
        hasResolutionDate: input.filters.hasResolutionDate ?? null,
        stakeLevel: input.filters.stakeLevel ?? [],
      }),
    });

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request", details: error.flatten() }, { status: 400 });
    }

    reportError(normalizeError(error), {
      userId: getRequestUserId({ path: new URL(request.url).pathname, headers: request.headers }),
      requestPath: request.url,
      requestMethod: request.method,
      featureId: "search-route",
    });

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
