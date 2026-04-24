import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NewMapButton } from "@/components/penny/new-map-modal";
import type { Map as CoreMap } from "@/types/mvp-core";
import type { ThoughtMapModel } from "@/types/thought-map";

type HomeDashboardProps = {
  maps: Array<CoreMap | ThoughtMapModel>;
};

export function HomeDashboard({ maps }: HomeDashboardProps) {
  const recentMaps = maps.slice(0, 6);
  const latestMap = recentMaps[0] ?? null;

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(243,241,232,0.96))] p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Home</p>
            <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)] sm:text-5xl">Start with a claim.</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted-ink)]">
              Open a map, capture a claim, and pressure-test it.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <NewMapButton label="New map" className="gap-2" />
              {latestMap ? (
                <Button asChild variant="secondary" className="gap-2">
                  <Link href={`/maps/${latestMap.id}`}>
                    Open latest map
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          {latestMap ? (
            <div className="rounded-[28px] border border-black/8 bg-white/80 p-5 lg:min-w-[320px]">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Pick up where you left off</p>
              <p className="mt-3 text-lg font-semibold text-[var(--ink)]">{latestMap.title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                {getClaimCount(latestMap)} claim{getClaimCount(latestMap) === 1 ? "" : "s"} · Updated {formatUpdatedAt(latestMap.updatedAt)}
              </p>
            </div>
          ) : null}
        </div>
      </Card>

      {recentMaps.length ? (
        <section className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Recent maps</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Open a map and challenge one claim.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recentMaps.map((map) => (
              <MapCard key={map.id} map={map} />
            ))}
          </div>
        </section>
      ) : (
        <Card className="border-black/8 bg-white/80 p-8 sm:p-10">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Empty state</p>
            <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)]">Create your first map.</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
              Start with one claim you need to examine, then open the map and pressure-test it.
            </p>
            <div className="mt-5">
              <NewMapButton label="Create your first map" className="gap-2" />
            </div>
          </div>
        </Card>
      )}
    </section>
  );
}

function MapCard({ map }: { map: CoreMap | ThoughtMapModel }) {
  const claimCount = getClaimCount(map);

  return (
    <Card className="h-full border-black/8 bg-[linear-gradient(180deg,#ffffff_0%,#f7f3ea_100%)] p-5">
      <div className="flex h-full flex-col justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Updated {formatUpdatedAt(map.updatedAt)}</p>
          <h3 className="mt-3 text-xl font-semibold text-[var(--ink)]">{map.title}</h3>
          <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
            {claimCount} claim{claimCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="border-t border-black/8 pt-4">
          <Button asChild variant="secondary" className="gap-2">
            <Link href={`/maps/${map.id}`}>
              Open map
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

function getClaimCount(map: CoreMap | ThoughtMapModel) {
  return "claimCount" in map ? map.claimCount : Math.max(0, map.nodes.length - 1);
}

function formatUpdatedAt(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
