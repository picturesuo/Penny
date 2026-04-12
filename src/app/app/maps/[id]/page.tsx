import { notFound } from "next/navigation";
import { ThoughtMapWorkspace } from "@/components/penny/thought-map-workspace";
import { getThoughtMap } from "@/server/thought-map";

export default async function ThoughtMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const map = await getThoughtMap(id);

  if (!map) {
    notFound();
  }

  return <ThoughtMapWorkspace initialMap={map} />;
}
