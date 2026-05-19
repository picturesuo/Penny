import { createHash } from "node:crypto";
import { z } from "zod";
import { scopeValues, type BrainScope } from "./scope.ts";

export type SourceImportKind =
  | "text"
  | "markdown"
  | "pdf"
  | "chatgpt_export"
  | "claude_export"
  | "docs_text"
  | "canvas_text"
  | "json"
  | "csv"
  | "zip";

export type MemoryNodeType =
  | "idea"
  | "project"
  | "preference"
  | "goal"
  | "frustration"
  | "question"
  | "source_fact"
  | "decision"
  | "rejected_direction";

export type MemoryEdgeKind = "derived_from" | "related_to" | "same_cluster" | "supports" | "challenges" | "rejects";

export type SourcePermission = {
  visibility: "private";
  trainingUse: false;
  source: "user_upload" | "manual_import";
  allowedUses: Array<"private_memory" | "create_retrieval">;
};

export type SourceImport = {
  id: string;
  kind: SourceImportKind;
  label: string;
  scope: BrainScope;
  privacy: {
    visibility: "private";
    trainingUse: false;
    rawRetention: boolean;
  };
  permission: SourcePermission;
  textHash: string;
  contentLength: number;
  chunkCount: number;
  memoryNodeCount: number;
  createdAt: string;
  updatedAt: string;
  fileName?: string;
  mimeType?: string;
  sourceUri?: string;
};

export type SourceChunk = {
  id: string;
  sourceId: string;
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
  tokenEstimate: number;
  hash: string;
  createdAt: string;
};

export type MemoryNode = {
  id: string;
  type: MemoryNodeType;
  title: string;
  summary: string;
  text: string;
  sourceId: string;
  chunkIds: string[];
  confidence: number;
  tags: string[];
  permission: SourcePermission;
  createdAt: string;
  lastSeenAt: string;
};

export type MemoryEdge = {
  id: string;
  kind: MemoryEdgeKind;
  fromNodeId: string;
  toNodeId: string;
  sourceId: string;
  weight: number;
  createdAt: string;
};

export type UserProfileSignalKind =
  | "recurring_interest"
  | "active_idea_cluster"
  | "taste_signal"
  | "preferred_build_style"
  | "common_frustration";

export type UserProfileSignal = {
  id: string;
  kind: UserProfileSignalKind;
  label: string;
  summary: string;
  weight: number;
  sourceNodeIds: string[];
  updatedAt: string;
};

export type IngestionJob = {
  id: string;
  status: "completed" | "failed";
  sourceImport: SourceImport | null;
  sourceId: string | null;
  errorMessages: string[];
  importedAt: string;
  completedAt: string;
  counts: {
    sources: number;
    chunks: number;
    memoryNodes: number;
    memoryEdges: number;
    profileSignals: number;
  };
};

export type RetrievalResult = {
  id: string;
  nodeId: string;
  sourceId: string;
  chunkId: string;
  type: MemoryNodeType;
  title: string;
  summary: string;
  excerpt: string;
  score: number;
  memoryRef: {
    id: string;
    label: string;
    kind: "brain" | "preference" | "context";
    summary: string;
  };
  sourceRef: {
    id: string;
    label: string;
    kind: "source";
    excerpt: string;
    sourceRange: string;
    url?: string | null;
  };
  permission: SourcePermission;
};

export type BrainMemoryProfile = {
  sourceOfTruth: "private_user_memory_sources_chunks_nodes_edges_profile_signals";
  scope: BrainScope;
  sources: SourceImport[];
  jobs: IngestionJob[];
  recentMemoryNodes: MemoryNode[];
  memoryEdges: MemoryEdge[];
  profile: {
    recurringInterests: UserProfileSignal[];
    activeIdeaClusters: UserProfileSignal[];
    tasteSignals: UserProfileSignal[];
    preferredBuildStyle: UserProfileSignal[];
    commonFrustrations: UserProfileSignal[];
    privacySafeSummary: string;
  };
  stats: {
    sourceCount: number;
    chunkCount: number;
    memoryNodeCount: number;
    memoryEdgeCount: number;
    profileSignalCount: number;
  };
};

export type BrainMemoryRetrieval = {
  sourceOfTruth: "private_user_memory_retrieval";
  query: string;
  contextLight: boolean;
  results: RetrievalResult[];
};

export type CreateMemoryRetrievalContext = {
  contextLight: boolean;
  memoryRefs: Array<{
    id: string;
    label: string;
    kind: "brain" | "preference" | "context";
    summary: string;
  }>;
  sourceRefs: Array<{
    id: string;
    label: string;
    kind: "source";
    excerpt: string;
    url?: string | null | undefined;
    sourceRange?: string | null | undefined;
  }>;
  results: RetrievalResult[];
};

export type BrainMemoryRouteService = {
  importSource(input: BrainImportInput, request: Request): Promise<{ job: IngestionJob; profile: BrainMemoryProfile }>;
  getJob(jobId: string, request: Request): Promise<IngestionJob | null>;
  getProfile(request: Request): Promise<BrainMemoryProfile>;
  retrieve(input: BrainRetrieveInput, request: Request): Promise<BrainMemoryRetrieval>;
  deleteSource(sourceId: string, request: Request): Promise<{ deleted: boolean; profile: BrainMemoryProfile }>;
};

