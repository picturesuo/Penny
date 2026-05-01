import React, { useEffect, useState } from "react";
import { decideVerifyConfidence, verifyClaim } from "../api/brainClient";
import type {
  BrainClaim,
  BrainSearchTraceResult,
  BrainVerifyConfidenceDecisionResponse,
  BrainVerifyEvidenceCard,
  BrainVerifyResult,
} from "../types/brain";
import { formatLabel } from "../lib/format";
import { truncateWords } from "../lib/text";

interface VerifyPanelProps {
  sessionId: string | null;
  claim: BrainClaim | null;
  disabled?: boolean;
  title?: string;
  compact?: boolean;
  onVerifyChanged?: () => Promise<void>;
}

export function VerifyPanel({
  sessionId,
  claim,
  disabled = false,
  title = "Verify",
  compact = false,
  onVerifyChanged,
}: VerifyPanelProps) {
  const [result, setResult] = useState<BrainVerifyResult | null>(null);
  const [decision, setDecision] = useState<BrainVerifyConfidenceDecisionResponse["data"] | null>(null);
  const [status, setStatus] = useState("Ready");
  const [isRunning, setIsRunning] = useState(false);
  const canVerify = Boolean(sessionId && claim) && !disabled && !isRunning;
  const hasPendingConfidence = Boolean(result?.move.id && result.confidenceUpdate.decision === "pending_user_decision");

  useEffect(() => {
    setResult(null);
    setDecision(null);
    setStatus("Ready");
  }, [claim?.id, sessionId]);

  async function handleVerify() {
    if (!sessionId || !claim || !canVerify) {
      return;
    }

    setIsRunning(true);
    setStatus("Checking evidence");
    setDecision(null);

    try {
      const payload = await verifyClaim({
        sessionId,
        claimId: claim.id,
        currentClaimText: claim.text,
      });
      setResult(payload.data);
      setStatus("Evidence ready");
      await onVerifyChanged?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  }

  async function handleConfidenceDecision(nextDecision: "accept" | "reject") {
    if (!result || !hasPendingConfidence || isRunning) {
      return;
    }

    setIsRunning(true);
    setStatus(nextDecision === "accept" ? "Accepting confidence change" : "Ignoring confidence change");

    try {
      const payload = await decideVerifyConfidence({
        verifyMoveId: result.move.id,
        decision: nextDecision,
        reason:
          nextDecision === "accept"
            ? "Accepted from the frontend Verify panel."
            : "Ignored from the frontend Verify panel.",
      });
      setDecision(payload.data);
      setStatus(nextDecision === "accept" ? "Confidence changed" : "Confidence ignored");
      await onVerifyChanged?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className={`verify-panel${compact ? " is-compact" : ""}`} aria-label={title}>
      <div className="verify-panel-head">
        <div>
          <span>{title}</span>
          <strong>{claim ? truncateWords(claim.text, compact ? 12 : 20) : "Select a claim to verify"}</strong>
        </div>
        <button type="button" className="text-command verify-run-button" disabled={!canVerify} onClick={handleVerify}>
          {isRunning ? "Verifying" : "Verify"}
        </button>
      </div>

      <div className="verify-panel-meta">
        {claim ? <span>{formatLabel(claim.kind)}</span> : null}
        {typeof claim?.confidence === "number" ? <span>{claim.confidence}% confidence</span> : null}
        <span>{status}</span>
      </div>

      {result ? (
        <VerifyResultDetails
          result={result}
          decision={decision}
          disabled={disabled}
          isRunning={isRunning}
          onConfidenceDecision={(nextDecision) => {
            void handleConfidenceDecision(nextDecision);
          }}
        />
      ) : (
        <p className="verify-empty">
          Verify checks the selected claim against evidence and keeps confidence changes pending until you accept them.
        </p>
      )}
    </section>
  );
}

export function VerifyResultDetails({
  result,
  decision,
  disabled,
  isRunning,
  onConfidenceDecision,
}: {
  result: BrainVerifyResult;
  decision: BrainVerifyConfidenceDecisionResponse["data"] | null;
  disabled: boolean;
  isRunning: boolean;
  onConfidenceDecision: (decision: "accept" | "reject") => void;
}) {
  const confidenceDelta = result.confidenceDeltaSuggestion;
  const hasPendingConfidence = Boolean(result.move.id && result.confidenceUpdate.decision === "pending_user_decision");
  const hasCitations = result.citationSources.length > 0 || result.citations.length > 0;
  const sourceItems = verifySourceItems(result);

  return (
    <>
      <div className={`verify-verdict is-${result.verdict}`}>
        <span>{formatLabel(result.verdict)}</span>
        <p>{result.summary}</p>
      </div>

      <VerifySourceBar result={result} />

      {sourceItems.length > 0 ? <VerifySourceList items={sourceItems} /> : null}

      <div className="verify-confidence-row">
        <span>
          Confidence suggestion: <strong>{confidenceDelta > 0 ? `+${confidenceDelta}` : confidenceDelta}</strong>
        </span>
        <div>
          <button
            type="button"
            className="text-command"
            disabled={disabled || isRunning || !hasPendingConfidence || Boolean(decision)}
            onClick={() => onConfidenceDecision("accept")}
          >
            Accept Confidence Change
          </button>
          <button
            type="button"
            className="text-command"
            disabled={disabled || isRunning || !hasPendingConfidence || Boolean(decision)}
            onClick={() => onConfidenceDecision("reject")}
          >
            Ignore
          </button>
          <button type="button" className="text-command" disabled title="Verify stores citation evidence when available.">
            {hasCitations ? "Evidence Saved" : "Save Evidence"}
          </button>
        </div>
      </div>

      {decision ? (
        <p className="verify-decision-note">
          {decision.confidenceUpdate.accepted
            ? `Confidence moved from ${decision.confidenceUpdate.previousConfidence}% to ${decision.confidenceUpdate.currentConfidence}%.`
            : "Confidence suggestion ignored."}
        </p>
      ) : null}

      <div className="verify-evidence-list" aria-label="Evidence cards">
        {result.evidenceCards.map((card, index) => (
          <EvidenceCard key={`${card.title}-${index}`} card={card} />
        ))}
      </div>

      {result.citations.length > 0 ? (
        <div className="verify-citations" aria-label="Citations">
          <strong>Citations</strong>
          {result.citations.map((citation, index) => (
            <p key={`${citation.title}-${index}`}>
              {citation.sourceUrl ? (
                <a href={citation.sourceUrl} target="_blank" rel="noreferrer">
                  {citation.title}
                </a>
              ) : (
                <span>{citation.title}</span>
              )}
              {citation.citation ? <small>{citation.citation}</small> : null}
            </p>
          ))}
        </div>
      ) : null}

      {result.unsupportedParts.length > 0 ? (
        <div className="verify-unsupported" aria-label="Unsupported parts">
          <strong>Still unsupported</strong>
          {result.unsupportedParts.slice(0, 3).map((part) => (
            <p key={part.part}>
              <span>{part.part}</span>
              <small>{part.neededEvidence ?? part.reason}</small>
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}

function VerifySourceBar({ result }: { result: BrainVerifyResult }) {
  const trace = result.searchTrace ?? null;
  const decision = trace?.decision ?? null;
  const usedWeb = Boolean(decision?.useWebSearch && trace?.providerToolAttached);
  const label = usedWeb ? "Used web because" : "Used your Brain";
  const detail = usedWeb
    ? decision?.reason
    : trace && decision?.useWebSearch && !trace.providerToolAttached
      ? "Web was requested for this Verify run, but no provider web tool was attached."
      : decision?.reason ?? "Verify used Penny's saved graph context and any persisted citation evidence.";
  const meta = trace
    ? [
        trace.providerName ? `${formatLabel(trace.providerName)} provider` : null,
        trace.resultCount > 0 ? `${trace.resultCount} search sources` : null,
        trace.savedSourceIds?.length ? `${trace.savedSourceIds.length} saved sources` : null,
      ].filter((item): item is string => Boolean(item))
    : [];

  return (
    <div className={`verify-source-bar${usedWeb ? " used-web" : ""}`} aria-label="Verify source behavior">
      <span>{label}</span>
      <p>{detail}</p>
      {meta.length > 0 ? <small>{meta.join(" / ")}</small> : null}
    </div>
  );
}

function VerifySourceList({ items }: { items: VerifySourceItem[] }) {
  return (
    <div className="verify-source-list" aria-label="Sources used">
      <strong>Sources used</strong>
      {items.slice(0, 5).map((item, index) => (
        <p key={`${item.title}-${item.url ?? index}`}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer">
              {item.title}
            </a>
          ) : (
            <span>{item.title}</span>
          )}
          {item.detail ? <small>{item.detail}</small> : null}
        </p>
      ))}
    </div>
  );
}

function EvidenceCard({ card }: { card: BrainVerifyEvidenceCard }) {
  return (
    <article className={`verify-evidence-card is-${card.stance}`}>
      <div>
        <span>{formatLabel(card.stance)}</span>
        <strong>{card.title}</strong>
      </div>
      <p>{card.summary}</p>
      {card.sourceUrl ? (
        <a href={card.sourceUrl} target="_blank" rel="noreferrer">
          {card.sourceName ?? "Source"}
        </a>
      ) : card.sourceName ? (
        <small>{card.sourceName}</small>
      ) : null}
      {card.citation ? <small>{card.citation}</small> : null}
    </article>
  );
}

interface VerifySourceItem {
  title: string;
  url?: string | null;
  detail?: string | null;
}

function verifySourceItems(result: BrainVerifyResult): VerifySourceItem[] {
  const seen = new Set<string>();
  const items: VerifySourceItem[] = [];

  for (const traceResult of result.searchTrace?.results ?? []) {
    appendVerifySourceItem(items, seen, sourceItemFromTrace(traceResult));
  }

  for (const citation of result.citations) {
    appendVerifySourceItem(items, seen, {
      title: citation.title || citation.sourceName || "Citation",
      url: citation.sourceUrl ?? null,
      detail: citation.citation ?? citation.sourceName ?? null,
    });
  }

  return items;
}

function sourceItemFromTrace(result: BrainSearchTraceResult): VerifySourceItem {
  const fallbackTitle = result.url ?? result.sourceType ?? "Search source";

  return {
    title: result.title ?? fallbackTitle,
    url: result.url,
    detail: result.snippet ?? result.sourceType,
  };
}

function appendVerifySourceItem(items: VerifySourceItem[], seen: Set<string>, item: VerifySourceItem): void {
  const key = `${item.url ?? ""}|${item.title}|${item.detail ?? ""}`;

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  items.push(item);
}
