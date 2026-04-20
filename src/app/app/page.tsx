import { HomeLauncher, type HomeLauncherClaimSummary, type HomeLauncherMapSummary } from "@/components/penny/home-launcher";
import { listThoughtMaps } from "@/server/thought-map";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
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

  return (
    <HomeLauncher
      maps={launcherMaps}
      initialIntent={parseLauncherIntent(firstQueryValue(query.intent))}
      initialCaptureMode={parseCaptureMode(firstQueryValue(query.captureMode))}
    />
  );
}

function firstQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseLauncherIntent(value: string | null): "capture" | "challenge" | "learn" | undefined {
  return value === "capture" || value === "challenge" || value === "learn" ? value : undefined;
}

function parseCaptureMode(value: string | null): "type" | "import" | "quick" | undefined {
  return value === "type" || value === "import" || value === "quick" ? value : undefined;
}