type BrainImportInput = z.infer<typeof BrainImportBodySchema>;
type BrainRetrieveInput = z.infer<typeof BrainRetrieveBodySchema>;

type ScopeMemoryStore = {
  sources: Map<string, SourceImport>;
  chunks: Map<string, SourceChunk>;
  nodes: Map<string, MemoryNode>;
  edges: Map<string, MemoryEdge>;
  jobs: Map<string, IngestionJob>;
  signals: Map<string, UserProfileSignal>;
};

type ChunkDraft = {
  text: string;
  charStart: number;
  charEnd: number;
};

type ClassifiedSentence = {
  type: MemoryNodeType;
  text: string;
};

const sourceImportKinds = [
  "text",
  "markdown",
  "pdf",
  "chatgpt_export",
  "claude_export",
  "docs_text",
  "canvas_text",
  "json",
  "csv",
  "zip",
] as const satisfies readonly SourceImportKind[];

const SourceImportKindSchema = z.enum(sourceImportKinds);

const BrainImportBodySchema = z
  .object({
    kind: SourceImportKindSchema.optional().default("text"),
    label: z.string().trim().min(1).max(240).optional(),
    fileName: z.string().trim().min(1).max(240).optional(),
    mimeType: z.string().trim().min(1).max(160).optional(),
    sourceUri: z.string().trim().min(1).max(1_000).optional(),
    content: z.string().max(2_000_000).optional(),
    text: z.string().max(2_000_000).optional(),
    rawRetention: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((value, context) => {
    const content = value.content?.trim() || value.text?.trim() || "";

    if (!content) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: "Brain import needs text content. ZIP/PDF binary parsing is not available unless text has already been extracted.",
      });
    }
  });

const BrainRetrieveBodySchema = z
  .object({
    query: z.string().trim().min(1).max(20_000),
    limit: z.number().int().min(1).max(20).optional().default(8),
    nodeTypes: z.array(z.enum(memoryNodeTypes())).max(9).optional(),
  })
  .strict();

const defaultPermission: SourcePermission = {
  visibility: "private",
  trainingUse: false,
  source: "user_upload",
  allowedUses: ["private_memory", "create_retrieval"],
};

const defaultStores = new Map<string, ScopeMemoryStore>();

export const defaultBrainMemoryService = createInMemoryBrainMemoryService(defaultStores);

export async function handleBrainImportRequest(
  request: Request,
  options: { service?: BrainMemoryRouteService } = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/brain/import requires the POST method.", "POST");
  }

  const parsed = await parseJsonRequest(request, BrainImportBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = options.service ?? defaultBrainMemoryService;
    return jsonResponse({ data: await service.importSource(parsed.data, request) });
  } catch (error) {
    return brainMemoryErrorResponse(error);
  }
}

export async function handleBrainImportJobRequest(
  request: Request,
  jobId: string,
  options: { service?: BrainMemoryRouteService } = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/brain/import/:jobId requires the GET method.", "GET");
  }

  const service = options.service ?? defaultBrainMemoryService;
  const job = await service.getJob(jobId, request);

  if (!job) {
    return jsonResponse({ error: { code: "brain_import_not_found", message: "No Brain import job matched that id." } }, 404);
  }

  return jsonResponse({ data: { job } });
}

export async function handleBrainMemoryProfileRequest(
  request: Request,
  options: { service?: BrainMemoryRouteService } = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/brain/memory/profile requires the GET method.", "GET");
  }

  const service = options.service ?? defaultBrainMemoryService;
  return jsonResponse({ data: await service.getProfile(request) });
}

export async function handleBrainRetrieveRequest(
  request: Request,
  options: { service?: BrainMemoryRouteService } = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/brain/retrieve requires the POST method.", "POST");
  }

  const parsed = await parseJsonRequest(request, BrainRetrieveBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const service = options.service ?? defaultBrainMemoryService;
  return jsonResponse({ data: await service.retrieve(parsed.data, request) });
}

export async function handleBrainSourceDeleteRequest(
  request: Request,
  sourceId: string,
  options: { service?: BrainMemoryRouteService } = {},
): Promise<Response> {
  if (request.method !== "DELETE") {
    return methodNotAllowed("DELETE /api/brain/sources/:sourceId requires the DELETE method.", "DELETE");
  }

  const service = options.service ?? defaultBrainMemoryService;
  const result = await service.deleteSource(sourceId, request);

  if (!result.deleted) {
    return jsonResponse({ error: { code: "brain_source_not_found", message: "No Brain source matched that id." } }, 404);
  }

  return jsonResponse({ data: result });
}

