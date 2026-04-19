import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { SearchResponse, SearchResult } from "@/types/search";

function ResultRow({ result }: { result: SearchResult }) {
  return (
    <Link href={result.mapId ? `/app/maps/${result.mapId}` : "/app"} className="block">
      <div className="rounded-[22px] border border-black/8 bg-white/80 p-4 transition hover:border-black/15 hover:bg-white">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-[var(--panel)] text-[var(--ink)]">{result.entityType}</Badge>
          {result.mapTitle ? <Badge className="bg-white text-[var(--muted-ink)]">{result.mapTitle}</Badge> : null}
          <Badge className="bg-white text-[var(--muted-ink)]">{Math.round(result.relevanceScore * 100)}%</Badge>
        </div>
        <h4 className="mt-3 text-base font-medium text-[var(--ink)]">{result.title}</h4>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{result.preview}</p>
        {result.matchedFields.length > 0 ? (
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
            Matched: {result.matchedFields.join(", ")}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function SearchResults({
  response,
  isLoading,
  error,
}: {
  response: SearchResponse | null;
  isLoading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <Card className="p-6">
        <h3 className="text-xl font-semibold text-[var(--ink)]">Search failed</h3>
        <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">{error}</p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-[var(--muted-ink)]">Searching Penny…</p>
      </Card>
    );
  }

  if (!response || response.results.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-xl font-semibold text-[var(--ink)]">No matches yet</h3>
        <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
          Try a claim title, a map title, or a phrase from the raw thought you are trying to find.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Results</p>
          <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">{response.totalCount} matches</h3>
        </div>
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{response.timeTakenMs} ms</p>
      </div>
      <div className="mt-5 space-y-3">
        {response.results.map((result) => (
          <ResultRow key={`${result.entityType}:${result.entityId}`} result={result} />
        ))}
      </div>
      {response.suggestions.length > 0 ? (
        <div className="mt-5 rounded-[22px] bg-[var(--panel)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Suggestions</p>
          <div className="mt-2 space-y-2">
            {response.suggestions.map((suggestion) => (
              <p key={suggestion} className="text-sm leading-6 text-[var(--ink)]">
                {suggestion}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
