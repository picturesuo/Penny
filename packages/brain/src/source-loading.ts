import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { PennyDatabase } from "./db/client.ts";
import { sources, sourceSpans } from "./db/schema.ts";
import { scopeValues, type BrainScope, type BrainScopeInput, type OptionalBrainScope } from "./scope.ts";

type SourceRow = OptionalBrainScope<typeof sources.$inferSelect>;
type SourceSpanRow = typeof sourceSpans.$inferSelect;
type SelectDb = Pick<PennyDatabase, "select">;
type ScopeColumn = AnyPgColumn;
type ScopeTable = {
  userId: ScopeColumn;
  workspaceId: ScopeColumn;
  projectId: ScopeColumn;
  sphereId: ScopeColumn;
};

export async function loadScopedSourcesForSession(
  db: SelectDb,
  session: { id: string } & BrainScopeInput,
): Promise<SourceRow[]> {
  return loadScopedSourcesForSessionIds(db, [session.id], session);
}

export async function loadScopedSourcesForSessionIds(
  db: SelectDb,
  sessionIds: readonly string[],
  scopeInput: BrainScopeInput,
): Promise<SourceRow[]> {
  const uniqueSessionIds = uniqueStrings(sessionIds);

  if (uniqueSessionIds.length === 0) {
    return [];
  }

  const scope = scopeValues(scopeInput);
  const rows = await db
    .select()
    .from(sources)
    .where(and(inArray(sources.sessionId, uniqueSessionIds), sourceScopeCondition(scope)))
    .orderBy(asc(sources.createdAt));

  return rows.filter((source) => sourceInScope(source, scope));
}

export async function loadScopedSourcesByIds(
  db: SelectDb,
  sourceIds: readonly string[],
  scopeInput: BrainScopeInput,
): Promise<SourceRow[]> {
  const uniqueSourceIds = uniqueStrings(sourceIds);

  if (uniqueSourceIds.length === 0) {
    return [];
  }

  const scope = scopeValues(scopeInput);
  const rows = await db
    .select()
    .from(sources)
    .where(and(inArray(sources.id, uniqueSourceIds), sourceScopeCondition(scope)))
    .orderBy(asc(sources.createdAt));

  return rows.filter((source) => sourceInScope(source, scope));
}

export async function loadSourceSpansForSourceIds(db: SelectDb, sourceIds: readonly string[]): Promise<SourceSpanRow[]> {
  const uniqueSourceIds = uniqueStrings(sourceIds);

  if (uniqueSourceIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(sourceSpans)
    .where(inArray(sourceSpans.sourceId, uniqueSourceIds))
    .orderBy(asc(sourceSpans.createdAt));
}

export function sourceInScope(source: BrainScopeInput, scopeInput: BrainScopeInput): boolean {
  const sourceScope = scopeValues(source);
  const scope = scopeValues(scopeInput);

  return (
    sourceScope.userId === scope.userId &&
    sourceScope.workspaceId === scope.workspaceId &&
    sourceScope.projectId === scope.projectId &&
    sourceScope.sphereId === scope.sphereId
  );
}

export function filterSourceSpansToSources<T extends { sourceId: string }>(spans: T[], sourceRows: readonly SourceRow[]): T[] {
  const sourceIds = new Set(sourceRows.map((source) => source.id));

  return spans.filter((span) => sourceIds.has(span.sourceId));
}

function sourceScopeCondition(scope: BrainScope) {
  return and(
    scopeColumnCondition(sources.userId, scope.userId),
    scopeColumnCondition(sources.workspaceId, scope.workspaceId),
    scopeColumnCondition(sources.projectId, scope.projectId),
    scopeColumnCondition(sources.sphereId, scope.sphereId),
  );
}

function scopeColumnCondition(column: ScopeColumn, value: string | null) {
  return value === null ? isNull(column) : eq(column, value);
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}
