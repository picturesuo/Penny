import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { OnboardingChecklist as OnboardingChecklistModel } from "@/types/onboarding";

export function OnboardingChecklist({ checklist }: { checklist: OnboardingChecklistModel }) {
  const progress = checklist.totalCount === 0 ? 0 : Math.round((checklist.completedCount / checklist.totalCount) * 100);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Onboarding</p>
          <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">First 10 minutes</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
            The first useful loop should be visible immediately: one claim, one critique, one update.
          </p>
        </div>
        <Badge className="bg-[var(--panel)] text-[var(--ink)]">{progress}%</Badge>
      </div>

      <div className="mt-5 space-y-3">
        {checklist.items.map((item) => (
          <div key={item.id} className="rounded-[22px] border border-black/8 bg-[var(--panel)] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[var(--ink)]">{item.label}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">{item.description}</p>
              </div>
              <Badge className={item.isCompleted ? "bg-[#d9ead8] text-[#355b32]" : "bg-white text-[var(--muted-ink)]"}>
                {item.isCompleted ? "Done" : `${item.estimatedMinutes} min`}
              </Badge>
            </div>
          </div>
        ))}
      </div>

      {checklist.nextRecommended ? (
        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
          Next: {checklist.nextRecommended.label}
        </p>
      ) : null}
    </Card>
  );
}

