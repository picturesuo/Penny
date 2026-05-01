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
  instructions: string;
};

export type SearchBroker = {
  prepare(input: SearchDecisionInput, mode: SearchMode, context?: SearchDecisionContext): SearchBrokerResult;
};

export function createSearchBroker(capabilities: SearchBrokerCapabilities = {}): SearchBroker {
  return {
    prepare(input, mode, context = {}) {
      const decision = shouldUseWebSearch(input, mode, context);
      const toolOptions = webSearchToolOptions(decision);
      const webSearch = capabilities.webSearch ?? null;
      const tools = decision.useWebSearch && webSearch ? ({ web_search: webSearch(toolOptions) } as ToolSet) : undefined;

      return {
        decision,
        tools,
        toolOptions: tools ? toolOptions : null,
        instructions: searchInstructions(decision, {
          providerName: capabilities.providerName ?? "unknown",
          toolAvailable: Boolean(webSearch),
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

function domainFilterOptions(filters: SearchFilters): {
  allowedDomains?: string[];
  excludedDomains?: string[];
} {
  return {
    ...(filters.allowedDomains?.length ? { allowedDomains: [...filters.allowedDomains].slice(0, 5) } : {}),
    ...(filters.excludedDomains?.length ? { excludedDomains: [...filters.excludedDomains].slice(0, 5) } : {}),
  };
}
