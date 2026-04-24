"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { DEMO_USER_ID } from "@/lib/penny";
import { getClientUserId } from "@/lib/error-reporting";
import type { LearningPromptOutput } from "@/lib/learning-prompts";

type LearningPromptBannerProps = {
  prompt: LearningPromptOutput;
  claimId: string;
  onDismiss: () => void;
};

export function LearningPromptBanner({ prompt, claimId, onDismiss }: LearningPromptBannerProps) {
  const trackedPromptId = useRef<string | null>(null);

  useEffect(() => {
    if (trackedPromptId.current === `${claimId}:${prompt.promptType}:${prompt.headline}`) {
      return;
    }

    trackedPromptId.current = `${claimId}:${prompt.promptType}:${prompt.headline}`;
    const userId = getClientUserId();
    void track(
      {
        event: "learning_prompt_opened",
        properties: {
          promptType: prompt.promptType,
          claimId,
        },
      },
      userId && userId !== DEMO_USER_ID ? userId : undefined,
    );
  }, [claimId, prompt.headline, prompt.promptType]);

  return (
    <div className="rounded-[24px] border border-[#b6c8f4] bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] p-4 shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-white text-[var(--ink)]">{prompt.promptType.replaceAll("_", " ")}</Badge>
        {prompt.source ? <Badge className="bg-white text-[var(--muted-ink)]">{prompt.source}</Badge> : null}
      </div>
      <h3 className="mt-3 text-lg font-semibold text-[var(--ink)]">{prompt.headline}</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--ink)]">{prompt.body}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {prompt.actionUrl && prompt.actionLabel ? (
          <Button asChild variant="secondary" className="px-3 py-2 text-xs">
            <Link href={prompt.actionUrl}>{prompt.actionLabel}</Link>
          </Button>
        ) : null}
        <Button variant="ghost" className="px-3 py-2 text-xs" onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}
