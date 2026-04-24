'use client';

import Link from "next/link";
import { Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NewMapModal } from "@/components/penny/new-map-modal";
import type { Map as CoreMap } from "@/types/mvp-core";
import type { ThoughtMapModel } from "@/types/thought-map";

type StandaloneHomeDashboardProps = {
  maps: Array<CoreMap | ThoughtMapModel>;
};

export function StandaloneHomeDashboard({ maps }: StandaloneHomeDashboardProps) {
  const [showNewMap, setShowNewMap] = useState(false);
  const activeMaps = maps.filter((map) => map.status === "active");
  const isNew = maps.length === 0;

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,240,230,0.98))] p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Home</p>
            <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)] sm:text-5xl">Your thinking maps</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted-ink)]">
              Each map is a set of related claims you are pressure-testing together.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button className="gap-2" onClick={() => setShowNewMap(true)}>
                + New map
              </Button>
              <Link href="/app/search">
                <Button variant="secondary" className="gap-2">
                  <Search className="size-4" />
                  Search everything
                </Button>
              </Link>
            </div>
          </div>

          <div className="rounded-[28px] border border-black/8 bg-white/80 p-5 lg:min-w-[320px]">
            <div className="flex items-center gap-2">
              <Badge className="bg-[var(--panel)] text-[var(--ink)]">{maps.length} maps</Badge>
              <Badge className="bg-white text-[var(--muted-ink)]">{activeMaps.length} active</Badge>
              <Badge className="bg-white text-[var(--muted-ink)]">Demo mode</Badge>
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
              Start with one real thought, then keep only the maps that are still active enough to deserve your attention.
            </p>
          </div>
        </div>
      </Card>

      {isNew ? (
        <Card className="border-black/8 bg-white/80 p-8">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Empty dashboard</p>
            <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)]">Your thinking space is empty</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
              Start with one thing you believe that has real stakes. A strategic decision. A prediction. A bet. Something that could be wrong.
            </p>
            <div className="mt-5">
              <Button className="gap-2" onClick={() => setShowNewMap(true)}>
                Create your first map
              </Button>
            </div>
            <div className="mt-6 rounded-[24px] bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Examples of good first maps</p>
              <ul className="mt-3 space-y-2 text-sm leading-7 text-[var(--ink)]">
                <li>"Series A readiness in Q3"</li>
                <li>"Is now the right time to hire a Head of Sales?"</li>
                <li>"Our product-market fit hypothesis"</li>
                <li>"Why we should pivot to enterprise"</li>
              </ul>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeMaps.map((map) => (
            <MapCard key={map.id} map={map} />
          ))}
          {activeMaps.length === 0 ? (
            <Card className="border-dashed border-black/10 bg-white/70 p-6">
              <p className="text-sm leading-7 text-[var(--muted-ink)]">You have maps, but none are marked active right now.</p>
              <Button className="mt-4 gap-2" onClick={() => setShowNewMap(true)}>
                Start a new map
              </Button>
            </Card>
          ) : null}
        </div>
      )}

      <NewMapModal open={showNewMap} onClose={() => setShowNewMap(false)} />
    </section>
  );
}

function MapCard({ map }: { map: CoreMap | ThoughtMapModel }) {
  const claimCount = "claimCount" in map ? map.claimCount : Math.max(0, map.nodes.length - 1);
  const description = "rawThought" in map ? map.rawThought : "Open this map to keep pressure-testing the active claims.";

  return (
    <Link href={`/app/maps/${map.id}`} className="block">
      <Card className="h-full border-black/8 bg-[linear-gradient(180deg,#ffffff_0%,#f7f3ea_100%)] p-5 transition hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(35,31,23,0.08)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-[var(--ink)]">{map.title}</h3>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted-ink)]">
              <span>
                {claimCount} claim{claimCount === 1 ? "" : "s"}
              </span>
              <span>·</span>
              <span>{formatRelativeDate(new Date(map.updatedAt))}</span>
            </div>
          </div>
          <Badge className="bg-[#d9ead8] text-[#355b32]">Active</Badge>
        </div>

        <p className="mt-4 text-sm leading-7 text-[var(--muted-ink)]">{truncateText(description, 120)}</p>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-black/8 pt-4">
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Open map</span>
          <span className="text-sm font-medium text-[var(--ink)]">Open →</span>
        </div>
      </Card>
    </Link>
  );
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}…`;
}
