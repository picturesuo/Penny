"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionSummary, ThinkingSession } from "@/types/thought-map";

const CLOSE_QUESTIONS = [
  "What was the most important thing you updated today?",
  "What are you still unsure about?",
  "Is there anything you want to look at next session?",
] as const;

export function SessionClose({
  session,
  summary,
  onClosed,
  onSkipped,
}: {
  session: ThinkingSession;
  summary: SessionSummary | null;
  onClosed: (session: ThinkingSession) => void;
  onSkipped: (session: ThinkingSession) => void;
}) {
  const [answers, setAnswers] = useState<Record<(typeof CLOSE_QUESTIONS)[number], string>>({
    "What was the most important thing you updated today?": "",
    "What are you still unsure about?": "",
    "Is there anything you want to look at next session?": "",
  });
  const [openItemsNoted, setOpenItemsNoted] = useState("");
  const [nextSessionIntention, setNextSessionIntention] = useState("");
  const [focusRating, setFocusRating] = useState<"scattered" | "moderate" | "deep">("moderate");
  const [energyRating, setEnergyRating] = useState<"low" | "medium" | "high">("medium");
  const [productivityRating, setProductivityRating] = useState("3");
  const [skipConfirmed, setSkipConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function closeSession(skip: boolean) {
    setError(null);

    const response = await fetch("/api/sessions", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: session.id,
        skipClosingRitual: skip,
        questionsAnswered: CLOSE_QUESTIONS.map((question) => ({
          question,
          answer: skip ? "" : answers[question].trim(),
        })),
        openItemsNoted: skip
          ? []
          : openItemsNoted
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
        nextSessionIntention: skip ? null : nextSessionIntention.trim() || null,
        energyRating: skip ? null : energyRating,
        focusRating: skip ? null : focusRating,
        productivityRating: skip ? null : Number(productivityRating),
      }),
    });

    if (!response.ok) {
      setError("Penny could not close the session.");
      return;
    }

    const payload = (await response.json()) as { session: ThinkingSession };
    if (skip) {
      onSkipped(payload.session);
      return;
    }

    onClosed(payload.session);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-black/10 bg-[var(--paper)] p-6 shadow-[0_40px_120px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Closing ritual</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--ink)]">End the session deliberately</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              Penny will capture what changed, what remains open, and how you want to re-enter next time.
            </p>
          </div>
          <Button type="button" variant="ghost" className="h-10 w-10 p-0" onClick={() => setSkipConfirmed(true)}>
            <X className="size-4" />
          </Button>
        </div>

        {summary ? (
          <div className="mt-6 rounded-[24px] border border-[#d7c06c] bg-[#fff9df] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[#6f5612]">Auto-generated summary</p>
            <p className="mt-2 text-sm leading-6 text-[#5a460d]">{summary.keyInsight ?? "No key insight generated yet."}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-xs text-[#6f5612]">
                {summary.claimsExamined} claims examined
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-[#6f5612]">
                {summary.claimsUpdated} claims updated
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-[#6f5612]">
                {summary.artifactsGenerated} artifacts generated
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-[#6f5612]">
                {summary.critiquesRun} critiques run
              </span>
            </div>
          </div>
        ) : null}

        {skipConfirmed ? (
          <div className="mt-6 rounded-[24px] border border-black/10 bg-white p-4">
            <p className="text-sm font-medium text-[var(--ink)]">Skip the closing ritual?</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              Skipping is logged so the session history stays honest.
            </p>
            <div className="mt-4 flex gap-3">
              <Button variant="secondary" onClick={() => setSkipConfirmed(false)}>
                Keep closing
              </Button>
              <Button
                onClick={() => {
                  startTransition(() => {
                    void closeSession(true);
                  });
                }}
                disabled={isPending}
              >
                Skip and close
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-5">
            {CLOSE_QUESTIONS.map((question) => (
              <label key={question} className="space-y-2">
                <span className="text-sm font-medium text-[var(--ink)]">{question}</span>
                <textarea
                  rows={3}
                  value={answers[question]}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question]: event.target.value,
                    }))
                  }
                  className="w-full rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none focus:border-black/20"
                />
              </label>
            ))}

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--ink)]">Open items noted</span>
              <textarea
                rows={3}
                value={openItemsNoted}
                onChange={(event) => setOpenItemsNoted(event.target.value)}
                placeholder="One per line."
                className="w-full rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--ink)]">What do you want to look at next session?</span>
              <input
                type="text"
                value={nextSessionIntention}
                onChange={(event) => setNextSessionIntention(event.target.value)}
                className="w-full rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--ink)]">Focus</span>
                <select
                  value={focusRating}
                  onChange={(event) => setFocusRating(event.target.value as typeof focusRating)}
                  className="w-full rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
                >
                  <option value="scattered">Scattered</option>
                  <option value="moderate">Moderate</option>
                  <option value="deep">Deep</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--ink)]">Energy</span>
                <select
                  value={energyRating}
                  onChange={(event) => setEnergyRating(event.target.value as typeof energyRating)}
                  className="w-full rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--ink)]">Productivity</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={productivityRating}
                  onChange={(event) => setProductivityRating(event.target.value)}
                  className="w-full rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
                />
              </label>
            </div>

            {error ? <p className="text-sm text-[#8b4d1f]">{error}</p> : null}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  startTransition(() => {
                    void closeSession(false);
                  });
                }}
                disabled={isPending}
              >
                Close session
              </Button>
              <Button variant="secondary" onClick={() => setSkipConfirmed(true)} disabled={isPending}>
                Skip ritual
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
