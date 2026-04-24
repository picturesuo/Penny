import type {
  PennyUncertainty,
  PennyUncertaintyGroundingType,
  PennyUncertaintyLevel,
  PennyUncertaintyOutputType,
} from "@/types/thought-map";

function clampConfidenceScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function defaultConfidenceScore(params: {
  groundingCount: number;
  groundingType: PennyUncertaintyGroundingType;
  outputType: PennyUncertaintyOutputType;
}) {
  const count = Math.max(0, params.groundingCount);

  if (count >= 10 && params.groundingType === "user_pattern_data") {
    return 90;
  }

  if (count >= 4 && params.groundingType === "user_pattern_data") {
    return 74;
  }

  if (params.groundingType === "cross_user_aggregate") {
    return count > 0 ? 66 : 62;
  }

  if (params.groundingType === "first_principles") {
    return count > 0 ? 46 : params.outputType === "meta_cognition_prompt" || params.outputType === "synthesis_prompt" ? 34 : 38;
  }

  return count > 0 ? 55 : 24;
}

function uncertaintyLevelFromScore(score: number): PennyUncertaintyLevel {
  if (score >= 80) {
    return "high_confidence";
  }

  if (score >= 55) {
    return "moderate_confidence";
  }

  if (score >= 35) {
    return "low_confidence";
  }

  return "speculative";
}

export function buildPennyUncertainty(params: {
  outputType: PennyUncertaintyOutputType;
  groundingType: PennyUncertaintyGroundingType;
  groundingCount: number;
  evidenceBasis: string;
  caveats?: string[];
  confidenceScore?: number;
}): PennyUncertainty {
  const confidenceScore = clampConfidenceScore(
    params.confidenceScore ?? defaultConfidenceScore(params),
  );

  return {
    outputType: params.outputType,
    groundingType: params.groundingType,
    groundingCount: Math.max(0, Math.round(params.groundingCount)),
    evidenceBasis: params.evidenceBasis,
    confidenceScore,
    uncertaintyLevel: uncertaintyLevelFromScore(confidenceScore),
    caveats: params.caveats ?? [],
  };
}

export function uncertaintyLabel(uncertainty: PennyUncertainty) {
  switch (uncertainty.uncertaintyLevel) {
    case "high_confidence":
      return "High";
    case "moderate_confidence":
      return "Moderate";
    case "low_confidence":
      return "Low";
    case "speculative":
      return "Speculative";
  }
}

export function uncertaintyQualifier(uncertainty: PennyUncertainty) {
  switch (uncertainty.uncertaintyLevel) {
    case "high_confidence":
      return "solidly grounded";
    case "moderate_confidence":
      return "pattern-backed";
    case "low_confidence":
      return "heuristic";
    case "speculative":
      return "speculative prompt";
  }
}