export function createInMemoryBrainMemoryService(stores = new Map<string, ScopeMemoryStore>()): BrainMemoryRouteService {
  function storeForScope(scope: BrainScope): ScopeMemoryStore {
    const key = scopeKey(scope);
    const existing = stores.get(key);

    if (existing) {
      return existing;
    }

    const store: ScopeMemoryStore = {
      sources: new Map(),
      chunks: new Map(),
      nodes: new Map(),
      edges: new Map(),
      jobs: new Map(),
      signals: new Map(),
    };

    stores.set(key, store);
    return store;
  }

  function retrievalForScope(scope: BrainScope, input: BrainRetrieveInput): BrainMemoryRetrieval {
    const store = storeForScope(scope);
    const results = retrieveFromStore(store, input.query, input.limit, input.nodeTypes);

    return {
      sourceOfTruth: "private_user_memory_retrieval",
      query: input.query,
      contextLight: results.length === 0,
      results,
    };
  }

  return {
    async importSource(input, request) {
      const scope = scopeFromRequest(request);
      const store = storeForScope(scope);
      const now = isoNow();
      const content = input.content ?? input.text ?? "";
      const baseLabel = input.label ?? input.fileName ?? labelForKind(input.kind);
      const jobId = stableId("brain-import-job", scopeKey(scope), input.kind, baseLabel, content, now);

      try {
        if (input.kind === "zip") {
          throw new BrainMemoryValidationError(
            "ZIP archive parsing is not available in this kernel. Import the exported conversations.json, CSV, markdown, or extracted text instead.",
          );
        }

        const normalized = normalizeImportedText(input.kind, content);
        const chunks = chunkText(normalized);

        if (!normalized.trim() || chunks.length === 0) {
          throw new BrainMemoryValidationError("Brain import did not contain usable text after normalization.");
        }

        const sourceId = stableId("brain-source", scopeKey(scope), input.kind, baseLabel, hashText(normalized));
        const source: SourceImport = {
          id: sourceId,
          kind: input.kind,
          label: baseLabel,
          scope,
          privacy: {
            visibility: "private" as const,
            trainingUse: false as const,
            rawRetention: input.rawRetention,
          },
          permission: defaultPermission,
          textHash: hashText(normalized),
          contentLength: normalized.length,
          chunkCount: chunks.length,
          memoryNodeCount: 0,
          createdAt: now,
          updatedAt: now,
          ...(input.fileName ? { fileName: input.fileName } : {}),
          ...(input.mimeType ? { mimeType: input.mimeType } : {}),
          ...(input.sourceUri ? { sourceUri: input.sourceUri } : {}),
        };
        const sourceChunks = chunks.map((chunk, index): SourceChunk => {
          const chunkHash = hashText(`${sourceId}:${index}:${chunk.text}`);

          return {
            id: stableId("brain-chunk", sourceId, index, chunkHash),
            sourceId,
            index,
            text: chunk.text,
            charStart: chunk.charStart,
            charEnd: chunk.charEnd,
            tokenEstimate: estimateTokens(chunk.text),
            hash: chunkHash,
            createdAt: now,
          };
        });
        const nodes = extractMemoryNodes(source, sourceChunks, now);
        const edges = inferMemoryEdges(source.id, nodes, now);
        const sourceWithCounts: SourceImport = {
          ...source,
          memoryNodeCount: nodes.length,
          updatedAt: now,
        };

        removeSourceData(store, sourceId);
        store.sources.set(sourceId, sourceWithCounts);
        for (const chunk of sourceChunks) {
          store.chunks.set(chunk.id, chunk);
        }
        for (const node of nodes) {
          store.nodes.set(node.id, node);
        }
        for (const edge of edges) {
          store.edges.set(edge.id, edge);
        }
        rebuildProfileSignals(store, now);

        const job: IngestionJob = {
          id: jobId,
          status: "completed",
          sourceImport: sourceWithCounts,
          sourceId,
          errorMessages: [],
          importedAt: now,
          completedAt: now,
          counts: {
            sources: 1,
            chunks: sourceChunks.length,
            memoryNodes: nodes.length,
            memoryEdges: edges.length,
            profileSignals: store.signals.size,
          },
        };

        store.jobs.set(job.id, job);
        return { job, profile: profileFromStore(scope, store) };
      } catch (error) {
        const job: IngestionJob = {
          id: jobId,
          status: "failed",
          sourceImport: null,
          sourceId: null,
          errorMessages: [formatErrorMessage(error)],
          importedAt: now,
          completedAt: now,
          counts: {
            sources: 0,
            chunks: 0,
            memoryNodes: 0,
            memoryEdges: 0,
            profileSignals: store.signals.size,
          },
        };

        store.jobs.set(job.id, job);
        return { job, profile: profileFromStore(scope, store) };
      }
    },

    async getJob(jobId, request) {
      return storeForScope(scopeFromRequest(request)).jobs.get(jobId) ?? null;
    },

    async getProfile(request) {
      const scope = scopeFromRequest(request);
      const store = storeForScope(scope);

      rebuildProfileSignals(store, isoNow());
      return profileFromStore(scope, store);
    },

    async retrieve(input, request) {
      return retrievalForScope(scopeFromRequest(request), input);
    },

    async deleteSource(sourceId, request) {
      const scope = scopeFromRequest(request);
      const store = storeForScope(scope);
      const deleted = removeSourceData(store, sourceId);

      if (deleted) {
        rebuildProfileSignals(store, isoNow());
      }

      return { deleted, profile: profileFromStore(scope, store) };
    },
  };
}

