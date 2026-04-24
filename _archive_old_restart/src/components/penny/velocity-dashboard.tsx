"use client";

import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { IntellectualVelocityReport, VelocityMetric, VelocityTrend } from "@/types/intellectual-velocity";

const PERIOD_OPTIONS = [7, 30, 90] as const;

type VelocityDashboardProps = {
  userId: string;
  initialReport: IntellectualVelocityReport;
};

function trendLabel(trend: VelocityTrend) {
  return trend.replaceAll("_", " ");
}

function trendClass(trend: VelocityTrend) {
  switch (trend) {
    case "accelerating":
      return "bg-[#d9ead8] text-[#355b32]";
    case "improving":
      return "bg-[#e7defa] text-[#5c4c88]";
    case "declining":
      return "bg-[#fff0eb] text-[#a04b35]";
    case "stable":
    default:
      return "bg-white text-[var(--muted-ink)]";
  }
}

function formatValue(value: number, unit: string) {
  const rendered = Number.isInteger(value) ? `${value}` : value.toFixed(1);

  if (!unit) {
    return rendered;
  }

  return unit.startsWith("/") || unit.startsWith("%") ? `${rendered}${unit}` : `${rendered} ${unit}`;
}

function formatDelta(value: number, unit: string) {
  const rendered = Number.isInteger(value) ? `${value}` : value.toFixed(1);
  const signed = value > 0 ? `+${rendered}` : rendered;

  if (!unit) {
    return signed;
  }

  return unit.startsWith("/") || unit.startsWith("%") ? `${signed}${unit}` : `${signed} ${unit}`;
}

function metricTone(metric: VelocityMetric) {
  if (metric.trend === "accelerating" || metric.trend === "improving") {
    return "bg-[#d9ead8] text-[#355b32]";
  }

  if (metric.trend === "declining") {
    return "bg-[#fff0eb] text-[#a04b35]";
  }

  return "bg-white text-[var(--muted-ink)]";
}

function normalizeMetricScore(metric: VelocityMetric) {
  if (metric.percentile != null) {
    return metric.percentile;
  }

  return metric.trend === "declining" ? 25 : metric.trend === "stable" ? 50 : 75;
}

