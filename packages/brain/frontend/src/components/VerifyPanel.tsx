import { useEffect, useState } from "react";
import { decideVerifyConfidence, verifyClaim } from "../api/brainClient";
import type {
  BrainClaim,
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
  const confidenceDelta = result?.confidenceDeltaSuggestion ?? 0;
  const hasPendingConfidence = Boolean(result?.move.id && result.confidenceUpdate.decision === "pending_user_decision");
  const hasCitations = (result?.citationSources.length ?? 0) > 0 || (result?.citations.length ?? 0) > 0;

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
        <>
          <div className={`verify-verdict is-${result.verdict}`}>
            <span>{formatLabel(result.verdict)}</span>
            <p>{result.summary}</p>
          </div>

          <div className="verify-confidence-row">
            <span>
              Confidence suggestion: <strong>{confidenceDelta > 0 ? `+${confidenceDelta}` : confidenceDelta}</strong>
            </span>
            <div>
              <button
                type="button"
                className="text-command"
                disabled={disabled || isRunning || !hasPendingConfidence || Boolean(decision)}
                onClick={() => void handleConfidenceDecision("accept")}
              >
                Accept Confidence Change
              </button>
              <button
                type="button"
                className="text-command"
                disabled={disabled || isRunning || !hasPendingConfidence || Boolean(decision)}
                onClick={() => void handleConfidenceDecision("reject")}
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
      ) : (
        <p className="verify-empty">
          Verify checks the selected claim against evidence and keeps confidence changes pending until you accept them.
        </p>
      )}
    </section>
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
