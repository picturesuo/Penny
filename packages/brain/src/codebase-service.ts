import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, posix, resolve } from "node:path";
import { promisify } from "node:util";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { PennyDatabase } from "./db/client.ts";
import {
  codeChunks,
  codeDocs,
  codeFiles,
  codeFindings,
  codeImports,
  codeMemoryNotes,
  codeRoutes,
  codeSymbols,
  codeTests,
  codebaseScanRuns,
} from "./db/schema.ts";
import { scopeValues, type BrainScope } from "./scope.ts";

const execFileAsync = promisify(execFile);
const defaultMaxFileBytes = 900_000;
const maxChunkChars = 10_000;

export type CodeSourceKind =
  | "backend_source"
  | "frontend_source"
  | "test"
  | "doc"
  | "memory_note"
  | "config"
  | "script"
  | "migration"
  | "schema"
  | "package"
  | "style"
  | "unknown";

export type CodeChunkKind =
  | "file"
  | "imports"
  | "exports"
  | "function"
  | "class"
  | "component"
  | "route"
  | "test"
  | "docs_section"
  | "schema"
  | "css_section"
  | "memory_note";

export type CodeSymbolKind =
  | "function"
  | "class"
  | "component"
  | "type"
  | "interface"
  | "constant"
  | "table"
  | "route_handler";

export type CodeFileKnowledge = {
  id: string;
  path: string;
  hash: string;
  previousHash: string | null;
  size: number;
  language: string;
  sourceKind: CodeSourceKind;
  lineCount: number;
  lastModifiedAt: string | null;
  indexedAt: string;
  content: string;
};

export type CodeChunk = {
  id: string;
  fileId: string;
  path: string;
  hash: string;
  fileHash: string;
  size: number;
  language: string;
  sourceKind: CodeSourceKind;
  chunkIndex: number;
  kind: CodeChunkKind;
  title: string;
  text: string;
  charStart: number;
  charEnd: number;
  lineStart: number;
  lineEnd: number;
  tokenEstimate: number;
  symbolNames: string[];
  metadata: Record<string, unknown>;
};

export type CodeSymbol = {
  id: string;
  fileId: string;
  chunkId: string | null;
  path: string;
  hash: string;
  size: number;
  language: string;
  sourceKind: CodeSourceKind;
  name: string;
  kind: CodeSymbolKind;
  exported: boolean;
  signature: string | null;
  lineStart: number;
  lineEnd: number;
  metadata: Record<string, unknown>;
};

export type CodeImport = {
  id: string;
  fileId: string;
  path: string;
  hash: string;
  size: number;
  language: string;
  sourceKind: CodeSourceKind;
  importSource: string;
  importedPath: string | null;
  specifiers: string[];
  importKind: "static" | "side_effect" | "dynamic" | "require";
  lineStart: number;
  metadata: Record<string, unknown>;
};

export type CodeRoute = {
  id: string;
  fileId: string;
  chunkId: string | null;
  path: string;
  hash: string;
  size: number;
  language: string;
  sourceKind: CodeSourceKind;
  method: string;
  routePath: string;
  handler: string | null;
  lineStart: number;
  metadata: Record<string, unknown>;
};

export type CodeTest = {
  id: string;
  fileId: string;
  chunkId: string | null;
  path: string;
  hash: string;
  size: number;
  language: string;
  sourceKind: CodeSourceKind;
  name: string;
  testKind: string;
  subjectPath: string | null;
  lineStart: number;
  metadata: Record<string, unknown>;
};

export type CodeDoc = {
  id: string;
  fileId: string;
  chunkId: string | null;
  path: string;
  hash: string;
  size: number;
  language: string;
  sourceKind: CodeSourceKind;
  title: string;
  section: string | null;
  references: string[];
  lineStart: number;
  lineEnd: number;
  metadata: Record<string, unknown>;
};

export type CodeFinding = {
  id: string;
  path: string | null;
  hash: string | null;
  size: number;
  language: string;
  sourceKind: CodeSourceKind | "unknown";
  severity: "info" | "warning" | "error";
  kind: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
};

export type CodeMemoryNote = {
  id: string;
  fileId: string | null;
  chunkId: string | null;
  path: string;
  hash: string;
  size: number;
  language: string;
  sourceKind: CodeSourceKind;
  title: string;
  noteKind: string;
  text: string;
  metadata: Record<string, unknown>;
};

export type CodebaseIndex = {
  repoRoot: string;
  gitCommit: string | null;
  scannedAt: string;
  files: CodeFileKnowledge[];
  chunks: CodeChunk[];
  symbols: CodeSymbol[];
  imports: CodeImport[];
  routes: CodeRoute[];
  tests: CodeTest[];
  docs: CodeDoc[];
  findings: CodeFinding[];
  memoryNotes: CodeMemoryNote[];
  excluded: Array<{ path: string; reason: string }>;
  changedFiles: Array<{ path: string; previousHash: string; hash: string }>;
  staleFiles: string[];
};

export type CodebaseScanSummary = {
  scanId: string;
  repoRoot: string;
  gitCommit: string | null;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  fileCount: number;
  chunkCount: number;
  symbolCount: number;
  importCount: number;
  routeCount: number;
  testCount: number;
  docCount: number;
  findingCount: number;
  memoryNoteCount: number;
  changedFileCount: number;
  staleFileCount: number;
  excludedCount: number;
};

export type CodebaseScanDetail = CodebaseScanSummary & {
  changedFiles: Array<{ path: string; previousHash: string; hash: string }>;
  staleFiles: string[];
  files: Array<{
    path: string;
    hash: string;
    previousHash: string | null;
    size: number;
    language: string;
    sourceKind: CodeSourceKind;
    chunkCount: number;
    symbolCount: number;
    routeCount: number;
    testCount: number;
    docCount: number;
  }>;
};

export type CodebaseSearchFilters = {
  pathPrefix?: string;
  sourceKinds?: CodeSourceKind[];
  languages?: string[];
  chunkKinds?: CodeChunkKind[];
};

export type CodebaseSearchInput = {
  scope: BrainScope;
  query: string;
  limit?: number;
  filters?: CodebaseSearchFilters;
  includeDependencies?: boolean;
};

export type CodebaseSearchResult = {
  chunkId: string;
  fileId: string;
  path: string;
  title: string;
  chunkKind: CodeChunkKind;
  language: string;
  sourceKind: CodeSourceKind;
  lineStart: number;
  lineEnd: number;
  score: number;
  reasons: string[];
  snippet: string;
  symbols: string[];
  routes: Array<{ method: string; routePath: string }>;
  tests: Array<{ name: string; subjectPath: string | null }>;
  docs: Array<{ title: string; references: string[] }>;
};

export type CodebaseContextInput = CodebaseSearchInput & {
  task?: string;
  maxChunks?: number;
  maxChars?: number;
};

export type CodebaseContextPayload = {
  sourceOfTruth: "codebase_db_index";
  query: string;
  strategy: "bm25_dependency_adjacency";
  summary: {
    fileCount: number;
    chunkCount: number;
    totalChars: number;
    omittedCount: number;
  };
  files: Array<{
    path: string;
    language: string;
    sourceKind: CodeSourceKind;
    hash: string;
    reason: string;
  }>;
  chunks: Array<{
    id: string;
    path: string;
    title: string;
    chunkKind: CodeChunkKind;
    lineStart: number;
    lineEnd: number;
    text: string;
    reasons: string[];
  }>;
  routes: CodeRoute[];
  tests: CodeTest[];
  docs: CodeDoc[];
};

export type CodebaseAuditPayload = {
  sourceOfTruth: "codebase_db_index";
  latestScan: CodebaseScanSummary | null;
  staleFiles: string[];
  changedFiles: Array<{ path: string; previousHash: string; hash: string }>;
  topFindings: CodeFinding[];
};

export type CodebaseIngestInput = {
  scope: BrainScope;
  repoRoot?: string;
  maxFileBytes?: number;
};

export interface CodebaseMemoryRepository {
  ingest(input: CodebaseIngestInput): Promise<CodebaseScanDetail>;
  getScan(scope: BrainScope, scanId: string): Promise<CodebaseScanDetail | null>;
  latestSummary(scope: BrainScope): Promise<CodebaseScanSummary | null>;
  search(input: CodebaseSearchInput): Promise<CodebaseSearchResult[]>;
  context(input: CodebaseContextInput): Promise<CodebaseContextPayload>;
  audit(scope: BrainScope): Promise<CodebaseAuditPayload>;
}

