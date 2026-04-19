"use client";

import type { PennyUncertainty } from "@/types/thought-map";
import { uncertaintyQualifier } from "@/lib/uncertainty";

function indicatorSymbol(uncertainty: PennyUncertainty) {
  switch (uncertainty.uncertaintyLevel) {
    case "high_confidence":
      return "●";
    case "moderate_confidence":
      return "◐";
    case "low_confidence":
      return "○";
    case "speculative":
      return "?";
  }
}

function levelCopy(uncertainty: PennyUncertainty) {
  switch (uncertainty.uncertaintyLevel) {
    case "high_confidence":
      return "Well-grounded in user pattern data.";
    case "moderate_confidence":
      return "Grounded, but still early enough to monitor.";
    case "low_confidence":
      return "Mostly heuristic, not yet strongly pattern-backed.";
    case "speculative":
      return "Speculative prompt, not a confident judgment.";
  }
}

function badgeCopy(uncertainty: PennyUncertainty) {
  switch (uncertainty.uncertaintyLevel) {
    case "high_confidence":
      return "";
    case "moderate_confidence":
      return "Pattern-backed";
    case "low_confidence":
      return "Heuristic";
    case "speculative":
      return "Speculative prompt";
  }
}

export function UncertaintyIndicator({
  uncertainty,
  className = "",
}: {
  uncertainty: PennyUncertainty;
  className?: string;
}) {
  const isLowConfidence = uncertainty.uncertaintyLevel === "low_confidence" || uncertainty.uncertaintyLevel === "speculative";

  return (
    <details className={`group inline-flex max-w-full flex-col ${className}`.trim()}>
      <summary className="list-none cursor-pointer outline-none">
        <span className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--ink)] transition group-open:bg-[var(--panel)]">
          <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px] leading-none">
            {indicatorSymbol(uncertainty)}
          </span>
          {badgeCopy(uncertainty) ? <span>{badgeCopy(uncertainty)}</span> : null}
        </span>
      </summary>
      <div className="mt-2 max-w-md rounded-[18px] border border-black/8 bg-[var(--panel)] p-3 text-xs leading-5 text-[var(--muted-ink)]">
        <p className="text-[var(--ink)]">
          This {uncertainty.outputType.replaceAll("_", " ")} is based on {uncertainty.groundingCount} data point
          {uncertainty.groundingCount === 1 ? "" : "s"}. Penny&apos;s confidence is {uncertainty.uncertaintyLevel.replaceAll("_", " ")}
          because {uncertainty.evidenceBasis}
        </p>
        <p className="mt-2">
          Grounding: <span className="font-medium text-[var(--ink)]">{uncertainty.groundingType.replaceAll("_", " ")}</span>
          {uncertainty.caveats.length ? ` · ${uncertainty.caveats.join(" ")}` : ""}
        </p>
        <p className="mt-2">
          Confidence score: <span className="font-medium text-[var(--ink)]">{uncertainty.confidenceScore}/100</span> ·{" "}
          <span className="font-medium text-[var(--ink)]">{uncertaintyQualifier(uncertainty)}</span>
        </p>
        <p className="mt-2">{levelCopy(uncertainty)}</p>
        {isLowConfidence ? (
          <p className="mt-2 rounded-[14px] bg-white px-3 py-2 text-[var(--ink)]">
            Does this seem off to you? Tell Penny what&apos;s wrong.
          </p>
        ) : null}
      </div>
    </details>
  );
}
