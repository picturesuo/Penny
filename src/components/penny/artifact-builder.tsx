"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, FileText, RotateCcw, Sparkles } from "lucide-react";
import { ArtifactCard } from "@/components/penny/artifact-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ARTIFACT_TYPES, diffArtifactRecords, getArtifactType } from "@/lib/artifact-types";
import type { ArtifactRecord, ArtifactTypeId, ThoughtMapModel } from "@/types/thought-map";

export function ArtifactBuilder({
  mapId,
  initialArtifactTypeId = "founder_brief",
  onArtifactGenerated,
}: {
  mapId: string;
  initialArtifactTypeId?: ArtifactTypeId;
  onArtifactGenerated?: (artifact: ArtifactRecord) => void;
}) {
  const [artifactTypeId, setArtifactTypeId] = useState<ArtifactTypeId>(initialArtifactTypeId);
  const [audience, setAudience] = useState("");
  const [narrativeGlue, setNarrativeGlue] = useState("");
  const [sectionOrder, setSectionOrder] = useState<string[]>(
    () => getArtifactType(initialArtifactTypeId)?.template.sections.map((section) => section.id) ?? [],
  );
  const [artifact, setArtifact] = useState<ArtifactRecord | null>(null);
  const [mapArtifacts, setMapArtifacts] = useState<ArtifactRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedType = useMemo(() => getArtifactType(artifactTypeId), [artifactTypeId]);
  const defaultSectionOrder = useMemo(
    () => selectedType?.template.sections.map((section) => section.id) ?? [],
    [selectedType],
  );
  const previousArtifact = useMemo(() => {
    if (!artifact) {
      return null;
    }

    return (
      mapArtifacts
        .filter(
          (entry) =>
            entry.artifactTypeId === artifact.artifactTypeId &&
            entry.version === Math.max(1, artifact.version - 1) &&
            entry.id !== artifact.id,
        )
        .sort((a, b) => b.version - a.version || new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())[0] ??
      null
    );
  }, [artifact, mapArtifacts]);
  const artifactDiff = useMemo(
    () => (artifact && previousArtifact ? diffArtifactRecords(previousArtifact, artifact) : null),
    [artifact, previousArtifact],
  );

  async function generateArtifact() {
    setError(null);
    const response = await fetch(`/api/maps/${mapId}/artifacts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        artifactTypeId,
        audience: audience.trim() || null,
        sectionOrder,
        narrativeGlue: narrativeGlue.trim() || null,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Penny could not generate the artifact.");
    }

    const payload = (await response.json()) as { artifact: ArtifactRecord; map?: ThoughtMapModel };
    setArtifact(payload.artifact);
    setMapArtifacts(payload.map?.artifacts ?? []);
    onArtifactGenerated?.(payload.artifact);
  }

  function moveSection(index: number, direction: -1 | 1) {
    setSectionOrder((current) => {
      const next = [...current];
      const targetIndex = index + direction;

      if (targetIndex < 0 || targetIndex >= next.length) {
        return next;
      }

      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Artifact builder</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">Generate a structured artifact</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Choose the artifact type, pick the audience, and reorder the sections before generation.
          </p>
        </div>
        <FileText className="size-5 text-[var(--ink)]" />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-[var(--ink)]">
          Artifact type
          <select
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
            value={artifactTypeId}
            onChange={(event) => {
              const nextType = event.target.value as ArtifactTypeId;
              setArtifactTypeId(nextType);
              setSectionOrder(getArtifactType(nextType)?.template.sections.map((section) => section.id) ?? []);
            }}
          >
            {ARTIFACT_TYPES.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-[var(--ink)]">
          Audience
          <input
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
            placeholder={selectedType?.template.defaultAudience ?? "audience"}
          />
        </label>
      </div>

      <label className="mt-4 block text-sm font-medium text-[var(--ink)]">
        Narrative glue
        <textarea
          className="mt-2 min-h-24 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
          value={narrativeGlue}
          onChange={(event) => setNarrativeGlue(event.target.value)}
          placeholder="Optional connective text for the generated artifact."
        />
      </label>

      <div className="mt-4 rounded-[28px] border border-black/8 bg-[linear-gradient(180deg,#f5ede2_0%,#efe5d8_100%)] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">Section order</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">Compact the brief before generation instead of scrolling one giant stack.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="h-9 rounded-full px-3 text-xs"
              onClick={() => setSectionOrder(defaultSectionOrder)}
              disabled={JSON.stringify(sectionOrder) === JSON.stringify(defaultSectionOrder)}
            >
              <RotateCcw className="mr-1 size-3.5" />
              Reset
            </Button>
            <Sparkles className="size-4 text-[var(--ink)]" />
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sectionOrder.map((sectionId, index) => {
            const section = selectedType?.template.sections.find((entry) => entry.id === sectionId);

            return (
              <div
                key={sectionId}
                className="rounded-[22px] border border-black/8 bg-white/92 p-4 shadow-[0_12px_28px_rgba(34,39,46,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[var(--panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink)]">
                        {index + 1}
                      </span>
                      <p className="truncate text-sm font-medium text-[var(--ink)]">{section?.title ?? sectionId}</p>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted-ink)]">
                      {section?.description ?? "Section"}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                  <Button
                    variant="secondary"
                    className="h-8 w-8 rounded-full p-0"
                    onClick={() => moveSection(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${sectionId} up`}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-8 w-8 rounded-full p-0"
                    onClick={() => moveSection(index, 1)}
                    disabled={index === sectionOrder.length - 1}
                    aria-label={`Move ${sectionId} down`}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          className="gap-2"
          disabled={isPending}
          onClick={() =>
            startTransition(() => {
              void generateArtifact().catch((submitError) => {
                setError(submitError instanceof Error ? submitError.message : "Penny could not generate the artifact.");
              });
            })
          }
        >
          <Sparkles className="size-4" />
          Generate artifact
        </Button>
      </div>

      {error ? <p className="mt-3 text-sm leading-6 text-[#8b4d1f]">{error}</p> : null}

      {artifact ? <div className="mt-5"><ArtifactCard artifact={artifact} /></div> : null}

      {artifactDiff ? (
        <div className="mt-4 rounded-[24px] border border-black/8 bg-[var(--panel)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Version diff</p>
          <h4 className="mt-1 text-lg font-semibold text-[var(--ink)]">
            Compared with version {artifactDiff.fromVersion}
          </h4>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            {artifactDiff.changedSectionCount} of {artifactDiff.sectionDiffs.length} sections changed.
          </p>
          <div className="mt-4 space-y-3">
            {artifactDiff.sectionDiffs.map((section) => (
              <div key={section.id} className="rounded-[18px] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{section.title}</p>
                <p className="mt-1 text-sm font-medium text-[var(--ink)]">
                  {section.changed ? "Changed" : "Unchanged"}
                </p>
                {section.changed ? (
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <div className="rounded-[16px] bg-[var(--panel)] p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted-ink)]">Before</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">{section.before || "No prior text."}</p>
                    </div>
                    <div className="rounded-[16px] bg-[var(--panel)] p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted-ink)]">After</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">{section.after || "No current text."}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                    This section matches the previous version.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