export function retrieveBrainMemoryForCreate(input: {
  scope: BrainScope;
  query: string;
  limit?: number;
}): CreateMemoryRetrievalContext {
  const store = defaultStores.get(scopeKey(input.scope));
  const results = store ? retrieveFromStore(store, input.query, input.limit ?? 5, undefined) : [];
  const retrieval: BrainMemoryRetrieval = {
    sourceOfTruth: "private_user_memory_retrieval",
    query: input.query,
    contextLight: results.length === 0,
    results,
  };

  return {
    contextLight: retrieval.results.length === 0,
    memoryRefs: uniqueById(retrieval.results.map((result) => result.memoryRef)).slice(0, 8),
    sourceRefs: uniqueById(retrieval.results.map((result) => result.sourceRef)).slice(0, 8),
    results: retrieval.results,
  };
}

function normalizeImportedText(kind: SourceImportKind, content: string): string {
  const raw = content.replace(/\u0000/g, " ");

  switch (kind) {
    case "chatgpt_export":
      return normalizeWhitespace(extractChatGptExportText(raw));
    case "claude_export":
      return normalizeWhitespace(extractClaudeExportText(raw));
    case "json":
      return normalizeWhitespace(extractGenericJsonText(raw));
    case "csv":
      return normalizeWhitespace(extractCsvText(raw));
    case "markdown":
    case "docs_text":
    case "canvas_text":
      return normalizeWhitespace(stripMarkdown(raw));
    case "pdf":
    case "text":
      return normalizeWhitespace(raw);
    case "zip":
      throw new BrainMemoryValidationError("ZIP archive parsing is not available in this kernel.");
  }
}

function extractChatGptExportText(content: string): string {
  const parsed = parseJsonOrNull(content);

  if (!parsed) {
    return content;
  }

  const conversations = Array.isArray(parsed) ? parsed : arrayValue(recordValue(parsed)?.conversations) ?? [parsed];
  const lines: string[] = [];

  for (const conversation of conversations) {
    const conversationRecord = recordValue(conversation);

    if (!conversationRecord) {
      continue;
    }

    const title = stringValue(conversationRecord.title) ?? stringValue(conversationRecord.name);
    if (title) {
      lines.push(`Conversation: ${title}`);
    }

    const mapping = recordValue(conversationRecord.mapping);
    if (mapping) {
      for (const value of Object.values(mapping)) {
        const node = recordValue(value);
        const message = recordValue(node?.message);
        const text = message ? messageContentText(message.content) : "";
        const role = stringValue(recordValue(message?.author)?.role) ?? "message";

        if (text) {
          lines.push(`${role}: ${text}`);
        }
      }
    }

    const messages = arrayValue(conversationRecord.messages) ?? arrayValue(conversationRecord.chat_messages) ?? [];
    for (const messageValue of messages) {
      const message = recordValue(messageValue);
      const text = message ? messageContentText(message.content) || stringValue(message.text) || stringValue(message.message) || "" : "";
      const role = stringValue(message?.role) ?? stringValue(message?.sender) ?? "message";

      if (text) {
        lines.push(`${role}: ${text}`);
      }
    }
  }

  return lines.length ? lines.join("\n") : extractGenericJsonText(content);
}

function extractClaudeExportText(content: string): string {
  const parsed = parseJsonOrNull(content);

  if (!parsed) {
    return extractCsvText(content);
  }

  const conversations = Array.isArray(parsed) ? parsed : arrayValue(recordValue(parsed)?.conversations) ?? [parsed];
  const lines: string[] = [];

  for (const conversation of conversations) {
    const conversationRecord = recordValue(conversation);

    if (!conversationRecord) {
      continue;
    }

    const title = stringValue(conversationRecord.name) ?? stringValue(conversationRecord.title);
    if (title) {
      lines.push(`Claude conversation: ${title}`);
    }

    const messages = arrayValue(conversationRecord.chat_messages) ?? arrayValue(conversationRecord.messages) ?? [];
    for (const messageValue of messages) {
      const message = recordValue(messageValue);
      const text = message ? messageContentText(message.content) || stringValue(message.text) || stringValue(message.message) || "" : "";
      const sender = stringValue(message?.sender) ?? stringValue(message?.role) ?? "message";

      if (text) {
        lines.push(`${sender}: ${text}`);
      }
    }
  }

  return lines.length ? lines.join("\n") : extractGenericJsonText(content);
}

function extractGenericJsonText(content: string): string {
  const parsed = parseJsonOrNull(content);

  if (!parsed) {
    return content;
  }

  const lines: string[] = [];
  walkJson(parsed, lines);

  return lines.join("\n");
}

function extractCsvText(content: string): string {
  const rows = content
    .split(/\r?\n/)
    .map((line) => parseCsvLine(line).map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));

  if (rows.length <= 1) {
    return content;
  }

  const headers = rows[0]?.map((header) => header.toLowerCase()) ?? [];
  const textIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => /text|content|message|prompt|response|title|summary/.test(header))
    .map(({ index }) => index);
  const indexes = textIndexes.length ? textIndexes : headers.map((_, index) => index);

  return rows
    .slice(1)
    .map((row) => indexes.map((index) => row[index]).filter(Boolean).join(" | "))
    .filter(Boolean)
    .join("\n");
}

function messageContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(messageContentText).filter(Boolean).join(" ");
  }

  const record = recordValue(content);
  if (!record) {
    return "";
  }

  const parts = arrayValue(record.parts);
  if (parts) {
    return parts.map(messageContentText).filter(Boolean).join(" ");
  }

  const contentArray = arrayValue(record.content);
  if (contentArray) {
    return contentArray.map(messageContentText).filter(Boolean).join(" ");
  }

  return stringValue(record.text) ?? stringValue(record.value) ?? "";
}

