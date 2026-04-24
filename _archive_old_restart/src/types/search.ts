export type SearchEntityType = "claim" | "map" | "artifact" | "lesson" | "session" | "shape";

export interface SearchFilters {
  entityTypes: SearchEntityType[];
  domains: string[];
  confidenceRange: [number, number] | null;
  dateRange: [Date, Date] | null;
  status: string[];
  hasDialecticRounds: boolean | null;
  hasResolutionDate: boolean | null;
  stakeLevel: string[];
}

export interface SearchQuery {
  query: string;
  filters: SearchFilters;
  userId: string;
  requestedAt: Date;
}

export interface SearchResult {
  entityType: SearchEntityType;
  entityId: string;
  title: string;
  preview: string;
  matchedFields: string[];
  relevanceScore: number;
  metadata: Record<string, unknown>;
  mapId: string | null;
  mapTitle: string | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalCount: number;
  timeTakenMs: number;
  suggestions: string[];
}
