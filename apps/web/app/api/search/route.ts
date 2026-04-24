import { and, desc, eq, ilike } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logBackendError } from "../../../lib/backend-error-logging";
import {
  RequestUserNotAuthenticatedError,
  getRequestUserId,
} from "../../../../../server/auth/get-request-user-id.ts";
import { getDb } from "../../../../../server/db/client.ts";
import { claims, maps, sessions, thoughts } from "../../../../../server/db/schema.ts";

type SearchResult = {
  id: string;
  type: "thought" | "map" | "claim" | "session";
  title: string;
  subtitle: string | null;
  confidence: number | null;
  href: string | null;
};

type RankedSearchResult = SearchResult & {
  sortAt: Date;
};

const MAX_RESULTS = 20;
const MAX_QUERY_LENGTH = 120;

function normalizeQuery(value: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function truncate(value: string, limit = 96) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3).trim()}...`;
}

function sessionTitle(id: string) {
  return `Session ${id.slice(0, 8)}`;
}

function confidenceBpsToPercent(value: number | null) {
  return typeof value === "number" ? Math.round(value / 100) : null;
}

async function searchWorkspace(input: { userId: string; query: string }) {
  if (!input.query) {
    return [];
  }

  const db = getDb();
  const pattern = `%${escapeLike(input.query)}%`;
  const [mapRows, claimRows, thoughtRows, sessionRows] = await Promise.all([
    db
      .select({
        id: maps.id,
        title: maps.title,
        createdAt: maps.createdAt,
      })
      .from(maps)
      .where(and(eq(maps.userId, input.userId), ilike(maps.title, pattern)))
      .orderBy(desc(maps.updatedAt), desc(maps.createdAt))
      .limit(6),
    db
      .select({
        id: claims.id,
        mapId: claims.mapId,
        body: claims.body,
        confidenceBps: claims.confidenceBps,
        updatedAt: claims.updatedAt,
      })
      .from(claims)
      .where(and(eq(claims.userId, input.userId), ilike(claims.body, pattern)))
      .orderBy(desc(claims.updatedAt), desc(claims.createdAt))
      .limit(8),
    db
      .select({
        id: thoughts.id,
        mapId: thoughts.mapId,
        rawText: thoughts.rawText,
        source: thoughts.source,
        updatedAt: thoughts.updatedAt,
      })
      .from(thoughts)
      .where(and(eq(thoughts.userId, input.userId), ilike(thoughts.rawText, pattern)))
      .orderBy(desc(thoughts.updatedAt), desc(thoughts.createdAt))
      .limit(8),
    db
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, input.userId))
      .orderBy(desc(sessions.createdAt), desc(sessions.id))
      .limit(20),
  ]);

  const normalizedQuery = input.query.toLowerCase();
  const results: RankedSearchResult[] = [
    ...mapRows.map((row) => ({
      id: row.id,
      type: "map" as const,
      title: row.title,
      subtitle: "Map",
      confidence: null,
      href: `/workspace?mapId=${row.id}`,
      sortAt: row.createdAt,
    })),
    ...claimRows.map((row) => ({
      id: row.id,
      type: "claim" as const,
      title: truncate(row.body),
      subtitle: "Claim",
      confidence: confidenceBpsToPercent(row.confidenceBps),
      href: `/workspace?mapId=${row.mapId}&claimId=${row.id}`,
      sortAt: row.updatedAt,
    })),
    ...thoughtRows.map((row) => ({
      id: row.id,
      type: "thought" as const,
      title: truncate(row.rawText),
      subtitle: row.source ? `Thought from ${row.source}` : "Thought",
      confidence: null,
      href: row.mapId ? `/workspace?mapId=${row.mapId}` : null,
      sortAt: row.updatedAt,
    })),
    ...sessionRows
      .filter((row) => row.id.toLowerCase().includes(normalizedQuery))
      .map((row) => ({
        id: row.id,
        type: "session" as const,
        title: sessionTitle(row.id),
        subtitle: `Expires ${row.expiresAt.toISOString()}`,
        confidence: null,
        href: null,
        sortAt: row.createdAt,
      })),
  ];

  const sortedResults: RankedSearchResult[] = [...results].sort(
    (left, right) => right.sortAt.getTime() - left.sortAt.getTime(),
  );

  return sortedResults.slice(0, MAX_RESULTS).map((rankedResult) => {
    const { sortAt, ...result } = rankedResult;
    void sortAt;
    return result;
  });
}

export async function GET(request: Request) {
  try {
    const userId = getRequestUserId(request.headers);
    const { searchParams } = new URL(request.url);
    const results = await searchWorkspace({
      userId,
      query: normalizeQuery(searchParams.get("q")),
    });

    return NextResponse.json({ results }, { status: 200 });
  } catch (error) {
    if (error instanceof RequestUserNotAuthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logBackendError({ error, request, route: "GET /api/search" });
    return NextResponse.json({ error: "Failed to search workspace." }, { status: 500 });
  }
}
