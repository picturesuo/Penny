"use client";

import { useMemo, useState, useTransition } from "react";
import { Info, PlusCircle, ShieldAlert, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { scoreEvidenceQuality, type EvidenceQualityInput } from "@/lib/evidence-quality";
import type { Evidence, ThoughtMapModel } from "@/types/thought-map";

const EVIDENCE_OPTIONS: Array<{
  value: Evidence["evidenceType"];
  label: string;
  description: string;
}> = [
  { value: "peer_reviewed", label: "Peer-reviewed", description: "Published research that has gone through peer review." },
  { value: "expert_opinion", label: "Expert opinion", description: "A credible specialist’s view, not yet directly tested." },
  { value: "case_study", label: "Case study", description: "A narrow but concrete example or implementation." },
  { value: "survey_data", label: "Survey data", description: "Structured data from a sample of respondents." },
  { value: "first_hand_observation", label: "First-hand observation", description: "What you directly saw or measured yourself." },
  { value: "anecdote", label: "Anecdote", description: "A single example or story with limited generalizability." },
  { value: "intuition", label: "Intuition", description: "A gut-level sense without explicit supporting structure." },
  { value: "hearsay", label: "Hearsay", description: "Second-hand information with minimal verification." },
  { value: "analogy", label: "Analogy", description: "A structural comparison, not direct evidence." },
];

export function EvidenceEntry({
  mapId,
  claimId,
  claimText,
  onSaved,
  onCancel,
}: {
  mapId: string;
  claimId: string;
  claimText: string;
  onSaved?: (payload: { evidence: Evidence; map: ThoughtMapModel }) => void;
  onCancel?: () => void;
}) {
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceType, setEvidenceType] = useState<Evidence["evidenceType"]>("peer_reviewed");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [publicationDate, setPublicationDate] = useState("");
  const [authorCredentials, setAuthorCredentials] = useState("");
  const [sampleSize, setSampleSize] = useState("");
  const [replicationStatus, setReplicationStatus] = useState<NonNullable<Evidence["replicationStatus"]>>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const preview = useMemo(
    () =>
      scoreEvidenceQuality({
        evidenceText: evidenceText.trim() || claimText,
        evidenceType,
        sourceUrl: sourceUrl.trim() || null,
        sourceName: sourceName.trim() || null,
        publicationDate: publicationDate ? new Date(publicationDate) : null,
        authorCredentials: authorCredentials.trim() || null,
        sampleSize: sampleSize.trim() ? Number(sampleSize) : null,
        replicationStatus,
        asOf: new Date(),
      } satisfies EvidenceQualityInput),
    [authorCredentials, claimText, evidenceText, evidenceType, publicationDate, replicationStatus, sampleSize, sourceName, sourceUrl],
  );

  async function submitEvidence() {
    setError(null);

    const response = await fetch(`/api/maps/${mapId}/claims/${claimId}/evidence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mapId,
        claimId,
        evidenceText: evidenceText.trim(),
        evidenceType,
        sourceUrl: sourceUrl.trim() || null,
        sourceName: sourceName.trim() || null,
        publicationDate: publicationDate || null,
        authorCredentials: authorCredentials.trim() || null,
        sampleSize: sampleSize.trim() ? Number(sampleSize) : null,
        replicationStatus,
      }),
    });

    if (!response.ok) {
      throw new Error("Penny could not save that evidence.");
    }

    const payload = (await response.json()) as { evidence: Evidence; map: ThoughtMapModel };
    onSaved?.(payload);
  }

  return (
    <Card className="mt-4 border border-black/8 bg-[linear-gradient(180deg,#fffdf8_0%,#fff_100%)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Add evidence</p>
          <h4 className="mt-1 text-base font-semibold text-[var(--ink)]">Attach evidence to this claim</h4>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Penny scores the evidence live. Higher-quality evidence will weigh more heavily in propagation and synthesis.
          </p>
        </div>
        <Button variant="ghost" className="h-8 w-8 p-0" onClick={onCancel} aria-label="Close evidence entry">
          <X className="size-4" />
        </Button>
      </div>

      <div
        className="mt-4 rounded-[18px] bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--muted-ink)]"
        title="Higher-quality evidence weighs more heavily when Penny updates confidence, propagates support, and checks synthesis gates."
      >
        <Info className="mr-2 inline-block size-4 align-[-3px] text-[var(--ink)]" />
        Why does this score matter? Penny uses evidence quality to decide how strongly to trust a claim when it propagates into other claims or into an artifact.
      </div>

      <label className="mt-4 block text-sm font-medium text-[var(--ink)]">
        Evidence text
        <textarea
          className="mt-2 min-h-28 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm"
          value={evidenceText}
          onChange={(event) => setEvidenceText(event.target.value)}
          placeholder={`What supports “${claimText}”?`}
        />
      </label>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="block text-sm font-medium text-[var(--ink)]">
          Evidence type
          <select
            className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm"
            value={evidenceType}
            onChange={(event) => setEvidenceType(event.target.value as Evidence["evidenceType"])}
          >
            {EVIDENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
            {EVIDENCE_OPTIONS.find((option) => option.value === evidenceType)?.description}
          </p>
        </label>

        <label className="block text-sm font-medium text-[var(--ink)]">
          Source name
          <input
            className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm"
            value={sourceName}
            onChange={(event) => setSourceName(event.target.value)}
            placeholder="Optional publication, person, or report title"
          />
        </label>

        <label className="block text-sm font-medium text-[var(--ink)]">
          Source URL
          <input
            className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="Optional source URL"
          />
        </label>

        <label className="block text-sm font-medium text-[var(--ink)]">
          Publication date
          <input
            className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm"
            type="date"
            value={publicationDate}
            onChange={(event) => setPublicationDate(event.target.value)}
          />
        </label>

        <label className="block text-sm font-medium text-[var(--ink)]">
          Sample size
          <input
            className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm"
            type="number"
            min={1}
            step={1}
            value={sampleSize}
            onChange={(event) => setSampleSize(event.target.value)}
            placeholder="Optional sample size"
          />
        </label>

        <label className="block text-sm font-medium text-[var(--ink)]">
          Author credentials
          <input
            className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm"
            value={authorCredentials}
            onChange={(event) => setAuthorCredentials(event.target.value)}
            placeholder="Optional domain expertise or affiliation"
          />
        </label>

        <label className="block text-sm font-medium text-[var(--ink)] lg:col-span-2">
          Replication status
          <select
            className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm"
            value={replicationStatus}
            onChange={(event) => setReplicationStatus(event.target.value as NonNullable<Evidence["replicationStatus"]>)}
          >
            <option value="unknown">Unknown</option>
            <option value="replicated">Replicated</option>
            <option value="unreplicated">Unreplicated</option>
            <option value="contested">Contested</option>
          </select>
        </label>
      </div>

      <div className="mt-5 rounded-[20px] border border-black/8 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Live quality score</p>
            <p className="mt-1 text-lg font-semibold text-[var(--ink)]">{preview.qualityScore}/100</p>
          </div>
          <Sparkles className="size-5 text-[var(--ink)]" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {preview.qualityComponents.map((component) => (
            <div key={component.dimension} className="rounded-[16px] bg-[var(--panel)] px-3 py-2">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{component.dimension.replaceAll("_", " ")}</p>
              <p className="mt-1 text-sm font-medium text-[var(--ink)]">{component.score}/20</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{component.explanation}</p>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="mt-3 text-sm leading-6 text-[#8b4d1f]">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          className="gap-2"
          disabled={isPending || evidenceText.trim().length === 0}
          onClick={() =>
            startTransition(() => {
              void submitEvidence().catch((submitError) => {
                setError(submitError instanceof Error ? submitError.message : "Penny could not save that evidence.");
              });
            })
          }
        >
          <PlusCircle className="size-4" />
          Save evidence
        </Button>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-[var(--muted-ink)]">
        <ShieldAlert className="size-3.5" />
        A stronger score means this evidence will matter more when Penny propagates confidence and checks synthesis gates.
      </div>
    </Card>
  );
}
