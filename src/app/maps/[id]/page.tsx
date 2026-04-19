import { redirect, notFound } from "next/navigation";
import { MapWorkspace } from "@/components/penny/map-workspace";
import { getAuthenticatedUserFromCookies } from "@/server/auth";
import { getArtifactsForMap, getClaimsForMap, getMap, getMapsForUser } from "@/server/mvp";
import { listMarginFragments } from "@/server/penny";

export default async function MapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAuthenticatedUserFromCookies();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const [map, claims, artifacts, maps, fragments] = await Promise.all([
    getMap(id, user.id),
    getClaimsForMap(id, user.id),
    getArtifactsForMap(id, user.id),
    getMapsForUser(user.id),
    listMarginFragments(),
  ]);

  if (!map) {
    notFound();
  }

  return (
    <MapWorkspace
      map={map}
      initialClaims={claims}
      initialArtifacts={artifacts}
      userId={user.id}
      initialFragments={fragments}
      availableMaps={maps.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        claimIds: candidate.nodes.filter((node) => node.kind !== "root").map((node) => node.id),
      }))}
    />
  );
}
