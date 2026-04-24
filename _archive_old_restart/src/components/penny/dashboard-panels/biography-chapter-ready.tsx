"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MemoryTimeDashboard } from "@/lib/penny-insights";
import type { DashboardPanel } from "@/types/home-dashboard";

type ChapterReadyDigest = MemoryTimeDashboard["beliefDigests"][number];

export function BiographyChapterReadyPanel({ panel }: { panel: DashboardPanel }) {
  const latestChapter = panel.data.latestChapter as ChapterReadyDigest | null;
  const chapterCount = Number(panel.data.chapterCount ?? 0);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-[#e7defa] text-[#5c4c88]">biography chapter</Badge>
        <Badge className="bg-white text-[var(--muted-ink)]">{chapterCount} digests</Badge>
      </div>
      <h3 className="mt-3 text-2xl font-semibold text-[var(--ink)]">A chapter of thinking is ready to read back.</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
        Penny can turn repeated updates into a visible chapter instead of leaving them buried in the map history.
      </p>
      {latestChapter ? (
        <div className="mt-4 rounded-[22px] border border-black/8 bg-[var(--panel)] p-4">
          <p className="text-sm font-medium text-[var(--ink)]">{latestChapter.title}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{latestChapter.summary}</p>
        </div>
      ) : null}
      <div className="mt-4">
        <Link href="/app/identity">
          <Button variant="secondary" className="gap-2">
            Open identity archive
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
