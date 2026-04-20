"use client";

import { useMemo, useState } from "react";
import { Brain, GraduationCap, Layers3, Swords } from "lucide-react";
import { ClaimCaptureLauncher } from "@/components/penny/claim-capture-launcher";
import { DocumentImport } from "@/components/penny/document-import";
import { ThoughtMapWorkspace } from "@/components/penny/thought-map-workspace";
import type { BestNextMoveKey } from "@/lib/challenge-next-move";
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
  nextAction?: BestNextMoveKey | null;
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
  const [capturePanel, setCapturePanel] = useState<"claim" | "import" | "quick">(
    launchState?.intent === "capture" && launchState.openImport ? "import" : "claim",
  );
  const [quickCaptureText, setQuickCaptureText] = useState("");
  const [quickCaptureSaving, setQuickCaptureSaving] = useState(false);
  const [quickCaptureFeedback, setQuickCaptureFeedback] = useState<string | null>(null);
  const [quickCaptureError, setQuickCaptureError] = useState<string | null>(null);
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

  async function handleQuickCaptureSave() {
    const rawText = quickCaptureText.trim();
    if (!rawText || quickCaptureSaving) {
      return;
    }

    setQuickCaptureSaving(true);
    setQuickCaptureError(null);
    setQuickCaptureFeedback(null);

    try {
      const response = await fetch("/api/quick-capture", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rawText,
          captureSource: "web_shortcut",
          mapId: map.id,
          sourceMapId: map.id,
          currentStage: "outline",
          currentFocus: map.title,
          currentContext: map.rawThought,
        }),
      });

      if (!response.ok) {
        throw new Error("Penny could not save this quick note right now.");
      }

      setQuickCaptureText("");
      setQuickCaptureFeedback("Quick note saved.")
    } catch (error) {
      setQuickCaptureError(error instanceof Error ? error.message : "Penny could not save this quick note right now.");
    } finally {
      setQuickCaptureSaving(false);
    }
  }

  if (focusIntent === "capture") {
    return (
      <div className="space-y-4" data-user-id={userId}>
        <IntentShellHeader
          intent="capture"
          title="Capture first."
          body="Add one claim, import source material, or save a quick note before you reopen the rest of the workspace."
          selectedClaim={selectedClaim}
          onOpenFullWorkspace={() => setShowFullWorkspace(true)}
        />

        <Card className="overflow-hidden border-black/8 bg-[linear-gradient(180deg,#fffefb_0%,#f7f1e8_100%)] p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>
                  {capturePanel === "claim" ? "Type into Brain" : capturePanel === "import" ? "Paste or import" : "Quick note"}
                </Badge>
                <Badge className="bg-white text-[var(--ink)]">{map.title}</Badge>
                <Badge className="bg-white text-[var(--ink)]">
                  {initialClaims.length} claim{initialClaims.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-[var(--ink)] sm:text-[1.9rem]">
                {capturePanel === "claim"
                  ? "Make one new claim visible."
                  : capturePanel === "import"
                    ? "Pull source material into the map first."
                    : "Save the thought before you decide what it is."}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-ink)]">
                {capturePanel === "claim"
                  ? "Start with the smallest version of the thought worth keeping, then let the map grow around it later."
                  : capturePanel === "import"
                    ? "Extract candidate claims from a URL, pasted text, or a document before you reopen the broader workspace."
                    : "Use quick note when the thought is too raw for a claim or import but still worth catching now."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
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
                Paste or import
              </Button>
              <Button
                className="gap-2"
                variant={capturePanel === "quick" ? "primary" : "secondary"}
                onClick={() => setCapturePanel("quick")}
              >
                Quick note
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-[20px] border border-black/8 bg-white/84 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Map in view</p>
                <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{map.title}</p>
              </div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                {initialClaims.length} captured claim{initialClaims.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="mt-4">
            {capturePanel === "claim" ? (
              <ClaimCaptureLauncher mapId={map.id} availableClaims={claimOptions} />
            ) : capturePanel === "import" ? (
              <div id="import-source" className="scroll-mt-28">
                <DocumentImport mapId={map.id} />
              </div>
            ) : (
              <div className="rounded-[24px] border border-black/8 bg-white p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Quick note</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                  Save the fragment first, then decide later whether it should become a claim, source import, or something to revisit.
                </p>
                <textarea
                  className="mt-4 min-h-32 w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition placeholder:text-[var(--muted-ink)] focus:border-black/20"
                  placeholder="Capture the quick note, fragment, or fleeting thought you do not want to lose..."
                  value={quickCaptureText}
                  onChange={(event) => setQuickCaptureText(event.target.value)}
                />
                {quickCaptureError ? (
                  <p className="mt-3 rounded-[16px] border border-[#f0c0b7] bg-[#fff4f1] px-4 py-3 text-sm text-[#8b3d2f]">{quickCaptureError}</p>
                ) : null}
                {quickCaptureFeedback ? (
                  <p className="mt-3 rounded-[16px] border border-[#b9d3c0] bg-[#eff8f1] px-4 py-3 text-sm text-[#2f6d47]">{quickCaptureFeedback}</p>
                ) : null}
                <div className="mt-4">
                  <Button className="gap-2" disabled={quickCaptureSaving || quickCaptureText.trim().length === 0} onClick={() => void handleQuickCaptureSave()}>
                    {quickCaptureSaving ? "Saving..." : "Save quick note"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (focusIntent === "challenge" || focusIntent === "learn") {
    return (
      <div className="space-y-4" data-user-id={userId}>
        <IntentShellHeader
          intent={focusIntent}
          title={
            focusIntent === "challenge"
              ? "Challenge one claim."
              : "Learn in context."
          }
          body={
            focusIntent === "challenge"
              ? "Stay on the selected claim, finish the steel-man and round flow, then reopen the broader workspace only if you need it."
              : "Stay on the selected claim, use the teach-back lane first, then reopen the broader workspace if you need more context."
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
          initialLearningQuestion={launchState?.intent === "learn" ? launchState.question ?? null : null}
          initialNextAction={launchState?.intent === "challenge" ? launchState.nextAction ?? null : null}
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
        initialLearningQuestion={launchState?.intent === "learn" ? launchState.question ?? null : null}
        initialNextAction={launchState?.intent === "challenge" ? launchState.nextAction ?? null : null}
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
    <Card className="overflow-hidden border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(242,235,225,0.96))] p-4 sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{label}</Badge>
            {selectedClaim ? <Badge className="bg-[#e7defa] text-[#5c4c88]">claim selected</Badge> : null}
          </div>
          <Button variant="secondary" className="gap-2 px-3 py-2 text-xs" onClick={onOpenFullWorkspace}>
            <Layers3 className="size-4" />
            Open full workspace
          </Button>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-[var(--panel)] p-2 text-[var(--ink)]">
                <Icon className="size-4" />
              </span>
              <h1 className="text-2xl font-semibold text-[var(--ink)] sm:text-[1.9rem]">{title}</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-ink)]">{body}</p>
            {question?.trim() ? (
              <div className="mt-3 rounded-[18px] border border-black/8 bg-white/78 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Question in view</p>
                <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{question.trim()}</p>
              </div>
            ) : null}
          </div>
          <div className="rounded-[20px] border border-black/8 bg-white/78 p-4 lg:max-w-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Current focus</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{selectedClaim?.content ?? "No claim selected yet."}</p>
            {selectedClaim ? (
              <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
                This shell keeps the active claim in front until you explicitly reopen the broader workspace.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
