"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchResults } from "@/components/penny/search-results";
import type { SearchEntityType, SearchResponse } from "@/types/search";

const ENTITY_FILTERS: Array<{ value: SearchEntityType; label: string }> = [
  { value: "claim", label: "Claims" },
  { value: "map", label: "Maps" },
  { value: "artifact", label: "Artifacts" },
  { value: "lesson", label: "Lessons" },
  { value: "session", label: "Sessions" },
  { value: "shape", label: "Shapes" },
];

export function GlobalSearch({ userId }: { userId: string }) {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entityTypes, setEntityTypes] = useState<SearchEntityType[]>([]);

  const activeFilters = useMemo(
    () => ({
      entityTypes,
      domains: [],
      confidenceRange: null,
      dateRange: null,
      status: [],
      hasDialecticRounds: null,
      hasResolutionDate: null,
      stakeLevel: [],
    }),
    [entityTypes],
  );

  function toggleEntityType(type: SearchEntityType) {
    setEntityTypes((current) => (current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type]));
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return;
    }

    let active = true;
    const handle = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);

      fetch("/api/search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query: trimmed,
          userId,
          requestedAt: new Date().toISOString(),
          filters: activeFilters,
        }),
      })
        .then(async (result) => {
          if (!result.ok) {
            throw new Error("Search request failed.");
          }
          return (await result.json()) as SearchResponse;
        })
        .then((payload) => {
          if (active) {
            setResponse(payload);
          }
        })
        .catch(() => {
          if (active) {
            setError("Penny could not complete the search right now.");
            setResponse(null);
          }
        })
        .finally(() => {
          if (active) {
            setIsLoading(false);
          }
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [activeFilters, query, userId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="relative flex min-w-[260px] flex-1 items-center">
          <Search className="pointer-events-none absolute left-4 size-4 text-[var(--muted-ink)]" />
          <input
            value={query}
            onChange={(event) => {
              const nextValue = event.target.value;
              setQuery(nextValue);
              if (nextValue.trim().length < 2) {
                setResponse(null);
                setError(null);
                setIsLoading(false);
              }
            }}
            placeholder="Search claims, maps, artifacts, sessions, shapes..."
            className="w-full rounded-full border border-black/10 bg-white py-3 pl-11 pr-4 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--muted-ink)] focus:border-[var(--ink)]"
          />
        </label>
        <Button
          variant="secondary"
          onClick={() => {
            setQuery("");
            setEntityTypes([]);
            setResponse(null);
            setError(null);
            setIsLoading(false);
          }}
        >
          Clear
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-full border px-3 py-2 text-xs transition ${
            entityTypes.length === 0
              ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
              : "border-black/10 bg-white text-[var(--muted-ink)] hover:border-black/20 hover:text-[var(--ink)]"
          }`}
          onClick={() => setEntityTypes([])}
        >
          All entities
        </button>
        {ENTITY_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`rounded-full border px-3 py-2 text-xs transition ${
              entityTypes.includes(filter.value)
                ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                : "border-black/10 bg-white text-[var(--muted-ink)] hover:border-black/20 hover:text-[var(--ink)]"
            }`}
            onClick={() => toggleEntityType(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <SearchResults response={response} isLoading={isLoading} error={error} />
    </div>
  );
}
