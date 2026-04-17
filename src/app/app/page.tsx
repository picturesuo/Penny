import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listThoughtMaps } from "@/server/thought-map";

const foundation = [
  {
    title: "Lens",
    copy: "A bounded user model built from high-confidence shapes, current goals, active claims, and only the precedents needed for the next answer.",
  },
  {
    title: "Overrides",
    copy: "Every disagreement becomes a move with an explicit failure mode so Penny can learn from the exact reason the user pushed back.",
  },
  {
    title: "Precedents",
    copy: "Seed cases and failure modes give the system a real retrieval substrate instead of generic web search or vague similarity matching.",
  },
];

function summarizeNodeStatus(nodes: Awaited<ReturnType<typeof listThoughtMaps>>[number]["nodes"]) {
  return nodes.reduce(
    (counts, node) => {
      counts[node.nodeStatus] += 1;
      return counts;
    },
    { active: 0, weak: 0, superseded: 0 },
  );
}

export default async function DashboardPage() {
  const maps = await listThoughtMaps();
  const mapCards = maps.map((map) => ({
    map,
    counts: summarizeNodeStatus(map.nodes),
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Thought Maps</p>
          <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)]">Build a personal idea wiki that shows weak logic fast.</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted-ink)]">
            Each map starts like a wiki note, then turns into claims, assumptions, counterarguments, research paths, and next actions you can sharpen live.
          </p>
        </div>
        <Link href="/app/new">
          <Button className="gap-2">
            <Plus className="size-4" />
            Start thought map
          </Button>
        </Link>
      </div>

      <Card className="p-6 sm:p-8">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Foundation stack</p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
            Lens, overrides, and precedents are the substrate under the dashboard.
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
            The dashboard stays decision-oriented by keeping the user model bounded, disagreement explicit, and retrieval grounded in real failure patterns.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {foundation.map((item) => (
            <div key={item.title} className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">{item.title}</p>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{item.copy}</p>
            </div>
          ))}
        </div>
      </Card>

      {mapCards.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {mapCards.map(({ map, counts }) => {
            return (
              <Card key={map.id} className="p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Map</p>
                <h2 className="mt-3 text-2xl font-semibold text-[var(--ink)]">{map.title}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">{map.rawThought}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Badge className="bg-[#d9ead8] text-[#355b32]">Active {counts.active}</Badge>
                  <Badge className="bg-[#f5d6b3] text-[#8b4d1f]">Weak {counts.weak}</Badge>
                  <Badge className="bg-black/8 text-[var(--muted-ink)]">Superseded {counts.superseded}</Badge>
                </div>
                <Link href={`/app/maps/${map.id}`} className="mt-6 inline-flex">
                  <Button className="gap-2">
                    Open map
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-10">
          <h2 className="text-2xl font-semibold text-[var(--ink)]">No thought maps yet</h2>
          <p className="mt-3 max-w-xl text-base leading-7 text-[var(--muted-ink)]">
            Start with one rough wiki entry. Penny will branch it into claims, stakes, assumptions, counterarguments, research paths, and the next node worth improving.
          </p>
        </Card>
      )}
    </div>
  );
}