export async function scanTrackedRepo(input: {
  repoRoot?: string;
  previousHashes?: Map<string, string>;
  maxFileBytes?: number;
  now?: Date;
} = {}): Promise<CodebaseIndex> {
  const repoRoot = resolve(input.repoRoot ?? process.cwd());
  const previousHashes = input.previousHashes ?? new Map<string, string>();
  const now = input.now ?? new Date();
  const indexedAt = now.toISOString();
  const trackedPaths = await listTrackedFiles(repoRoot);
  const gitCommit = await currentGitCommit(repoRoot);
  const files: CodeFileKnowledge[] = [];
  const chunks: CodeChunk[] = [];
  const symbols: CodeSymbol[] = [];
  const imports: CodeImport[] = [];
  const routes: CodeRoute[] = [];
  const tests: CodeTest[] = [];
  const docs: CodeDoc[] = [];
  const findings: CodeFinding[] = [];
  const memoryNotes: CodeMemoryNote[] = [];
  const excluded: Array<{ path: string; reason: string }> = [];
  const maxFileBytes = input.maxFileBytes ?? defaultMaxFileBytes;

  for (const filePath of trackedPaths) {
    const normalizedPath = normalizeRepoPath(filePath);
    const includeReason = includePathReason(normalizedPath);

    if (!includeReason) {
      excluded.push({ path: normalizedPath, reason: "outside_codebase_brain_scope" });
      continue;
    }

    const excludedReason = excludedPathReason(normalizedPath);

    if (excludedReason) {
      excluded.push({ path: normalizedPath, reason: excludedReason });
      continue;
    }

    const absolutePath = resolve(repoRoot, normalizedPath);
    const fileStat = await stat(absolutePath);

    if (fileStat.size > maxFileBytes) {
      excluded.push({ path: normalizedPath, reason: "too_large" });
      continue;
    }

    const buffer = await readFile(absolutePath);

    if (looksBinary(buffer, normalizedPath)) {
      excluded.push({ path: normalizedPath, reason: "binary_or_generated_asset" });
      continue;
    }

    const content = buffer.toString("utf8");
    const hash = hashText(content);
    const language = languageForPath(normalizedPath);
    const sourceKind = sourceKindForPath(normalizedPath);
    const fileId = entityId("code_file", normalizedPath);
    const file: CodeFileKnowledge = {
      id: fileId,
      path: normalizedPath,
      hash,
      previousHash: previousHashes.get(normalizedPath) ?? null,
      size: buffer.byteLength,
      language,
      sourceKind,
      lineCount: lineCount(content),
      lastModifiedAt: fileStat.mtime.toISOString(),
      indexedAt,
      content,
    };
    const extracted = extractFileKnowledge(file);

    files.push(file);
    chunks.push(...extracted.chunks);
    symbols.push(...extracted.symbols);
    imports.push(...extracted.imports);
    routes.push(...extracted.routes);
    tests.push(...extracted.tests);
    docs.push(...extracted.docs);
    memoryNotes.push(...extracted.memoryNotes);
  }

  const pathSet = new Set(files.map((file) => file.path));
  const changedFiles = files
    .filter((file) => file.previousHash !== null && file.previousHash !== file.hash)
    .map((file) => ({ path: file.path, previousHash: file.previousHash ?? "", hash: file.hash }));
  const staleFiles = [...previousHashes.keys()].filter((filePath) => !pathSet.has(filePath));

  resolveImportTargets(imports, pathSet);

  for (const changed of changedFiles) {
    findings.push({
      id: entityId("code_finding", "changed", changed.path, changed.hash),
      path: changed.path,
      hash: changed.hash,
      size: files.find((file) => file.path === changed.path)?.size ?? 0,
      language: files.find((file) => file.path === changed.path)?.language ?? "unknown",
      sourceKind: files.find((file) => file.path === changed.path)?.sourceKind ?? "unknown",
      severity: "info",
      kind: "changed_file",
      title: "File changed since last scan",
      message: `${changed.path} has a new content hash.`,
      metadata: { previousHash: changed.previousHash, hash: changed.hash },
    });
  }

  for (const stale of staleFiles) {
    findings.push({
      id: entityId("code_finding", "stale", stale),
      path: stale,
      hash: null,
      size: 0,
      language: "unknown",
      sourceKind: "unknown",
      severity: "warning",
      kind: "stale_file",
      title: "Previously indexed file is stale",
      message: `${stale} was indexed previously but is not in the current tracked source set.`,
      metadata: {},
    });
  }

  return {
    repoRoot,
    gitCommit,
    scannedAt: indexedAt,
    files,
    chunks,
    symbols,
    imports,
    routes,
    tests,
    docs,
    findings,
    memoryNotes,
    excluded,
    changedFiles,
    staleFiles,
  };
}

export function searchCodebaseIndex(index: CodebaseIndex, input: Omit<CodebaseSearchInput, "scope">): CodebaseSearchResult[] {
  const limit = clampLimit(input.limit, 10, 50);
  const query = compactText(input.query);
  const queryTerms = uniqueTerms(query);

  if (queryTerms.length === 0) {
    return [];
  }

  const filteredChunks = index.chunks.filter((chunk) => chunkMatchesFilters(chunk, input.filters));

  if (filteredChunks.length === 0) {
    return [];
  }

  const termDocCounts = new Map<string, number>();
  for (const term of queryTerms) {
    termDocCounts.set(term, filteredChunks.filter((chunk) => searchableChunkText(chunk).includes(term)).length);
  }

  const averageLength =
    filteredChunks.reduce((total, chunk) => total + Math.max(tokenize(searchableChunkText(chunk)).length, 1), 0) /
    filteredChunks.length;
  const results = filteredChunks
    .map((chunk) => scoreChunk(chunk, index, query, queryTerms, termDocCounts, averageLength, filteredChunks.length))
    .filter((result): result is CodebaseSearchResult => result !== null)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);

  if (!input.includeDependencies) {
    return results;
  }

  return withDependencyAdjacency(index, results, limit);
}

export function buildCodebaseContext(index: CodebaseIndex, input: Omit<CodebaseContextInput, "scope">): CodebaseContextPayload {
  const query = compactText(input.task || input.query);
  const maxChunks = clampLimit(input.maxChunks, 8, 20);
  const maxChars = Math.max(2_000, Math.min(input.maxChars ?? 28_000, 60_000));
  const results = searchCodebaseIndex(index, {
    ...input,
    query,
    limit: Math.max(maxChunks, 12),
    includeDependencies: true,
  });
  const selected: CodebaseSearchResult[] = [];
  let totalChars = 0;

  for (const result of results) {
    const chunk = index.chunks.find((candidate) => candidate.id === result.chunkId);

    if (!chunk) {
      continue;
    }

    const nextSize = totalChars + chunk.text.length;

    if (selected.length >= maxChunks || nextSize > maxChars) {
      continue;
    }

    selected.push(result);
    totalChars = nextSize;
  }

  const fileReasons = new Map<string, string>();
  for (const result of selected) {
    fileReasons.set(result.path, result.reasons[0] ?? "ranked context match");
  }

  const selectedChunks = selected
    .map((result) => {
      const chunk = index.chunks.find((candidate) => candidate.id === result.chunkId);

      if (!chunk) {
        return null;
      }

      return {
        id: chunk.id,
        path: chunk.path,
        title: chunk.title,
        chunkKind: chunk.kind,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        text: chunk.text,
        reasons: result.reasons,
      };
    })
    .filter((chunk): chunk is NonNullable<typeof chunk> => chunk !== null);
  const selectedPaths = new Set(selectedChunks.map((chunk) => chunk.path));

  return {
    sourceOfTruth: "codebase_db_index",
    query,
    strategy: "bm25_dependency_adjacency",
    summary: {
      fileCount: selectedPaths.size,
      chunkCount: selectedChunks.length,
      totalChars,
      omittedCount: Math.max(0, results.length - selectedChunks.length),
    },
    files: index.files
      .filter((file) => selectedPaths.has(file.path))
      .map((file) => ({
        path: file.path,
        language: file.language,
        sourceKind: file.sourceKind,
        hash: file.hash,
        reason: fileReasons.get(file.path) ?? "selected by context planner",
      })),
    chunks: selectedChunks,
    routes: index.routes.filter((route) => selectedPaths.has(route.path)),
    tests: index.tests.filter((test) => selectedPaths.has(test.path) || (test.subjectPath !== null && selectedPaths.has(test.subjectPath))),
    docs: index.docs.filter(
      (doc) => selectedPaths.has(doc.path) || doc.references.some((reference) => selectedPaths.has(reference)),
    ),
  };
}

export class DrizzleCodebaseMemoryRepository implements CodebaseMemoryRepository {
  constructor(
    private readonly db: PennyDatabase,
    private readonly repoRoot = process.cwd(),
  ) {}

  async ingest(input: CodebaseIngestInput): Promise<CodebaseScanDetail> {
    const scope = scopeValues(input.scope);
    const priorFiles = await this.loadCurrentFiles(scope);
    const previousHashes = new Map(priorFiles.map((file) => [file.path, file.hash]));
    const scanInput: {
      repoRoot: string;
      previousHashes: Map<string, string>;
      maxFileBytes?: number;
    } = {
      repoRoot: input.repoRoot ?? this.repoRoot,
      previousHashes,
    };

    if (input.maxFileBytes !== undefined) {
      scanInput.maxFileBytes = input.maxFileBytes;
    }

    const index = await scanTrackedRepo(scanInput);
    const scanId = randomUUID();
    const startedAt = new Date(index.scannedAt);
    const completedAt = new Date();

    await this.db.insert(codebaseScanRuns).values({
      id: scanId,
      ...scope,
      repoRoot: index.repoRoot,
      gitCommit: index.gitCommit,
      status: "running",
      startedAt,
      createdAt: startedAt,
      updatedAt: startedAt,
    });

    await this.replaceScopeIndex(scope, scanId, index);

    await this.db
      .update(codebaseScanRuns)
      .set({
        status: "completed",
        completedAt,
        updatedAt: completedAt,
        fileCount: index.files.length,
        chunkCount: index.chunks.length,
        symbolCount: index.symbols.length,
        importCount: index.imports.length,
        routeCount: index.routes.length,
        testCount: index.tests.length,
        docCount: index.docs.length,
        findingCount: index.findings.length,
        memoryNoteCount: index.memoryNotes.length,
        changedFileCount: index.changedFiles.length,
        staleFileCount: index.staleFiles.length,
        excludedCount: index.excluded.length,
      })
      .where(eq(codebaseScanRuns.id, scanId));

    const detail = await this.getScan(scope, scanId);

    if (!detail) {
      throw new Error(`Codebase scan ${scanId} was written but could not be read back.`);
    }

    return detail;
  }

