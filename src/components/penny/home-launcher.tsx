'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, GraduationCap, Sparkles, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type HomeLauncherClaimSummary = {
  id: string;
  mapId: string;
  mapTitle: string;
  text: string;
};

export type HomeLauncherMapSummary = {
  id: string;
  title: string;
  updatedAt: string;
  claimCount: number;
  rawThought: string;
  claims: HomeLauncherClaimSummary[];
};

export type HomeLauncherResumeSummary = {
  id: string;
  mapId: string;
  mapTitle: string;
  claimId: string | null;
  claimText: string;
  intent: LauncherIntent;
  nextActionLabel: string;
  nextActionDescription: string;
  signalLabel: string | null;
  href: string;
  updatedAt: string;
};

type LauncherIntent = "capture" | "challenge" | "learn";
type CaptureInputMode = "type" | "import" | "quick";

type DraftState = {
  text: string;
  selectedClaimId: string | null;
};

const DEFAULT_CLAIM = {
  insideViewEstimate: 60,
  confidence: 60,
  resolutionDate: null,
  provenance: "intuition" as const,
  provenanceDetail: "",
  sourceCitation: "",
  sourceTrustLevel: "self" as const,
  stakes: [] as const,
  dependencyNotes: "",
  status: "open" as const,
  temporalScope: "",
  conditionalStatement: "",
  structureKind: "assertion" as const,
};

const INTENT_COPY: Record<
  LauncherIntent,
  {
    label: string;
    eyebrow: string;
    title: string;
    description: string;
    placeholder: string;
    primaryLabel: string;
    secondaryLabel: string | null;
    icon: typeof Brain;
  }
> = {
  capture: {
    label: "Capture",
    eyebrow: "Into Brain",
    title: "Add new material with minimal friction.",
    description: "Write the claim, note, source, or idea you want to add, then drop into a real map immediately.",
    placeholder: "Write the claim, note, source, or idea you want to add...",
    primaryLabel: "Add to Brain",
    secondaryLabel: "Import source",
    icon: Brain,
  },
  challenge: {
    label: "Challenge",
    eyebrow: "Pressure test",
    title: "Start one stress-test quickly.",
    description: "Type a fresh claim or choose an existing one and Penny will route you into the challenge lane with one claim already in focus.",
    placeholder: "State the claim you want pressure-tested...",
    primaryLabel: "Start challenge",
    secondaryLabel: "Choose existing claim",
    icon: Swords,
  },
  learn: {
    label: "Learn",
    eyebrow: "In context",
    title: "Get help understanding something without leaving the work.",
    description: "Ask the question in plain language, optionally tie it to a claim, then open the learning scaffold inside the map workspace.",
    placeholder: "What are you trying to understand right now?",
    primaryLabel: "Start learning",
    secondaryLabel: "Tie to a claim",
    icon: GraduationCap,
  },
};

const SURFACE_EYEBROW_CLASS = "text-[11px] uppercase tracking-[0.22em] text-[var(--muted-ink)]";
const QUIET_PANEL_CLASS = "rounded-[22px] border border-black/8 bg-white/84 p-4 shadow-[0_10px_24px_rgba(34,39,46,0.04)]";
const PANEL_NOTICE_ERROR_CLASS = "rounded-[18px] border border-[#f0c0b7] bg-[#fff4f1] px-4 py-3 text-sm leading-6 text-[#8b3d2f]";
const PANEL_NOTICE_SUCCESS_CLASS = "rounded-[18px] border border-[#b9d3c0] bg-[#eff8f1] px-4 py-3 text-sm leading-6 text-[#2f6d47]";

