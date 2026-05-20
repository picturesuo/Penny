export const searchModes = ["learn", "verify", "check", "brain", "autopilot"] as const;

export type SearchMode = (typeof searchModes)[number];
export type SearchDepth = "fast" | "deep";

export type SearchFilters = {
  allowedDomains?: string[];
  excludedDomains?: string[];
  recencyDays?: number;
  academic?: boolean;
};

export type SearchDecisionInput = {
  query?: string;
  text?: string;
  userRequest?: string;
};

export type SearchDecisionContext = {
  brainContext?: string | null;
  brainContextSufficient?: boolean;
  knownBrainEntities?: ReadonlyArray<string>;
  claimRequiresExternalEvidence?: boolean;
  verifyRequiresSources?: boolean;
  highStakes?: boolean;
  filters?: SearchFilters;
};

export type SearchDecision = {
  mode: SearchMode;
  useWebSearch: boolean;
  depth: SearchDepth;
  reason: string;
  reasonCodes: ReadonlyArray<string>;
  signals: ReadonlyArray<string>;
  query: string;
  filters: SearchFilters;
};

const explicitSearchPattern =
  /\b(search|web|browse|look up|lookup|google|source|sources|citation|citations|verify|fact[- ]check|find evidence|current|latest|today|recent|news)\b/i;
const currentPattern = /\b(current|latest|today|yesterday|tomorrow|recent|new|news|this week|this month|202[4-9]|price|pricing|version|release|law|regulation)\b/i;
const externalEvidencePattern =
  /\b(study|research|source|citation|evidence|survey|benchmark|according to|reported|data|market|customer|adoption|retention|conversion|revenue|sales|pricing|pay|users|companies|founders)\b/i;
const quantitativePattern =
  /[$%]|\b\d+(?:\.\d+)?\s*(?:percent|%|k|m|million|billion|users|customers|founders|months|days|weeks|dollars|usd)\b/i;
const highStakesPattern =
  /\b(medical|health|clinical|legal|law|tax|finance|financial|security|privacy|compliance|regulation|safety|insurance|investment)\b/i;
const academicPattern = /\b(study|research|paper|journal|clinical|science|evidence|experiment|trial|meta-analysis|dataset)\b/i;

export function shouldUseWebSearch(
  input: SearchDecisionInput,
  mode: SearchMode,
  context: SearchDecisionContext = {},
): SearchDecision {
  const requestText = compactText([input.userRequest, input.query, input.text].filter(Boolean).join("\n"));
  const query = compactText(input.query || input.text || input.userRequest || "");
  const reasonCodes = new Set<string>();
  const signals = new Set<string>();
  const filters: SearchFilters = { ...(context.filters ?? {}) };

  if (mode === "brain") {
    return {
      mode,
      useWebSearch: false,
      depth: "fast",
      reason: "Brain mode reads persisted Penny rows and does not browse.",
      reasonCodes: [],
      signals: [],
      query: query || requestText.slice(0, 240),
      filters: normalizeFilters(filters),
    };
  }

  if (explicitSearchPattern.test(`${input.userRequest ?? ""}\n${input.text ?? ""}`)) {
    reasonCodes.add("user_explicitly_asks");
    signals.add("explicit_search_request");
  }

  if (currentPattern.test(requestText)) {
    reasonCodes.add("current_or_time_sensitive");
    signals.add("current_time_sensitive");
    filters.recencyDays ??= 30;
  }

  const missingEntities = namedEntitiesNotInBrain(requestText, context);

  if (missingEntities.length > 0 && (externalEvidencePattern.test(requestText) || quantitativePattern.test(requestText) || mode === "verify")) {
    reasonCodes.add("named_entity_or_fact_not_in_brain");
    for (const entity of missingEntities.slice(0, 4)) {
      signals.add(`entity:${entity}`);
    }
  }

  if (context.claimRequiresExternalEvidence || externalEvidencePattern.test(requestText) || quantitativePattern.test(requestText)) {
    reasonCodes.add("claim_requires_external_evidence");
    signals.add("external_evidence");
  }

  if (context.brainContextSufficient === false || (!context.brainContext?.trim() && hasExternalFactSignal(requestText))) {
    reasonCodes.add("brain_context_insufficient");
    signals.add("brain_context_gap");
  }

  if (mode === "verify" || context.verifyRequiresSources) {
    reasonCodes.add("verify_requires_sources");
    signals.add("verify_source_grounding");
  }

  if (context.highStakes || highStakesPattern.test(requestText)) {
    reasonCodes.add("high_stakes_factual_claim");
    signals.add("high_stakes");
  }

  if (academicPattern.test(requestText)) {
    filters.academic ??= true;
    signals.add("academic_or_research");
  }

  const useWebSearch = reasonCodes.size > 0;
  const depth = deepSearchNeeded(reasonCodes, requestText) ? "deep" : "fast";

  return {
    mode,
    useWebSearch,
    depth,
    reason: reasonFor(reasonCodes, useWebSearch),
    reasonCodes: [...reasonCodes],
    signals: [...signals],
    query: query || requestText.slice(0, 240),
    filters: normalizeFilters(filters),
  };
}

