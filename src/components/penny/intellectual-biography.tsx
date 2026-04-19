"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { IntellectualBiography, BiographyChapter, BiographyAnnotation } from "@/types/intellectual-biography";

type AnnotationTarget = {
  targetType: "chapter" | "belief_shift" | "highlight";
  targetId: string;
};

export function IntellectualBiographyView({ biography }: { biography: IntellectualBiography }) {
  const [currentBiography, setCurrentBiography] = useState(biography);
  const [selectedChapterId, setSelectedChapterId] = useState(biography.chapters[0]?.id ?? null);
  const [annotationTarget, setAnnotationTarget] = useState<AnnotationTarget | null>(null);
  const [annotationText, setAnnotationText] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedChapter = useMemo(
    () => currentBiography.chapters.find((chapter) => chapter.id === selectedChapterId) ?? currentBiography.chapters[0] ?? null,
    [currentBiography.chapters, selectedChapterId],
  );

  const activeTarget = annotationTarget ?? (selectedChapter ? { targetType: "chapter" as const, targetId: selectedChapter.id } : null);

  async function handleSaveAnnotation() {
    if (!selectedChapter || !activeTarget || annotationText.trim().length < 3) {
      return;
    }

    startTransition(async () => {
      setSaveMessage(null);

      try {
        const response = await fetch(`/api/users/${currentBiography.userId}/biography`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chapterId: selectedChapter.id,
            targetType: activeTarget.targetType,
            targetId: activeTarget.targetId,
            annotationText: annotationText.trim(),
          }),
        });

        if (!response.ok) {
          setSaveMessage("Could not save the annotation.");
          return;
        }

        const payload = (await response.json()) as { biography: IntellectualBiography; annotation: BiographyAnnotation };
        setCurrentBiography(payload.biography);
        setAnnotationText("");
        setAnnotationTarget(null);
        setSaveMessage("Saved.");
      } catch {
        setSaveMessage("Could not save the annotation.");
      }
    });
  }

  function selectChapter(chapter: BiographyChapter) {
    setSelectedChapterId(chapter.id);
    setAnnotationTarget({ targetType: "chapter", targetId: chapter.id });
    setAnnotationText("");
    setSaveMessage(null);
  }

  if (!selectedChapter) {
    return (
      <Card className="p-6 sm:p-8">
        <p className="text-sm leading-7 text-[var(--muted-ink)]">No biography is available yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(243,241,232,0.94))] p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Intellectual biography</p>
            <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)] sm:text-5xl">Your thinking, chapter by chapter.</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted-ink)]">
              This is the living record of what changed, what stayed load-bearing, and the moves that made your thinking evolve.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:max-w-[380px]">
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">{currentBiography.totalChapters} chapters</Badge>
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">{currentBiography.totalBeliefShifts} belief shifts</Badge>
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">{currentBiography.totalDialecticRounds} critique rounds</Badge>
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">{currentBiography.totalClaimsResolved} resolved claims</Badge>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[28px] border border-black/8 bg-white/80 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Arc</p>
            <blockquote className="mt-3 text-lg leading-8 text-[var(--ink)]">{currentBiography.intellectualArc}</blockquote>
            <div className="mt-4 space-y-3 rounded-[22px] bg-[var(--panel)] p-4 text-sm leading-6 text-[var(--muted-ink)]">
              <p>{currentBiography.openingNarrative}</p>
              <p>{currentBiography.currentNarrative}</p>
              <p>
                The biggest single update was{" "}
                {currentBiography.biggestSingleUpdate
                  ? `a ${currentBiography.biggestSingleUpdate.shiftMagnitude}-point move on "${currentBiography.biggestSingleUpdate.claimText}"`
                  : "not yet established"}
                .
              </p>
            </div>
          </div>

          <div className="rounded-[28px] border border-black/8 bg-white/80 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Chapter spine</p>
            <div className="mt-4 grid gap-3">
              {currentBiography.chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  className={`rounded-[22px] border p-4 text-left transition ${
                    chapter.id === selectedChapter.id
                      ? "border-black/20 bg-[var(--panel)]"
                      : "border-black/8 bg-white/80 hover:border-black/15"
                  }`}
                  onClick={() => selectChapter(chapter)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-white text-[var(--ink)]">Chapter {chapter.chapterNumber}</Badge>
                    <Badge className="bg-[#e7defa] text-[#5c4c88]">{chapter.majorBeliefShifts.length} shifts</Badge>
                    <Badge className="bg-white text-[var(--muted-ink)]">
                      {chapter.periodStart.toLocaleDateString()} to {chapter.periodEnd.toLocaleDateString()}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm font-medium text-[var(--ink)]">{chapter.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{chapter.narrativeText}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Selected chapter</p>
            <h2 className="mt-2 text-3xl font-semibold text-[var(--ink)]">{selectedChapter.title}</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
              {selectedChapter.periodStart.toLocaleDateString()} to {selectedChapter.periodEnd.toLocaleDateString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedChapter.dominantThemes.map((theme) => (
              <Badge key={theme} className="bg-[var(--panel)] text-[var(--ink)]">
                {theme}
              </Badge>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <section className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">What changed</p>
              <div className="mt-4 space-y-3">
                {selectedChapter.majorBeliefShifts.length ? (
                  selectedChapter.majorBeliefShifts.map((shift) => (
                    <div key={shift.id} className="rounded-[18px] border border-black/8 bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-white text-[var(--ink)]">{shift.shiftDirection}</Badge>
                        <Badge className="bg-[#d9ead8] text-[#355b32]">{shift.shiftMagnitude} points</Badge>
                        <Button
                          variant="secondary"
                          className="ml-auto px-3 py-2 text-xs"
                          onClick={() => {
                            setAnnotationTarget({ targetType: "belief_shift", targetId: shift.id });
                            setAnnotationText("");
                          }}
                        >
                          Annotate
                        </Button>
                      </div>
                      <p className="mt-3 text-sm font-medium text-[var(--ink)]">{shift.claimText}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{shift.narrativeDescription}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-7 text-[var(--muted-ink)]">No significant belief shifts were detected in this chapter.</p>
                )}
              </div>
            </section>

            <section className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Dialectic highlights</p>
              <div className="mt-4 space-y-3">
                {selectedChapter.dialecticHighlights.length ? (
                  selectedChapter.dialecticHighlights.map((highlight) => (
                    <div key={highlight.id} className="rounded-[18px] border border-black/8 bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-white text-[var(--ink)]">{highlight.outcomeType.replaceAll("_", " ")}</Badge>
                        <Badge className="bg-[#e7defa] text-[#5c4c88]">{highlight.critiqueType}</Badge>
                        <Button
                          variant="secondary"
                          className="ml-auto px-3 py-2 text-xs"
                          onClick={() => {
                            setAnnotationTarget({ targetType: "highlight", targetId: highlight.id });
                            setAnnotationText("");
                          }}
                        >
                          Annotate
                        </Button>
                      </div>
                      <p className="mt-3 text-sm font-medium text-[var(--ink)]">{highlight.claimText}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{highlight.userResponseSummary}</p>
                      {highlight.notableQuote ? (
                        <blockquote className="mt-3 rounded-[18px] bg-[var(--panel)] px-4 py-3 text-sm italic leading-6 text-[var(--ink)]">
                          {highlight.notableQuote}
                        </blockquote>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-7 text-[var(--muted-ink)]">No dialectic highlights were detected in this chapter.</p>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Annotations</p>
              <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
                Add your own commentary on the chapter, a belief shift, or a specific highlight.
              </p>

              <div className="mt-4 rounded-[18px] bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                  <span>Target</span>
                  <Badge className="bg-[var(--panel)] text-[var(--ink)]">
                    {activeTarget?.targetType ?? "chapter"}
                  </Badge>
                  <Badge className="bg-white text-[var(--muted-ink)]">
                    {activeTarget?.targetId ?? selectedChapter.id}
                  </Badge>
                </div>
                <textarea
                  value={annotationText}
                  onChange={(event) => setAnnotationText(event.target.value)}
                  placeholder="Add a note about what this chapter says about your thinking..."
                  rows={6}
                  className="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-black/20"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button onClick={handleSaveAnnotation} disabled={isPending || annotationText.trim().length < 3}>
                    {isPending ? "Saving..." : "Save annotation"}
                  </Button>
                  {saveMessage ? <p className="text-sm text-[var(--muted-ink)]">{saveMessage}</p> : null}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {selectedChapter.userAnnotations.length ? (
                  selectedChapter.userAnnotations.map((annotation) => (
                    <div key={annotation.id} className="rounded-[18px] border border-black/8 bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-[var(--panel)] text-[var(--ink)]">{annotation.targetType}</Badge>
                        <Badge className="bg-white text-[var(--muted-ink)]">
                          {annotation.createdAt.toLocaleDateString()}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{annotation.annotationText}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-7 text-[var(--muted-ink)]">No annotations have been added to this chapter yet.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </Card>
    </div>
  );
}