  async getScan(scope: BrainScope, scanId: string): Promise<CodebaseScanDetail | null> {
    const [run] = await this.db
      .select()
      .from(codebaseScanRuns)
      .where(and(eq(codebaseScanRuns.id, scanId), scopeWhere(codebaseScanRuns, scopeValues(scope))))
      .limit(1);

    if (!run) {
      return null;
    }

    const rows = await this.db
      .select()
      .from(codeFiles)
      .where(and(eq(codeFiles.scanRunId, scanId), scopeWhere(codeFiles, scopeValues(scope))));
    const findings = await this.db
      .select()
      .from(codeFindings)
      .where(and(eq(codeFindings.scanRunId, scanId), scopeWhere(codeFindings, scopeValues(scope))));

    return {
      ...scanSummaryFromRun(run),
      changedFiles: rows
        .filter((row) => row.previousHash !== null && row.previousHash !== row.hash)
        .map((row) => ({ path: row.path, previousHash: row.previousHash ?? "", hash: row.hash })),
      staleFiles: findings.filter((finding) => finding.kind === "stale_file" && finding.path !== null).map((finding) => finding.path ?? ""),
      files: rows
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((row) => ({
          path: row.path,
          hash: row.hash,
          previousHash: row.previousHash,
          size: row.size,
          language: row.language,
          sourceKind: row.sourceKind as CodeSourceKind,
          chunkCount: row.chunkCount,
          symbolCount: row.symbolCount,
          routeCount: row.routeCount,
          testCount: row.testCount,
          docCount: row.docCount,
        })),
    };
  }

  async latestSummary(scope: BrainScope): Promise<CodebaseScanSummary | null> {
    const run = await this.latestRun(scope);

    return run ? scanSummaryFromRun(run) : null;
  }

  async search(input: CodebaseSearchInput): Promise<CodebaseSearchResult[]> {
    const index = await this.loadIndex(input.scope);

    if (!index) {
      return [];
    }

    return searchCodebaseIndex(index, input);
  }

  async context(input: CodebaseContextInput): Promise<CodebaseContextPayload> {
    const index = await this.loadIndex(input.scope);

    if (!index) {
      return emptyContext(input.task || input.query);
    }

    return buildCodebaseContext(index, input);
  }

  async audit(scope: BrainScope): Promise<CodebaseAuditPayload> {
    const normalizedScope = scopeValues(scope);
    const latestScan = await this.latestSummary(normalizedScope);

    if (!latestScan) {
      return {
        sourceOfTruth: "codebase_db_index",
        latestScan: null,
        staleFiles: [],
        changedFiles: [],
        topFindings: [],
      };
    }

    const detail = await this.getScan(normalizedScope, latestScan.scanId);
    const findingRows = await this.db
      .select()
      .from(codeFindings)
      .where(and(eq(codeFindings.scanRunId, latestScan.scanId), scopeWhere(codeFindings, normalizedScope)))
      .limit(20);

    return {
      sourceOfTruth: "codebase_db_index",
      latestScan,
      staleFiles: detail?.staleFiles ?? [],
      changedFiles: detail?.changedFiles ?? [],
      topFindings: findingRows.map((row) => ({
        id: row.id,
        path: row.path,
        hash: row.hash,
        size: row.size,
        language: row.language,
        sourceKind: row.sourceKind as CodeSourceKind,
        severity: row.severity as CodeFinding["severity"],
        kind: row.kind,
        title: row.title,
        message: row.message,
        metadata: objectMetadata(row.metadata),
      })),
    };
  }

  private async replaceScopeIndex(scope: BrainScope, scanId: string, index: CodebaseIndex): Promise<void> {
    await this.db.delete(codeMemoryNotes).where(scopeWhere(codeMemoryNotes, scope));
    await this.db.delete(codeFindings).where(scopeWhere(codeFindings, scope));
    await this.db.delete(codeFiles).where(scopeWhere(codeFiles, scope));

    const fileIdByPath = new Map(index.files.map((file) => [file.path, scopedEntityId("code_file", scope, file.path)]));
    const chunkIdById = new Map(index.chunks.map((chunk) => [chunk.id, scopedEntityId("code_chunk", scope, chunk.path, String(chunk.chunkIndex), chunk.hash)]));

    const fileRows: Array<typeof codeFiles.$inferInsert> = index.files.map((file) => ({
      id: fileIdByPath.get(file.path) ?? scopedEntityId("code_file", scope, file.path),
      scanRunId: scanId,
      ...scope,
      path: file.path,
      hash: file.hash,
      previousHash: file.previousHash,
      size: file.size,
      language: file.language,
      sourceKind: file.sourceKind,
      lineCount: file.lineCount,
      chunkCount: index.chunks.filter((chunk) => chunk.path === file.path).length,
      symbolCount: index.symbols.filter((symbol) => symbol.path === file.path).length,
      importCount: index.imports.filter((item) => item.path === file.path).length,
      routeCount: index.routes.filter((route) => route.path === file.path).length,
      testCount: index.tests.filter((item) => item.path === file.path).length,
      docCount: index.docs.filter((doc) => doc.path === file.path).length,
      metadata: {},
      lastModifiedAt: file.lastModifiedAt ? new Date(file.lastModifiedAt) : null,
      indexedAt: new Date(file.indexedAt),
      createdAt: new Date(file.indexedAt),
      updatedAt: new Date(file.indexedAt),
    }));

    for (const batch of batches(fileRows, 200)) {
      await this.db.insert(codeFiles).values(batch);
    }

    const chunkRows: Array<typeof codeChunks.$inferInsert> = index.chunks.map((chunk) => ({
      id: chunkIdById.get(chunk.id) ?? scopedEntityId("code_chunk", scope, chunk.path, String(chunk.chunkIndex), chunk.hash),
      fileId: fileIdByPath.get(chunk.path) ?? scopedEntityId("code_file", scope, chunk.path),
      scanRunId: scanId,
      ...scope,
      path: chunk.path,
      hash: chunk.hash,
      fileHash: chunk.fileHash,
      size: chunk.size,
      language: chunk.language,
      sourceKind: chunk.sourceKind,
      chunkIndex: chunk.chunkIndex,
      chunkKind: chunk.kind,
      title: chunk.title,
      text: chunk.text,
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
      lineStart: chunk.lineStart,
      lineEnd: chunk.lineEnd,
      tokenEstimate: chunk.tokenEstimate,
      symbolNames: chunk.symbolNames,
      metadata: chunk.metadata,
      indexedAt: new Date(index.scannedAt),
      createdAt: new Date(index.scannedAt),
      updatedAt: new Date(index.scannedAt),
    }));

    for (const batch of batches(chunkRows, 200)) {
      await this.db.insert(codeChunks).values(batch);
    }

    const symbolRows: Array<typeof codeSymbols.$inferInsert> = index.symbols.map((symbol) => ({
      id: scopedEntityId("code_symbol", scope, symbol.path, symbol.name, symbol.kind, String(symbol.lineStart)),
      fileId: fileIdByPath.get(symbol.path) ?? scopedEntityId("code_file", scope, symbol.path),
      chunkId: symbol.chunkId ? chunkIdById.get(symbol.chunkId) ?? null : null,
      scanRunId: scanId,
      ...scope,
      path: symbol.path,
      hash: symbol.hash,
      size: symbol.size,
      language: symbol.language,
      sourceKind: symbol.sourceKind,
      name: symbol.name,
      kind: symbol.kind,
      exported: symbol.exported,
      signature: symbol.signature,
      lineStart: symbol.lineStart,
      lineEnd: symbol.lineEnd,
      metadata: symbol.metadata,
      createdAt: new Date(index.scannedAt),
      updatedAt: new Date(index.scannedAt),
    }));

    for (const batch of batches(symbolRows, 200)) {
      await this.db.insert(codeSymbols).values(batch);
    }

    const importRows: Array<typeof codeImports.$inferInsert> = index.imports.map((item) => ({
      id: scopedEntityId("code_import", scope, item.path, item.importSource, String(item.lineStart)),
      fileId: fileIdByPath.get(item.path) ?? scopedEntityId("code_file", scope, item.path),
      scanRunId: scanId,
      ...scope,
      path: item.path,
      hash: item.hash,
      size: item.size,
      language: item.language,
      sourceKind: item.sourceKind,
      importSource: item.importSource,
      importedPath: item.importedPath,
      specifiers: item.specifiers,
      importKind: item.importKind,
      lineStart: item.lineStart,
      metadata: item.metadata,
      createdAt: new Date(index.scannedAt),
      updatedAt: new Date(index.scannedAt),
    }));

    for (const batch of batches(importRows, 200)) {
      await this.db.insert(codeImports).values(batch);
    }

    const routeRows: Array<typeof codeRoutes.$inferInsert> = index.routes.map((route) => ({
      id: scopedEntityId("code_route", scope, route.path, route.method, route.routePath, String(route.lineStart)),
      fileId: fileIdByPath.get(route.path) ?? scopedEntityId("code_file", scope, route.path),
      chunkId: route.chunkId ? chunkIdById.get(route.chunkId) ?? null : null,
      scanRunId: scanId,
      ...scope,
      path: route.path,
      hash: route.hash,
      size: route.size,
      language: route.language,
      sourceKind: route.sourceKind,
      method: route.method,
      routePath: route.routePath,
      handler: route.handler,
      lineStart: route.lineStart,
      metadata: route.metadata,
      createdAt: new Date(index.scannedAt),
      updatedAt: new Date(index.scannedAt),
    }));

    for (const batch of batches(routeRows, 200)) {
      await this.db.insert(codeRoutes).values(batch);
    }

    const testRows: Array<typeof codeTests.$inferInsert> = index.tests.map((item) => ({
      id: scopedEntityId("code_test", scope, item.path, item.name, String(item.lineStart)),
      fileId: fileIdByPath.get(item.path) ?? scopedEntityId("code_file", scope, item.path),
      chunkId: item.chunkId ? chunkIdById.get(item.chunkId) ?? null : null,
      scanRunId: scanId,
      ...scope,
      path: item.path,
      hash: item.hash,
      size: item.size,
      language: item.language,
      sourceKind: item.sourceKind,
      name: item.name,
      testKind: item.testKind,
      subjectPath: item.subjectPath,
      lineStart: item.lineStart,
      metadata: item.metadata,
      createdAt: new Date(index.scannedAt),
      updatedAt: new Date(index.scannedAt),
    }));

    for (const batch of batches(testRows, 200)) {
      await this.db.insert(codeTests).values(batch);
    }

    const docRows: Array<typeof codeDocs.$inferInsert> = index.docs.map((doc) => ({
      id: scopedEntityId("code_doc", scope, doc.path, doc.title, String(doc.lineStart)),
      fileId: fileIdByPath.get(doc.path) ?? scopedEntityId("code_file", scope, doc.path),
      chunkId: doc.chunkId ? chunkIdById.get(doc.chunkId) ?? null : null,
      scanRunId: scanId,
      ...scope,
      path: doc.path,
      hash: doc.hash,
      size: doc.size,
      language: doc.language,
      sourceKind: doc.sourceKind,
      title: doc.title,
      section: doc.section,
      references: doc.references,
      lineStart: doc.lineStart,
      lineEnd: doc.lineEnd,
      metadata: doc.metadata,
      createdAt: new Date(index.scannedAt),
      updatedAt: new Date(index.scannedAt),
    }));

    for (const batch of batches(docRows, 200)) {
      await this.db.insert(codeDocs).values(batch);
    }

    const findingRows: Array<typeof codeFindings.$inferInsert> = index.findings.map((finding) => ({
      id: scopedEntityId("code_finding", scope, finding.id),
      scanRunId: scanId,
      ...scope,
      path: finding.path,
      hash: finding.hash,
      size: finding.size,
      language: finding.language,
      sourceKind: finding.sourceKind,
      severity: finding.severity,
      kind: finding.kind,
      title: finding.title,
      message: finding.message,
      metadata: finding.metadata,
      createdAt: new Date(index.scannedAt),
      updatedAt: new Date(index.scannedAt),
    }));

    for (const batch of batches(findingRows, 200)) {
      await this.db.insert(codeFindings).values(batch);
    }

    const memoryRows: Array<typeof codeMemoryNotes.$inferInsert> = index.memoryNotes.map((note) => ({
      id: scopedEntityId("code_memory_note", scope, note.path, note.title, note.hash),
      fileId: note.fileId ? fileIdByPath.get(note.path) ?? null : null,
      chunkId: note.chunkId ? chunkIdById.get(note.chunkId) ?? null : null,
      scanRunId: scanId,
      ...scope,
      path: note.path,
      hash: note.hash,
      size: note.size,
      language: note.language,
      sourceKind: note.sourceKind,
      title: note.title,
      noteKind: note.noteKind,
      text: note.text,
      metadata: note.metadata,
      createdAt: new Date(index.scannedAt),
      updatedAt: new Date(index.scannedAt),
    }));

    for (const batch of batches(memoryRows, 200)) {
      await this.db.insert(codeMemoryNotes).values(batch);
    }
  }

