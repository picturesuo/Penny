import { Search } from "lucide-react";
import { GlobalSearch } from "@/components/penny/global-search";
import { Card } from "@/components/ui/card";
import { getCurrentAuthenticatedUserId } from "@/server/auth";

export default async function SearchPage() {
  const userId = await getCurrentAuthenticatedUserId();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="p-8">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--paper)]">
            <Search className="size-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Global search</p>
            <h1 className="mt-1 text-4xl font-semibold text-[var(--ink)]">Search across claims, maps, sessions, artifacts, lessons, and shapes.</h1>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--muted-ink)]">
          Use this surface to recover reasoning you already made. Search stays deterministic first, with all the existing map data on hand.
        </p>
      </Card>
      <GlobalSearch userId={userId} />
    </div>
  );
}