function MetricCard({ metric, highlighted = false }: { metric: VelocityMetric; highlighted?: boolean }) {
  const delta = metric.direction === "higher_is_better" ? metric.currentValue - metric.previousValue : metric.previousValue - metric.currentValue;

  return (
    <div className={`rounded-[24px] border border-black/8 bg-white/80 p-5 ${highlighted ? "ring-1 ring-[#d9ead8]" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--ink)]">{metric.metricName}</p>
        <Badge className={metricTone(metric)}>{trendLabel(metric.trend)}</Badge>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Current</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{formatValue(metric.currentValue, metric.unit)}</p>
        </div>
        <p className="text-right text-sm font-medium text-[var(--muted-ink)]">{formatDelta(delta, metric.unit)} vs prior</p>
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">{metric.interpretation}</p>
      <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
        Previous {formatValue(metric.previousValue, metric.unit)} · Score {normalizeMetricScore(metric)}
      </p>
    </div>
  );
}

function SignalCard({ description, evidence, magnitude }: { description: string; evidence: string; magnitude: number }) {
  return (
    <div className="rounded-[24px] border border-black/8 bg-white/80 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-[#e7defa] text-[#5c4c88]">signal</Badge>
        <Badge className="bg-white text-[var(--muted-ink)]">magnitude {Math.round(magnitude)}</Badge>
      </div>
      <p className="mt-3 text-sm font-medium text-[var(--ink)]">{description}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{evidence}</p>
    </div>
  );
}

export function VelocityDashboard({ userId, initialReport }: VelocityDashboardProps) {
  const [report, setReport] = useState(initialReport);
  const [periodDays, setPeriodDays] = useState(initialReport.periodDays);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(initialReport);
    setPeriodDays(initialReport.periodDays);
  }, [initialReport]);

  async function loadReport(nextPeriodDays: number) {
    setPeriodDays(nextPeriodDays);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/users/${userId}/velocity?periodDays=${nextPeriodDays}`);

      if (!response.ok) {
        throw new Error(`Velocity report request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as { report: IntellectualVelocityReport };
      setReport(payload.report);
    } catch {
      setError("Penny could not refresh the velocity report right now.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border border-black/8 bg-[var(--panel)] p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Intellectual velocity</p>
            <h1 className="mt-2 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">How quickly your thinking is compounding.</h1>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
              This surface is not gamification. It tracks whether you are updating faster, critiquing more deeply, shrinking blind spots, and tightening calibration over time.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((option) => (
              <Button
                key={option}
                variant={option === periodDays ? "primary" : "secondary"}
                className="min-w-20"
                disabled={isLoading}
                onClick={() => {
                  void loadReport(option);
                }}
              >
                {option}d
              </Button>
            ))}
            <Button variant="secondary" className="gap-2" disabled={isLoading} onClick={() => void loadReport(periodDays)}>
              <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="rounded-[28px] border border-black/8 bg-white p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-[#d9ead8] text-[#355b32]">score {report.overallVelocityScore}</Badge>
              <Badge className={trendClass(report.overallTrend)}>{trendLabel(report.overallTrend)}</Badge>
              <Badge className="bg-white text-[var(--muted-ink)]">{report.periodDays} day window</Badge>
            </div>
            <p className="mt-4 text-lg leading-8 text-[var(--ink)]">{report.velocityNarrative}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-[#e7defa] text-[#5c4c88]">{report.compoundingSignals.length} compounding signals</Badge>
              <Badge className="bg-white text-[var(--muted-ink)]">Updated {report.reportDate.toLocaleDateString()}</Badge>
            </div>
          </div>

          <div className="rounded-[28px] border border-black/8 bg-white p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Why this matters</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              Starting over elsewhere would mean losing the running record of calibration, critique depth, and structural cleanup that makes the user visibly better at thinking.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-white text-[var(--muted-ink)]">calibration</Badge>
              <Badge className="bg-white text-[var(--muted-ink)]">critique</Badge>
              <Badge className="bg-white text-[var(--muted-ink)]">coverage</Badge>
              <Badge className="bg-white text-[var(--muted-ink)]">structural health</Badge>
            </div>
            <div className="mt-5">
              <Link href="/app" className="inline-flex">
                <Button variant="ghost" className="gap-2 pl-0">
                  Back to Brain
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Card>

      {error ? (
        <div className="rounded-[24px] border border-[#e7d3cb] bg-[#fff6f2] p-4 text-sm leading-6 text-[#8d4d39]">{error}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {report.compoundingSignals.length ? (
          report.compoundingSignals.map((signal) => (
            <SignalCard key={`${signal.signalType}-${signal.detectedAt.toISOString()}`} description={signal.description} evidence={signal.evidence} magnitude={signal.magnitude} />
          ))
        ) : (
          <div className="rounded-[24px] border border-black/8 bg-white/80 p-5 text-sm leading-6 text-[var(--muted-ink)] xl:col-span-4">
            No compounding signals are strong enough to promote yet. That usually means the window is too small or the thinking is still in a steady phase.
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <MetricCard metric={report.metrics.calibrationImprovement} highlighted />
        <MetricCard metric={report.metrics.blindSpotCoverage} highlighted />
        <MetricCard metric={report.metrics.engagementDepth} />
        <MetricCard metric={report.metrics.updateRate} />
        <MetricCard metric={report.metrics.critiqueSophistication} />
        <MetricCard metric={report.metrics.evidenceQualityAvg} />
        <MetricCard metric={report.metrics.beliefRevisionLatency} />
        <MetricCard metric={report.metrics.structuralHealthTrend} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[28px] border border-black/8 bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Most improved</p>
          <MetricCard metric={report.mostImprovedMetric} highlighted />
        </div>

        <div className="rounded-[28px] border border-black/8 bg-[var(--panel)] p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Needs attention</p>
          {report.needsAttentionMetric ? <MetricCard metric={report.needsAttentionMetric} highlighted /> : <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">Nothing urgent is misbehaving yet.</p>}
        </div>
      </div>
    </div>
  );
}
