"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { CheckCheck, CheckCircle2, FileUp, Globe, PencilLine, RotateCcw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ExtractedClaim, ExtractedClaimDecision, ImportSource, ImportSourceType } from "@/types/thought-map";

type ReviewState = Record<string, { userDecision: ExtractedClaimDecision | "pending"; editedText: string }>;

export function DocumentImport({
  mapId,
  onImported,
}: {
  mapId: string;
  onImported?: (importSource: ImportSource) => void;
}) {
  const [sourceType, setSourceType] = useState<ImportSourceType>("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [importSource, setImportSource] = useState<ImportSource | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState>({});
  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSubmittingReview, startReviewTransition] = useTransition();
  const hasCommittedReview = Boolean(importSource?.acceptedClaimIds.length);

  const claims = useMemo(() => importSource?.extractedClaims ?? [], [importSource]);

  const highlightedPassages = useMemo(() => buildHighlightedPassages(importSource?.sourceContent ?? "", claims), [claims, importSource?.sourceContent]);

  function resetReviewState(nextSource: ImportSource) {
    const nextState: ReviewState = {};
    for (const claim of nextSource.extractedClaims) {
      nextState[claim.id] = {
        userDecision: claim.userDecision,
        editedText: claim.editedText ?? claim.extractedText,
      };
    }

    setImportSource(nextSource);
    setReviewState(nextState);
    setSelectedClaimIds(nextSource.extractedClaims.map((claim) => claim.id));
  }

  async function submitSource() {
    setError(null);
    setStatusMessage(null);

    const response = await fetch(`/api/maps/${mapId}/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mapId,
        sourceType,
        sourceUrl: sourceType === "url" ? sourceUrl.trim() || null : null,
        sourceTitle: sourceTitle.trim() || null,
        sourceContent,
      }),
    });

    if (!response.ok) {
      throw new Error("Penny could not extract claims from that source.");
    }

    const payload = (await response.json()) as { importSource: ImportSource };
    resetReviewState(payload.importSource);
    setStatusMessage("Claims extracted. Review the list on the right.");
    onImported?.(payload.importSource);
  }

  async function submitReview() {
    if (!importSource) {
      return;
    }

    if (hasCommittedReview) {
      setStatusMessage("This import has already been added to the map.");
      return;
    }

    const reviewedClaims = claims.map((claim) => {
      const state = reviewState[claim.id];
      return {
        id: claim.id,
        userDecision: state?.userDecision ?? "pending",
        editedText: state?.userDecision === "edited" ? state.editedText.trim() || null : null,
      };
    });

    if (reviewedClaims.some((claim) => claim.userDecision === "pending")) {
      setError("Resolve every extracted claim before adding it to the map.");
      return;
    }

    setError(null);
    setStatusMessage(null);

    const response = await fetch(`/api/maps/${mapId}/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mapId,
        importSourceId: importSource.id,
        extractedClaims: reviewedClaims,
      }),
    });

    if (!response.ok) {
      throw new Error("Penny could not save the reviewed import.");
    }

    const payload = (await response.json()) as { importSource: ImportSource };
    setImportSource(payload.importSource);
    setStatusMessage(`Saved ${payload.importSource.acceptedClaimIds.length} sourced claim${payload.importSource.acceptedClaimIds.length === 1 ? "" : "s"}.`);
    onImported?.(payload.importSource);
  }

  function updateClaimDecision(claimId: string, userDecision: ExtractedClaimDecision) {
    setReviewState((current) => ({
      ...current,
      [claimId]: {
        userDecision,
        editedText: current[claimId]?.editedText ?? claims.find((claim) => claim.id === claimId)?.extractedText ?? "",
      },
    }));
  }

  function updateEditedText(claimId: string, editedText: string) {
    setReviewState((current) => ({
      ...current,
      [claimId]: {
        userDecision: "edited",
        editedText,
      },
    }));
  }

  function selectAllClaims() {
    setSelectedClaimIds(claims.map((claim) => claim.id));
  }

  function toggleClaimSelection(claimId: string) {
    setSelectedClaimIds((current) =>
      current.includes(claimId) ? current.filter((selectedId) => selectedId !== claimId) : [...current, claimId],
    );
  }

  function acceptSelectedClaims() {
    setReviewState((current) => {
      const next = { ...current };
      for (const claimId of selectedClaimIds) {
        next[claimId] = {
          userDecision: "accepted",
          editedText: next[claimId]?.editedText ?? claims.find((claim) => claim.id === claimId)?.extractedText ?? "",
        };
      }
      return next;
    });
  }

  const pendingCount = claims.filter((claim) => reviewState[claim.id]?.userDecision === "pending" || !reviewState[claim.id]).length;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-black/8 bg-[var(--panel)] px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Import source</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">Extract claims from a source</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            Paste a URL, paste raw text, or upload a document. Penny will extract candidate claims and let you review them before adding them to the map.
          </p>
        </div>
        <FileUp className="size-5 text-[var(--ink)]" />
      </div>

      {!importSource ? (
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <label className="block text-sm font-medium text-[var(--ink)]">
              Source type
              <select
                className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm"
                value={sourceType}
                onChange={(event) => {
                  const next = event.target.value as ImportSourceType;
                  setSourceType(next);
                  setError(null);
                }}
              >
                <option value="url">URL</option>
                <option value="text_paste">Text paste</option>
                <option value="document">Document</option>
              </select>
            </label>

            <label className="block text-sm font-medium text-[var(--ink)]">
              Source title
              <input
                className="mt-2 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm"
                value={sourceTitle}
                onChange={(event) => setSourceTitle(event.target.value)}
                placeholder="Optional title or filename"
              />
            </label>

            {sourceType === "url" ? (
              <label className="block text-sm font-medium text-[var(--ink)]">
                URL
                <div className="mt-2 flex items-center gap-3 rounded-[18px] border border-black/10 bg-white px-4 py-3">
                  <Globe className="size-4 text-[var(--muted-ink)]" />
                  <input
                    className="w-full bg-transparent text-sm outline-none"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://example.com/article"
                  />
                </div>
              </label>
            ) : (
              <label className="block text-sm font-medium text-[var(--ink)]">
                {sourceType === "document" ? "Upload document" : "Paste text"}
                {sourceType === "document" ? (
                  <div className="mt-2 rounded-[18px] border border-dashed border-black/10 bg-white px-4 py-6">
                    <input
                      type="file"
                      accept=".txt,.md,.mdx,.csv,.json,.doc,.docx,.pdf,text/plain"
                      className="block w-full text-sm text-[var(--muted-ink)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--ink)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (!file) {
                          return;
                        }

                        setFileName(file.name);
                        if (!sourceTitle.trim()) {
                          setSourceTitle(file.name.replace(/\.[^.]+$/, ""));
                        }

                        const reader = new FileReader();
                        reader.onload = () => {
                          setSourceContent(typeof reader.result === "string" ? reader.result : "");
                        };
                        reader.readAsText(file);
                      }}
                    />
                    <p className="mt-3 text-xs leading-5 text-[var(--muted-ink)]">
                      {fileName ? `Loaded ${fileName}.` : "Choose a text-based file. If you upload binary formats, convert them to text first."}
                    </p>
                  </div>
                ) : (
                  <textarea
                    className="mt-2 min-h-48 w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm leading-6"
                    value={sourceContent}
                    onChange={(event) => setSourceContent(event.target.value)}
                    placeholder="Paste the source text Penny should review."
                  />
                )}
              </label>
            )}

            {sourceType === "text_paste" ? (
              <div className="rounded-[18px] bg-[var(--panel)] px-4 py-3 text-xs leading-5 text-[var(--muted-ink)]">
                Penny will read the pasted text, split it into candidate claims, and show each claim alongside the source passage that triggered it.
              </div>
            ) : null}

            {error ? <p className="text-sm leading-6 text-[#8b4d1f]">{error}</p> : null}
            {statusMessage ? <p className="text-sm leading-6 text-[#355b32]">{statusMessage}</p> : null}
          </div>

          <div className="rounded-[24px] bg-[var(--panel)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Review flow</p>
            <div className="mt-3 space-y-3 text-sm leading-6 text-[var(--ink)]">
              <Row icon={<FileUp className="size-4" />} title="1. Submit source">
                Penny extracts candidate claims from the URL, paste, or uploaded text.
              </Row>
              <Row icon={<PencilLine className="size-4" />} title="2. Review claims">
                Accept as-is, edit then accept, or reject each candidate claim.
              </Row>
              <Row icon={<CheckCircle2 className="size-4" />} title="3. Add sourced claims">
                Accepted claims enter the map with provenance preserved in the review record.
              </Row>
            </div>
          </div>

          <div className="lg:col-span-2 flex flex-wrap gap-3">
            <Button
              className="gap-2"
              disabled={isPending}
              onClick={() =>
                startTransition(() => {
                  void submitSource().catch((submitError) => {
                    setError(submitError instanceof Error ? submitError.message : "Penny could not extract claims from that source.");
                  });
                })
              }
            >
              <Sparkles className="size-4" />
              Extract claims
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={selectAllClaims}>
                Select all
              </Button>
              <Button variant="secondary" onClick={acceptSelectedClaims} disabled={!selectedClaimIds.length || hasCommittedReview}>
                Accept all selected
              </Button>
              <Button
                onClick={() =>
                  startReviewTransition(() => {
                    void submitReview().catch((submitError) => {
                      setError(submitError instanceof Error ? submitError.message : "Penny could not save the reviewed import.");
                    });
                  })
                }
                disabled={isSubmittingReview || pendingCount > 0 || hasCommittedReview}
              >
                <CheckCheck className="mr-2 size-4" />
                {hasCommittedReview ? "Added to map" : "Add sourced claims"}
              </Button>
            </div>

            <div className="rounded-[24px] border border-black/8 bg-white p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Source content</p>
              <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--ink)]">
                {highlightedPassages.map((passage) => (
                  <div
                    key={`${passage.offset}:${passage.text.slice(0, 24)}`}
                    className={passage.claimIds.length > 0 ? "rounded-[18px] bg-[#fff6ed] px-4 py-3 ring-1 ring-[#e8b888]" : "px-4 py-3"}
                  >
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                      {passage.claimIds.length > 0 ? `${passage.claimIds.length} claim${passage.claimIds.length === 1 ? "" : "s"} extracted here` : "Context"}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{passage.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[24px] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Extracted claims</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                {claims.length} candidate claim{claims.length === 1 ? "" : "s"} found. Decide what to keep, edit, or reject.
              </p>
            </div>

            <div className="space-y-3">
              {claims.map((claim) => {
                const state = reviewState[claim.id] ?? { userDecision: "pending", editedText: claim.editedText ?? claim.extractedText };
                const isSelected = selectedClaimIds.includes(claim.id);

                return (
                  <div key={claim.id} className="rounded-[24px] border border-black/8 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            aria-label={`Select claim ${claim.id}`}
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleClaimSelection(claim.id)}
                            disabled={hasCommittedReview}
                            className="size-4 accent-[var(--ink)]"
                          />
                          <span className="rounded-full bg-[var(--panel)] px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                            {claim.structureKind}
                          </span>
                          {typeof claim.inferredConfidence === "number" ? (
                            <span className="rounded-full bg-[#dff0f7] px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-[#1f5d73]">
                              {Math.round(claim.inferredConfidence * 100)}%
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{claim.extractedText}</p>
                        <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{claim.sourceAttribution}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => updateClaimDecision(claim.id, "accepted")} disabled={hasCommittedReview}>
                        <CheckCircle2 className="mr-2 size-4" />
                        Accept as-is
                      </Button>
                      <Button variant="secondary" onClick={() => updateClaimDecision(claim.id, "edited")} disabled={hasCommittedReview}>
                        <PencilLine className="mr-2 size-4" />
                        Edit then accept
                      </Button>
                      <Button variant="secondary" onClick={() => updateClaimDecision(claim.id, "rejected")} disabled={hasCommittedReview}>
                        <X className="mr-2 size-4" />
                        Reject
                      </Button>
                    </div>

                    {state.userDecision === "edited" ? (
                      <label className="mt-4 block text-sm font-medium text-[var(--ink)]">
                        Edited claim text
                        <textarea
                          className="mt-2 min-h-24 w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm leading-6"
                          value={state.editedText}
                          onChange={(event) => updateEditedText(claim.id, event.target.value)}
                          disabled={hasCommittedReview}
                        />
                      </label>
                    ) : null}

                    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                      Current decision: {state.userDecision}
                    </p>
                  </div>
                );
              })}
            </div>

            {error ? <p className="text-sm leading-6 text-[#8b4d1f]">{error}</p> : null}
            {statusMessage ? <p className="text-sm leading-6 text-[#355b32]">{statusMessage}</p> : null}

            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setImportSource(null);
                  setReviewState({});
                  setSelectedClaimIds([]);
                  setStatusMessage(null);
                  setError(null);
                }}
              >
                <RotateCcw className="mr-2 size-4" />
                Start over
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Row({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-[18px] bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        {icon}
        <p className="font-medium text-[var(--ink)]">{title}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{children}</p>
    </div>
  );
}

function buildHighlightedPassages(sourceContent: string, claims: ExtractedClaim[]) {
  const passages = [...sourceContent.matchAll(/[^.!?\n]+[.!?]?/g)].map((match) => {
    const text = match[0].trim();
    const offset = match.index ?? 0;
    const claimIds = claims
      .filter((claim) => claim.offsetInSource >= offset && claim.offsetInSource < offset + match[0].length)
      .map((claim) => claim.id);

    return {
      text,
      offset,
      claimIds,
    };
  });

  if (passages.length > 0) {
    return passages;
  }

  return [
    {
      text: sourceContent,
      offset: 0,
      claimIds: claims.map((claim) => claim.id),
    },
  ];
}
