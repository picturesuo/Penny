import { notFound } from "next/navigation";
import { MapWorkspace } from "@/components/penny/map-workspace";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import { getArtifactsForMap, getClaimsForMap, getMap, getMapsForUser } from "@/server/mvp";
import { listMarginFragments } from "@/server/penny";

export default async function ThoughtMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const userId = await getCurrentAuthenticatedUserId();

  const [map, claims, artifacts, maps, fragments] = await Promise.all([
    getMap(id, userId),
    getClaimsForMap(id, userId),
    getArtifactsForMap(id, userId),
    getMapsForUser(userId),
    listMarginFragments(),
  ]);

  if (!map) {
    notFound();
  }

  const initialSelectedClaimId = firstQueryValue(query.claimId);
  const launcher = parseLauncherIntent(firstQueryValue(query.launcher));
  const question = firstQueryValue(query.question);
  const openImport = firstQueryValue(query.openImport) === "1";
  const launchState = launcher
    ? {
        intent: launcher,
        question,
        openImport,
      }
    : openImport
      ? {
          intent: "capture" as const,
          question,
          openImport: true,
        }
      : null;

  return (
    <MapWorkspace
      map={map}
      initialClaims={claims}
      initialArtifacts={artifacts}
      userId={userId}
      initialFragments={fragments}
      initialSelectedClaimId={initialSelectedClaimId}
      launchState={launchState}
      availableMaps={maps.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        claimIds: candidate.nodes.filter((node) => node.kind !== "root").map((node) => node.id),
      }))}
    />
  );
}

function firstQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseLauncherIntent(value: string | null): "capture" | "challenge" | "learn" | null {
  return value === "capture" || value === "challenge" || value === "learn" ? value : null;
}
