"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { HereBeforeSignal } from "@/types/here-before-detection";

export function HereBeforeNotification({
  signal,
  onDismiss,
  onViewHistory,
}: {
  signal: HereBeforeSignal;
  onDismiss: () => void;
  onViewHistory: (mapId: string, claimId: string) => void;
}) {
  return (
    <Card className="border border-[#d8c26d] bg-[#fff9df] p-5 shadow-none">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-white text-[#5a460d]">You&apos;ve been here before</Badge>
            <Badge className={signal.urgency === "high" ? "bg-[#f5d6b3] text-[#8b4d1f]" : signal.urgency === "medium" ? "bg-[#e7defa] text-[#5c4c88]" : "bg-white text-[#5a460d]"}>
              {signal.urgency} urgency
            </Badge>
          </div>
          <p className="mt-3 text-sm leading-7 text-[#5a460d]">
            This new claim is structurally similar to a claim you made before.
          </p>
        </div>
        <Button variant="secondary" className="self-start" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>

      <div className="mt-4 rounded-[22px] bg-white/80 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-[#6f5612]">Previous claim</p>
        <blockquote className="mt-2 text-sm leading-7 text-[#5a460d]">{signal.similarClaimText}</blockquote>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-[18px] bg-white p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">What happened</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{signal.whatHappened.confidenceJourney}</p>
        </div>
        <div className="rounded-[18px] bg-white p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Critique rounds</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{signal.whatHappened.roundCount}</p>
        </div>
        <div className="rounded-[18px] bg-white p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Concessions made</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{signal.whatHappened.concessionsMade}</p>
        </div>
      </div>

      {signal.whatHappened.wasResolved ? (
        <div className="mt-4 rounded-[22px] bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#6f5612]">Outcome</p>
          <p className="mt-2 text-sm leading-6 text-[#5a460d]">
            {signal.whatHappened.outcomeType ?? "unknown"}
          </p>
        </div>
      ) : null}

      {signal.lesson ? (
        <div className="mt-4 rounded-[22px] bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#6f5612]">What you learned</p>
          <blockquote className="mt-2 text-sm leading-7 text-[#5a460d]">{signal.lesson}</blockquote>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={() => onViewHistory(signal.similarMapId, signal.similarClaimId)}>View the full history</Button>
      </div>
    </Card>
  );
}
