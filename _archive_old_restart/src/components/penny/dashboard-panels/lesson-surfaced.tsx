"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MemoryTimeDashboard } from "@/lib/penny-insights";
import type { DashboardPanel } from "@/types/home-dashboard";

type SurfacedLesson = MemoryTimeDashboard["predictionRetrospectives"][number] | MemoryTimeDashboard["beliefDigests"][number];

export function LessonSurfacedPanel({ panel }: { panel: DashboardPanel }) {
  const lesson = panel.data.lesson as SurfacedLesson | null;

  if (!lesson) {
    return null;
  }

  const text = typeof lesson.summary === "string"
    ? lesson.summary
    : typeof lesson.reviewPrompt === "string"
      ? lesson.reviewPrompt
      : "A useful lesson is ready.";
  const title = typeof lesson.title === "string" ? lesson.title : "Lesson surfaced";

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-[#d9ead8] text-[#355b32]">lesson surfaced</Badge>
      </div>
      <h3 className="mt-3 text-2xl font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">{text}</p>
      <div className="mt-4">
        <Link href="/app/identity">
          <Button variant="secondary" className="gap-2">
            Open memory
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
