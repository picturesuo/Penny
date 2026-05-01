import {
  shouldUseWebSearch,
  type SearchDecision,
  type SearchDecisionContext,
  type SearchDecisionInput,
  type SearchFilters,
  type SearchMode,
} from "./search-decision-service.ts";
import type { ToolSet } from "ai";

export type WebSearchToolFactory = (options?: {
  allowedDomains?: string[];
  excludedDomains?: string[];
  enableImageUnderstanding?: boolean;
}) => unknown;

export type SearchBrokerCapabilities = {
  webSearch?: WebSearchToolFactory | null;
  providerName?: string;
};

export type SearchBrokerResult = {
  decision: SearchDecision;
  tools: ToolSet | undefined;
  toolOptions: ReturnType<typeof webSearchToolOptions> | null;
  providerName: string;
  providerToolAvailable: boolean;
  providerToolAttached: boolean;
  instructions: string;
};

export type SearchBroker = {
  prepare(input: SearchDecisionInput, mode: SearchMode, context?: SearchDecisionContext): SearchBrokerResult;
};

export type SearchTraceResult = {
  title: string | null;
  url: string | null;
  snippet: string | null;
  sourceType: string | null;
};

export type SearchTrace = {
  mode: SearchMode;
  decision: SearchDecision;
  providerName: string;
  providerToolAvailable: boolean;
  providerToolAttached: boolean;
  toolOptions: ReturnType<typeof webSearchToolOptions> | null;
  resultCount: number;
  results: SearchTraceResult[];
};

export function createSearchBroker(capabilities: SearchBrokerCapabilities = {}): SearchBroker {
  return {
    prepare(input, mode, context = {}) {
      const decision = shouldUseWebSearch(input, mode, context);
      const toolOptions = webSearchToolOptions(decision);
      const webSearch = capabilities.webSearch ?? null;
      const tools = decision.useWebSearch && webSearch ? ({ web_search: webSearch(toolOptions) } as ToolSet) : undefined;
      const providerName = capabilities.providerName ?? "unknown";
      const providerToolAvailable = Boolean(webSearch);
      const providerToolAttached = Boolean(tools);

      return {
        decision,
        tools,
        toolOptions: tools ? toolOptions : null,
        providerName,
        providerToolAvailable,
        providerToolAttached,
        instructions: searchInstructions(decision, {
          providerName,
          toolAvailable: providerToolAvailable,
          toolOptions: tools ? toolOptions : null,
        }),
      };
    },
  };
}

export function webSearchToolOptions(decision: SearchDecision): {
  allowedDomains?: string[];
  excludedDomains?: string[];
  enableImageUnderstanding: false;
} {
  return {
    ...domainFilterOptions(decision.filters),
    enableImageUnderstanding: false,
  };
}

export function searchInstructions(
  decision: SearchDecision,
  broker: {
    providerName: string;
    toolAvailable: boolean;
    toolOptions: ReturnType<typeof webSearchToolOptions> | null;
  },
): string {
  const filters = [
    decision.filters.allowedDomains?.length ? `allowed domains: ${decision.filters.allowedDomains.join(", ")}` : null,
    decision.filters.excludedDomains?.length ? `excluded domains: ${decision.filters.excludedDomains.join(", ")}` : null,
    decision.filters.recencyDays ? `recency: last ${decision.filters.recencyDays} days` : null,
    decision.filters.academic ? "academic/research sources preferred" : null,
  ].filter((line): line is string => Boolean(line));

  return [
    "Search decision:",
    `- useWebSearch: ${decision.useWebSearch}`,
    `- depth: ${decision.depth}`,
    `- reason: ${decision.reason}`,
    `- reasonCodes: ${decision.reasonCodes.join(", ") || "none"}`,
    `- signals: ${decision.signals.join(", ") || "none"}`,
    `- query: ${decision.query || "none"}`,
    `- provider: ${broker.providerName}`,
    `- providerToolAvailable: ${broker.toolAvailable}`,
    `- providerToolAttached: ${Boolean(broker.toolOptions)}`,
    filters.length ? `- filters: ${filters.join("; ")}` : "- filters: none",
    "- Use web_search only when providerToolAttached is true.",
    "- If recency or academic filters are not provider-native, apply them in query wording and source selection.",
  ].join("\n");
}

export function searchTraceFromBrokerResult(result: SearchBrokerResult, providerSources: unknown[] = []): SearchTrace {
  const results = providerSources
    .map(searchTraceResult)
    .filter((source): source is SearchTraceResult => Boolean(source))
    .slice(0, 12);

  return {
    mode: result.decision.mode,
    decision: result.decision,
    providerName: result.providerName,
    providerToolAvailable: result.providerToolAvailable,
    providerToolAttached: result.providerToolAttached,
    toolOptions: result.toolOptions,
    resultCount: results.length,
    results,
  };
}

function domainFilterOptions(filters: SearchFilters): {
  allowedDomains?: string[];
  excludedDomains?: string[];
} {
  return {
    ...(filters.allowedDomains?.length ? { allowedDomains: [...filters.allowedDomains].slice(0, 5) } : {}),
    ...(filters.excludedDomains?.length ? { excludedDomains: [...filters.excludedDomains].slice(0, 5) } : {}),
  };
}

function searchTraceResult(source: unknown): SearchTraceResult | null {
  const record = objectRecord(source);

  if (!record) {
    return null;
  }

  const url = firstString(record, ["url", "uri", "link"]);
  const title = firstString(record, ["title", "name"]);
  const snippet = firstString(record, ["snippet", "summary", "description", "text", "content"]);
  const sourceType = firstString(record, ["sourceType", "type", "kind"]);

  if (!url && !title && !snippet) {
    return null;
  }

  return {
    title: title ? title.slice(0, 240) : null,
    url: url ? url.slice(0, 500) : null,
    snippet: snippet ? snippet.slice(0, 1_000) : null,
    sourceType: sourceType ? sourceType.slice(0, 80) : null,
  };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}
