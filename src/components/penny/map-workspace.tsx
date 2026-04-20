"use client";

import { useMemo } from "react";
import { ArtifactCard } from "@/components/penny/artifact-card";
import { ClaimCaptureLauncher } from "@/components/penny/claim-capture-launcher";
import { ThoughtMapWorkspace } from "@/components/penny/thought-map-workspace";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ArtifactRecord, ThoughtMapModel, ThoughtNodeModel } from "@/types/thought-map";
import type { MarginFragmentModel } from "@/types/penny";

export type MapWorkspaceMapOption = {
  id: string;
  title: string;
  claimIds: string[];
};

interface MapWorkspaceProps {
  map: ThoughtMapModel;
  initialClaims: ThoughtNodeModel[];
  initialArtifacts: ArtifactRecord[];
  userId: string;
  initialFragments?: MarginFragmentModel[];
  availableMaps?: MapWorkspaceMapOption[];
}

export function MapWorkspace({
  map,
  initialClaims,
  initialArtifacts,
  userId,
  initialFragments = [],
  availableMaps = [],
}: MapWorkspaceProps) {
  const latestArtifact = useMemo(
    () => [...initialArtifacts].sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime())[0] ?? null,
    [initialArtifacts],
  );
  const claimOptions = useMemo(
    () =>
      initialClaims.map((claim) => ({
        id: claim.id,
        text: claim.content,
      })),
    [initialClaims],
  );

  return (
    <div className="space-y-6" data-user-id={userId}>
      <Card className="overflow-hidden p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Map workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">{map.title}</h1>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
              Capture a claim, challenge it, teach through the confusing parts, and generate artifacts without leaving the map.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-white text-[var(--ink)]">
                {initialClaims.length} claim{initialClaims.length === 1 ? "" : "s"}
              </Badge>
              <Badge className="bg-white text-[var(--ink)]">
                {initialArtifacts.length} artifact{initialArtifacts.length === 1 ? "" : "s"}
              </Badge>
              <Badge className="bg-white text-[var(--ink)]">{availableMaps.length} other map{availableMaps.length === 1 ? "" : "s"}</Badge>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <ClaimCaptureLauncher mapId={map.id} availableClaims={claimOptions} />
          </div>
        </div>

        {latestArtifact ? (
          <div className="mt-6">
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Latest artifact</p>
            <ArtifactCard artifact={latestArtifact} />
          </div>
        ) : null}
      </Card>

      <ThoughtMapWorkspace
        initialMap={map}
        initialView="outline"
        initialFragments={initialFragments}
        availableMaps={availableMaps}
      />
    </div>
  );
}