function walkJson(value: unknown, lines: string[]): void {
  if (typeof value === "string") {
    const clean = value.trim();

    if (clean.length >= 16) {
      lines.push(clean);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => walkJson(item, lines));
    return;
  }

  const record = recordValue(value);
  if (!record) {
    return;
  }

  for (const [key, child] of Object.entries(record)) {
    if (/id|uuid|created|updated|timestamp|url/i.test(key)) {
      continue;
    }
    walkJson(child, lines);
  }
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "");
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunkText(text: string, maxChars = 1_400): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  let position = 0;

  while (position < text.length) {
    const remaining = text.length - position;
    let end = remaining <= maxChars ? text.length : position + maxChars;

    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf("\n\n", end), text.lastIndexOf(". ", end), text.lastIndexOf("\n", end));
      if (boundary > position + Math.floor(maxChars * 0.45)) {
        end = boundary + (text.slice(boundary, boundary + 2) === ". " ? 1 : 0);
      }
    }

    const rawChunk = text.slice(position, end);
    const leading = rawChunk.length - rawChunk.trimStart().length;
    const clean = rawChunk.trim();

    if (clean) {
      chunks.push({
        text: clean,
        charStart: position + leading,
        charEnd: position + leading + clean.length,
      });
    }

    position = Math.max(end, position + 1);
  }

  return chunks;
}