export function HomeLauncher({
  maps,
  recentWork,
  initialIntent,
  initialCaptureMode = "type",
}: {
  maps: HomeLauncherMapSummary[];
  recentWork: HomeLauncherResumeSummary[];
  initialIntent?: LauncherIntent;
  initialCaptureMode?: CaptureInputMode;
}) {
  const router = useRouter();
  const recentClaims = useMemo(
    () =>
      maps
        .flatMap((map) => map.claims)
        .slice(0, 6),
    [maps],
  );
  const latestMap = maps[0] ?? null;
  const defaultIntent: LauncherIntent = recentClaims.length ? "challenge" : "capture";
  const [activeIntent, setActiveIntent] = useState<LauncherIntent>(initialIntent ?? defaultIntent);
  const [captureInputMode, setCaptureInputMode] = useState<CaptureInputMode>(initialCaptureMode);
  const [captureDraft, setCaptureDraft] = useState<DraftState>({ text: "", selectedClaimId: null });
  const [challengeDraft, setChallengeDraft] = useState<DraftState>({ text: "", selectedClaimId: null });
  const [learnDraft, setLearnDraft] = useState<DraftState>({ text: "", selectedClaimId: null });
  const [showChallengeClaims, setShowChallengeClaims] = useState(defaultIntent === "challenge" && recentClaims.length > 0);
  const [showLearnClaims, setShowLearnClaims] = useState(false);
  const [submittingIntent, setSubmittingIntent] = useState<LauncherIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);

  const activeCopy = INTENT_COPY[activeIntent];
  const ActiveIcon = activeCopy.icon;

  async function createMapAndOpen(options: { rawThought: string; launcher?: LauncherIntent; question?: string | null }) {
    const trimmed = options.rawThought.trim();

    if (trimmed.length < 12) {
      throw new Error("Give Penny one real thought, not a slogan.");
    }

    const response = await fetch("/api/maps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rawThought: trimmed,
        claim: DEFAULT_CLAIM,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } } | null;
      throw new Error(
        payload?.error ||
          payload?.details?.formErrors?.[0] ||
          Object.values(payload?.details?.fieldErrors ?? {}).flat()[0] ||
          "Failed to create map.",
      );
    }

    const payload = (await response.json()) as { map?: { id?: string } };
    const mapId = payload.map?.id;

    if (!mapId) {
      throw new Error("The map was created but Penny could not open it.");
    }

    const params = new URLSearchParams();
    if (options.launcher) {
      params.set("launcher", options.launcher);
    }
    if (options.question?.trim()) {
      params.set("question", options.question.trim());
    }

    router.push(params.size ? `/maps/${mapId}?${params.toString()}` : `/maps/${mapId}`);
  }

  function routeToExistingClaim(intent: "challenge" | "learn", claimId: string, question?: string) {
    const claim = recentClaims.find((candidate) => candidate.id === claimId) ?? null;
    if (!claim) {
      throw new Error("That claim is no longer available.");
    }

    const params = new URLSearchParams({
      claimId: claim.id,
      launcher: intent,
    });

    if (question?.trim()) {
      params.set("question", question.trim());
    }

    router.push(`/maps/${claim.mapId}?${params.toString()}`);
  }

  async function handlePrimaryAction() {
    setError(null);
    setCaptureFeedback(null);
    setSubmittingIntent(activeIntent);

    try {
      if (activeIntent === "capture") {
        if (captureInputMode === "type") {
          await createMapAndOpen({ rawThought: captureDraft.text });
        } else if (captureInputMode === "import") {
          if (!latestMap) {
            throw new Error("Create one map first so Penny has somewhere to import into.");
          }

          router.push(`/maps/${latestMap.id}?launcher=capture&openImport=1`);
        } else {
          const trimmed = captureDraft.text.trim();
          if (!trimmed) {
            throw new Error("Write the quick note before you save it.");
          }

          const response = await fetch("/api/quick-capture", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              rawText: trimmed,
              captureSource: "web_shortcut",
            }),
          });

          if (!response.ok) {
            throw new Error("Penny could not save this quick note right now.");
          }

          setCaptureDraft((current) => ({ ...current, text: "" }));
          setCaptureFeedback("Quick note saved.");
        }
      } else if (activeIntent === "challenge") {
        if (challengeDraft.selectedClaimId) {
          routeToExistingClaim("challenge", challengeDraft.selectedClaimId);
        } else {
          await createMapAndOpen({ rawThought: challengeDraft.text, launcher: "challenge" });
        }
      } else if (learnDraft.selectedClaimId) {
        routeToExistingClaim("learn", learnDraft.selectedClaimId, learnDraft.text);
      } else {
        await createMapAndOpen({ rawThought: learnDraft.text, launcher: "learn", question: learnDraft.text });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSubmittingIntent(null);
    }
  }

  function handleSecondaryAction() {
    setError(null);
    setCaptureFeedback(null);

    if (activeIntent === "capture") {
      return;
    }

    if (activeIntent === "challenge") {
      setShowChallengeClaims((current) => !current);
      return;
    }

    setShowLearnClaims((current) => !current);
  }

  function activeDraft() {
    if (activeIntent === "capture") {
      return captureDraft;
    }
    if (activeIntent === "challenge") {
      return challengeDraft;
    }
    return learnDraft;
  }

  const currentDraft = activeDraft();
  const primaryDisabled =
    submittingIntent != null ||
    (activeIntent === "capture" &&
      ((captureInputMode === "type" && currentDraft.text.trim().length < 12) ||
        (captureInputMode === "quick" && currentDraft.text.trim().length < 1) ||
        (captureInputMode === "import" && !latestMap))) ||
    (activeIntent === "challenge" && !challengeDraft.selectedClaimId && currentDraft.text.trim().length < 12) ||
    (activeIntent === "learn" && currentDraft.text.trim().length < 12);

  return (
    <section className="mx-auto flex min-h-[calc(100vh-15rem)] max-w-6xl flex-col justify-center px-1">
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="penny-reveal order-2 rounded-[34px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,253,248,0.98)_0%,rgba(242,235,225,0.94)_100%)] p-5 shadow-[0_24px_60px_rgba(34,39,46,0.08)] lg:order-1 lg:sticky lg:top-28 lg:self-start">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={SURFACE_EYEBROW_CLASS}>Previous chats & logs</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">Resume the closest live thread without opening the whole workspace in your head.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {recentWork.length ? (
              recentWork.map((item) => (
                <Link key={item.id} href={item.href}>
                  <Card className="penny-press border-black/8 bg-white/84 p-4 shadow-[0_12px_30px_rgba(34,39,46,0.04)] hover:border-black/15 hover:bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-full border border-black/8 bg-[var(--accent-paper)] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--ink)]">
                        {item.intent}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                        {formatUpdatedAt(item.updatedAt)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-medium leading-6 text-[var(--ink)]">{truncate(item.claimText, 72)}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{truncate(item.nextActionLabel, 44)}</p>
                    {item.signalLabel ? <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[var(--muted-ink)]">{item.signalLabel}</p> : null}
                  </Card>
                </Link>
              ))
            ) : (
              <Card className="border-black/8 bg-white/80 p-4">
                <p className="text-sm leading-7 text-[var(--muted-ink)]">Recent work will appear here after your first saved map or round.</p>
              </Card>
            )}
          </div>
        </aside>

        <div className="order-1 space-y-5 lg:order-2">
          <div className="penny-reveal rounded-[34px] border border-black/8 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.72),transparent_38%),linear-gradient(180deg,rgba(255,250,243,0.99)_0%,rgba(243,233,220,0.96)_100%)] p-5 shadow-[0_24px_60px_rgba(34,39,46,0.08)] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/82 px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-[var(--muted-ink)]">
                  <span className="size-2 rounded-full bg-[var(--accent-muted)]" />
                  Penny
                </div>
                <h1 className="font-display mt-4 text-3xl leading-tight text-[var(--ink)] sm:text-[2.6rem]">
                  What do you want to do?
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--muted-ink)]">
                  Capture something new, challenge a claim, or learn what you need in context.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {(["capture", "challenge", "learn"] as const).map((intent) => {
                  const copy = INTENT_COPY[intent];
                  const active = activeIntent === intent;

                  return (
                    <button
                      key={intent}
                      type="button"
                      className={[
                        "penny-press rounded-full border px-4 py-2 text-xs uppercase tracking-[0.18em] transition",
                        active
                          ? "border-[var(--accent-muted)] bg-[var(--ink)] text-[var(--paper)] shadow-[0_10px_24px_rgba(34,39,46,0.10)]"
                          : "border-black/8 bg-white/86 text-[var(--muted-ink)] hover:border-black/15 hover:text-[var(--ink)]",
                      ].join(" ")}
                      onClick={() => {
                        setActiveIntent(intent);
                        setError(null);
                        setCaptureFeedback(null);
                      }}
                    >
                      {copy.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <Card className="penny-soft-switch overflow-hidden rounded-[34px] border-black/8 bg-[linear-gradient(180deg,#fffefb_0%,#f6eee3_100%)] p-0 shadow-[0_24px_60px_rgba(34,39,46,0.08)]">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,0.56fr)_minmax(0,1.44fr)]">
              <div className="border-b border-black/8 bg-[linear-gradient(180deg,rgba(248,242,233,0.98),rgba(243,236,226,0.94))] p-5 lg:border-b-0 lg:border-r lg:p-6">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-white p-2 text-[var(--ink)] shadow-[0_12px_30px_rgba(34,39,46,0.06)]">
                    <ActiveIcon className="size-4" />
                  </span>
                  <p className={SURFACE_EYEBROW_CLASS}>{activeCopy.eyebrow}</p>
                </div>
                <h2 className="font-display mt-4 max-w-sm text-[1.55rem] leading-[1.08] font-semibold text-[var(--ink)]">{activeCopy.title}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">{activeCopy.description}</p>
                <div className={`mt-5 ${QUIET_PANEL_CLASS}`}>
                  <p className={SURFACE_EYEBROW_CLASS}>Fastest path</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                    {activeIntent === "capture"
                      ? captureInputMode === "type"
                        ? "Turn one rough thought into a live map."
                        : captureInputMode === "import"
                          ? "Open Penny’s importer without leaving the capture system."
                          : "Save the fleeting note first, then decide what it becomes later."
                      : activeIntent === "challenge"
                        ? "Put one claim under pressure without opening the whole product first."
                        : "Open the learning scaffold beside a real claim instead of leaving the work."}
                  </p>
                </div>
              </div>

              <div className="p-5 lg:p-6">
              <div className="space-y-4">
                {activeIntent === "capture" ? (
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["type", "Type into Brain"],
                      ["import", "Paste or import"],
                      ["quick", "Quick note"],
                    ] as const).map(([mode, label]) => (
                      <Button
                        key={mode}
                        type="button"
                        variant={captureInputMode === mode ? "primary" : "secondary"}
                        className="gap-2 px-4 py-2.5"
                        onClick={() => {
                          setCaptureInputMode(mode);
                          setError(null);
                          setCaptureFeedback(null);
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                ) : null}
                <label className="block">
                  <span className="text-sm font-medium text-[var(--ink)]">
                    {activeIntent === "capture"
                      ? captureInputMode === "type"
                        ? "New material"
                        : captureInputMode === "import"
                          ? "Paste or import"
                          : "Quick note"
                      : activeIntent === "challenge"
                        ? "Claim in view"
                        : "Learning question"}
                  </span>
                  {activeIntent === "capture" && captureInputMode === "import" ? (
                    <div className={`mt-3 ${QUIET_PANEL_CLASS}`}>
                      <p className="text-sm leading-7 text-[var(--ink)]">
                        Route into Penny’s importer so you can paste source text, add a URL, or upload a document without choosing a separate product surface first.
                      </p>
                      <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                        {latestMap
                          ? `Import will open inside ${latestMap.title}.`
                          : "Create one map first so Penny has somewhere to place the imported material."}
                      </p>
                    </div>
                  ) : (
                    <textarea
                      className="penny-soft-switch mt-3 min-h-[144px] w-full rounded-[22px] border border-black/10 bg-white px-5 py-4 text-sm leading-7 text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
                      placeholder={
                        activeIntent === "capture" && captureInputMode === "quick"
                          ? "Capture the quick note, fragment, or fleeting thought you do not want to lose..."
                          : activeCopy.placeholder
                      }
                      value={currentDraft.text}
                      onChange={(event) => {
                        const nextText = event.target.value;
                        if (activeIntent === "capture") {
                          setCaptureDraft((current) => ({ ...current, text: nextText }));
                          return;
                        }
                        if (activeIntent === "challenge") {
                          setChallengeDraft({ text: nextText, selectedClaimId: null });
                          return;
                        }
                        setLearnDraft((current) => ({ ...current, text: nextText }));
                      }}
                    />
                  )}
                </label>

                {activeIntent === "challenge" ? (
                  <>
                    {challengeDraft.selectedClaimId ? (
                      <SelectedClaimNotice claimId={challengeDraft.selectedClaimId} claims={recentClaims} onClear={() => setChallengeDraft((current) => ({ ...current, selectedClaimId: null }))} />
                    ) : null}
                    {showChallengeClaims && recentClaims.length ? (
                      <ClaimPicker
                        claims={recentClaims}
                        selectedClaimId={challengeDraft.selectedClaimId}
                        onSelect={(claimId) => setChallengeDraft({ text: "", selectedClaimId: claimId })}
                      />
                    ) : null}
                  </>
                ) : null}

                {activeIntent === "learn" ? (
                  <>
                    {learnDraft.selectedClaimId ? (
                      <SelectedClaimNotice claimId={learnDraft.selectedClaimId} claims={recentClaims} onClear={() => setLearnDraft((current) => ({ ...current, selectedClaimId: null }))} />
                    ) : null}
                    {showLearnClaims && recentClaims.length ? (
                      <ClaimPicker
                        claims={recentClaims}
                        selectedClaimId={learnDraft.selectedClaimId}
                        onSelect={(claimId) => setLearnDraft((current) => ({ ...current, selectedClaimId: claimId }))}
                      />
                    ) : null}
                  </>
                ) : null}

                {error ? (
                  <div className={PANEL_NOTICE_ERROR_CLASS}>{error}</div>
                ) : null}
                {captureFeedback && activeIntent === "capture" ? (
                  <div className={PANEL_NOTICE_SUCCESS_CLASS}>{captureFeedback}</div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap gap-2">
                    <Button className="penny-press gap-2 px-4 py-2.5" onClick={handlePrimaryAction} disabled={primaryDisabled}>
                      {submittingIntent === activeIntent ? (
                        submittingIntent === "capture"
                          ? captureInputMode === "quick"
                            ? "Saving..."
                            : captureInputMode === "import"
                              ? "Opening..."
                              : "Adding..."
                          : submittingIntent === "challenge"
                            ? "Starting..."
                            : "Opening..."
                      ) : (
                        activeIntent === "capture"
                          ? captureInputMode === "quick"
                            ? "Save quick note"
                            : captureInputMode === "import"
                              ? "Open importer"
                              : activeCopy.primaryLabel
                          : activeCopy.primaryLabel
                      )}
                    </Button>
                    {activeCopy.secondaryLabel && activeIntent !== "capture" ? (
                      <Button
                        variant="secondary"
                        className="penny-press gap-2 px-4 py-2.5"
                        onClick={handleSecondaryAction}
                      >
                        <Sparkles className="size-4" />
                        {activeCopy.secondaryLabel}
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                    {activeIntent === "capture"
                      ? captureInputMode === "type"
                        ? "Type into Brain"
                        : captureInputMode === "import"
                          ? "Paste or import"
                          : "Quick note"
                      : activeIntent === "challenge" && challengeDraft.selectedClaimId
                      ? "Existing claim selected"
                      : activeIntent === "learn" && learnDraft.selectedClaimId
                        ? "Claim-tied learning"
                        : "One active path"}
                  </p>
                </div>
              </div>
              </div>
            </div>
          </Card>
          <div className="flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.18em] text-[var(--muted-ink)]">
            <span className="rounded-full border border-black/8 bg-white/76 px-3 py-1.5">Three intents</span>
            <span className="rounded-full border border-black/8 bg-white/76 px-3 py-1.5">One active panel</span>
            <span className="rounded-full border border-black/8 bg-white/76 px-3 py-1.5">Sidebar history</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ClaimPicker({
  claims,
  selectedClaimId,
  onSelect,
}: {
  claims: HomeLauncherClaimSummary[];
  selectedClaimId: string | null;
  onSelect: (claimId: string) => void;
}) {
  return (
    <div className={`${QUIET_PANEL_CLASS} bg-[var(--panel)]/55`}>
      <p className={SURFACE_EYEBROW_CLASS}>Recent claims</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {claims.map((claim) => (
          <button
            key={claim.id}
            type="button"
            className={[
              "rounded-full px-3 py-2 text-left text-xs font-medium transition",
              claim.id === selectedClaimId ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-white text-[var(--ink)] hover:bg-[#f7f2ea]",
            ].join(" ")}
            onClick={() => onSelect(claim.id)}
          >
            {truncate(claim.text, 56)}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectedClaimNotice({
  claimId,
  claims,
  onClear,
}: {
  claimId: string;
  claims: HomeLauncherClaimSummary[];
  onClear: () => void;
}) {
  const claim = claims.find((candidate) => candidate.id === claimId) ?? null;

  if (!claim) {
    return null;
  }

  return (
    <div className={QUIET_PANEL_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={SURFACE_EYEBROW_CLASS}>Selected claim</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{claim.text}</p>
          <p className={`mt-2 ${SURFACE_EYEBROW_CLASS}`}>{claim.mapTitle}</p>
        </div>
        <Button variant="ghost" className="px-3" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