  private async loadCurrentFiles(scope: BrainScope): Promise<Array<{ path: string; hash: string }>> {
    const rows = await this.db.select({ path: codeFiles.path, hash: codeFiles.hash }).from(codeFiles).where(scopeWhere(codeFiles, scope));

    return rows;
  }

  private async latestRun(scope: BrainScope): Promise<typeof codebaseScanRuns.$inferSelect | null> {
    const [run] = await this.db
      .select()
      .from(codebaseScanRuns)
      .where(scopeWhere(codebaseScanRuns, scopeValues(scope)))
      .orderBy(desc(codebaseScanRuns.startedAt))
      .limit(1);

    return run ?? null;
  }

  private async loadIndex(scope: BrainScope): Promise<CodebaseIndex | null> {
    const normalizedScope = scopeValues(scope);
    const run = await this.latestRun(normalizedScope);

    if (!run || run.status !== "completed") {
      return null;
    }

    const [fileRows, chunkRows, symbolRows, importRows, routeRows, testRows, docRows, findingRows, memoryRows] =
      await Promise.all([
        this.db.select().from(codeFiles).where(and(eq(codeFiles.scanRunId, run.id), scopeWhere(codeFiles, normalizedScope))),
        this.db.select().from(codeChunks).where(and(eq(codeChunks.scanRunId, run.id), scopeWhere(codeChunks, normalizedScope))),
        this.db.select().from(codeSymbols).where(and(eq(codeSymbols.scanRunId, run.id), scopeWhere(codeSymbols, normalizedScope))),
        this.db.select().from(codeImports).where(and(eq(codeImports.scanRunId, run.id), scopeWhere(codeImports, normalizedScope))),
        this.db.select().from(codeRoutes).where(and(eq(codeRoutes.scanRunId, run.id), scopeWhere(codeRoutes, normalizedScope))),
        this.db.select().from(codeTests).where(and(eq(codeTests.scanRunId, run.id), scopeWhere(codeTests, normalizedScope))),
        this.db.select().from(codeDocs).where(and(eq(codeDocs.scanRunId, run.id), scopeWhere(codeDocs, normalizedScope))),
        this.db.select().from(codeFindings).where(and(eq(codeFindings.scanRunId, run.id), scopeWhere(codeFindings, normalizedScope))),
        this.db.select().from(codeMemoryNotes).where(and(eq(codeMemoryNotes.scanRunId, run.id), scopeWhere(codeMemoryNotes, normalizedScope))),
      ]);

    return {
      repoRoot: run.repoRoot,
      gitCommit: run.gitCommit,
      scannedAt: run.completedAt?.toISOString() ?? run.startedAt.toISOString(),
      files: fileRows.map((row) => ({
        id: row.id,
        path: row.path,
        hash: row.hash,
        previousHash: row.previousHash,
        size: row.size,
        language: row.language,
        sourceKind: row.sourceKind as CodeSourceKind,
        lineCount: row.lineCount,
        lastModifiedAt: row.lastModifiedAt?.toISOString() ?? null,
        indexedAt: row.indexedAt.toISOString(),
        content: "",
      })),
      chunks: chunkRows.map((row) => ({
        id: row.id,
        fileId: row.fileId,
        path: row.path,
        hash: row.hash,
        fileHash: row.fileHash,
        size: row.size,
        language: row.language,
        sourceKind: row.sourceKind as CodeSourceKind,
        chunkIndex: row.chunkIndex,
        kind: row.chunkKind as CodeChunkKind,
        title: row.title,
        text: row.text,
        charStart: row.charStart,
        charEnd: row.charEnd,
        lineStart: row.lineStart,
        lineEnd: row.lineEnd,
        tokenEstimate: row.tokenEstimate,
        symbolNames: row.symbolNames,
        metadata: objectMetadata(row.metadata),
      })),
      symbols: symbolRows.map((row) => ({
        id: row.id,
        fileId: row.fileId,
        chunkId: row.chunkId,
        path: row.path,
        hash: row.hash,
        size: row.size,
        language: row.language,
        sourceKind: row.sourceKind as CodeSourceKind,
        name: row.name,
        kind: row.kind as CodeSymbolKind,
        exported: row.exported,
        signature: row.signature,
        lineStart: row.lineStart,
        lineEnd: row.lineEnd,
        metadata: objectMetadata(row.metadata),
      })),
      imports: importRows.map((row) => ({
        id: row.id,
        fileId: row.fileId,
        path: row.path,
        hash: row.hash,
        size: row.size,
        language: row.language,
        sourceKind: row.sourceKind as CodeSourceKind,
        importSource: row.importSource,
        importedPath: row.importedPath,
        specifiers: row.specifiers,
        importKind: row.importKind as CodeImport["importKind"],
        lineStart: row.lineStart,
        metadata: objectMetadata(row.metadata),
      })),
      routes: routeRows.map((row) => ({
        id: row.id,
        fileId: row.fileId,
        chunkId: row.chunkId,
        path: row.path,
        hash: row.hash,
        size: row.size,
        language: row.language,
        sourceKind: row.sourceKind as CodeSourceKind,
        method: row.method,
        routePath: row.routePath,
        handler: row.handler,
        lineStart: row.lineStart,
        metadata: objectMetadata(row.metadata),
      })),
      tests: testRows.map((row) => ({
        id: row.id,
        fileId: row.fileId,
        chunkId: row.chunkId,
        path: row.path,
        hash: row.hash,
        size: row.size,
        language: row.language,
        sourceKind: row.sourceKind as CodeSourceKind,
        name: row.name,
        testKind: row.testKind,
        subjectPath: row.subjectPath,
        lineStart: row.lineStart,
        metadata: objectMetadata(row.metadata),
      })),
      docs: docRows.map((row) => ({
        id: row.id,
        fileId: row.fileId,
        chunkId: row.chunkId,
        path: row.path,
        hash: row.hash,
        size: row.size,
        language: row.language,
        sourceKind: row.sourceKind as CodeSourceKind,
        title: row.title,
        section: row.section,
        references: row.references,
        lineStart: row.lineStart,
        lineEnd: row.lineEnd,
        metadata: objectMetadata(row.metadata),
      })),
      findings: findingRows.map((row) => ({
        id: row.id,
        path: row.path,
        hash: row.hash,
        size: row.size,
        language: row.language,
        sourceKind: row.sourceKind as CodeSourceKind,
        severity: row.severity as CodeFinding["severity"],
        kind: row.kind,
        title: row.title,
        message: row.message,
        metadata: objectMetadata(row.metadata),
      })),
      memoryNotes: memoryRows.map((row) => ({
        id: row.id,
        fileId: row.fileId,
        chunkId: row.chunkId,
        path: row.path,
        hash: row.hash,
        size: row.size,
        language: row.language,
        sourceKind: row.sourceKind as CodeSourceKind,
        title: row.title,
        noteKind: row.noteKind,
        text: row.text,
        metadata: objectMetadata(row.metadata),
      })),
      excluded: [],
      changedFiles: fileRows
        .filter((row) => row.previousHash !== null && row.previousHash !== row.hash)
        .map((row) => ({ path: row.path, previousHash: row.previousHash ?? "", hash: row.hash })),
      staleFiles: findingRows.filter((finding) => finding.kind === "stale_file" && finding.path !== null).map((finding) => finding.path ?? ""),
    };
  }
}

