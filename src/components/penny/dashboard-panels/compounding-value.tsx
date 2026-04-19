"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MemoryTimeDashboard } from "@/lib/penny-insights";
import type { IntellectualVelocityReport } from "@/types/intellectual-velocity";
import type { DashboardPanel } from "@/types/home-dashboard";

export function CompoundingValuePanel({ panel }: { panel: DashboardPanel }) {
  const velocityReport = panel.data.velocityReport as IntellectualVelocityReport;
  const memoryTime = panel.data.memoryTime as MemoryTimeDashboard;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-[#d9ead8] text-[#355b32]">compounding value</Badge>
        <Badge className="bg-white text-[var(--muted-ink)]">score {velocityReport.overallVelocityScore}</Badge>
      </div>
      <h3 className="mt-3 text-2xl font-semibold text-[var(--ink)]">The product should show its work over time.</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">{velocityReport.velocityNarrative}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge className="bg-white text-[var(--muted-ink)]">{memoryTime.beliefDigests.length} belief digests</Badge>
        <Badge className="bg-white text-[var(--muted-ink)]">{memoryTime.predictionRetrospectives.length} retrospectives</Badge>
        <Badge className="bg-white text-[var(--muted-ink)]">{velocityReport.compoundingSignals.length} signals</Badge>
      </div>
      <div className="mt-4">
        <Link href="/app/velocity">
          <Button variant="secondary" className="gap-2">
            Open velocity
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
