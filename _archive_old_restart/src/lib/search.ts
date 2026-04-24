import { classifyCalibrationDomain } from "@/lib/calibration";
import { formatLessonPreview } from "@/lib/lesson-library";
import { cleanSentence } from "@/lib/penny";
import { derivePennyShapes } from "@/lib/penny-insights";
import { getLessonLibrary } from "@/server/lesson-library";
import { listSessions } from "@/server/penny";
import { listThoughtMaps } from "@/server/thought-map";
import type { SearchFilters, SearchQuery, SearchResponse, SearchResult } from "@/types/search";
import type { ThoughtMapModel } from "@/types/thought-map";

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

  const matches = queryTokens.filter((token) =>
    fieldTokens.some((fieldToken) => fieldToken.includes(token) || token.includes(fieldToken)),
  );
  return (matches.length / queryTokens.length) * weight;
}

function scoreFields(queryTokens: string[], fields: Array<{ text: string; weight: number }>) {
  return Math.min(1, fields.reduce((total, field) => total + scoreText(queryTokens, field.text, field.weight), 0));
}

function findMatchedFields(queryTokens: string[], entries: Array<[string, string]>) {
  return entries.filter(([, text]) => scoreText(queryTokens, text, 1) > 0).map(([field]) => field);
}

function asDate(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function matchesDateRange(filters: SearchFilters, metadata: Record<string, unknown>) {
  if (!filters.dateRange) {
    return true;
  }

  const [start, end] = filters.dateRange;
  const date = asDate(metadata.createdAt) ?? asDate(metadata.updatedAt);
  if (!date) {
    return true;
  }

  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
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

  if (
    filters.hasResolutionDate != null &&
    typeof metadata.hasResolutionDate === "boolean" &&
    metadata.hasResolutionDate !== filters.hasResolutionDate
  ) {
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

  if (!matchesDateRange(filters, metadata)) {
    return false;
  }

  return true;
}

function makeSuggestion(query: string, results: SearchResult[]) {
  const base = cleanSentence(query);
  if (!base) {
    return ["Try a claim title, map title, or a phrase from the raw thought."];
  }

  const suggestions = [`Search for “${base}” in another map`, `Try a shorter version of “${base}”`];

  if (results.length > 0) {
    suggestions.unshift(`Best match: ${results[0]?.title ?? "result"}`);
  }

  return suggestions.slice(0, 3);
}

async function searchMaps(queryTokens: string[], maps: ThoughtMapModel[], filters: SearchFilters) {
  const results: SearchResult[] = [];

  for (const map of maps) {
    const shapeLabels = derivePennyShapes(map.nodes).map((shape) => shape.label);
    const metadata = {
      status: map.status,
      confidence: map.nodes[0]?.scores?.confidence ?? null,
      domain: classifyCalibrationDomain(`${map.title} ${map.rawThought}`),
      hasResolutionDate: map.events.some((event) => event.eventType === "claim_resolution"),
      dialecticRoundCount: map.events.filter((event) => event.eventType === "dialectic_round").length,
      stakeLevel: map.nodes.some((node) => node.kind === "core_claim") ? "high" : "medium",
      createdAt: map.createdAt,
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

    if (relevanceScore > 0.1 && matchesFilters(filters, "map", metadata)) {
      results.push({
        entityType: "map",
        entityId: map.id,
        title: map.title,
        preview: cleanSentence(map.rawThought).slice(0, 160),
        matchedFields,
        relevanceScore,
        metadata,
        mapId: map.id,
        mapTitle: map.title,
      });
    }
  }

  return results;
}

async function searchClaims(queryTokens: string[], maps: ThoughtMapModel[], filters: SearchFilters) {
  const results: SearchResult[] = [];

  for (const map of maps) {
    for (const node of map.nodes) {
      if (node.kind === "root") {
        continue;
      }

      const metadata = {
        status: node.nodeStatus,
        confidence: node.scores?.confidence ?? null,
        domain: classifyCalibrationDomain(node.content),
        hasResolutionDate: map.events.some((event) => event.eventType === "claim_resolution" && event.nodeId === node.id),
        dialecticRoundCount: map.events.filter((event) => event.eventType === "dialectic_round" && event.nodeId === node.id).length,
        stakeLevel: node.kind === "core_claim" ? "high" : node.kind === "counter_argument" ? "medium" : "low",
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
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

async function searchArtifacts(queryTokens: string[], maps: ThoughtMapModel[], filters: SearchFilters) {
  const results: SearchResult[] = [];

  for (const map of maps) {
    for (const artifact of map.artifacts) {
      const artifactText = [artifact.narrativeGlue ?? "", ...artifact.sections.map((section) => `${section.title} ${section.body}`)].join(" ").trim();
      const metadata = {
        status: artifact.latestOutcome?.outcomeType ?? "pending",
        confidence: artifact.latestOutcome?.artifactQualityRating ?? null,
        domain: classifyCalibrationDomain(`${artifact.title} ${artifact.artifactTypeName}`),
        hasResolutionDate: artifact.latestOutcome != null,
        dialecticRoundCount: artifact.loadBearingClaims.length,
        stakeLevel: artifact.loadBearingClaims.length > 3 ? "high" : "medium",
        createdAt: map.createdAt,
        updatedAt: map.updatedAt,
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

async function searchSessions(queryTokens: string[], userId: string, filters: SearchFilters) {
  const sessions = await listSessions(userId);
  const results: SearchResult[] = [];

  for (const session of sessions) {
    const metadata = {
      status: session.status,
      confidence: session.clarityScore,
      domain: classifyCalibrationDomain(`${session.title} ${session.rawIdea}`),
      hasResolutionDate: false,
      dialecticRoundCount: session.currentStage === "brief" ? 1 : 0,
      stakeLevel: session.status === "brief-ready" ? "high" : "medium",
      createdAt: session.createdAt,
      updatedAt: session.updatedAt ?? session.createdAt,
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

async function searchLessons(queryTokens: string[], userId: string, filters: SearchFilters) {
  const library = await getLessonLibrary(userId);
  const results: SearchResult[] = [];

  for (const lesson of library.lessons) {
    const metadata = {
      status: lesson.hasBeenApplied ? "applied" : "stored",
      confidence: Math.round(lesson.confidenceInLesson * 100),
      domain: lesson.domain ?? classifyCalibrationDomain(lesson.lessonText),
      hasResolutionDate: lesson.sourceType === "resolution" || lesson.sourceType === "counterfactual",
      dialecticRoundCount: lesson.applicationCount,
      stakeLevel: lesson.confidenceInLesson >= 0.85 ? "high" : "medium",
      createdAt: lesson.createdAt,
      updatedAt: lesson.lastSurfacedAt ?? lesson.createdAt,
      sourceType: lesson.sourceType,
    };
    const matchedFields = findMatchedFields(queryTokens, [
      ["text", lesson.lessonText],
      ["editedText", lesson.userEditedText ?? ""],
      ["tags", lesson.tags.join(" ")],
      ["domain", lesson.domain ?? ""],
    ]);
    const relevanceScore = scoreFields(queryTokens, [
      { text: lesson.lessonText, weight: 1.1 },
      { text: lesson.userEditedText ?? "", weight: 0.7 },
      { text: lesson.tags.join(" "), weight: 0.5 },
      { text: lesson.domain ?? "", weight: 0.3 },
    ]);

    if (relevanceScore > 0.12 && matchesFilters(filters, "lesson", metadata)) {
      results.push({
        entityType: "lesson",
        entityId: lesson.id,
        title: formatLessonPreview(lesson).slice(0, 90),
        preview: formatLessonPreview(lesson).slice(0, 160),
        matchedFields,
        relevanceScore,
        metadata,
        mapId: null,
        mapTitle: "Lesson library",
      });
    }
  }

  return results;
}

async function searchShapes(queryTokens: string[], maps: ThoughtMapModel[], filters: SearchFilters) {
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
        createdAt: map.createdAt,
        updatedAt: map.updatedAt,
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
  const allMaps = (await listThoughtMaps()).filter((map) => map.userId === query.userId);

  const [claimResults, mapResults, artifactResults, lessonResults, sessionResults, shapeResults] = await Promise.all([
    searchClaims(queryTokens, allMaps, filters),
    searchMaps(queryTokens, allMaps, filters),
    searchArtifacts(queryTokens, allMaps, filters),
    searchLessons(queryTokens, query.userId, filters),
    searchSessions(queryTokens, query.userId, filters),
    searchShapes(queryTokens, allMaps, filters),
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