function extractMemoryNodes(source: SourceImport, chunks: SourceChunk[], now: string): MemoryNode[] {
  const nodes: MemoryNode[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const sentences = sentenceCandidates(chunk.text)
      .map(classifySentence)
      .filter((candidate): candidate is ClassifiedSentence => Boolean(candidate));
    const prioritized = prioritizeSentences(sentences).slice(0, 8);

    for (const candidate of prioritized) {
      const key = `${candidate.type}:${candidate.text.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      const tags = importantWords(candidate.text).slice(0, 6);
      const title = titleForMemory(candidate.type, candidate.text);
      const id = stableId("memory-node", source.id, chunk.id, candidate.type, candidate.text);

      nodes.push({
        id,
        type: candidate.type,
        title,
        summary: clipText(candidate.text, 360),
        text: candidate.text,
        sourceId: source.id,
        chunkIds: [chunk.id],
        confidence: confidenceForType(candidate.type, candidate.text),
        tags,
        permission: source.permission,
        createdAt: now,
        lastSeenAt: now,
      });
    }
  }

  return nodes.slice(0, 120);
}

function sentenceCandidates(text: string): string[] {
  const candidates = text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/u))
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => line.length >= 18 && line.length <= 700);

  return candidates.length ? candidates : [clipText(text, 700)].filter((line) => line.length >= 18);
}

function classifySentence(text: string): ClassifiedSentence | null {
  const lower = text.toLowerCase();

  if (/\b(avoid|reject|rejected|not build|do not|don't|won't|instead of|not a generic|no generic|skip)\b/.test(lower)) {
    return { type: "rejected_direction", text };
  }

  if (/\b(decided|decision|chose|chosen|committed|settled|we will|i will|ship)\b/.test(lower)) {
    return { type: "decision", text };
  }

  if (/\b(frustrat|annoy|hate|blocked|pain|struggle|stuck|too much|generic|slop)\b/.test(lower)) {
    return { type: "frustration", text };
  }

  if (/\b(i|we)\s+(want|need|aim|hope|plan|intend|am trying|are trying)|\b(goal|objective|north star)\b/.test(lower)) {
    return { type: "goal", text };
  }

  if (/\b(prefer|like|taste|style|care about|i use|we use|should feel|visual direction|build style)\b/.test(lower)) {
    return { type: "preference", text };
  }

  if (/\?$/.test(text.trim()) || /^(how|what|why|should|can|could|where|when|who)\b/i.test(text.trim())) {
    return { type: "question", text };
  }

  if (/\b(project|app|startup|product|penny|build|workspace|prototype|kernel|feature)\b/.test(lower)) {
    return { type: "project", text };
  }

  if (/\b(idea|what if|maybe|could|concept|direction|opportunity)\b/.test(lower)) {
    return { type: "idea", text };
  }

  if (/\b(is|are|means|because|therefore|shows|proves|source|fact|note)\b/.test(lower)) {
    return { type: "source_fact", text };
  }

  return null;
}

function prioritizeSentences(sentences: ClassifiedSentence[]): ClassifiedSentence[] {
  const typeRank: Record<MemoryNodeType, number> = {
    goal: 9,
    decision: 8,
    rejected_direction: 8,
    preference: 7,
    frustration: 7,
    project: 6,
    idea: 6,
    question: 5,
    source_fact: 4,
  };

  return [...sentences].sort((left, right) => typeRank[right.type] - typeRank[left.type]);
}

function inferMemoryEdges(sourceId: string, nodes: MemoryNode[], now: string): MemoryEdge[] {
  const edges: MemoryEdge[] = [];

  for (let index = 0; index < nodes.length - 1; index += 1) {
    const from = nodes[index];
    const to = nodes[index + 1];

    if (!from || !to) {
      continue;
    }

    edges.push({
      id: stableId("memory-edge", sourceId, from.id, to.id, "derived_from"),
      kind: "derived_from",
      fromNodeId: from.id,
      toNodeId: to.id,
      sourceId,
      weight: 0.52,
      createdAt: now,
    });
  }

  const byTag = new Map<string, MemoryNode[]>();
  for (const node of nodes) {
    for (const tag of node.tags.slice(0, 3)) {
      byTag.set(tag, [...(byTag.get(tag) ?? []), node]);
    }
  }

  for (const [tag, taggedNodes] of byTag) {
    if (taggedNodes.length < 2) {
      continue;
    }

    const [first, second] = taggedNodes;
    if (!first || !second || first.id === second.id) {
      continue;
    }

    edges.push({
      id: stableId("memory-edge", sourceId, first.id, second.id, `same_cluster:${tag}`),
      kind: "same_cluster",
      fromNodeId: first.id,
      toNodeId: second.id,
      sourceId,
      weight: 0.68,
      createdAt: now,
    });
  }

  for (const rejected of nodes.filter((node) => node.type === "rejected_direction")) {
    const target = nodes.find((node) => node.id !== rejected.id && (node.type === "idea" || node.type === "project" || node.type === "goal"));
    if (!target) {
      continue;
    }

    edges.push({
      id: stableId("memory-edge", sourceId, rejected.id, target.id, "rejects"),
      kind: "rejects",
      fromNodeId: rejected.id,
      toNodeId: target.id,
      sourceId,
      weight: 0.74,
      createdAt: now,
    });
  }

  return uniqueById(edges).slice(0, 180);
}

function rebuildProfileSignals(store: ScopeMemoryStore, now: string): void {
  store.signals.clear();
  const nodes = [...store.nodes.values()];
  const tagCounts = new Map<string, { count: number; nodeIds: string[] }>();

  for (const node of nodes) {
    for (const tag of node.tags) {
      const current = tagCounts.get(tag) ?? { count: 0, nodeIds: [] };
      current.count += 1;
      current.nodeIds.push(node.id);
      tagCounts.set(tag, current);
    }
  }

  const topTags = [...tagCounts.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
    .slice(0, 6);

  for (const [tag, value] of topTags) {
    addSignal(store, {
      kind: "recurring_interest",
      label: startCase(tag),
      summary: `Recurring private memory topic seen in ${value.count} memory node(s).`,
      weight: Math.min(1, 0.35 + value.count * 0.12),
      sourceNodeIds: unique(value.nodeIds).slice(0, 8),
      updatedAt: now,
    });
  }

  addSignalsFromNodes(store, "active_idea_cluster", nodes.filter((node) => node.type === "idea" || node.type === "project" || node.type === "goal"), now);
  addSignalsFromNodes(store, "taste_signal", nodes.filter((node) => node.type === "preference"), now);
  addSignalsFromNodes(
    store,
    "preferred_build_style",
    nodes.filter((node) => node.type === "preference" || node.type === "goal" || /\b(build|ship|mvp|prototype|small|test|verify|bold|simple)\b/i.test(node.text)),
    now,
  );
  addSignalsFromNodes(store, "common_frustration", nodes.filter((node) => node.type === "frustration"), now);
}

function addSignalsFromNodes(store: ScopeMemoryStore, kind: UserProfileSignalKind, nodes: MemoryNode[], now: string): void {
  for (const node of nodes.slice(0, 5)) {
    addSignal(store, {
      kind,
      label: node.title,
      summary: node.summary,
      weight: node.confidence,
      sourceNodeIds: [node.id],
      updatedAt: now,
    });
  }
}

function addSignal(store: ScopeMemoryStore, input: Omit<UserProfileSignal, "id">): void {
  const id = stableId("profile-signal", input.kind, input.label, input.sourceNodeIds.join("|"));
  store.signals.set(id, { id, ...input });
}

function retrieveFromStore(
  store: ScopeMemoryStore,
  query: string,
  limit: number,
  nodeTypes: MemoryNodeType[] | undefined,
): RetrievalResult[] {
  const terms = importantWords(query);
  const allowedTypes = nodeTypes?.length ? new Set<MemoryNodeType>(nodeTypes) : null;
  const scored = [...store.nodes.values()]
    .filter((node) => !allowedTypes || allowedTypes.has(node.type))
    .map((node) => ({ node, score: scoreNode(node, query, terms) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return scored.flatMap(({ node, score }) => {
    const source = store.sources.get(node.sourceId);
    const chunk = node.chunkIds.map((chunkId) => store.chunks.get(chunkId)).find((item): item is SourceChunk => Boolean(item));

    if (!source || !chunk) {
      return [];
    }

    return [retrievalResultFromNode(node, source, chunk, score)];
  });
}

function scoreNode(node: MemoryNode, query: string, terms: string[]): number {
  const haystack = [node.title, node.summary, node.text, node.type, ...node.tags].join(" ").toLowerCase();
  const queryLower = query.toLowerCase();
  const lexical = terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
  const directPhrase = queryLower.length > 12 && haystack.includes(queryLower.slice(0, 80)) ? 1.5 : 0;
  const typeBoost = node.type === "preference" || node.type === "goal" || node.type === "project" || node.type === "idea" ? 0.35 : 0.1;
  const tagOverlap = node.tags.filter((tag) => queryLower.includes(tag)).length * 0.45;
  const score = lexical * 1.25 + directPhrase + tagOverlap + typeBoost + node.confidence * 0.25;

  return Math.round(score * 100) / 100;
}

function retrievalResultFromNode(node: MemoryNode, source: SourceImport, chunk: SourceChunk, score: number): RetrievalResult {
  const memoryKind = node.type === "preference" ? "preference" : node.type === "source_fact" ? "context" : "brain";

  return {
    id: stableId("brain-retrieval", node.id, source.id, chunk.id),
    nodeId: node.id,
    sourceId: source.id,
    chunkId: chunk.id,
    type: node.type,
    title: node.title,
    summary: node.summary,
    excerpt: excerptAround(chunk.text, node.text),
    score,
    memoryRef: {
      id: node.id,
      label: `${startCase(node.type)}: ${node.title}`,
      kind: memoryKind,
      summary: node.summary,
    },
    sourceRef: compactObject({
      id: source.id,
      label: source.label,
      kind: "source" as const,
      excerpt: excerptAround(chunk.text, node.text),
      sourceRange: `chunk ${chunk.index + 1}`,
      url: source.sourceUri ?? null,
    }),
    permission: node.permission,
  };
}

function profileFromStore(scope: BrainScope, store: ScopeMemoryStore): BrainMemoryProfile {
  const signals = [...store.signals.values()].sort((left, right) => right.weight - left.weight || left.label.localeCompare(right.label));
  const recentMemoryNodes = [...store.nodes.values()].sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt)).slice(0, 16);
  const sources = [...store.sources.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const privacySafeSummary = buildPrivacySafeSummary(sources, signals);

  return {
    sourceOfTruth: "private_user_memory_sources_chunks_nodes_edges_profile_signals",
    scope,
    sources,
    jobs: [...store.jobs.values()].sort((left, right) => Date.parse(right.importedAt) - Date.parse(left.importedAt)).slice(0, 20),
    recentMemoryNodes,
    memoryEdges: [...store.edges.values()].slice(-40),
    profile: {
      recurringInterests: signals.filter((signal) => signal.kind === "recurring_interest").slice(0, 6),
      activeIdeaClusters: signals.filter((signal) => signal.kind === "active_idea_cluster").slice(0, 6),
      tasteSignals: signals.filter((signal) => signal.kind === "taste_signal").slice(0, 6),
      preferredBuildStyle: signals.filter((signal) => signal.kind === "preferred_build_style").slice(0, 6),
      commonFrustrations: signals.filter((signal) => signal.kind === "common_frustration").slice(0, 6),
      privacySafeSummary,
    },
    stats: {
      sourceCount: store.sources.size,
      chunkCount: store.chunks.size,
      memoryNodeCount: store.nodes.size,
      memoryEdgeCount: store.edges.size,
      profileSignalCount: store.signals.size,
    },
  };
}

function buildPrivacySafeSummary(sources: SourceImport[], signals: UserProfileSignal[]): string {
  if (!sources.length) {
    return "No private user memory has been imported yet. Create will run context-light until sources are added.";
  }

  const topics = signals
    .filter((signal) => signal.kind === "recurring_interest")
    .map((signal) => signal.label.toLowerCase())
    .slice(0, 4);
  const topicPhrase = topics.length ? ` Current recurring topics: ${topics.join(", ")}.` : "";

  return `Private user memory from ${sources.length} imported source(s).${topicPhrase} Imported content is scoped to this user's Penny memory; no private global training is claimed or enabled.`;
}

function removeSourceData(store: ScopeMemoryStore, sourceId: string): boolean {
  const existed = store.sources.delete(sourceId);

  for (const [chunkId, chunk] of store.chunks) {
    if (chunk.sourceId === sourceId) {
      store.chunks.delete(chunkId);
    }
  }

  const removedNodeIds = new Set<string>();
  for (const [nodeId, node] of store.nodes) {
    if (node.sourceId === sourceId) {
      removedNodeIds.add(nodeId);
      store.nodes.delete(nodeId);
    }
  }

  for (const [edgeId, edge] of store.edges) {
    if (edge.sourceId === sourceId || removedNodeIds.has(edge.fromNodeId) || removedNodeIds.has(edge.toNodeId)) {
      store.edges.delete(edgeId);
    }
  }

  return existed || removedNodeIds.size > 0;
}

function scopeFromRequest(request: Request): BrainScope {
  return scopeValues({
    userId: firstPresentHeader(request, ["x-user-id", "x-penny-user-id"]),
    workspaceId: firstPresentHeader(request, ["x-workspace-id", "x-penny-workspace-id"]),
    projectId: firstPresentHeader(request, ["x-project-id", "x-penny-project-id"]),
    sphereId: firstPresentHeader(request, ["x-sphere-id", "x-penny-sphere-id"]),
  });
}

function firstPresentHeader(request: Request, names: string[]): string | null {
  for (const name of names) {
    const value = request.headers.get(name)?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function scopeKey(scope: BrainScope): string {
  return [scope.userId ?? "anon-user", scope.workspaceId ?? "anon-workspace", scope.projectId ?? "anon-project", scope.sphereId ?? "anon-sphere"].join("|");
}

function headersFromScope(scope: BrainScope): Headers {
  const headers = new Headers();

  if (scope.userId) {
    headers.set("x-user-id", scope.userId);
  }
  if (scope.workspaceId) {
    headers.set("x-workspace-id", scope.workspaceId);
  }
  if (scope.projectId) {
    headers.set("x-project-id", scope.projectId);
  }
  if (scope.sphereId) {
    headers.set("x-sphere-id", scope.sphereId);
  }

  return headers;
}

async function parseJsonRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<{ ok: true; data: z.infer<Schema> } | { ok: false; response: Response }> {
  const body = await request.text();

  if (!body.trim()) {
    return { ok: false, response: jsonResponse({ error: { code: "invalid_json", message: "Request body must be JSON." } }, 400) };
  }

  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch (error) {
    return {
      ok: false,
      response: jsonResponse({ error: { code: "invalid_json", message: `Request body is not valid JSON: ${formatErrorMessage(error)}` } }, 400),
    };
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "invalid_request",
            message: "Request body failed validation.",
            issues: parsed.error.issues.map((issue) => `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`),
          },
        },
        400,
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

function methodNotAllowed(message: string, allow: string): Response {
  return jsonResponse({ error: { code: "method_not_allowed", message } }, 405, { Allow: allow });
}

function brainMemoryErrorResponse(error: unknown): Response {
  if (error instanceof BrainMemoryValidationError) {
    return jsonResponse({ error: { code: "brain_memory_invalid", message: error.message } }, 400);
  }

  return jsonResponse({ error: { code: "brain_memory_failed", message: formatErrorMessage(error) } }, 500);
}

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

class BrainMemoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrainMemoryValidationError";
  }
}

function memoryNodeTypes(): [MemoryNodeType, ...MemoryNodeType[]] {
  return ["idea", "project", "preference", "goal", "frustration", "question", "source_fact", "decision", "rejected_direction"];
}

function titleForMemory(type: MemoryNodeType, text: string): string {
  const stripped = text.replace(/^(user|assistant|human|claude|message):\s*/i, "").trim();
  const prefix: Record<MemoryNodeType, string> = {
    idea: "Idea",
    project: "Project",
    preference: "Preference",
    goal: "Goal",
    frustration: "Frustration",
    question: "Question",
    source_fact: "Source fact",
    decision: "Decision",
    rejected_direction: "Rejected direction",
  };

  return `${prefix[type]} - ${clipText(stripped, 72)}`;
}

function confidenceForType(type: MemoryNodeType, text: string): number {
  const explicit = /\b(i|we|my|our|decided|prefer|goal|need|want|avoid)\b/i.test(text) ? 0.08 : 0;
  const base: Record<MemoryNodeType, number> = {
    decision: 0.86,
    goal: 0.82,
    preference: 0.8,
    rejected_direction: 0.8,
    frustration: 0.76,
    project: 0.74,
    idea: 0.7,
    question: 0.68,
    source_fact: 0.62,
  };

  return Math.min(0.96, Math.round((base[type] + explicit) * 100) / 100);
}

function labelForKind(kind: SourceImportKind): string {
  const labels: Record<SourceImportKind, string> = {
    text: "Text import",
    markdown: "Markdown import",
    pdf: "PDF text import",
    chatgpt_export: "ChatGPT export",
    claude_export: "Claude export",
    docs_text: "Document text import",
    canvas_text: "Canvas text import",
    json: "JSON import",
    csv: "CSV import",
    zip: "ZIP import",
  };

  return labels[kind];
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function importantWords(text: string): string[] {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "because",
    "before",
    "build",
    "could",
    "create",
    "generic",
    "have",
    "should",
    "their",
    "there",
    "these",
    "thing",
    "this",
    "through",
    "using",
    "want",
    "where",
    "which",
    "would",
  ]);

  return unique(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((word) => word.replace(/^-+|-+$/g, ""))
      .filter((word) => word.length > 3 && !stopWords.has(word))
      .slice(0, 40),
  );
}

function excerptAround(chunkTextValue: string, nodeText: string): string {
  const cleanChunk = chunkTextValue.replace(/\s+/g, " ").trim();
  const cleanNode = nodeText.replace(/\s+/g, " ").trim();
  const index = cleanChunk.toLowerCase().indexOf(cleanNode.toLowerCase().slice(0, 80));

  if (index < 0) {
    return clipText(cleanChunk, 360);
  }

  const start = Math.max(0, index - 90);
  const end = Math.min(cleanChunk.length, index + cleanNode.length + 90);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < cleanChunk.length ? "..." : "";

  return `${prefix}${cleanChunk.slice(start, end).trim()}${suffix}`;
}

function parseJsonOrNull(content: string): unknown | null {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function arrayValue(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (character === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += character ?? "";
  }

  cells.push(current);
  return cells;
}

function stableId(prefix: string, ...parts: Array<string | number | null | undefined>): string {
  const digest = createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("\u001f"))
    .digest("hex")
    .slice(0, 16);

  return `${prefix}-${digest}`;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    if (seen.has(value.id)) {
      continue;
    }

    seen.add(value.id);
    result.push(value);
  }

  return result;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function startCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function clipText(text: string, maxLength: number): string {
  const clean = text.replace(/\s+/g, " ").trim();

  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function isoNow(): string {
  return new Date().toISOString();
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