function deepSearchNeeded(reasonCodes: Set<string>, text: string): boolean {
  return (
    reasonCodes.has("verify_requires_sources") ||
    reasonCodes.has("high_stakes_factual_claim") ||
    (reasonCodes.has("current_or_time_sensitive") && /\b(latest|today|news|law|regulation|price|pricing)\b/i.test(text)) ||
    /\b(deep|thorough|comprehensive|academic|research)\b/i.test(text)
  );
}

function reasonFor(reasonCodes: Set<string>, useWebSearch: boolean): string {
  if (!useWebSearch) {
    return "Brain context is sufficient and no external factual signal requires web search.";
  }

  if (reasonCodes.has("user_explicitly_asks")) {
    return "The user explicitly asked Penny to search or cite sources.";
  }

  if (reasonCodes.has("verify_requires_sources")) {
    return "Verify requires source grounding when search is available.";
  }

  if (reasonCodes.has("high_stakes_factual_claim")) {
    return "The claim is high-stakes and should be grounded in external evidence.";
  }

  if (reasonCodes.has("current_or_time_sensitive")) {
    return "The claim may have changed recently and needs current information.";
  }

  if (reasonCodes.has("named_entity_or_fact_not_in_brain")) {
    return "The claim mentions a named entity or fact that is not grounded in Brain context.";
  }

  if (reasonCodes.has("brain_context_insufficient")) {
    return "Brain context is insufficient for the factual part of this request.";
  }

  return "The claim requires external evidence before Penny should treat it as grounded.";
}

function hasExternalFactSignal(text: string): boolean {
  return externalEvidencePattern.test(text) || quantitativePattern.test(text) || highStakesPattern.test(text);
}

function namedEntitiesNotInBrain(text: string, context: SearchDecisionContext): string[] {
  const brainText = `${context.brainContext ?? ""}\n${(context.knownBrainEntities ?? []).join("\n")}`.toLowerCase();
  const matches = text.match(/\b[A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){0,4}\b/g) ?? [];
  const stop = new Set(["Penny", "Brain", "Create", "Learn", "Check", "Verify", "Search", "Autopilot", "I"]);

  return [...new Set(matches.map((value) => value.trim()).filter((value) => value.length > 2 && !stop.has(value)))]
    .filter((entity) => !brainText.includes(entity.toLowerCase()))
    .slice(0, 8);
}

function normalizeFilters(filters: SearchFilters): SearchFilters {
  return {
    ...(filters.allowedDomains?.length ? { allowedDomains: normalizedDomains(filters.allowedDomains).slice(0, 5) } : {}),
    ...(filters.excludedDomains?.length ? { excludedDomains: normalizedDomains(filters.excludedDomains).slice(0, 5) } : {}),
    ...(typeof filters.recencyDays === "number" && Number.isFinite(filters.recencyDays)
      ? { recencyDays: Math.max(1, Math.min(3650, Math.round(filters.recencyDays))) }
      : {}),
    ...(filters.academic ? { academic: true } : {}),
  };
}

function normalizedDomains(domains: ReadonlyArray<string>): string[] {
  return [...new Set(domains.map((domain) => domain.trim().toLowerCase()).filter(Boolean))];
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
