import { randomUUID } from "node:crypto";
import type { ClaimStructureKind, ReferenceClass } from "@/types/thought-map";

export interface ReferenceClassSuggestion {
  referenceClassType: string;
  promptShown: string;
  benchmarkLow: number | null;
  benchmarkHigh: number | null;
  benchmarkSource: string | null;
}

function normalize(text: string) {
  return text.toLowerCase();
}

function buildSuggestion(params: ReferenceClassSuggestion): ReferenceClassSuggestion {
  return params;
}

export function suggestReferenceClass(params: {
  claimText: string;
  claimType: ClaimStructureKind;
  structureKind: ClaimStructureKind;
}): ReferenceClassSuggestion {
  const text = normalize(`${params.claimText} ${params.claimType} ${params.structureKind}`);

  if (/(market size|tam|sam|som|\bmarket\b|\brevenue\b|\bpricing\b|\badoption\b|\bgrowth\b|\bcustomer\b|\bbuyer\b)/i.test(text)) {
    return buildSuggestion({
      referenceClassType: "market_size",
      promptShown:
        "Across founders who made similar market size estimates, what fraction were within 2x of the actual figure at 3 years out? (Industry research suggests ~20-30%.)",
      benchmarkLow: 20,
      benchmarkHigh: 30,
      benchmarkSource: "Founder market-size calibration studies and 3-year actual-vs-estimate comparisons.",
    });
  }

  if (/(timeline|schedule|deadline|ship|launch|deliver|release|rollout|migration|project|implementation|by \d{4})/i.test(text)) {
    return buildSuggestion({
      referenceClassType: "timeline",
      promptShown:
        "What fraction of similar projects completed on the schedule originally proposed? (Reference: most software projects run 1.5-2x original timeline.)",
      benchmarkLow: 30,
      benchmarkHigh: 45,
      benchmarkSource: "Historical software delivery overrun studies and project schedule comparisons.",
    });
  }

  if (/(competitor|rival|incumbent|failure|stagnat|overtake|beat|displace|competitive landscape|competition)/i.test(text)) {
    return buildSuggestion({
      referenceClassType: "competitor_prediction",
      promptShown:
        "What fraction of predictions about a named competitor's failure or stagnation came true within 24 months? (Reference: competitive landscape predictions are notoriously unreliable.)",
      benchmarkLow: 10,
      benchmarkHigh: 20,
      benchmarkSource: "Competitive prediction track records across 24-month forecast horizons.",
    });
  }

  if (/(retention|engagement|churn|active users|dau|wau|mau|consumer app|app usage|repeat use)/i.test(text)) {
    return buildSuggestion({
      referenceClassType: "retention_engagement",
      promptShown:
        "What fraction of early retention metrics held up at 12 months for consumer apps at this stage?",
      benchmarkLow: 35,
      benchmarkHigh: 55,
      benchmarkSource: "Stage-matched consumer retention and engagement benchmark sets.",
    });
  }

  if (/(hire|hiring|team|employee|headcount|talent|exceptional|manager|leadership)/i.test(text)) {
    return buildSuggestion({
      referenceClassType: "hiring_team",
      promptShown:
        "What fraction of initial hires described as 'exceptional' at 3 months are still rated that way at 18 months?",
      benchmarkLow: 20,
      benchmarkHigh: 35,
      benchmarkSource: "Longitudinal hiring quality and team-assessment follow-up studies.",
    });
  }

  return buildSuggestion({
    referenceClassType: "custom",
    promptShown:
      "Think about the last 5 times you made a similar claim. How often were you right? That's your personal base rate.",
    benchmarkLow: null,
    benchmarkHigh: null,
    benchmarkSource: null,
  });
}

export function buildReferenceClassRecord(params: {
  claimId: string;
  suggestion: ReferenceClassSuggestion;
  userInsideViewEstimate: number;
  userReferenceClassEstimate: number | null;
  userFinalConfidence: number;
  userExplainedDivergence: string | null;
  capturedAt?: Date;
}): ReferenceClass {
  const divergence =
    params.userReferenceClassEstimate == null ? 0 : params.userFinalConfidence - params.userReferenceClassEstimate;
  const divergenceDirection =
    params.userReferenceClassEstimate == null || divergence === 0
      ? "aligned"
      : divergence > 0
        ? "higher_than_base_rate"
        : "lower_than_base_rate";

  return {
    id: randomUUID(),
    claimId: params.claimId,
    promptShown: params.suggestion.promptShown,
    referenceClassType: params.suggestion.referenceClassType,
    benchmarkLow: params.suggestion.benchmarkLow,
    benchmarkHigh: params.suggestion.benchmarkHigh,
    benchmarkSource: params.suggestion.benchmarkSource,
    userInsideViewEstimate: params.userInsideViewEstimate,
    userReferenceClassEstimate: params.userReferenceClassEstimate,
    userFinalConfidence: params.userFinalConfidence,
    divergence,
    divergenceDirection,
    userExplainedDivergence: params.userExplainedDivergence,
    capturedAt: params.capturedAt ?? new Date(),
  };
}
