"use client";

import { useMemo, useState } from "react";
import { Brain, GraduationCap, Layers3, Swords } from "lucide-react";
import { ClaimCaptureLauncher } from "@/components/penny/claim-capture-launcher";
import { DocumentImport } from "@/components/penny/document-import";
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
  const [showFullWorkspace, setShowFullWorkspace] = useState(launchState == null);
  const [capturePanel, setCapturePanel] = useState<"claim" | "import">(
    launchState?.intent === "capture" && launchState.openImport ? "import" : "claim",
  );
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
  const focusIntent = !showFullWorkspace ? launchState?.intent ?? null : null;

  if (focusIntent === "capture") {
    return (
      <div className="space-y-6" data-user-id={userId}>
        <IntentShellHeader
          intent="capture"
          title="Capture first. Leave the rest of the workspace quiet."
          body="Add a claim directly into the map or import source material before you open the broader workspace."
          selectedClaim={selectedClaim}
          onOpenFullWorkspace={() => setShowFullWorkspace(true)}
        />

        <Card className="overflow-hidden border-black/8 bg-[linear-gradient(180deg,#fffefb_0%,#f7f1e8_100%)] p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{capturePanel === "claim" ? "Capture claim" : "Import source"}</Badge>
                <Badge className="bg-white text-[var(--ink)]">{map.title}</Badge>
              </div>
              <h2 className="mt-4 text-3xl font-semibold text-[var(--ink)]">
                {capturePanel === "claim" ? "Make one new claim visible." : "Pull source material into the map first."}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
                {capturePanel === "claim"
                  ? "Start with the smallest version of the thought worth keeping in Brain, then let the map grow around it later."
                  : "Extract candidate claims from a URL, pasted text, or a document before you reopen the rest of the workspace."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="gap-2"
                variant={capturePanel === "claim" ? "primary" : "secondary"}
                onClick={() => setCapturePanel("claim")}
              >
                Capture claim
              </Button>
              <Button
                className="gap-2"
                variant={capturePanel === "import" ? "primary" : "secondary"}
                onClick={() => setCapturePanel("import")}
              >
                Import source
              </Button>
            </div>
          </div>

          <div className="mt-5 rounded-[22px] border border-black/8 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Map in view</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{map.title}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              {initialClaims.length} captured claim{initialClaims.length === 1 ? "" : "s"} so far.
            </p>
          </div>

          <div className="mt-5">
            {capturePanel === "claim" ? (
              <ClaimCaptureLauncher mapId={map.id} availableClaims={claimOptions} />
            ) : (
              <div id="import-source" className="scroll-mt-28">
                <DocumentImport mapId={map.id} />
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (focusIntent === "challenge" || focusIntent === "learn") {
    return (
      <div className="space-y-6" data-user-id={userId}>
        <IntentShellHeader
          intent={focusIntent}
          title={
            focusIntent === "challenge"
              ? "Challenge one claim before the rest of the workspace competes for attention."
              : "Learn in context before you reopen the wider map."
          }
          body={
            focusIntent === "challenge"
              ? "Stay on the selected claim, finish the steel-man and round flow, then open the full workspace only if you need broader context."
              : "Stay on the selected claim, use the teach-back lane first, then reopen the full workspace when the concept is clear enough to continue."
          }
          selectedClaim={selectedClaim}
          question={launchState?.question ?? null}
          onOpenFullWorkspace={() => setShowFullWorkspace(true)}
        />

        <ThoughtMapWorkspace
          initialMap={map}
          initialView="outline"
          initialFragments={initialFragments}
          availableMaps={availableMaps}
          initialSelectedClaimId={initialSelectedClaimId}
          focusIntent={focusIntent}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-user-id={userId}>
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
        focusIntent={null}
      />
    </div>
  );
}

function IntentShellHeader({
  intent,
  title,
  body,
  selectedClaim,
  question,
  onOpenFullWorkspace,
}: {
  intent: "capture" | "challenge" | "learn";
  title: string;
  body: string;
  selectedClaim: ThoughtNodeModel | null;
  question?: string | null;
  onOpenFullWorkspace: () => void;
}) {
  const icon = intent === "capture" ? Brain : intent === "challenge" ? Swords : GraduationCap;
  const Icon = icon;
  const label = intent === "capture" ? "Capture mode" : intent === "challenge" ? "Challenge mode" : "Learn mode";

  return (
    <Card className="overflow-hidden border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(242,235,225,0.96))] p-6 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{label}</Badge>
            {selectedClaim ? <Badge className="bg-[#e7defa] text-[#5c4c88]">claim selected</Badge> : null}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <span className="rounded-full bg-[var(--panel)] p-2 text-[var(--ink)]">
              <Icon className="size-4" />
            </span>
            <h1 className="text-3xl font-semibold text-[var(--ink)] sm:text-4xl">{title}</h1>
          </div>
          <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">{body}</p>
          {question?.trim() ? (
            <div className="mt-4 rounded-[22px] border border-black/8 bg-white/78 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Question in view</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{question.trim()}</p>
            </div>
          ) : null}
          <div className="mt-5">
            <Button variant="secondary" className="gap-2" onClick={onOpenFullWorkspace}>
              <Layers3 className="size-4" />
              Open full workspace
            </Button>
          </div>
        </div>
        <div className="rounded-[24px] border border-black/8 bg-white/75 p-4 lg:max-w-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Current focus</p>
          <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{selectedClaim?.content ?? "No claim selected yet."}</p>
          {selectedClaim ? (
            <p className="mt-3 text-xs leading-5 text-[var(--muted-ink)]">
              The focused shell keeps this claim primary until you decide to reopen the broader workspace.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
