"use client";

import type { Claim, DialecticRound, Move } from "@/types/mvp-core";

interface ClaimHistoryProps {
  claim: Claim;
  rounds: DialecticRound[];
  moves: Move[];
}

export function ClaimHistory({ claim, rounds, moves }: ClaimHistoryProps) {
  const confidenceHistory = [...(claim.confidenceHistory ?? [])].sort(
    (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
  );
  const claimRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber || a.createdAt.getTime() - b.createdAt.getTime());
  const claimMoves = [...moves]
    .filter((move) => move.claimId === claim.id)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return (
    <div className="space-y-6 rounded-[28px] border border-black/8 bg-[linear-gradient(180deg,#fffdf8_0%,#f7f2e9_100%)] p-6 shadow-[0_24px_80px_rgba(35,31,23,0.08)]">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Claim history</p>
        <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">History of this claim</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
          Saved confidence updates, challenge rounds, and key moves for this claim live here.
        </p>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-[var(--ink)]">Confidence over time</h4>
        {confidenceHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="flex min-h-[220px] items-end gap-3 rounded-[22px] border border-black/8 bg-white/75 p-4">
              {confidenceHistory.map((entry, index) => (
                <div key={`${entry.changedAt.toString()}-${index}`} className="flex w-16 flex-col items-center gap-2">
                  <div className="flex h-[160px] items-end">
                    <div
                      className="w-10 rounded-t-[14px] bg-[linear-gradient(180deg,#2f3744_0%,#5d6b7f_100%)] shadow-[0_10px_20px_rgba(47,55,68,0.18)]"
                      style={{ height: `${Math.max(8, Math.min(160, entry.confidence * 1.6))}px` }}
                      title={`${entry.confidence}% on ${new Date(entry.changedAt).toLocaleDateString()}`}
                    />
                  </div>
                  <div className="text-xs font-medium text-[var(--ink)]">{entry.confidence}%</div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted-ink)]">
                    {new Date(entry.changedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-black/10 bg-white/70 p-4 text-sm leading-6 text-[var(--muted-ink)]">
            No confidence changes recorded yet.
          </div>
        )}

        {confidenceHistory.length > 1 ? (
          <div className="text-sm">
            {(() => {
              const first = confidenceHistory[0]?.confidence ?? claim.confidence;
              const last = confidenceHistory[confidenceHistory.length - 1]?.confidence ?? claim.confidence;
              const delta = last - first;
              return (
                <span className={delta < 0 ? "text-[#8b3d2f]" : delta > 0 ? "text-[#2f6d47]" : "text-[var(--muted-ink)]"}>
                  Net change: {delta > 0 ? "+" : ""}
                  {delta}%
                </span>
              );
            })()}
          </div>
        ) : null}
      </div>

      {claimRounds.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-[var(--ink)]">Challenge rounds</h4>
          <div className="space-y-3">
            {claimRounds.map((round) => (
              <div key={round.id} className="rounded-[22px] border border-black/8 bg-white/80 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                  <span>Round {round.roundNumber}</span>
                  <span>•</span>
                  <span>{new Date(round.createdAt).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>{formatFailureTypes(round.critiqueFailureTypes)}</span>
                </div>

                <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{round.critiqueGenerated}</p>

                <div className="mt-3 rounded-[18px] bg-[var(--panel)] p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Your response</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{round.userResponse || "No response recorded."}</p>
                  {round.responseClassification ? (
                    <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--ink)] ring-1 ring-black/8">
                      {formatClassification(round.responseClassification.type)}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 text-sm text-[var(--muted-ink)]">
                  <span>
                    {round.confidenceAtRoundStart}% → {round.confidenceAtRoundEnd}%
                  </span>
                  {round.confidenceDelta !== 0 ? (
                    <span className={round.confidenceDelta < 0 ? "ml-2 text-[#8b3d2f]" : "ml-2 text-[#2f6d47]"}>
                      ({round.confidenceDelta > 0 ? "+" : ""}
                      {round.confidenceDelta}%)
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-[var(--ink)]">What happened to this claim</h4>
        {claimMoves.length > 0 ? (
          <div className="space-y-2">
            {claimMoves.map((move) => (
              <div key={move.id} className="flex flex-wrap items-center gap-2 rounded-[18px] border border-black/8 bg-white/75 px-4 py-3 text-sm">
                <span className="text-[var(--muted-ink)]">{move.createdAt.toLocaleDateString()}</span>
                <span className="text-[var(--ink)]">{formatMoveType(move.moveType)}</span>
                {move.payload && Object.keys(move.payload).length > 0 ? (
                  <span className="text-[var(--muted-ink)]">· {summarizePayload(move.payload)}</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-black/10 bg-white/70 p-4 text-sm leading-6 text-[var(--muted-ink)]">
            No moves recorded for this claim yet.
          </div>
        )}
      </div>
    </div>
  );
}

function formatMoveType(type: string): string {
  const labels: Record<string, string> = {
    claim_created: "Claim added",
    claim_updated: "Claim updated",
    confidence_updated: "Confidence updated",
    steel_man_written: "Steel man written",
    challenge_started: "Challenge started",
    challenge_completed: "Challenge completed",
    response_submitted: "Response submitted",
  };

  return labels[type] ?? type.replaceAll("_", " ");
}

function formatFailureTypes(failureTypes: string[]): string {
  if (!failureTypes.length) {
    return "challenge";
  }

  return failureTypes.map((value) => value.replaceAll("-", " ")).join(" · ");
}

function formatClassification(type: string): string {
  return type.replaceAll("_", " ");
}

function summarizePayload(payload: Record<string, unknown>): string {
  const entries = Object.entries(payload).filter(([, value]) => typeof value === "string" || typeof value === "number");
  const [firstKey, firstValue] = entries[0] ?? [];
  if (!firstKey || firstValue == null) {
    return "details recorded";
  }

  return `${firstKey}: ${String(firstValue)}`;
}
