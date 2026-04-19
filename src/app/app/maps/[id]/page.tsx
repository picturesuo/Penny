import { notFound } from "next/navigation";
import { ThoughtMapWorkspace } from "@/components/penny/thought-map-workspace";
import { getThoughtMap, listThoughtMaps } from "@/server/thought-map";
import { listMarginFragments } from "@/server/penny";

export default async function ThoughtMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const map = await getThoughtMap(id);
  const maps = await listThoughtMaps();
  const fragments = await listMarginFragments();

  if (!map) {
    notFound();
  }

  return (
    <ThoughtMapWorkspace
      initialMap={map}
      initialView="outline"
      initialFragments={fragments}
      availableMaps={maps.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        claimIds: candidate.nodes.filter((node) => node.kind !== "root").map((node) => node.id),
      }))}
    />
  );
}
