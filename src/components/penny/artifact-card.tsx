"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ClipboardCopy, Download, FileText, Layers3, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DependencyHealthBar } from "@/components/penny/dependency-health";
import type { ArtifactOutcome, ArtifactRecord } from "@/types/thought-map";

type ArtifactCardArtifact = ArtifactRecord;

interface ArtifactCardProps {
  artifact: ArtifactCardArtifact;
  onExport?: () => void;
}

export function ArtifactCard({ artifact, onExport }: ArtifactCardProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    },
    [],
  );

  const latestOutcome = artifact.latestOutcome ?? null;
  const loadBearingClaimCount = artifact.loadBearingClaims.length;
  const sectionCount = artifact.sections.length;

  async function handleCopyToClipboard() {
    const text = generatePlainText(artifact);

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setCopied(true);
    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current);
    }
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-6 border-b border-black/8 bg-[var(--panel)] px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-white text-[var(--muted-ink)]">{formatArtifactType(artifact.artifactTypeName)}</Badge>
            <Badge className="bg-white text-[var(--muted-ink)]">Version {artifact.version}</Badge>
            <Badge className="bg-white text-[var(--muted-ink)]">Generated {formatDate(artifact.generatedAt)}</Badge>
            {artifact.audience ? <Badge className="bg-white text-[var(--muted-ink)]">{artifact.audience}</Badge> : null}
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-[var(--ink)] sm:text-3xl">{artifact.title}</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
            {artifact.narrativeGlue?.trim()
              ? artifact.narrativeGlue
              : "Generated from the active map with load-bearing claims, section structure, and outcome history preserved."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--muted-ink)]">
            <Badge className="bg-white text-[var(--ink)]">{sectionCount} section{sectionCount === 1 ? "" : "s"}</Badge>
            <Badge className="bg-white text-[var(--ink)]">
              {loadBearingClaimCount} load-bearing claim{loadBearingClaimCount === 1 ? "" : "s"}
            </Badge>
            {latestOutcome ? (
              <Badge className="bg-white text-[var(--ink)]">
                Latest outcome {formatOutcomeType(latestOutcome.outcomeType)}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="gap-2" onClick={handleCopyToClipboard}>
            <ClipboardCopy className="size-4" />
            {copied ? "Copied" : "Copy"}
          </Button>
          {onExport ? (
            <Button variant="secondary" className="gap-2" onClick={onExport}>
              <Download className="size-4" />
              Export
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 border-b border-black/8 px-6 py-5 md:grid-cols-2 xl:grid-cols-4">
        <MetadataStat label="Artifact type" value={formatArtifactType(artifact.artifactTypeName)} icon={FileText} />
        <MetadataStat label="Generated" value={formatDateTime(artifact.generatedAt)} icon={Sparkles} />
        <MetadataStat label="Audience" value={artifact.audience ?? "Unspecified"} icon={Layers3} />
        <MetadataStat
          label="Source map"
          value={artifact.sourceMapId}
          helper={artifact.loadBearingClaims.length > 0 ? `${artifact.loadBearingClaims.length} load-bearing claims` : "No load-bearing claims"}
          icon={FileText}
        />
      </div>

      {artifact.dependencyHealth ? (
        <div className="border-b border-black/8 px-6 py-5">
          <DependencyHealthBar health={artifact.dependencyHealth} label="Dependency health" />
        </div>
      ) : null}

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.85fr)]">
        <div className="space-y-4">
          <SectionList title="Sections" count={artifact.sections.length}>
            {artifact.sections.map((section) => (
              <article key={section.id} className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{section.title}</p>
                  </div>
                  <Badge className="bg-white text-[var(--ink)]">
                    {section.sourceClaimIds.length} source claim{section.sourceClaimIds.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--ink)]">
                  {section.body.trim().length > 0 ? (
                    section.body
                      .split("\n")
                      .map((line, index) => <p key={`${section.id}-${index}`}>{line || <br />}</p>)
                  ) : (
                    <p className="text-[var(--muted-ink)]">No section body was generated.</p>
                  )}
                </div>
              </article>
            ))}
          </SectionList>
        </div>

        <div className="space-y-4">
          <Panel title="Load-bearing claims" helper={`${artifact.loadBearingClaims.length} surfaced`}>
            <div className="space-y-3">
              {artifact.loadBearingClaims.length > 0 ? (
                artifact.loadBearingClaims.map((claim) => (
                  <div key={claim.claimId} className="rounded-[20px] bg-white px-4 py-3">
                    <p className="text-sm leading-6 text-[var(--ink)]">{claim.claimText}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                      Confidence {Math.round(claim.confidenceAtArtifactTime * 100)}%
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No load-bearing claims surfaced for this artifact.</p>
              )}
            </div>
          </Panel>

          {latestOutcome ? (
            <Panel title="Latest outcome" helper={formatDate(latestOutcome.outcomeDate)}>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-white text-[var(--ink)]">{formatOutcomeType(latestOutcome.outcomeType)}</Badge>
                  <Badge className="bg-white text-[var(--ink)]">Quality {latestOutcome.artifactQualityRating}/5</Badge>
                  <Badge className="bg-white text-[var(--ink)]">
                    {latestOutcome.wouldUseAgain ? "Would use again" : "Would not use again"}
                  </Badge>
                </div>
                <p className="text-sm leading-7 text-[var(--ink)]">{latestOutcome.actionTaken}</p>
                <p className="text-sm leading-7 text-[var(--muted-ink)]">{latestOutcome.outcomeDescription}</p>
                {latestOutcome.lessonsLearned ? (
                  <div className="rounded-[20px] bg-[var(--panel)] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Lessons learned</p>
                    <p className="mt-2 text-sm leading-7 text-[var(--ink)]">{latestOutcome.lessonsLearned}</p>
                  </div>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function MetadataStat({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper?: string;
  icon: typeof FileText;
}) {
  return (
    <div className="rounded-[24px] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{label}</p>
          <p className="mt-2 text-sm font-semibold text-[var(--ink)]">{value}</p>
          {helper ? <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{helper}</p> : null}
        </div>
        <Icon className="size-4 text-[var(--muted-ink)]" />
      </div>
    </div>
  );
}

function SectionList({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{title}</p>
          <h4 className="mt-1 text-xl font-semibold text-[var(--ink)]">
            {count} item{count === 1 ? "" : "s"}
          </h4>
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Panel({
  title,
  helper,
  children,
}: {
  title: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{title}</p>
          {helper ? <p className="mt-1 text-sm text-[var(--muted-ink)]">{helper}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function formatArtifactType(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char: string) => char.toUpperCase());
}

function formatOutcomeType(value: ArtifactOutcome["outcomeType"]): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char: string) => char.toUpperCase());
}

function formatDate(value: Date): string {
  return value.toLocaleDateString();
}

function formatDateTime(value: Date): string {
  return value.toLocaleString();
}

function generatePlainText(artifact: ArtifactCardArtifact): string {
  const lines: string[] = [
    artifact.title,
    "=".repeat(artifact.title.length),
    "",
    `Type: ${formatArtifactType(artifact.artifactTypeName)}`,
    `Generated: ${formatDateTime(artifact.generatedAt)}`,
    `Version: ${artifact.version}`,
    `Audience: ${artifact.audience ?? "Unspecified"}`,
  ];

  if (artifact.narrativeGlue) {
    lines.push("", "Narrative glue", "-------------", artifact.narrativeGlue);
  }

  if (artifact.loadBearingClaims.length > 0) {
    lines.push("", "Load-bearing claims", "-------------------");
    artifact.loadBearingClaims.forEach((claim, index) => {
      lines.push(`${index + 1}. ${claim.claimText} (${Math.round(claim.confidenceAtArtifactTime * 100)}%)`);
    });
  }

  if (artifact.dependencyHealth) {
    lines.push(
      "",
      "Dependency health",
      "-----------------",
      `Score: ${artifact.dependencyHealth.healthScore}/100`,
      `Weakest link: ${artifact.dependencyHealth.weakestLink.claimText}`,
    );
  }

  artifact.sections.forEach((section) => {
    lines.push("", section.title, "-".repeat(section.title.length));

    if (section.sourceClaimIds.length > 0) {
      lines.push(`Source claims: ${section.sourceClaimIds.join(", ")}`);
    }

    lines.push(section.body);
  });

  if (artifact.latestOutcome) {
    lines.push(
      "",
      "Latest outcome",
      "--------------",
      `Outcome type: ${formatOutcomeType(artifact.latestOutcome.outcomeType)}`,
      `Outcome date: ${formatDateTime(artifact.latestOutcome.outcomeDate)}`,
      `Quality rating: ${artifact.latestOutcome.artifactQualityRating}/5`,
      `Would use again: ${artifact.latestOutcome.wouldUseAgain ? "Yes" : "No"}`,
      `Action taken: ${artifact.latestOutcome.actionTaken}`,
      `Outcome description: ${artifact.latestOutcome.outcomeDescription}`,
    );

    if (artifact.latestOutcome.lessonsLearned) {
      lines.push(`Lessons learned: ${artifact.latestOutcome.lessonsLearned}`);
    }
  }

  return lines.join("\n").trim();
}