function extractFileKnowledge(file: CodeFileKnowledge): Omit<
  CodebaseIndex,
  "repoRoot" | "gitCommit" | "scannedAt" | "files" | "findings" | "excluded" | "changedFiles" | "staleFiles"
> {
  const chunks: CodeChunk[] = [];
  const symbols: CodeSymbol[] = [];
  const imports = extractImports(file);
  const routes = extractRoutes(file);
  const tests = extractTests(file, imports);
  const docs = extractDocs(file);
  const memoryNotes: CodeMemoryNote[] = [];

  chunks.push(...chunkFile(file, imports, routes, tests, docs));

  for (const symbol of extractSymbols(file, chunks)) {
    symbols.push(symbol);
  }

  for (const route of routes) {
    route.chunkId = nearestChunkId(chunks, route.lineStart, "route");
  }

  for (const item of tests) {
    item.chunkId = nearestChunkId(chunks, item.lineStart, "test");
  }

  for (const doc of docs) {
    doc.chunkId = nearestChunkId(chunks, doc.lineStart, "docs_section");
  }

  if (file.sourceKind === "memory_note") {
    for (const chunk of chunks.filter((candidate) => candidate.kind === "docs_section" || candidate.kind === "memory_note")) {
      memoryNotes.push({
        id: entityId("code_memory_note", file.path, chunk.title, chunk.hash),
        fileId: file.id,
        chunkId: chunk.id,
        path: file.path,
        hash: chunk.hash,
        size: file.size,
        language: file.language,
        sourceKind: file.sourceKind,
        title: chunk.title,
        noteKind: "memory",
        text: chunk.text,
        metadata: { lineStart: chunk.lineStart, lineEnd: chunk.lineEnd },
      });
    }
  }

  return {
    chunks,
    symbols,
    imports,
    routes,
    tests,
    docs,
    memoryNotes,
  };
}

function chunkFile(
  file: CodeFileKnowledge,
  imports: CodeImport[],
  routes: CodeRoute[],
  tests: CodeTest[],
  docs: CodeDoc[],
): CodeChunk[] {
  if (file.language === "markdown") {
    return chunkMarkdown(file);
  }

  if (file.language === "css") {
    return chunkCss(file);
  }

  const lines = file.content.split("\n");
  const offsets = lineOffsets(file.content);
  const chunks: CodeChunk[] = [];
  const importLineNumbers = imports.map((item) => item.lineStart);

  if (importLineNumbers.length > 0) {
    const lineStart = Math.min(...importLineNumbers);
    const lineEnd = Math.max(...importLineNumbers);
    chunks.push(makeChunk(file, chunks.length, "imports", "imports", lineStart, lineEnd, offsets, { importCount: imports.length }));
  }

  const declarationStarts = declarationLineStarts(file);

  for (let index = 0; index < declarationStarts.length; index += 1) {
    const declaration = declarationStarts[index];

    if (!declaration) {
      continue;
    }

    const next = declarationStarts[index + 1];
    const lineEnd = Math.max(declaration.lineStart, (next?.lineStart ?? lines.length + 1) - 1);
    chunks.push(
      makeChunk(file, chunks.length, declaration.kind, declaration.title, declaration.lineStart, lineEnd, offsets, {
        symbolName: declaration.name,
      }),
    );
  }

  for (const route of routes) {
    if (!chunks.some((chunk) => chunk.lineStart <= route.lineStart && chunk.lineEnd >= route.lineStart)) {
      chunks.push(makeChunk(file, chunks.length, "route", `${route.method} ${route.routePath}`, route.lineStart, route.lineStart, offsets, {}));
    }
  }

  for (const item of tests) {
    if (!chunks.some((chunk) => chunk.lineStart <= item.lineStart && chunk.lineEnd >= item.lineStart)) {
      const end = nextTestLineEnd(lines, item.lineStart);
      chunks.push(makeChunk(file, chunks.length, "test", item.name, item.lineStart, end, offsets, {}));
    }
  }

  if (chunks.length === 0) {
    const docTitle = docs[0]?.title ?? file.path;
    chunks.push(makeChunk(file, 0, file.sourceKind === "schema" ? "schema" : "file", docTitle, 1, lines.length, offsets, {}));
  }

  return chunks;
}

function chunkMarkdown(file: CodeFileKnowledge): CodeChunk[] {
  const lines = file.content.split("\n");
  const offsets = lineOffsets(file.content);
  const headingLines: Array<{ line: number; title: string }> = [];

  lines.forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);

    if (match?.[2]) {
      headingLines.push({ line: index + 1, title: match[2].trim() });
    }
  });

  if (headingLines.length === 0) {
    return [makeChunk(file, 0, file.sourceKind === "memory_note" ? "memory_note" : "docs_section", file.path, 1, lines.length, offsets, {})];
  }

  return headingLines.map((heading, index) => {
    const next = headingLines[index + 1];
    const end = Math.max(heading.line, (next?.line ?? lines.length + 1) - 1);

    return makeChunk(
      file,
      index,
      file.sourceKind === "memory_note" ? "memory_note" : "docs_section",
      heading.title,
      heading.line,
      end,
      offsets,
      {},
    );
  });
}

function chunkCss(file: CodeFileKnowledge): CodeChunk[] {
  const lines = file.content.split("\n");
  const offsets = lineOffsets(file.content);
  const chunks: CodeChunk[] = [];
  let blockStart: number | null = null;
  let title = file.path;

  lines.forEach((line, index) => {
    if (blockStart === null && line.includes("{")) {
      blockStart = index + 1;
      title = compactText(line.slice(0, line.indexOf("{")) || file.path);
    }

    if (blockStart !== null && line.includes("}")) {
      chunks.push(makeChunk(file, chunks.length, "css_section", title, blockStart, index + 1, offsets, {}));
      blockStart = null;
    }
  });

  if (chunks.length === 0) {
    chunks.push(makeChunk(file, 0, "file", file.path, 1, lines.length, offsets, {}));
  }

  return chunks;
}

