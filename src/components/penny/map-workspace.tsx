"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ClaimCaptureLauncher } from "@/components/penny/claim-capture-launcher";
import { ThoughtMapWorkspace } from "@/components/penny/thought-map-workspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ArtifactRecord, ThoughtMapModel, ThoughtNodeModel } from "@/types/thought-map";
import type { MarginFragmentModel } from "@/types/penny";

export type MapWorkspaceMapOption = {
  id: string;
  title: string;
  claimIds: string[];
};

export type MapWorkspaceLaunchState = {
  intent: "capture" | "challenge" | "learn";
  question?: string | null;
  openImport?: boolean;
};

interface MapWorkspaceProps {
  map: ThoughtMapModel;
  initialClaims: ThoughtNodeModel[];
  initialArtifacts: ArtifactRecord[];
  userId: string;
  initialFragments?: MarginFragmentModel[];
  availableMaps?: MapWorkspaceMapOption[];
  initialSelectedClaimId?: string | null;
  launchState?: MapWorkspaceLaunchState | null;
}

export function MapWorkspace({
  map,
  initialClaims,
  userId,
  initialFragments = [],
  availableMaps = [],
  initialSelectedClaimId = null,
  launchState = null,
}: MapWorkspaceProps) {
  const claimOptions = useMemo(
    () =>
      initialClaims.map((claim) => ({
        id: claim.id,
        text: claim.content,
      })),
    [initialClaims],
  );
  const selectedClaim = useMemo(
    () => initialClaims.find((claim) => claim.id === initialSelectedClaimId) ?? null,
    [initialClaims, initialSelectedClaimId],
  );
  const launcherPanel = buildLauncherPanel(launchState, selectedClaim, map.rawThought);

  return (
    <div className="space-y-6" data-user-id={userId}>
      {launcherPanel ? (
        <Card className="overflow-hidden border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(242,235,225,0.96))] p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{launcherPanel.kicker}</Badge>
                {selectedClaim ? <Badge className="bg-[#e7defa] text-[#5c4c88]">claim selected</Badge> : null}
              </div>
              <h1 className="mt-4 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">{launcherPanel.title}</h1>
              <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">{launcherPanel.body}</p>
              {launcherPanel.detail ? <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{launcherPanel.detail}</p> : null}
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild className="gap-2">
                  <Link href={launcherPanel.primaryHref}>{launcherPanel.primaryLabel}</Link>
                </Button>
                {launcherPanel.secondaryHref && launcherPanel.secondaryLabel ? (
                  <Button asChild variant="secondary" className="gap-2">
                    <Link href={launcherPanel.secondaryHref}>{launcherPanel.secondaryLabel}</Link>
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="rounded-[24px] border border-black/8 bg-white/75 p-4 lg:max-w-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Current focus</p>
              <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{selectedClaim?.content ?? map.rawThought}</p>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Map workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">{map.title}</h1>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
              Select a claim, start one challenge round, and confirm the saved result in the round history below.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-white text-[var(--ink)]">
                {initialClaims.length} claim{initialClaims.length === 1 ? "" : "s"}
              </Badge>
              <Badge className="bg-white text-[var(--ink)]">{availableMaps.length} other map{availableMaps.length === 1 ? "" : "s"}</Badge>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <ClaimCaptureLauncher mapId={map.id} availableClaims={claimOptions} />
          </div>
        </div>
      </Card>

      <ThoughtMapWorkspace
        initialMap={map}
        initialView="outline"
        initialFragments={initialFragments}
        availableMaps={availableMaps}
        initialSelectedClaimId={initialSelectedClaimId}
      />
    </div>
  );
}

function buildLauncherPanel(
  launchState: MapWorkspaceLaunchState | null,
  selectedClaim: ThoughtNodeModel | null,
  rawThought: string,
) {
  if (!launchState) {
    return null;
  }

  if (launchState.intent === "challenge") {
    return {
      kicker: "Challenge handoff",
      title: "Pressure-test one claim now.",
      body: selectedClaim
        ? "Penny has already focused the selected claim, so the next useful move is one explicit challenge round in the saved dialectic lane."
        : "This map is open in challenge mode. Start one round, answer it, and confirm the saved result in the round history.",
      detail: selectedClaim ? `Claim in focus: ${selectedClaim.content}` : null,
      primaryLabel: "Jump to challenge round",
      primaryHref: "#challenge-lane",
      secondaryLabel: null,
      secondaryHref: null,
    };
  }

  if (launchState.intent === "learn") {
    return {
      kicker: "Learn handoff",
      title: "Learn in the context of the active claim.",
      body: launchState.question?.trim()
        ? `Question in view: ${launchState.question.trim()}`
        : "Penny will keep the learning path tied to the current claim instead of opening a generic chat thread.",
      detail: selectedClaim
        ? `The scaffold will stay attached to ${selectedClaim.content}.`
        : `The learning scaffold is anchored to ${rawThought}.`,
      primaryLabel: "Open learning scaffold",
      primaryHref: "#teach-back-lane",
      secondaryLabel: "Review selected claim",
      secondaryHref: "#claim-card",
    };
  }

  if (launchState.openImport) {
    return {
      kicker: "Capture handoff",
      title: "Import source material into this map.",
      body: "Use the source importer below to extract candidate claims from a URL, pasted text, or a document before they land in Brain.",
      detail: null,
      primaryLabel: "Open import source",
      primaryHref: "#import-source",
      secondaryLabel: "Stay in outline",
      secondaryHref: "#claim-card",
    };
  }

  return null;
}
