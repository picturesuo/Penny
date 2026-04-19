"use client";

import { Card } from "@/components/ui/card";
import { RevisitQueue } from "@/components/penny/revisit-queue";
import type { RevisitQueueItem } from "@/lib/revisit-scheduler";
import type { DashboardPanel } from "@/types/home-dashboard";

export function RevisitQueuePanel({ panel }: { panel: DashboardPanel }) {
  const items = (panel.data.items ?? []) as RevisitQueueItem[];

  return (
    <Card className="p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Revisit queue</p>
      <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Claims that deserve another pass.</h3>
      <div className="mt-4">
        <RevisitQueue items={items} />
      </div>
    </Card>
  );
}
