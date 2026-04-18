import { notFound } from "next/navigation";
import { ThoughtMapWorkspace } from "@/components/penny/thought-map-workspace";
import { getThoughtMap } from "@/server/thought-map";
import { listMarginFragments } from "@/server/penny";

export default async function ThoughtMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const map = await getThoughtMap(id);
  const fragments = await listMarginFragments();

  if (!map) {
    notFound();
  }

  return <ThoughtMapWorkspace initialMap={map} initialView="outline" initialFragments={fragments} />;
}
