"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UncertaintyIndicator } from "@/components/penny/uncertainty-indicator";
import { track } from "@/lib/analytics";
import { getClientUserId } from "@/lib/error-reporting";
import { DEMO_USER_ID } from "@/lib/penny";
import type { MetaCognitionPromptSnapshot } from "@/lib/meta-cognition";

export function MetaCognitionPrompt({
  prompt,
  onRespond,
  onDismiss,
}: {
  prompt: MetaCognitionPromptSnapshot;
  onRespond: (responseType: "that's_useful" | "disagree" | "not_now", responseText: string | null, tellMeMoreOpened: boolean) => void;
  onDismiss: () => void;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [disagreeDraft, setDisagreeDraft] = useState("");
  const trackedPromptId = useRef<string | null>(null);

  useEffect(() => {
    if (trackedPromptId.current === prompt.id) {
      return;
    }

    trackedPromptId.current = prompt.id;
    const userId = getClientUserId();
    void track(
      {
        event: "learning_prompt_opened",
        properties: {
          promptType: prompt.trigger.condition,
          claimId: prompt.selectedNodeId ?? prompt.trigger.id,
        },
      },
      userId && userId !== DEMO_USER_ID ? userId : undefined,
    );
  }, [prompt.id, prompt.selectedNodeId, prompt.trigger.condition, prompt.trigger.id]);

  return (
    <div className="rounded-[24px] border border-[#b6c8f4] bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] p-4 shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <Badge className="bg-white text-[var(--ink)]">{prompt.trigger.promptTone.replaceAll("_", " ")}</Badge>
        <Badge className="bg-white text-[var(--ink)]">{prompt.trigger.condition.replaceAll("_", " ")}</Badge>
        <UncertaintyIndicator uncertainty={prompt.uncertainty} />
      </div>
      <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{prompt.prompt}</p>
      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
        {prompt.sessionContext.roundNumber} critique rounds · {prompt.sessionContext.claimsOpen} claims open · {prompt.sessionContext.minutesElapsed} minutes
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => setShowEvidence((current) => !current)}>
          {showEvidence ? "Hide evidence" : "Tell me more"}
        </Button>
        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => onRespond("that's_useful", null, showEvidence)}>
          That&apos;s useful
        </Button>
      </div>
      {showEvidence ? (
        <div className="mt-3 rounded-[18px] bg-white p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Underlying evidence</p>
          <div className="mt-2 space-y-2">
            {prompt.evidence.length ? (
              prompt.evidence.map((item) => (
                <p key={item} className="text-sm leading-6 text-[var(--muted-ink)]">
                  {item}
                </p>
              ))
            ) : (
              <p className="text-sm leading-6 text-[var(--muted-ink)]">{prompt.tellMeMore}</p>
            )}
          </div>
        </div>
      ) : null}
      <div className="mt-3 rounded-[18px] bg-white p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Response</p>
        <textarea
          className="mt-3 min-h-[88px] w-full rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
          placeholder="If you disagree, tell Penny what is actually happening."
          value={disagreeDraft}
          onChange={(event) => setDisagreeDraft(event.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="px-3 py-2 text-xs"
            disabled={disagreeDraft.trim().length < 8}
            onClick={() => onRespond("disagree", disagreeDraft.trim(), showEvidence)}
          >
            I disagree with this
          </Button>
          <Button variant="ghost" className="px-3 py-2 text-xs" onClick={onDismiss}>
            Not now
          </Button>
        </div>
      </div>
      {prompt.shapesAssociated.length ? (
        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
          Associated shapes: {prompt.shapesAssociated.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
