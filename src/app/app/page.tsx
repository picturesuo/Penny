import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listThoughtMaps } from "@/server/thought-map";

export default async function DashboardPage() {
  const maps = await listThoughtMaps();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Thought Maps</p>
          <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)]">Build a second brain that shows weak logic fast.</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted-ink)]">
            Each map starts from one rough entry, then turns into claims, assumptions, counterarguments, research paths, and next actions you can sharpen live.
          </p>
        </div>
        <Link href="/app/new">
          <Button className="gap-2">
            <Plus className="size-4" />
            Start thought map
          </Button>
        </Link>
      </div>

      {maps.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {maps.map((map) => {
            const active = map.nodes.filter((node) => node.nodeStatus === "active").length;
            const weak = map.nodes.filter((node) => node.nodeStatus === "weak").length;
            const superseded = map.nodes.filter((node) => node.nodeStatus === "superseded").length;

            return (
              <Card key={map.id} className="p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Map</p>
                <h2 className="mt-3 text-2xl font-semibold text-[var(--ink)]">{map.title}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">{map.rawThought}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Badge className="bg-[#d9ead8] text-[#355b32]">Active {active}</Badge>
                  <Badge className="bg-[#f5d6b3] text-[#8b4d1f]">Weak {weak}</Badge>
                  <Badge className="bg-black/8 text-[var(--muted-ink)]">Superseded {superseded}</Badge>
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
            Start with one rough second-brain entry. Penny will branch it into claims, stakes, assumptions, counterarguments, research paths, and the next node worth improving.
          </p>
        </Card>
      )}
    </div>
  );
}