function extractImports(file: CodeFileKnowledge): CodeImport[] {
  if (!["typescript", "tsx", "javascript", "jsx"].includes(file.language)) {
    return [];
  }

  const imports: CodeImport[] = [];
  const importRegex = /^\s*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];?/gm;
  const sideEffectRegex = /^\s*import\s+["']([^"']+)["'];?/gm;
  const requireRegex = /^\s*(?:const|let|var)\s+(.+?)\s*=\s*require\(["']([^"']+)["']\);?/gm;
  const dynamicRegex = /import\(["']([^"']+)["']\)/gm;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(file.content))) {
    const source = match[2];

    if (!source) {
      continue;
    }

    imports.push(makeImport(file, source, specifiersFromImport(match[1] ?? ""), "static", offsetLine(file.content, match.index)));
  }

  while ((match = sideEffectRegex.exec(file.content))) {
    const source = match[1];

    if (!source) {
      continue;
    }

    if (imports.some((item) => item.importSource === source && item.lineStart === offsetLine(file.content, match?.index ?? 0))) {
      continue;
    }

    imports.push(makeImport(file, source, [], "side_effect", offsetLine(file.content, match.index)));
  }

  while ((match = requireRegex.exec(file.content))) {
    const source = match[2];

    if (!source) {
      continue;
    }

    imports.push(makeImport(file, source, specifiersFromImport(match[1] ?? ""), "require", offsetLine(file.content, match.index)));
  }

  while ((match = dynamicRegex.exec(file.content))) {
    const source = match[1];

    if (!source) {
      continue;
    }

    imports.push(makeImport(file, source, [], "dynamic", offsetLine(file.content, match.index)));
  }

  return imports.sort((a, b) => a.lineStart - b.lineStart || a.importSource.localeCompare(b.importSource));
}

function makeImport(
  file: CodeFileKnowledge,
  importSource: string,
  specifiers: string[],
  importKind: CodeImport["importKind"],
  lineStart: number,
): CodeImport {
  return {
    id: entityId("code_import", file.path, importSource, String(lineStart)),
    fileId: file.id,
    path: file.path,
    hash: file.hash,
    size: file.size,
    language: file.language,
    sourceKind: file.sourceKind,
    importSource,
    importedPath: null,
    specifiers,
    importKind,
    lineStart,
    metadata: {},
  };
}

