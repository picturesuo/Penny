"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PrivateBetSnapshot } from "@/lib/penny-insights";
import type { DashboardPanel } from "@/types/home-dashboard";

export function ResolutionDuePanel({ panel }: { panel: DashboardPanel }) {
  const items = (panel.data.items ?? []) as PrivateBetSnapshot[];

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-[#e7defa] text-[#5c4c88]">resolution due</Badge>
        <Badge className="bg-white text-[var(--muted-ink)]">{items.length} claims</Badge>
      </div>
      <h3 className="mt-3 text-2xl font-semibold text-[var(--ink)]">Predictions that now need an answer.</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
        If a resolution date exists, the dashboard should make that claim impossible to ignore.
      </p>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.mapId} className="rounded-[22px] border border-black/8 bg-[var(--panel)] p-4">
            <p className="text-sm font-medium text-[var(--ink)]">{item.title}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              {item.credibilityLabel} · {item.prompt}
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
              {item.resolutionDate ? new Date(item.resolutionDate).toLocaleDateString() : "No date"}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Link href="/app/velocity">
          <Button variant="secondary" className="gap-2">
            Review calibration
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
