import { createPennyApiClient, PennyApiError, type ApiRequestOptions, type PennyApiClientOptions } from "./client";

export type CommandResult = {
  id: string;
  type: "thought" | "map" | "claim" | "session";
  title: string;
  subtitle?: string;
  confidence?: number | null;
  href?: string;
};

export type SearchResultKind = CommandResult["type"];
export type SearchResult = CommandResult;

export type SearchResponse = {
  results: SearchResult[];
};

export const globalSearchPath = "/api/search";

export function createSearchApiClient(options: PennyApiClientOptions = {}) {
  const client = createPennyApiClient(options);

  return {
    async search(query: string, requestOptions?: ApiRequestOptions): Promise<SearchResult[] | null> {
      const params = new URLSearchParams();
      params.set("q", query);

      try {
        const response = await client.get<SearchResponse>(`${globalSearchPath}?${params.toString()}`, requestOptions);
        return response.results;
      } catch (error) {
        if (error instanceof PennyApiError && (error.status === 404 || error.status === 405)) {
          return null;
        }

        throw error;
      }
    },
  };
}

export const searchApiClient = createSearchApiClient();
