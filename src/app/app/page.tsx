import { HomeLauncher, type HomeLauncherClaimSummary, type HomeLauncherMapSummary } from "@/components/penny/home-launcher";
import { listThoughtMaps } from "@/server/thought-map";

export default async function DashboardPage() {
  const maps = await listThoughtMaps();
  const launcherMaps: HomeLauncherMapSummary[] = maps.slice(0, 6).map((map) => ({
    id: map.id,
    title: map.title,
    updatedAt: map.updatedAt instanceof Date ? map.updatedAt.toISOString() : String(map.updatedAt),
    claimCount: map.nodes.filter((node) => node.kind !== "root").length,
    rawThought: map.rawThought,
    claims: map.nodes
      .filter((node) => node.kind !== "root")
      .slice(0, 4)
      .map(
        (node) =>
          ({
            id: node.id,
            mapId: map.id,
            mapTitle: map.title,
            text: node.content,
          }) satisfies HomeLauncherClaimSummary,
      ),
  }));

  return <HomeLauncher maps={launcherMaps} />;
}
