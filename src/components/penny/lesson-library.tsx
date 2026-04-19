"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatLessonPreview } from "@/lib/lesson-library";
import type { Lesson } from "@/types/lesson-library";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function lessonSourceLabel(sourceType: Lesson["sourceType"]) {
  const labels: Record<Lesson["sourceType"], string> = {
    post_mortem: "Post-mortem",
    concession: "Concession",
    resolution: "Resolution",
    counterfactual: "Counterfactual",
    manual: "Manual",
  };

  return labels[sourceType];
}

function lessonTypeLabel(type: Lesson["lessonType"]) {
  return type.replaceAll("_", " ");
}

function unique(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function LessonLibraryView({
  userId,
  initialLessons,
  generatedAt,
}: {
  userId: string;
  initialLessons: Lesson[];
  generatedAt: Date;
}) {
  const [lessons, setLessons] = useState(initialLessons);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const lessonTypes = useMemo(() => unique(lessons.map((lesson) => lesson.lessonType)), [lessons]);
  const lessonTags = useMemo(() => unique(lessons.flatMap((lesson) => lesson.tags)), [lessons]);
  const appliedLessons = lessons.filter((lesson) => lesson.hasBeenApplied).length;
  const mostAppliedLesson = useMemo(
    () =>
      lessons
        .slice()
        .sort((a, b) => b.applicationCount - a.applicationCount || b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
    [lessons],
  );
  const mostRecentLesson = useMemo(
    () => lessons.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
    [lessons],
  );

  const filteredLessons = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return lessons
      .filter((lesson) => {
        if (selectedType !== "all" && lesson.lessonType !== selectedType) {
          return false;
        }

        if (selectedTag !== "all" && !lesson.tags.includes(selectedTag)) {
          return false;
        }

        if (!query) {
          return true;
        }

        const haystack = [
          lesson.lessonText,
          lesson.userEditedText ?? "",
          lesson.domain ?? "",
          lesson.claimType ?? "",
          lesson.tags.join(" "),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      })
      .sort((a, b) => b.applicationCount - a.applicationCount || b.createdAt.getTime() - a.createdAt.getTime());
  }, [lessons, searchQuery, selectedTag, selectedType]);

  function markApplied(lesson: Lesson, wasUseful: boolean | null) {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/users/${userId}/lesson-library`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lessonId: lesson.id,
            appliedInContext: "lesson library",
            wasUseful,
            userNote: null,
          }),
        });

        if (!response.ok) {
          return;
        }

        setLessons((current) =>
          current.map((candidate) =>
            candidate.id === lesson.id
              ? {
                  ...candidate,
                  hasBeenApplied: true,
                  applicationCount: candidate.applicationCount + 1,
                  applicationEvents: [
                    ...candidate.applicationEvents,
                    {
                      lessonId: lesson.id,
                      appliedInContext: "lesson library",
                      appliedAt: new Date(),
                      wasUseful,
                      userNote: null,
                    },
                  ],
                  lastSurfacedAt: new Date(),
                }
              : candidate,
          ),
        );
      } catch {
        return;
      }
    });
  }

  return (
    <Card className="border border-black/8 bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Lesson library</p>
          <h2 className="mt-2 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
            Distilled lessons from your own decisions.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-ink)]">
            Penny turns post-mortems, strong concessions, resolutions, and counterfactuals into reusable lessons that can resurface when the next claim looks structurally similar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-[#d9ead8] text-[#355b32]">{lessons.length} lessons</Badge>
          <Badge className="bg-[#e7defa] text-[#5c4c88]">{appliedLessons} applied</Badge>
          <Badge className="bg-white text-[var(--muted-ink)]">Generated {formatDate(generatedAt)}</Badge>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.92fr]">
        <div className="rounded-[24px] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Continuity note</p>
          <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
            These lessons were distilled from {lessons.length} recorded decision moments. Losing them would mean losing the smallest, most repeatable pieces of your own judgment.
          </p>
        </div>
        <div className="rounded-[24px] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Most referenced</p>
          {mostAppliedLesson ? (
            <>
              <blockquote className="mt-3 text-sm leading-7 text-[var(--ink)]">{formatLessonPreview(mostAppliedLesson)}</blockquote>
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                Applied {mostAppliedLesson.applicationCount} times
                {mostAppliedLesson.lastSurfacedAt ? ` · last surfaced ${formatDate(mostAppliedLesson.lastSurfacedAt)}` : ""}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">No lesson has been applied yet.</p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <div className="rounded-[24px] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Search and filter</p>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search lessons..."
            className="mt-3 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
          />

          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Type</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-full border px-3 py-2 text-xs transition ${
                    selectedType === "all"
                      ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                      : "border-black/10 bg-white text-[var(--muted-ink)] hover:border-black/20 hover:text-[var(--ink)]"
                  }`}
                  onClick={() => setSelectedType("all")}
                >
                  All
                </button>
                {lessonTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`rounded-full border px-3 py-2 text-xs transition ${
                      selectedType === type
                        ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                        : "border-black/10 bg-white text-[var(--muted-ink)] hover:border-black/20 hover:text-[var(--ink)]"
                    }`}
                    onClick={() => setSelectedType(type)}
                  >
                    {lessonTypeLabel(type as Lesson["lessonType"])}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Tags</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-full border px-3 py-2 text-xs transition ${
                    selectedTag === "all"
                      ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                      : "border-black/10 bg-white text-[var(--muted-ink)] hover:border-black/20 hover:text-[var(--ink)]"
                  }`}
                  onClick={() => setSelectedTag("all")}
                >
                  All tags
                </button>
                {lessonTags.slice(0, 24).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`rounded-full border px-3 py-2 text-xs transition ${
                      selectedTag === tag
                        ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                        : "border-black/10 bg-white text-[var(--muted-ink)] hover:border-black/20 hover:text-[var(--ink)]"
                    }`}
                    onClick={() => setSelectedTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Lessons</p>
          <div className="mt-4 space-y-3">
            {filteredLessons.length ? (
              filteredLessons.map((lesson) => (
                <div key={lesson.id} className="rounded-[20px] border border-black/8 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-[var(--panel)] text-[var(--ink)]">{lessonSourceLabel(lesson.sourceType)}</Badge>
                    <Badge className="bg-[#d9ead8] text-[#355b32]">{lessonTypeLabel(lesson.lessonType)}</Badge>
                    {lesson.domain ? <Badge className="bg-[#e7defa] text-[#5c4c88]">{lesson.domain}</Badge> : null}
                  </div>
                  <blockquote className="mt-3 text-sm leading-7 text-[var(--ink)]">{formatLessonPreview(lesson)}</blockquote>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lesson.tags.slice(0, 6).map((tag) => (
                      <Badge key={tag} className="bg-[var(--panel)] text-[var(--muted-ink)]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                    <span>{formatDate(lesson.createdAt)}</span>
                    <span>Confidence {Math.round(lesson.confidenceInLesson * 100)}%</span>
                    <span>Applied {lesson.applicationCount}x</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" className="px-3 py-2 text-xs" disabled={isPending} onClick={() => markApplied(lesson, true)}>
                      Useful
                    </Button>
                    <Button type="button" variant="secondary" className="px-3 py-2 text-xs" disabled={isPending} onClick={() => markApplied(lesson, false)}>
                      Not useful
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-[var(--muted-ink)]">No lesson matches the current filters.</p>
            )}
          </div>
        </div>
      </div>

      {mostRecentLesson ? (
        <div className="mt-6 rounded-[24px] bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Most recent</p>
          <blockquote className="mt-3 text-sm leading-7 text-[var(--ink)]">{formatLessonPreview(mostRecentLesson)}</blockquote>
        </div>
      ) : null}
    </Card>
  );
}
