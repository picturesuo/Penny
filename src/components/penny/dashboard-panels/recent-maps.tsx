"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DashboardPanel } from "@/types/home-dashboard";

type RecentMapSummary = {
  id: string;
  title: string;
  updatedAt: Date;
  nodeCount: number;
  artifactCount: number;
};

export function RecentMapsPanel({ panel }: { panel: DashboardPanel }) {
  const maps = (panel.data.maps ?? []) as RecentMapSummary[];
  const isExampleSurface = Boolean(panel.data.isExampleSurface);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-white text-[var(--muted-ink)]">{maps.length} maps</Badge>
        {isExampleSurface ? <Badge className="bg-[#fff0eb] text-[#a04b35]">example surface</Badge> : null}
      </div>
      <h3 className="mt-3 text-2xl font-semibold text-[var(--ink)]">Recent maps and the last thing the user did with them.</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
        This is the simplest honest view of the workspace: what is active, what changed, and what deserves another pass.
      </p>
      <div className="mt-4 space-y-3">
        {maps.length ? (
          maps.map((map) => (
            <Link key={map.id} href={`/app/maps/${map.id}`} className="block rounded-[22px] border border-black/8 bg-[var(--panel)] p-4 transition hover:border-black/15">
              <p className="text-sm font-medium text-[var(--ink)]">{map.title}</p>
              <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">
                {map.nodeCount} nodes · {map.artifactCount} artifacts
              </p>
            </Link>
          ))
        ) : (
          <div className="rounded-[22px] border border-dashed border-black/10 bg-[var(--panel)] p-4">
            <p className="text-sm leading-7 text-[var(--muted-ink)]">No maps yet. The first map will anchor the whole dashboard.</p>
          </div>
        )}
      </div>
      <div className="mt-4">
        <Link href="/app/new">
          <Button variant="secondary" className="gap-2">
            Create map
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
