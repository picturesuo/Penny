"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buildMarginSurfaceSnapshot } from "@/lib/margin";
import { cn } from "@/lib/utils";
import type { MarginFragmentContextSnapshot, MarginFragmentModel } from "@/types/penny";

type MarginRailProps = {
  scopeLabel: string;
  fragments: MarginFragmentModel[];
  currentStage: MarginFragmentContextSnapshot["currentStage"];
  currentFocus: string;
  currentSphere: string;
  currentContext: string;
  currentResponse?: string | null;
  recentSessionMinutes: number | null;
  sourceSessionId?: string | null;
  sourceMapId?: string | null;
};

async function saveMarginFragment(payload: {
  content: string;
  sphere: string;
  contextSnapshot: MarginFragmentContextSnapshot;
  sourceSessionId?: string | null;
  sourceMapId?: string | null;
}) {
  const response = await fetch("/api/margin/fragments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Could not save margin fragment");
  }

  const data = (await response.json()) as { fragment: MarginFragmentModel };
  return data.fragment;
}

async function updateMarginFragment(
  fragmentId: string,
  payload: {
    status?: "floating" | "surfaced" | "promoted" | "merged" | "archived";
    priorityDelta?: number;
    mergedInto?: string | null;
  },
) {
  const response = await fetch(`/api/margin/fragments/${fragmentId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Could not update margin fragment");
  }

  const data = (await response.json()) as { fragment: MarginFragmentModel };
  return data.fragment;
}

function captureContextLabel(stage: MarginFragmentContextSnapshot["currentStage"]) {
  if (stage === "outline" || stage === "graph" || stage === "dashboard") {
    return stage;
  }

  return stage.replaceAll("_", " ");
}

export function MarginRail({
  scopeLabel,
  fragments,
  currentStage,
  currentFocus,
  currentSphere,
  currentContext,
  currentResponse,
  recentSessionMinutes,
  sourceSessionId,
  sourceMapId,
}: MarginRailProps) {
  const [localFragments, setLocalFragments] = useState(fragments);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [marginOpen, setMarginOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setLocalFragments(fragments);
  }, [fragments]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const targetTag = target?.tagName?.toLowerCase() ?? "";
      const isEditable =
        targetTag === "input" || targetTag === "textarea" || targetTag === "select" || target?.isContentEditable === true;

      if (isEditable) {
        return;
      }

      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        setCaptureOpen(true);
        setMarginOpen(true);
        setStatus("Margin opened. Capture the thought without classifying it.");
      }

      if (event.altKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        setMarginOpen((current) => !current);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const snapshot = useMemo(
    () =>
      buildMarginSurfaceSnapshot(localFragments, {
        focusText: currentFocus || currentContext || scopeLabel,
        sphere: currentSphere,
      }),
    [currentContext, currentFocus, currentSphere, localFragments, scopeLabel],
  );

  const contextSnapshot: MarginFragmentContextSnapshot = {
    currentStage,
    currentFocus,
    currentSphere,
    currentContext,
    currentResponse: currentResponse ?? null,
    recentSessionMinutes,
    sourceSessionId: sourceSessionId ?? null,
    sourceMapId: sourceMapId ?? null,
  };

  async function handleSave() {
    const content = draft.trim();
    if (content.length < 2) {
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const fragment = await saveMarginFragment({
        content,
        sphere: currentSphere,
        contextSnapshot,
        sourceSessionId: sourceSessionId ?? null,
        sourceMapId: sourceMapId ?? null,
      });

      setLocalFragments((current) => [fragment, ...current]);
      setDraft("");
      setCaptureOpen(false);
      setMarginOpen(true);
      setStatus("Fragment saved. It stays in the margin until you want it.");
    } catch {
      setStatus("Could not save this fragment right now.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(fragmentId: string, payload: { status: "floating" | "surfaced" | "promoted" | "merged" | "archived"; mergedInto?: string | null }) {
    try {
      const fragment = await updateMarginFragment(fragmentId, payload);
      setLocalFragments((current) => current.map((item) => (item.id === fragment.id ? fragment : item)));
    } catch {
      setStatus("Could not update that fragment.");
    }
  }

  const topFragments = snapshot.candidates.slice(0, 5);

  return (
    <>
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
        <button
          type="button"
          onClick={() => setMarginOpen((current) => !current)}
          className="rounded-full border border-black/10 bg-white px-4 py-3 text-left shadow-[0_20px_50px_rgba(0,0,0,0.1)]"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex size-3 rounded-full bg-[#8f8f8f]" />
            <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Margin</span>
            <Badge className="bg-[#f0ede7] text-[var(--ink)]">{snapshot.floatingCount}</Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
            Press Tab to catch a fleeting thought without leaving {captureContextLabel(currentStage)}.
          </p>
        </button>

        {captureOpen ? (
          <Card className="w-[min(92vw,420px)] border-black/10 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Capture without committing attention</p>
            <textarea
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="mt-3 min-h-[92px] w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
              placeholder="What just flashed by?"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={saving || draft.trim().length < 2} onClick={handleSave} className="px-3 py-2 text-xs">
                {saving ? "Saving…" : "Store in margin"}
              </Button>
              <Button
                variant="secondary"
                className="px-3 py-2 text-xs"
                onClick={() => {
                  setCaptureOpen(false);
                  setDraft("");
                }}
              >
                Keep working
              </Button>
            </div>
          </Card>
        ) : null}
      </div>

      {marginOpen ? (
        <Card className="fixed bottom-24 right-5 z-30 w-[min(92vw,520px)] max-h-[72vh] overflow-hidden border-black/10 p-0 shadow-[0_24px_70px_rgba(0,0,0,0.16)]">
          <div className="flex items-center justify-between border-b border-black/8 px-5 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">The Margin</p>
              <h3 className="mt-1 text-lg font-semibold text-[var(--ink)]">Fleeting thoughts that stayed alive</h3>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-white text-[var(--ink)]">{scopeLabel}</Badge>
              <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => setMarginOpen(false)}>
                Close
              </Button>
            </div>
          </div>

          <div className="max-h-[calc(72vh-68px)] overflow-y-auto px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] bg-[var(--panel)] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Floating</p>
                <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{snapshot.floatingCount}</p>
              </div>
              <div className="rounded-[18px] bg-[var(--panel)] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Clusters</p>
                <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{snapshot.clusters.length}</p>
              </div>
            </div>

            <div className="mt-4 rounded-[20px] border border-dashed border-black/10 bg-[#f8f5ee] px-4 py-3 text-sm leading-6 text-[var(--muted-ink)]">
              Capture is intentionally light: no type, no confidence, no stakes, no linking. Just the thought.
            </div>

            {status ? <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">{status}</p> : null}

            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Resume candidates</p>
                <div className="mt-3 space-y-3">
                  {topFragments.length ? (
                    topFragments.map(({ fragment, score, reasons }) => (
                      <div key={fragment.id} className="rounded-[18px] bg-white p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-[#e7defa] text-[#5c4c88]">score {score.toFixed(1)}</Badge>
                          <Badge className="bg-white text-[var(--ink)]">{fragment.status}</Badge>
                          <Badge className="bg-white text-[var(--ink)]">{fragment.sphere}</Badge>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{fragment.content}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                          {reasons.length ? reasons.join(" · ") : "quietly floating"}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            className="px-3 py-2 text-xs"
                            onClick={() => handleUpdate(fragment.id, { status: "surfaced" })}
                          >
                            Surface
                          </Button>
                          <Button
                            variant="secondary"
                            className="px-3 py-2 text-xs"
                            onClick={() => handleUpdate(fragment.id, { status: "promoted" })}
                          >
                            Promote
                          </Button>
                          <Button
                            variant="secondary"
                            className="px-3 py-2 text-xs"
                            onClick={() => handleUpdate(fragment.id, { status: "merged", mergedInto: currentFocus.slice(0, 120) || null })}
                          >
                            Merge
                          </Button>
                          <Button
                            variant="secondary"
                            className="px-3 py-2 text-xs"
                            onClick={() => handleUpdate(fragment.id, { status: "archived" })}
                          >
                            Archive
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-[18px] bg-white p-4 text-sm leading-6 text-[var(--muted-ink)]">
                      No fragments are ready to resurface yet.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Clusters</p>
                <div className="mt-3 space-y-3">
                  {snapshot.clusters.length ? (
                    snapshot.clusters.map((cluster) => (
                      <div key={cluster.key} className="rounded-[18px] bg-white p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-[#d9ead8] text-[#355b32]">{cluster.label}</Badge>
                          <Badge className="bg-white text-[var(--ink)]">{cluster.fragments.length} fragments</Badge>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{cluster.summary}</p>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-[18px] bg-white p-4 text-sm leading-6 text-[var(--muted-ink)]">
                      No cluster is strong enough to surface yet.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Weekly review</p>
                <div className="mt-3 space-y-3">
                  {snapshot.weeklyReview.length ? (
                    snapshot.weeklyReview.map((fragment) => (
                      <div key={fragment.id} className="rounded-[18px] bg-[var(--panel)] p-4">
                        <p className="text-sm leading-6 text-[var(--ink)]">{fragment.content}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                          captured {fragment.createdAt.toLocaleDateString()}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-[18px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
                      Nothing is old enough or strong enough yet for the weekly review.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
      ) : null}
    </>
  );
}
