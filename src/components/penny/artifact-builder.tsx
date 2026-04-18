"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, FileText, Sparkles } from "lucide-react";
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
      throw new Error("Penny could not generate the artifact.");
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

      <div className="mt-4 rounded-[24px] bg-[var(--panel)] p-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-[var(--ink)]">Section order</p>
          <Sparkles className="size-4 text-[var(--ink)]" />
        </div>
        <div className="mt-3 space-y-2">
          {sectionOrder.map((sectionId, index) => {
            const section = selectedType?.template.sections.find((entry) => entry.id === sectionId);

            return (
              <div key={sectionId} className="flex items-center justify-between gap-3 rounded-[18px] bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--ink)]">{section?.title ?? sectionId}</p>
                  <p className="text-xs text-[var(--muted-ink)]">{section?.description ?? "Section"}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="h-9 w-9 p-0"
                    onClick={() => moveSection(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${sectionId} up`}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-9 w-9 p-0"
                    onClick={() => moveSection(index, 1)}
                    disabled={index === sectionOrder.length - 1}
                    aria-label={`Move ${sectionId} down`}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
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

      {artifact ? (
        <div className="mt-5 rounded-[24px] border border-black/8 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{artifact.artifactTypeName}</p>
          <h4 className="mt-1 text-lg font-semibold text-[var(--ink)]">{artifact.title}</h4>
          <p className="mt-2 text-sm text-[var(--muted-ink)]">
            Generated {artifact.generatedAt.toString()} for {artifact.audience ?? "unspecified audience"}.
          </p>
          <div className="mt-4 space-y-3">
            {artifact.sections.map((section) => (
              <div key={section.id} className="rounded-[18px] bg-[var(--panel)] p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{section.title}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{section.body}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
