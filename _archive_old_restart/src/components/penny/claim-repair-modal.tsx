"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ClaimRepairActionType, ClaimStructureKind, ThoughtNodeModel } from "@/types/thought-map";
import type { ClaimRepairSuggestion } from "@/lib/penny-insights";

export interface ClaimRepairSubmission {
  actionType: ClaimRepairActionType;
  initiatedBy: "user" | "penny_suggestion";
  sourceClaimIds: string[];
  reasoning: string;
  details: Record<string, unknown>;
  propagationTriggered: boolean;
}

export interface ClaimRepairModalProps {
  open: boolean;
  currentClaim: ThoughtNodeModel | null;
  claimOptions: ThoughtNodeModel[];
  suggestions: ClaimRepairSuggestion[];
  onClose: () => void;
  onSubmit: (submission: ClaimRepairSubmission) => void;
}

const ACTIONS: ClaimRepairActionType[] = ["merge", "split", "promote", "demote", "reclassify", "reroute_edge", "reroot"];

function defaultPeerClaim(currentClaim: ThoughtNodeModel | null, claims: ThoughtNodeModel[]) {
  return claims.find((claim) => claim.id !== currentClaim?.id) ?? null;
}

export function ClaimRepairModal({ open, currentClaim, claimOptions, suggestions, onClose, onSubmit }: ClaimRepairModalProps) {
  const defaultSuggestion = suggestions[0] ?? null;
  const [actionType, setActionType] = useState<ClaimRepairActionType>(defaultSuggestion?.actionType ?? "merge");
  const [reasoning, setReasoning] = useState(defaultSuggestion?.reason ?? "");
  const [mergeTargetId, setMergeTargetId] = useState(defaultPeerClaim(currentClaim, claimOptions)?.id ?? "");
  const [mergeText, setMergeText] = useState(currentClaim?.content ?? "");
  const [splitFirst, setSplitFirst] = useState(currentClaim?.content ?? "");
  const [splitSecond, setSplitSecond] = useState("");
  const [promoteText, setPromoteText] = useState(currentClaim?.content ?? "");
  const [demoteTargetId, setDemoteTargetId] = useState(defaultPeerClaim(currentClaim, claimOptions)?.id ?? "");
  const [reclassifyKind, setReclassifyKind] = useState<ClaimStructureKind>("assertion");
  const [rerouteTargetId, setRerouteTargetId] = useState(defaultPeerClaim(currentClaim, claimOptions)?.id ?? "");
  const [rerootText, setRerootText] = useState(currentClaim?.content ?? "");
  const [initiatedBy, setInitiatedBy] = useState<"user" | "penny_suggestion">("user");

  const availablePeers = useMemo(
    () => claimOptions.filter((claim) => claim.id !== currentClaim?.id),
    [claimOptions, currentClaim?.id],
  );

  if (!open) {
    return null;
  }

  function submit() {
    if (!currentClaim) {
      return;
    }

    const sourceClaimIds = actionType === "merge" ? [currentClaim.id, mergeTargetId].filter(Boolean) : [currentClaim.id];
    const details: Record<string, unknown> = {};

    if (actionType === "merge") {
      details.mergedText = mergeText.trim();
      details.peerClaimId = mergeTargetId || null;
    } else if (actionType === "split") {
      details.splitTexts = [splitFirst.trim(), splitSecond.trim()];
    } else if (actionType === "promote") {
      details.promotedText = promoteText.trim();
    } else if (actionType === "demote") {
      details.targetClaimId = demoteTargetId;
      details.demotedText = promoteText.trim();
    } else if (actionType === "reclassify") {
      details.newStructureKind = reclassifyKind;
    } else if (actionType === "reroute_edge") {
      details.childClaimId = currentClaim.id;
      details.toClaimId = rerouteTargetId;
    } else if (actionType === "reroot") {
      details.rerootText = rerootText.trim();
    }

    onSubmit({
      actionType,
      initiatedBy,
      sourceClaimIds,
      reasoning: reasoning.trim(),
      details,
      propagationTriggered: true,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-black/8 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Claim repair</p>
            <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Perform structural surgery on the graph</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              Merge, split, promote, demote, reclassify, or reroute the selected claim. The repair is stored as an immutable event.
            </p>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {suggestions.slice(0, 4).map((suggestion) => (
            <button
              key={`${suggestion.actionType}:${suggestion.sourceClaimIds.join(",")}`}
              className="rounded-full border border-black/10 bg-[var(--panel)] px-3 py-1 text-xs uppercase tracking-[0.18em] text-[var(--ink)]"
              onClick={() => {
                setActionType(suggestion.actionType);
                setReasoning(suggestion.reason);
                if (suggestion.sourceClaimIds.length >= 2) {
                  setMergeTargetId(suggestion.sourceClaimIds[1] ?? "");
                }
              }}
              type="button"
            >
              {suggestion.actionType} · {Math.round(suggestion.confidence * 100)}%
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Repair action</label>
            <select
              className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
              value={actionType}
              onChange={(event) => setActionType(event.target.value as ClaimRepairActionType)}
            >
              {ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Initiated by</label>
            <select
              className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
              value={initiatedBy}
              onChange={(event) => setInitiatedBy(event.target.value as "user" | "penny_suggestion")}
            >
              <option value="user">user</option>
              <option value="penny_suggestion">penny_suggestion</option>
            </select>
          </div>
        </div>

        <div className="mt-4 rounded-[20px] bg-[var(--panel)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Selected claim</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{currentClaim?.content ?? "No claim selected."}</p>
        </div>

        {actionType === "merge" ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Merge partner</label>
              <select
                className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
                value={mergeTargetId}
                onChange={(event) => setMergeTargetId(event.target.value)}
              >
                <option value="">Choose a claim</option>
                {availablePeers.map((claim) => (
                  <option key={claim.id} value={claim.id}>
                    {claim.content}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Merged text</label>
              <textarea
                className="mt-2 min-h-[120px] w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none"
                value={mergeText}
                onChange={(event) => setMergeText(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        {actionType === "split" ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">First sub-claim</label>
              <textarea
                className="mt-2 min-h-[120px] w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none"
                value={splitFirst}
                onChange={(event) => setSplitFirst(event.target.value)}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Second sub-claim</label>
              <textarea
                className="mt-2 min-h-[120px] w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none"
                value={splitSecond}
                onChange={(event) => setSplitSecond(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        {actionType === "promote" ? (
          <div className="mt-4">
            <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Promoted claim text</label>
            <textarea
              className="mt-2 min-h-[120px] w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none"
              value={promoteText}
              onChange={(event) => setPromoteText(event.target.value)}
            />
          </div>
        ) : null}

        {actionType === "demote" ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Become assumption of</label>
              <select
                className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
                value={demoteTargetId}
                onChange={(event) => setDemoteTargetId(event.target.value)}
              >
                <option value="">Choose a claim</option>
                {availablePeers.map((claim) => (
                  <option key={claim.id} value={claim.id}>
                    {claim.content}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Demoted text</label>
              <textarea
                className="mt-2 min-h-[120px] w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none"
                value={promoteText}
                onChange={(event) => setPromoteText(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        {actionType === "reclassify" ? (
          <div className="mt-4">
            <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">New structure kind</label>
            <select
              className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
              value={reclassifyKind}
              onChange={(event) => setReclassifyKind(event.target.value as ClaimStructureKind)}
            >
              {["assertion", "conditional", "compound", "temporal", "merged_candidate", "split_candidate"].map((kind) => (
                <option key={kind} value={kind}>
                  {kind.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {actionType === "reroute_edge" ? (
          <div className="mt-4">
            <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Reroute to claim</label>
            <select
              className="mt-2 w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
              value={rerouteTargetId}
              onChange={(event) => setRerouteTargetId(event.target.value)}
            >
              <option value="">Choose a claim</option>
              {availablePeers.map((claim) => (
                <option key={claim.id} value={claim.id}>
                  {claim.content}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {actionType === "reroot" ? (
          <div className="mt-4">
            <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Reroot text</label>
            <textarea
              className="mt-2 min-h-[120px] w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none"
              value={rerootText}
              onChange={(event) => setRerootText(event.target.value)}
            />
          </div>
        ) : null}

        <div className="mt-4">
          <label className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Reasoning</label>
          <textarea
            className="mt-2 min-h-[120px] w-full rounded-[16px] border border-black/10 bg-white px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none"
            value={reasoning}
            onChange={(event) => setReasoning(event.target.value)}
            placeholder="Why does this surgery improve the graph?"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Badge className="bg-[#fff6ed] text-[#8b4d1f]">
            {actionType.replaceAll("_", " ")} · {Math.max(0, reasoning.trim().length)} chars reasoning
          </Badge>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!currentClaim || reasoning.trim().length < 20} onClick={submit}>
              Store repair
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
