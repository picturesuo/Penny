"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchResults } from "@/components/penny/search-results";
import type { SearchResponse } from "@/types/search";

export function GlobalSearch({ userId }: { userId: string }) {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [query, userId]);

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
        <Button variant="secondary" onClick={() => setQuery("")}>
          Clear
        </Button>
      </div>
      <SearchResults response={response} isLoading={isLoading} error={error} />
    </div>
  );
}