function extractRoutes(file: CodeFileKnowledge): CodeRoute[] {
  if (!["typescript", "tsx", "javascript", "jsx"].includes(file.language)) {
    return [];
  }

  const routes: CodeRoute[] = [];
  const literalPathRegex = /url\.pathname\s*===\s*["'`]([^"'`]+)["'`]/g;
  const methodPathRegex = /["'`]([A-Z]+)\s+(\/(?:api|brain|autopilot)[^"'`\s]+)[^"'`]*["'`]/g;
  const regexpRouteRegex = /\^\\\/((?:api|brain|autopilot)[^$]+)\\?\$/.source;
  let match: RegExpExecArray | null;

  while ((match = literalPathRegex.exec(file.content))) {
    const routePath = match[1];

    if (!routePath || !isRoutePath(routePath)) {
      continue;
    }

    routes.push(makeRoute(file, "ANY", routePath, nearbyHandler(file.content, match.index), offsetLine(file.content, match.index), {}));
  }

  while ((match = methodPathRegex.exec(file.content))) {
    const method = match[1];
    const routePath = match[2];

    if (!method || !routePath || !isRoutePath(routePath)) {
      continue;
    }

    routes.push(makeRoute(file, method, routePath, nearbyHandler(file.content, match.index), offsetLine(file.content, match.index), {}));
  }

  const regexRoute = new RegExp(regexpRouteRegex, "g");

  while ((match = regexRoute.exec(file.content))) {
    const rawRoute = match[1];

    if (!rawRoute) {
      continue;
    }

    const routePath = regexRoutePath(rawRoute);
    routes.push(makeRoute(file, "ANY", routePath, nearbyHandler(file.content, match.index), offsetLine(file.content, match.index), { pattern: rawRoute }));
  }

  return dedupeBy(routes, (route) => `${route.method}:${route.routePath}:${route.lineStart}`);
}

function makeRoute(
  file: CodeFileKnowledge,
  method: string,
  routePath: string,
  handler: string | null,
  lineStart: number,
  metadata: Record<string, unknown>,
): CodeRoute {
  return {
    id: entityId("code_route", file.path, method, routePath, String(lineStart)),
    fileId: file.id,
    chunkId: null,
    path: file.path,
    hash: file.hash,
    size: file.size,
    language: file.language,
    sourceKind: file.sourceKind,
    method,
    routePath,
    handler,
    lineStart,
    metadata,
  };
}

function extractTests(file: CodeFileKnowledge, imports: CodeImport[]): CodeTest[] {
  if (!file.path.includes(".test.") && !file.path.startsWith("test/")) {
    return [];
  }

  const tests: CodeTest[] = [];
  const testRegex = /\b(?:test|it)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let match: RegExpExecArray | null;
  const subjectPath = imports.find((item) => item.importedPath !== null && !item.importSource.includes("node:"))?.importedPath ?? null;

  while ((match = testRegex.exec(file.content))) {
    const name = match[1];

    if (!name) {
      continue;
    }

    const lineStart = offsetLine(file.content, match.index);
    tests.push({
      id: entityId("code_test", file.path, name, String(lineStart)),
      fileId: file.id,
      chunkId: null,
      path: file.path,
      hash: file.hash,
      size: file.size,
      language: file.language,
      sourceKind: file.sourceKind,
      name,
      testKind: "node_test",
      subjectPath,
      lineStart,
      metadata: {},
    });
  }

  return tests;
}

function extractDocs(file: CodeFileKnowledge): CodeDoc[] {
  if (file.language !== "markdown") {
    return [];
  }

  const docs: CodeDoc[] = [];
  const lines = file.content.split("\n");
  const headings: Array<{ title: string; line: number }> = [];

  lines.forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);

    if (match?.[2]) {
      headings.push({ title: match[2].trim(), line: index + 1 });
    }
  });

  if (headings.length === 0) {
    headings.push({ title: file.path, line: 1 });
  }

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];

    if (!heading) {
      continue;
    }

    const next = headings[index + 1];
    const end = Math.max(heading.line, (next?.line ?? lines.length + 1) - 1);
    const section = lines.slice(heading.line - 1, end).join("\n");

    docs.push({
      id: entityId("code_doc", file.path, heading.title, String(heading.line)),
      fileId: file.id,
      chunkId: null,
      path: file.path,
      hash: file.hash,
      size: file.size,
      language: file.language,
      sourceKind: file.sourceKind,
      title: heading.title,
      section: heading.title,
      references: extractPathReferences(section),
      lineStart: heading.line,
      lineEnd: end,
      metadata: {},
    });
  }

  return docs;
}

function extractSymbols(file: CodeFileKnowledge, chunks: CodeChunk[]): CodeSymbol[] {
  if (!["typescript", "tsx", "javascript", "jsx"].includes(file.language)) {
    return [];
  }

  return declarationLineStarts(file).map((declaration) => {
    const chunkId = nearestChunkId(chunks, declaration.lineStart, declaration.kind);

    return {
      id: entityId("code_symbol", file.path, declaration.name, declaration.kind, String(declaration.lineStart)),
      fileId: file.id,
      chunkId,
      path: file.path,
      hash: file.hash,
      size: file.size,
      language: file.language,
      sourceKind: file.sourceKind,
      name: declaration.name,
      kind: symbolKindFromChunkKind(declaration.kind, declaration.name, file),
      exported: declaration.exported,
      signature: declaration.signature,
      lineStart: declaration.lineStart,
      lineEnd: chunks.find((chunk) => chunk.id === chunkId)?.lineEnd ?? declaration.lineStart,
      metadata: declaration.metadata,
    };
  });
}

function declarationLineStarts(file: CodeFileKnowledge): Array<{
  lineStart: number;
  name: string;
  title: string;
  kind: CodeChunkKind;
  exported: boolean;
  signature: string;
  metadata: Record<string, unknown>;
}> {
  const declarations: Array<{
    lineStart: number;
    name: string;
    title: string;
    kind: CodeChunkKind;
    exported: boolean;
    signature: string;
    metadata: Record<string, unknown>;
  }> = [];
  const lines = file.content.split("\n");

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const tableMatch = /^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*pgTable\(\s*["']([^"']+)["']/.exec(line);

    if (tableMatch?.[1]) {
      declarations.push({
        lineStart: lineNumber,
        name: tableMatch[1],
        title: `${tableMatch[1]} table`,
        kind: "schema",
        exported: true,
        signature: compactText(line),
        metadata: { tableName: tableMatch[2] ?? tableMatch[1] },
      });
      return;
    }

    const functionMatch = /^\s*(export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b/.exec(line);

    if (functionMatch?.[2]) {
      const name = functionMatch[2];
      const kind = isComponentName(name, file) ? "component" : name.toLowerCase().includes("route") ? "route" : "function";
      declarations.push({
        lineStart: lineNumber,
        name,
        title: name,
        kind,
        exported: Boolean(functionMatch[1]),
        signature: compactText(line),
        metadata: {},
      });
      return;
    }

    const classMatch = /^\s*(export\s+)?class\s+([A-Za-z_$][\w$]*)\b/.exec(line);

    if (classMatch?.[2]) {
      declarations.push({
        lineStart: lineNumber,
        name: classMatch[2],
        title: classMatch[2],
        kind: "class",
        exported: Boolean(classMatch[1]),
        signature: compactText(line),
        metadata: {},
      });
      return;
    }

    const typeMatch = /^\s*(export\s+)?(?:type|interface|enum)\s+([A-Za-z_$][\w$]*)\b/.exec(line);

    if (typeMatch?.[2]) {
      declarations.push({
        lineStart: lineNumber,
        name: typeMatch[2],
        title: typeMatch[2],
        kind: "exports",
        exported: Boolean(typeMatch[1]),
        signature: compactText(line),
        metadata: {},
      });
      return;
    }

    const constMatch = /^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(line);

    if (constMatch?.[2]) {
      const name = constMatch[2];
      const kind = line.includes("=>") || isComponentName(name, file) ? (isComponentName(name, file) ? "component" : "function") : "exports";
      declarations.push({
        lineStart: lineNumber,
        name,
        title: name,
        kind,
        exported: Boolean(constMatch[1]),
        signature: compactText(line),
        metadata: {},
      });
    }
  });

  return declarations;
}

function makeChunk(
  file: CodeFileKnowledge,
  chunkIndex: number,
  kind: CodeChunkKind,
  title: string,
  lineStart: number,
  lineEnd: number,
  offsets: number[],
  metadata: Record<string, unknown>,
): CodeChunk {
  const safeLineStart = Math.max(1, lineStart);
  const safeLineEnd = Math.max(safeLineStart, lineEnd);
  const charStart = offsets[safeLineStart - 1] ?? 0;
  const nextOffset = offsets[safeLineEnd] ?? file.content.length;
  const rawText = file.content.slice(charStart, nextOffset);
  const text = rawText.length > maxChunkChars ? rawText.slice(0, maxChunkChars) : rawText;
  const symbolName = typeof metadata.symbolName === "string" ? metadata.symbolName : null;

  return {
    id: entityId("code_chunk", file.path, String(chunkIndex), hashText(text)),
    fileId: file.id,
    path: file.path,
    hash: hashText(text),
    fileHash: file.hash,
    size: file.size,
    language: file.language,
    sourceKind: file.sourceKind,
    chunkIndex,
    kind,
    title: title.trim() || file.path,
    text: text.trim() || file.path,
    charStart,
    charEnd: charStart + text.length,
    lineStart: safeLineStart,
    lineEnd: safeLineEnd,
    tokenEstimate: Math.max(1, Math.ceil(text.length / 4)),
    symbolNames: symbolName ? [symbolName] : [],
    metadata,
  };
}

function scoreChunk(
  chunk: CodeChunk,
  index: CodebaseIndex,
  query: string,
  terms: string[],
  termDocCounts: Map<string, number>,
  averageLength: number,
  documentCount: number,
): CodebaseSearchResult | null {
  const text = searchableChunkText(chunk);
  const tokens = tokenize(text);
  const tokenCounts = frequencyMap(tokens);
  const length = Math.max(tokens.length, 1);
  let score = 0;
  const reasons: string[] = [];

  for (const term of terms) {
    const frequency = tokenCounts.get(term) ?? 0;

    if (frequency === 0) {
      continue;
    }

    const docCount = termDocCounts.get(term) ?? 0;
    const idf = Math.log(1 + (documentCount - docCount + 0.5) / (docCount + 0.5));
    const k = 1.2;
    const b = 0.75;
    score += idf * ((frequency * (k + 1)) / (frequency + k * (1 - b + b * (length / averageLength))));
    reasons.push(`matched "${term}"`);
  }

  const lowerQuery = query.toLowerCase();

  if (chunk.path.toLowerCase().includes(lowerQuery)) {
    score += 2.5;
    reasons.push("path match");
  }

  if (chunk.title.toLowerCase().includes(lowerQuery)) {
    score += 2;
    reasons.push("symbol/title match");
  }

  if (chunk.kind === "route" || index.routes.some((route) => route.path === chunk.path && route.lineStart >= chunk.lineStart && route.lineStart <= chunk.lineEnd)) {
    score += 0.6;
    reasons.push("API route metadata");
  }

  if (chunk.kind === "test") {
    score += 0.4;
    reasons.push("test metadata");
  }

  if (chunk.kind === "docs_section" || chunk.kind === "memory_note") {
    score += 0.25;
    reasons.push("documentation metadata");
  }

  if (score <= 0) {
    return null;
  }

  const routes = index.routes
    .filter((route) => route.path === chunk.path && route.lineStart >= chunk.lineStart && route.lineStart <= chunk.lineEnd)
    .map((route) => ({ method: route.method, routePath: route.routePath }));
  const tests = index.tests
    .filter((test) => test.path === chunk.path || test.subjectPath === chunk.path)
    .map((test) => ({ name: test.name, subjectPath: test.subjectPath }));
  const docs = index.docs
    .filter((doc) => doc.path === chunk.path || doc.references.includes(chunk.path))
    .map((doc) => ({ title: doc.title, references: doc.references }));

  return {
    chunkId: chunk.id,
    fileId: chunk.fileId,
    path: chunk.path,
    title: chunk.title,
    chunkKind: chunk.kind,
    language: chunk.language,
    sourceKind: chunk.sourceKind,
    lineStart: chunk.lineStart,
    lineEnd: chunk.lineEnd,
    score: Number(score.toFixed(4)),
    reasons: dedupe(reasons),
    snippet: clipText(chunk.text, 700),
    symbols: chunk.symbolNames,
    routes,
    tests,
    docs,
  };
}

function withDependencyAdjacency(index: CodebaseIndex, results: CodebaseSearchResult[], limit: number): CodebaseSearchResult[] {
  const merged = new Map(results.map((result) => [result.chunkId, result]));

  for (const result of results.slice(0, Math.min(results.length, 5))) {
    const adjacentPaths = new Set<string>();

    for (const item of index.imports) {
      if (item.path === result.path && item.importedPath) {
        adjacentPaths.add(item.importedPath);
      }

      if (item.importedPath === result.path) {
        adjacentPaths.add(item.path);
      }
    }

    for (const test of index.tests) {
      if (test.subjectPath === result.path) {
        adjacentPaths.add(test.path);
      }
    }

    for (const doc of index.docs) {
      if (doc.references.includes(result.path)) {
        adjacentPaths.add(doc.path);
      }
    }

    for (const path of adjacentPaths) {
      const chunk = index.chunks.find((candidate) => candidate.path === path);

      if (!chunk || merged.has(chunk.id)) {
        continue;
      }

      const adjacent = scoreChunk(chunk, index, path, uniqueTerms(path), new Map(), 1, 1);

      merged.set(chunk.id, {
        chunkId: chunk.id,
        fileId: chunk.fileId,
        path: chunk.path,
        title: chunk.title,
        chunkKind: chunk.kind,
        language: chunk.language,
        sourceKind: chunk.sourceKind,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        score: Math.max((adjacent?.score ?? 0.1) * 0.5, 0.1),
        reasons: [`dependency adjacency from ${result.path}`],
        snippet: clipText(chunk.text, 700),
        symbols: chunk.symbolNames,
        routes: index.routes
          .filter((route) => route.path === chunk.path)
          .map((route) => ({ method: route.method, routePath: route.routePath })),
        tests: index.tests
          .filter((test) => test.path === chunk.path || test.subjectPath === chunk.path)
          .map((test) => ({ name: test.name, subjectPath: test.subjectPath })),
        docs: index.docs
          .filter((doc) => doc.path === chunk.path || doc.references.includes(chunk.path))
          .map((doc) => ({ title: doc.title, references: doc.references })),
      });
    }
  }

  return [...merged.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
}

function emptyContext(query: string): CodebaseContextPayload {
  return {
    sourceOfTruth: "codebase_db_index",
    query: compactText(query),
    strategy: "bm25_dependency_adjacency",
    summary: {
      fileCount: 0,
      chunkCount: 0,
      totalChars: 0,
      omittedCount: 0,
    },
    files: [],
    chunks: [],
    routes: [],
    tests: [],
    docs: [],
  };
}

async function listTrackedFiles(repoRoot: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 20 * 1024 * 1024,
  });
  const output = Buffer.isBuffer(stdout) ? stdout.toString("utf8") : String(stdout);

  return output.split("\0").filter((filePath) => filePath.trim().length > 0).map(normalizeRepoPath);
}

async function currentGitCommit(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot });

    return String(stdout).trim() || null;
  } catch {
    return null;
  }
}

function includePathReason(filePath: string): string | null {
  if (filePath.startsWith("packages/brain/src/")) {
    return "backend_source";
  }

  if (filePath.startsWith("packages/brain/frontend/src/")) {
    return "frontend_source";
  }

  if (filePath.startsWith("docs/")) {
    return "docs";
  }

  if (filePath.startsWith("scripts/")) {
    return "script";
  }

  if (filePath.startsWith("drizzle/") && (filePath.endsWith(".sql") || filePath.endsWith(".json"))) {
    return "migration";
  }

  if (/^(package\.json|tsconfig\.json|drizzle\.config\.ts|Dockerfile|AGENTS\.md|CLAUDE\.md|\.env\.example)$/.test(filePath)) {
    return "root_config";
  }

  return null;
}

function excludedPathReason(filePath: string): string | null {
  const parts = filePath.split("/");

  if (parts.includes("node_modules") || parts.includes(".git")) {
    return "dependency_or_git_internals";
  }

  if (parts.includes("dist") || parts.includes("build") || parts.includes("coverage")) {
    return "build_output";
  }

  if (filePath.startsWith("packages/brain/public/")) {
    return "generated_public_asset";
  }

  if (/(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(filePath)) {
    return "lockfile_noise";
  }

  if (/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|woff2?|mp4|mov|sqlite|db)$/i.test(filePath)) {
    return "large_binary_asset";
  }

  return null;
}

function sourceKindForPath(filePath: string): CodeSourceKind {
  if (filePath.startsWith("docs/code-memory/")) {
    return "memory_note";
  }

  if (filePath.startsWith("docs/")) {
    return "doc";
  }

  if (filePath.includes(".test.") || filePath.startsWith("test/")) {
    return "test";
  }

  if (filePath.endsWith(".css")) {
    return "style";
  }

  if (filePath.startsWith("packages/brain/frontend/src/")) {
    return "frontend_source";
  }

  if (filePath.startsWith("packages/brain/src/db/schema.ts") || filePath.endsWith("/schema.ts")) {
    return "schema";
  }

  if (filePath.startsWith("packages/brain/src/")) {
    return "backend_source";
  }

  if (filePath.startsWith("drizzle/")) {
    return "migration";
  }

  if (filePath.startsWith("scripts/")) {
    return "script";
  }

  if (filePath === "package.json" || filePath.endsWith("/package.json")) {
    return "package";
  }

  if (/\.(json|ts|js|mjs|cjs|yaml|yml)$/.test(filePath) || ["Dockerfile", "AGENTS.md", "CLAUDE.md"].includes(filePath)) {
    return "config";
  }

  return "unknown";
}

function languageForPath(filePath: string): string {
  const extension = extname(filePath).toLowerCase();

  switch (extension) {
    case ".ts":
      return "typescript";
    case ".tsx":
      return "tsx";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".jsx":
      return "jsx";
    case ".md":
      return "markdown";
    case ".css":
      return "css";
    case ".sql":
      return "sql";
    case ".json":
      return "json";
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".sh":
      return "shell";
    default:
      return filePath === "Dockerfile" ? "dockerfile" : "text";
  }
}

function looksBinary(buffer: Buffer, filePath: string): boolean {
  if (/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|woff2?|mp4|mov|sqlite|db)$/i.test(filePath)) {
    return true;
  }

  return buffer.subarray(0, Math.min(buffer.length, 8000)).includes(0);
}

function resolveImportTargets(imports: CodeImport[], knownPaths: Set<string>): void {
  for (const item of imports) {
    if (!item.importSource.startsWith(".")) {
      continue;
    }

    item.importedPath = resolveRelativeImport(item.path, item.importSource, knownPaths);
  }
}

function resolveRelativeImport(fromPath: string, importSource: string, knownPaths: Set<string>): string | null {
  const base = posix.normalize(posix.join(dirname(fromPath), importSource));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.css`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ];

  return candidates.find((candidate) => knownPaths.has(candidate)) ?? null;
}

function specifiersFromImport(raw: string): string[] {
  return dedupe(
    raw
      .replace(/[{}*]/g, " ")
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && part !== "as" && part !== "type"),
  );
}

