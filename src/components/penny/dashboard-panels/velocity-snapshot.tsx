"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { IntellectualVelocityReport } from "@/types/intellectual-velocity";
import type { DashboardPanel } from "@/types/home-dashboard";

export function VelocitySnapshotPanel({ panel }: { panel: DashboardPanel }) {
  const report = panel.data.report as IntellectualVelocityReport;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-[#e7defa] text-[#5c4c88]">velocity snapshot</Badge>
        <Badge className="bg-white text-[var(--muted-ink)]">score {report.overallVelocityScore}</Badge>
        <Badge className="bg-white text-[var(--muted-ink)]">{report.periodDays}d</Badge>
      </div>
      <h3 className="mt-3 text-2xl font-semibold text-[var(--ink)]">How quickly the user is compounding.</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">{report.velocityNarrative}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge className="bg-white text-[var(--muted-ink)]">{Object.keys(report.metrics).length} metrics</Badge>
        <Badge className="bg-white text-[var(--muted-ink)]">{report.compoundingSignals.length} signals</Badge>
      </div>
      <div className="mt-4">
        <Link href="/app/velocity">
          <Button variant="secondary" className="gap-2">
            Open full velocity
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
