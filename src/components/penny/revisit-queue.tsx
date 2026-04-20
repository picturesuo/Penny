"use client";

import { AlarmClock, Clock3, RotateCcw, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RevisitPatternFeedback, RevisitQueueItem } from "@/lib/revisit-scheduler";

export interface RevisitQueueProps {
  items: RevisitQueueItem[];
  patternFeedback?: RevisitPatternFeedback | null;
  onOpenClaim?: (claimId: string) => void;
  onMarkHeldUp?: (claimId: string) => void;
  onMarkChanged?: (claimId: string) => void;
  onMarkFailed?: (claimId: string) => void;
  onSnooze?: (claimId: string) => void;
}

function formatTimeSince(date: Date) {
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "1 day ago";
  }
  return `${days} days ago`;
}

function priorityLabel(priority: RevisitQueueItem["schedule"]["priority"]) {
  switch (priority) {
    case "urgent":
      return "urgent";
    case "high":
      return "high";
    case "medium":
      return "medium";
    default:
      return "low";
  }
}

export function RevisitQueue({
  items,
  patternFeedback = null,
  onOpenClaim,
  onMarkHeldUp,
  onMarkChanged,
  onMarkFailed,
  onSnooze,
}: RevisitQueueProps) {
  if (!items.length) {
    return (
      <div className="rounded-[24px] border border-black/8 bg-white p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Daily revisit queue</p>
        <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Nothing is due right now.</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
          Penny will surface claims here when they age, drift, or pick up a trigger that deserves another pass.
        </p>
      </div>
    );
  }

  const actionsVisible = Boolean(onMarkHeldUp || onMarkChanged || onMarkFailed || onOpenClaim || onSnooze);

  return (
    <div className="rounded-[24px] border border-black/8 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Daily revisit queue</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">At most five claims surface per session.</h3>
        </div>
        <Badge className="bg-[#d9ead8] text-[#355b32]">{items.length}</Badge>
      </div>
      {patternFeedback ? (
        <div className="mt-4 rounded-[18px] border border-[#d7c06c] bg-[#fff9df] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[#6f5612]">Visible pattern</p>
          <p className="mt-2 text-sm font-medium leading-6 text-[#5a460d]">{patternFeedback.summary}</p>
          <p className="mt-2 text-sm leading-6 text-[#6f5612]">{patternFeedback.evidence}</p>
        </div>
      ) : null}
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.schedule.id} className="rounded-[18px] bg-[var(--panel)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-white text-[var(--ink)]">{priorityLabel(item.schedule.priority)}</Badge>
              <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{item.schedule.schedulingReason.type.replaceAll("_", " ")}</Badge>
              <Badge className="bg-white text-[var(--ink)]">{item.schedule.leitnerBox}</Badge>
            </div>
            <p className="mt-3 text-sm font-medium leading-6 text-[var(--ink)]">{item.claim.content}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{item.worldChangePrompt}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-ink)]">
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3.5" />
                Last reviewed {formatTimeSince(item.schedule.lastComputedAt)}
              </span>
              <span>Scheduled for {item.schedule.scheduledFor.toLocaleDateString()}</span>
            </div>
            {actionsVisible ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {onMarkHeldUp ? (
                  <Button className="gap-2" variant="secondary" onClick={() => onMarkHeldUp(item.claim.id)}>
                    <RotateCcw className="size-4" />
                    Held up
                  </Button>
                ) : null}
                {onMarkChanged ? (
                  <Button className="gap-2" variant="secondary" onClick={() => onMarkChanged(item.claim.id)}>
                    <ArrowRight className="size-4" />
                    Changed
                  </Button>
                ) : null}
                {onMarkFailed ? (
                  <Button className="gap-2" variant="secondary" onClick={() => onMarkFailed(item.claim.id)}>
                    <ArrowRight className="size-4" />
                    Failed
                  </Button>
                ) : null}
                {onOpenClaim ? (
                  <Button className="gap-2" variant="secondary" onClick={() => onOpenClaim(item.claim.id)}>
                    <ArrowRight className="size-4" />
                    Open claim
                  </Button>
                ) : null}
                {onSnooze ? (
                  <Button className="gap-2" variant="secondary" onClick={() => onSnooze(item.claim.id)}>
                    <AlarmClock className="size-4" />
                    Snooze 7 days
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
