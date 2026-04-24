"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BlindSpotMap } from "@/types/thought-map";
import type { DashboardPanel } from "@/types/home-dashboard";

export function BlindSpotAlertPanel({ panel }: { panel: DashboardPanel }) {
  const blindSpotMap = panel.data.blindSpotMap as BlindSpotMap;
  const highConfidence = blindSpotMap.untestedHighConfidenceClaims?.slice(0, 3) ?? [];
  const unexaminedDomains = blindSpotMap.unexaminedDomains?.slice(0, 3) ?? [];

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-[#fff0eb] text-[#a04b35]">blind spots</Badge>
        <Badge className="bg-white text-[var(--muted-ink)]">{highConfidence.length} high-confidence claims</Badge>
        <Badge className="bg-white text-[var(--muted-ink)]">{unexaminedDomains.length} domains</Badge>
      </div>
      <h3 className="mt-3 text-2xl font-semibold text-[var(--ink)]">What Penny still does not trust yet.</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
        Blind spots are not errors in the UI. They are the surface that tells the user where their current map is most likely to be wrong.
      </p>
      <div className="mt-4 space-y-3">
        {highConfidence.map((claim) => (
          <div key={claim.claimId} className="rounded-[22px] border border-black/8 bg-[var(--panel)] p-4">
            <p className="text-sm font-medium text-[var(--ink)]">{claim.claimText}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{claim.suggestedAction}</p>
          </div>
        ))}
        {unexaminedDomains.map((domain) => (
          <div key={domain.domain} className="rounded-[22px] border border-black/8 bg-[var(--panel)] p-4">
            <p className="text-sm font-medium text-[var(--ink)]">{domain.domain} domain</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{domain.suggestedAction}</p>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Link href="/app/velocity">
          <Button variant="secondary" className="gap-2">
            Review velocity
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