function extractPathReferences(text: string): string[] {
  const matches = text.match(/\b(?:packages\/brain\/src|packages\/brain\/frontend\/src|docs|scripts|drizzle)\/[A-Za-z0-9_./-]+/g) ?? [];

  return dedupe(matches.map((match) => match.replace(/[).,;:]+$/, "")));
}

function isRoutePath(routePath: string): boolean {
  return routePath.startsWith("/api/") || routePath.startsWith("/brain/") || routePath.startsWith("/autopilot");
}

function regexRoutePath(rawRoute: string): string {
  return `/${rawRoute}`
    .replace(/\\\//g, "/")
    .replace(/\(\[\^\/]\+\)/g, ":id")
    .replace(/\(\[\^\/\]\+\)/g, ":id")
    .replace(/\[\^\/]\+/g, ":id")
    .replace(/\?/g, "")
    .replace(/\\/g, "");
}

function nearbyHandler(content: string, offset: number): string | null {
  const nearby = content.slice(offset, Math.min(content.length, offset + 500));
  const match = /\b(handle[A-Za-z0-9_]+Request)\b/.exec(nearby);

  return match?.[1] ?? null;
}

function nearestChunkId(chunks: CodeChunk[], lineStart: number, preferredKind?: CodeChunkKind): string | null {
  const exact = chunks.find((chunk) => chunk.lineStart <= lineStart && chunk.lineEnd >= lineStart && (!preferredKind || chunk.kind === preferredKind));

  if (exact) {
    return exact.id;
  }

  return chunks.find((chunk) => chunk.lineStart <= lineStart && chunk.lineEnd >= lineStart)?.id ?? null;
}

function nextTestLineEnd(lines: string[], lineStart: number): number {
  for (let index = lineStart; index < lines.length; index += 1) {
    if (/^\s*(?:test|it)\s*\(/.test(lines[index] ?? "")) {
      return index;
    }
  }

  return lines.length;
}

function symbolKindFromChunkKind(kind: CodeChunkKind, name: string, file: CodeFileKnowledge): CodeSymbolKind {
  if (kind === "component" || isComponentName(name, file)) {
    return "component";
  }

  if (kind === "class") {
    return "class";
  }

  if (kind === "schema") {
    return "table";
  }

  if (kind === "route") {
    return "route_handler";
  }

  if (kind === "exports") {
    return "type";
  }

  return "function";
}

function isComponentName(name: string, file: CodeFileKnowledge): boolean {
  return file.language === "tsx" && /^[A-Z]/.test(name);
}

function chunkMatchesFilters(chunk: CodeChunk, filters: CodebaseSearchFilters | undefined): boolean {
  if (filters?.pathPrefix && !chunk.path.startsWith(filters.pathPrefix)) {
    return false;
  }

  if (filters?.sourceKinds && filters.sourceKinds.length > 0 && !filters.sourceKinds.includes(chunk.sourceKind)) {
    return false;
  }

  if (filters?.languages && filters.languages.length > 0 && !filters.languages.includes(chunk.language)) {
    return false;
  }

  if (filters?.chunkKinds && filters.chunkKinds.length > 0 && !filters.chunkKinds.includes(chunk.kind)) {
    return false;
  }

  return true;
}

function searchableChunkText(chunk: CodeChunk): string {
  return compactText([chunk.path, chunk.title, chunk.kind, chunk.sourceKind, chunk.language, chunk.symbolNames.join(" "), chunk.text].join(" "));
}

function uniqueTerms(query: string): string[] {
  return dedupe(tokenize(query)).filter((term) => term.length > 1);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_$/.:-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function frequencyMap(values: string[]): Map<string, number> {
  const map = new Map<string, number>();

  for (const value of values) {
    map.set(value, (map.get(value) ?? 0) + 1);
  }

  return map;
}

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.split("\n").length;
}

function lineOffsets(text: string): number[] {
  const offsets = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      offsets.push(index + 1);
    }
  }

  return offsets;
}

function offsetLine(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function entityId(prefix: string, ...parts: string[]): string {
  return `${prefix}:${createHash("sha1").update(parts.join("\0")).digest("hex").slice(0, 28)}`;
}

function scopedEntityId(prefix: string, scope: BrainScope, ...parts: string[]): string {
  return entityId(prefix, scope.userId ?? "", scope.workspaceId ?? "", scope.projectId ?? "", scope.sphereId ?? "", ...parts);
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function dedupeBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    const itemKey = key(value);

    if (seen.has(itemKey)) {
      continue;
    }

    seen.add(itemKey);
    result.push(value);
  }

  return result;
}

function batches<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }

  return result;
}

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clipText(text: string, maxLength: number): string {
  const compact = text.trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1).trim()}...`;
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isInteger(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(value ?? fallback, max));
}

function objectMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

type ScopeColumn = AnyPgColumn;
type ScopeTable = {
  userId: ScopeColumn;
  workspaceId: ScopeColumn;
  projectId: ScopeColumn;
  sphereId: ScopeColumn;
};

function scopeWhere(table: ScopeTable, scope: BrainScope): SQL {
  return and(
    nullableEq(table.userId, scope.userId),
    nullableEq(table.workspaceId, scope.workspaceId),
    nullableEq(table.projectId, scope.projectId),
    nullableEq(table.sphereId, scope.sphereId),
  ) ?? sql`true`;
}

function nullableEq(column: ScopeColumn, value: string | null): SQL {
  return value === null ? isNull(column) : eq(column, value);
}

function scanSummaryFromRun(row: typeof codebaseScanRuns.$inferSelect): CodebaseScanSummary {
  return {
    scanId: row.id,
    repoRoot: row.repoRoot,
    gitCommit: row.gitCommit,
    status: row.status as CodebaseScanSummary["status"],
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    fileCount: row.fileCount,
    chunkCount: row.chunkCount,
    symbolCount: row.symbolCount,
    importCount: row.importCount,
    routeCount: row.routeCount,
    testCount: row.testCount,
    docCount: row.docCount,
    findingCount: row.findingCount,
    memoryNoteCount: row.memoryNoteCount,
    changedFileCount: row.changedFileCount,
    staleFileCount: row.staleFileCount,
    excludedCount: row.excludedCount,
  };
}
