import { derivePennyShapes } from "@/lib/penny-insights";
import { cleanSentence } from "@/lib/penny";
import { listMarginFragments, listSessions } from "@/server/penny";
import { listThoughtMaps } from "@/server/thought-map";
import type { SearchFilters, SearchQuery, SearchResponse, SearchResult } from "@/types/search";

function tokenize(value: string) {
  return cleanSentence(value)
    .toLowerCase()
    .split(/[\s/.,:;!?()[\]{}"'`~_-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreText(queryTokens: string[], text: string, weight: number) {
  if (queryTokens.length === 0) {
    return 0;
  }

  const fieldTokens = tokenize(text);
  if (fieldTokens.length === 0) {
    return 0;
  }

  const matches = queryTokens.filter((token) => fieldTokens.some((fieldToken) => fieldToken.includes(token) || token.includes(fieldToken)));
  return (matches.length / queryTokens.length) * weight;
}

function scoreFields(queryTokens: string[], fields: Array<{ text: string; weight: number }>) {
  return Math.min(
    1,
    fields.reduce((total, field) => total + scoreText(queryTokens, field.text, field.weight), 0),
  );
}

function findMatchedFields(queryTokens: string[], entries: Array<[string, string]>) {
  return entries
    .filter(([, text]) => scoreText(queryTokens, text, 1) > 0)
    .map(([field]) => field);
}

function matchesFilters(filters: SearchFilters, entityType: SearchResult["entityType"], metadata: Record<string, unknown>) {
  if (filters.entityTypes.length > 0 && !filters.entityTypes.includes(entityType)) {
    return false;
  }

  if (filters.confidenceRange && typeof metadata.confidence === "number") {
    const [min, max] = filters.confidenceRange;
    if (metadata.confidence < min || metadata.confidence > max) {
      return false;
    }
  }

  if (filters.status.length > 0 && typeof metadata.status === "string" && !filters.status.includes(metadata.status)) {
    return false;
  }

  if (filters.hasResolutionDate != null && typeof metadata.hasResolutionDate === "boolean" && metadata.hasResolutionDate !== filters.hasResolutionDate) {
    return false;
  }

  if (filters.hasDialecticRounds != null && typeof metadata.dialecticRoundCount === "number") {
    const hasRounds = metadata.dialecticRoundCount > 0;
    if (hasRounds !== filters.hasDialecticRounds) {
      return false;
    }
  }

  if (filters.domains.length > 0 && typeof metadata.domain === "string" && !filters.domains.includes(metadata.domain)) {
    return false;
  }

  if (filters.stakeLevel.length > 0 && typeof metadata.stakeLevel === "string" && !filters.stakeLevel.includes(metadata.stakeLevel)) {
    return false;
  }

  return true;
}

function makeSuggestion(query: string, results: SearchResult[]) {
  const base = cleanSentence(query);
  if (!base) {
    return ["Try a claim title, map title, or a phrase from the raw thought."];
  }

  const suggestions = [
    `Search for “${base}” in another map`,
    `Try a shorter version of “${base}”`,
  ];

  if (results.length > 0) {
    suggestions.unshift(`Best match: ${results[0]?.title ?? "result"}`);
  }

  return suggestions.slice(0, 3);
}

async function searchMaps(queryTokens: string[], filters: SearchFilters) {
  const maps = await listThoughtMaps();
  const results: SearchResult[] = [];

  for (const map of maps) {
    const shapeLabels = derivePennyShapes(map.nodes).map((shape) => shape.label);
    const mapMetadata = {
      status: map.status,
      nodeCount: map.nodes.length,
      artifactCount: map.artifacts.length,
      confidence: map.nodes[0]?.scores?.confidence ?? null,
      updatedAt: map.updatedAt,
    };
    const matchedFields = findMatchedFields(queryTokens, [
      ["title", map.title],
      ["rawThought", map.rawThought],
      ["shape", shapeLabels.join(" ")],
    ]);
    const relevanceScore = scoreFields(queryTokens, [
      { text: map.title, weight: 1.2 },
      { text: map.rawThought, weight: 0.9 },
      { text: shapeLabels.join(" "), weight: 0.5 },
    ]);

    if (relevanceScore > 0.1 && matchesFilters(filters, "map", mapMetadata)) {
      results.push({
        entityType: "map",
        entityId: map.id,
        title: map.title,
        preview: cleanSentence(map.rawThought).slice(0, 160),
        matchedFields,
        relevanceScore,
        metadata: mapMetadata,
        mapId: map.id,
        mapTitle: map.title,
      });
    }
  }

  return results;
}

async function searchClaims(queryTokens: string[], filters: SearchFilters) {
  const maps = await listThoughtMaps();
  const results: SearchResult[] = [];

  for (const map of maps) {
    for (const node of map.nodes) {
      if (node.kind === "root") {
        continue;
      }

      const metadata = {
        status: node.nodeStatus,
        confidence: node.scores?.confidence ?? null,
        domain: node.kind,
        hasResolutionDate: /by\s+\d{4}/i.test(node.content) || /(?:deadline|resolve|resolution)/i.test(node.content),
        dialecticRoundCount: node.kind === "counter_argument" || node.kind === "research" ? 1 : 0,
        stakeLevel: node.kind === "core_claim" ? "high" : "medium",
      };
      const matchedFields = findMatchedFields(queryTokens, [
        ["content", node.content],
        ["note", node.note ?? ""],
        ["kind", node.kind],
      ]);
      const relevanceScore = scoreFields(queryTokens, [
        { text: node.content, weight: 1.2 },
        { text: node.note ?? "", weight: 0.4 },
        { text: node.kind, weight: 0.2 },
      ]);

      if (relevanceScore > 0.1 && matchesFilters(filters, "claim", metadata)) {
        results.push({
          entityType: "claim",
          entityId: node.id,
          title: cleanSentence(node.content).slice(0, 90),
          preview: node.note ? cleanSentence(node.note).slice(0, 140) : cleanSentence(node.content).slice(0, 140),
          matchedFields,
          relevanceScore,
          metadata: {
            ...metadata,
            mapNodeKind: node.kind,
          },
          mapId: map.id,
          mapTitle: map.title,
        });
      }
    }
  }

  return results;
}

async function searchArtifacts(queryTokens: string[], filters: SearchFilters) {
  const maps = await listThoughtMaps();
  const results: SearchResult[] = [];

  for (const map of maps) {
    for (const artifact of map.artifacts) {
      const artifactText = [artifact.narrativeGlue ?? "", ...artifact.sections.map((section) => `${section.title} ${section.body}`)].join(" ").trim();
      const metadata = {
        status: artifact.latestOutcome?.outcomeType ?? "pending",
        confidence: artifact.latestOutcome?.artifactQualityRating ?? null,
        domain: artifact.artifactTypeId,
        hasResolutionDate: false,
        dialecticRoundCount: artifact.loadBearingClaims.length,
        stakeLevel: artifact.loadBearingClaims.length > 3 ? "high" : "medium",
      };
      const matchedFields = findMatchedFields(queryTokens, [
        ["title", artifact.title],
        ["summary", artifactText],
        ["artifactType", artifact.artifactTypeName],
      ]);
      const relevanceScore = scoreFields(queryTokens, [
        { text: artifact.title, weight: 1.2 },
        { text: artifactText, weight: 0.8 },
        { text: artifact.artifactTypeName, weight: 0.4 },
      ]);

      if (relevanceScore > 0.1 && matchesFilters(filters, "artifact", metadata)) {
        results.push({
          entityType: "artifact",
          entityId: artifact.id,
          title: artifact.title,
          preview: cleanSentence(artifactText).slice(0, 160),
          matchedFields,
          relevanceScore,
          metadata,
          mapId: map.id,
          mapTitle: map.title,
        });
      }
    }
  }

  return results;
}

async function searchSessions(queryTokens: string[], filters: SearchFilters) {
  const sessions = await listSessions();
  const results: SearchResult[] = [];

  for (const session of sessions) {
    const metadata = {
      status: session.status,
      confidence: session.clarityScore,
      domain: session.currentStage,
      hasResolutionDate: false,
      dialecticRoundCount: session.currentStage === "brief" ? 1 : 0,
      stakeLevel: session.status === "brief-ready" ? "high" : "medium",
    };
    const matchedFields = findMatchedFields(queryTokens, [
      ["title", session.title],
      ["rawIdea", session.rawIdea],
      ["problem", session.problem ?? ""],
    ]);
    const relevanceScore = scoreFields(queryTokens, [
      { text: session.title, weight: 1.1 },
      { text: session.rawIdea, weight: 0.8 },
      { text: session.problem ?? "", weight: 0.6 },
    ]);

    if (relevanceScore > 0.1 && matchesFilters(filters, "session", metadata)) {
      results.push({
        entityType: "session",
        entityId: session.id,
        title: session.title,
        preview: cleanSentence(session.rawIdea).slice(0, 160),
        matchedFields,
        relevanceScore,
        metadata,
        mapId: null,
        mapTitle: null,
      });
    }
  }

  return results;
}

async function searchLessons(queryTokens: string[], filters: SearchFilters) {
  const fragments = await listMarginFragments();
  const results: SearchResult[] = [];

  for (const fragment of fragments) {
    const metadata = {
      status: fragment.status,
      confidence: fragment.priority,
      domain: fragment.sphere,
      hasResolutionDate: false,
      dialecticRoundCount: fragment.surfaceCount,
      stakeLevel: fragment.priority > 0.7 ? "high" : "medium",
    };
    const matchedFields = findMatchedFields(queryTokens, [
      ["content", fragment.content],
      ["sphere", fragment.sphere],
      ["context", fragment.contextSnapshot.currentContext],
    ]);
    const relevanceScore = scoreFields(queryTokens, [
      { text: fragment.content, weight: 1.0 },
      { text: fragment.sphere, weight: 0.4 },
      { text: fragment.contextSnapshot.currentContext, weight: 0.4 },
    ]);

    if (relevanceScore > 0.1 && matchesFilters(filters, "lesson", metadata)) {
      results.push({
        entityType: "lesson",
        entityId: fragment.id,
        title: cleanSentence(fragment.content).slice(0, 90),
        preview: cleanSentence(fragment.contextSnapshot.currentContext || fragment.content).slice(0, 160),
        matchedFields,
        relevanceScore,
        metadata,
        mapId: fragment.sourceMapId,
        mapTitle: null,
      });
    }
  }

  return results;
}

async function searchShapes(queryTokens: string[], filters: SearchFilters) {
  const maps = await listThoughtMaps();
  const results: SearchResult[] = [];

  for (const map of maps) {
    const shapes = derivePennyShapes(map.nodes);
    for (const shape of shapes) {
      const metadata = {
        status: shape.verdict,
        confidence: shape.confidence,
        domain: shape.kind,
        hasResolutionDate: false,
        dialecticRoundCount: shape.evidenceNodeIds.length,
        stakeLevel: shape.confidence > 80 ? "high" : "medium",
      };
      const matchedFields = findMatchedFields(queryTokens, [
        ["label", shape.label],
        ["summary", shape.summary],
        ["explanation", shape.explanation],
      ]);
      const relevanceScore = scoreFields(queryTokens, [
        { text: shape.label, weight: 1.2 },
        { text: shape.summary, weight: 0.7 },
        { text: shape.explanation, weight: 0.4 },
      ]);

      if (relevanceScore > 0.1 && matchesFilters(filters, "shape", metadata)) {
        results.push({
          entityType: "shape",
          entityId: shape.id,
          title: shape.label,
          preview: cleanSentence(shape.summary).slice(0, 160),
          matchedFields,
          relevanceScore,
          metadata,
          mapId: map.id,
          mapTitle: map.title,
        });
      }
    }
  }

  return results;
}

export async function globalSearch(query: SearchQuery): Promise<SearchResponse> {
  const start = Date.now();
  const queryTokens = tokenize(query.query);
  const filters = query.filters;

  const [claimResults, mapResults, artifactResults, lessonResults, sessionResults, shapeResults] = await Promise.all([
    searchClaims(queryTokens, filters),
    searchMaps(queryTokens, filters),
    searchArtifacts(queryTokens, filters),
    searchLessons(queryTokens, filters),
    searchSessions(queryTokens, filters),
    searchShapes(queryTokens, filters),
  ]);

  const rankedResults = [...claimResults, ...mapResults, ...artifactResults, ...lessonResults, ...sessionResults, ...shapeResults].sort(
    (a, b) => b.relevanceScore - a.relevanceScore,
  );
  const visibleResults = rankedResults.slice(0, 20);

  return {
    query: query.query,
    results: visibleResults,
    totalCount: rankedResults.length,
    timeTakenMs: Date.now() - start,
    suggestions: makeSuggestion(query.query, visibleResults),
  };
}
