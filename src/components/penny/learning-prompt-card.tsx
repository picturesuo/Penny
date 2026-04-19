"use client";

import { useState } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { DEMO_USER_ID } from "@/lib/penny";
import { getClientUserId } from "@/lib/error-reporting";
import type { LearningPromptOutput } from "@/lib/learning-prompts";

interface LearningPromptCardProps {
  prompt: LearningPromptOutput;
  claimId: string;
  roundId: string | null;
  onDismiss: () => void;
}

export function LearningPromptCard({ prompt, claimId, roundId, onDismiss }: LearningPromptCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [marked, setMarked] = useState(false);

  function handleExpand() {
    setExpanded(true);
    const userId = getClientUserId();
    void track(
      {
        event: "learning_prompt_opened",
        properties: { promptType: prompt.promptType, claimId },
      },
      userId && userId !== DEMO_USER_ID ? userId : undefined,
    );
  }

  function handleMarkUseful() {
    setMarked(true);
    fetch("/api/learning-prompts/engage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimId, roundId, promptType: prompt.promptType, wasUseful: true }),
    }).catch(console.error);
  }

  const typeLabel =
    {
      concept_explanation: "Background",
      base_rate: "Reference class",
      framework: "Thinking tool",
    }[prompt.promptType] ?? "Learning prompt";

  return (
    <div className={`learning-prompt-card prompt-type-${prompt.promptType} rounded-[24px] border border-[#b6c8f4] bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] p-4 shadow-[0_16px_36px_rgba(15,23,42,0.08)]`}>
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--ink)]">{typeLabel}</span>
        <button onClick={onDismiss} className="rounded-full px-2 py-1 text-lg leading-none text-[var(--muted-ink)] transition hover:bg-white hover:text-[var(--ink)]" aria-label="Dismiss">
          ×
        </button>
      </div>

      <h4 className="mt-3 text-lg font-semibold text-[var(--ink)]">{prompt.headline}</h4>

      {!expanded ? (
        <button onClick={handleExpand} className="mt-3 text-sm font-medium text-[var(--ink)] underline decoration-black/20 underline-offset-4">
          Read more →
        </button>
      ) : (
        <>
          <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{prompt.body}</p>

          {prompt.source ? <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Source: {prompt.source}</p> : null}

          {prompt.actionLabel && prompt.actionUrl ? (
            <Link
              href={prompt.actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] ring-1 ring-black/10 transition hover:bg-[var(--panel)]"
            >
              {prompt.actionLabel}
            </Link>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {!marked ? (
              <button onClick={handleMarkUseful} className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] shadow-[0_12px_40px_rgba(34,39,46,0.16)] transition hover:bg-[var(--ink-soft)]">
                This was useful
              </button>
            ) : (
              <span className="rounded-full bg-white px-3 py-2 text-sm font-medium text-[var(--muted-ink)]">✓ Noted</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
