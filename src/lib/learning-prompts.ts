import { classifyCalibrationDomain } from "@/lib/calibration";
import { findRelevantPersonalBaseRate, generateBaseRateWarning } from "@/lib/personal-base-rates";
import { suggestReferenceClass } from "@/lib/reference-classes";
import type { PersonalBaseRateLibrary } from "@/types/personal-base-rates";
import type { ClaimProvenance, ClaimStake, ClaimStructureKind } from "@/types/thought-map";

export type LearningPromptClaim = {
  id: string;
  mapId: string;
  userId: string;
  text: string;
  confidence: number;
  structureKind: ClaimStructureKind | null;
  provenance: ClaimProvenance;
  stakes: ClaimStake[];
  domain?: string | null;
};

export type LearningPromptRound = {
  id: string;
  claimId: string | null;
  roundNumber: number;
  critiqueFailureTypes: string[];
  confidenceAtRoundStart: number;
  confidenceAtRoundEnd: number;
  confidenceDelta: number;
  engagementScore: number;
  userResponse: string;
  responseClassification: { type: string } | null;
};

export type LearningPromptInput = {
  claim: LearningPromptClaim;
  round: LearningPromptRound | null;
  userResponse: string | null;
  triggerType: "post_challenge" | "low_engagement" | "confidence_drop" | "high_confidence_entry";
  personalBaseRateLibrary?: PersonalBaseRateLibrary | null;
};

export type LearningPromptOutput = {
  promptType: "concept_explanation" | "base_rate" | "framework";
  headline: string;
  body: string;
  source: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
};

const BASE_RATE_URL = "/app/base-rates";

const CONCEPT_EXPLANATIONS: Record<
  string,
  { headline: string; body: string; source: string }
> = {
  "weak-evidence": {
    headline: "About weak evidence",
    body:
      "Weak evidence means the claim may be plausible, but it is not yet anchored by enough concrete observation, tests, or direct examples. The corrective move is to ask what would actually count as evidence, not just what would make the idea feel reasonable.",
    source: "Penny critique taxonomy",
  },
  "missing-counterargument": {
    headline: "About missing counterarguments",
    body:
      "A missing counterargument means the claim is getting support without enough real opposition. The corrective move is to name the strongest objection first, then test whether the claim still survives when that objection is taken seriously.",
    source: "Penny critique taxonomy",
  },
  "shaky-assumption": {
    headline: "About shaky assumptions",
    body:
      "A shaky assumption is doing more work than it should. The correction is to pull that assumption into the open, check whether it is actually supported, and separate it from the rest of the claim so you can see where the fragility lives.",
    source: "Penny assumption analysis",
  },
  "analogy-break": {
    headline: "About analogies that do not hold",
    body:
      "An analogy break happens when a familiar pattern is carrying the claim farther than it should. The corrective move is to ask where the comparison stops being valid and what precedent would look different from the current case.",
    source: "Penny precedent analysis",
  },
  "dependency-risk": {
    headline: "About hidden dependency risk",
    body:
      "Dependency risk means the claim depends on more things being true than are visible at first glance. The corrective move is to list the upstream assumptions, then ask which one would fail first if the claim were wrong.",
    source: "Penny dependency analysis",
  },
  "unaddressed-precedent": {
    headline: "About missing precedent",
    body:
      "Unaddressed precedent means the claim has not yet been checked against a similar case from the past. The corrective move is to ask what happened last time something structurally similar was tried and whether the lesson changes the current estimate.",
    source: "Penny precedent analysis",
  },
  "premise-rejection": {
    headline: "About premise rejection",
    body:
      "Premise rejection means the critique is no longer arguing about details; it is challenging the starting assumption itself. The corrective move is to ask whether the original frame is still the right one, or whether the entire claim should be rewritten from a different premise.",
    source: "Penny critique taxonomy",
  },
  "definition-failure": {
    headline: "About definition failure",
    body:
      "Definition failure happens when a claim stays too abstract to test cleanly. The corrective move is to force the claim into concrete terms: who, what, by when, and what evidence would count as a result.",
    source: "Penny concreteness analysis",
  },
};

function cleanFailureType(value: string) {
  return value.trim().toLowerCase().replaceAll("_", "-");
}

function clampConfidence(confidence: number) {
  return Math.max(0, Math.min(100, Math.round(confidence)));
}

function claimDomain(claim: LearningPromptClaim) {
  return claim.domain?.trim() || classifyCalibrationDomain(claim.text);
}

function claimType(claim: LearningPromptClaim) {
  return claim.structureKind ?? "assertion";
}

function buildBaseRatePrompt(
  claim: LearningPromptClaim,
  baseRateLibrary?: PersonalBaseRateLibrary | null,
): LearningPromptOutput {
  const domain = claimDomain(claim);
  const type = claimType(claim);
  const highConfidence = clampConfidence(claim.confidence);
  const relevantBaseRate =
    baseRateLibrary && highConfidence >= 80
      ? findRelevantPersonalBaseRate(domain, type, highConfidence, baseRateLibrary)
      : null;

  if (relevantBaseRate) {
    const warning = generateBaseRateWarning(relevantBaseRate, highConfidence);
    return {
      promptType: "base_rate",
      headline: `Your base rate for ${domain} ${type} claims`,
      body:
        warning ??
        `You have enough history to compare this claim against your own record in ${domain} ${type} predictions. The outside view is worth checking before you lock in a high-confidence number.`,
      source: "Your personal base-rate library",
      actionLabel: "Open base rates",
      actionUrl: BASE_RATE_URL,
    };
  }

  const referenceClass = suggestReferenceClass({
    claimText: claim.text,
    claimType: type,
    structureKind: type,
  });

  return {
    promptType: "base_rate",
    headline: "Reference class check",
    body: `${referenceClass.promptShown} Before you commit at ${highConfidence}%, compare this to the outside view and ask what similar cases usually look like.`,
    source: referenceClass.benchmarkSource ?? "Reference class prompting",
    actionLabel: "Open base rates",
    actionUrl: BASE_RATE_URL,
  };
}

function buildFrameworkPrompt(
  claim: LearningPromptClaim,
  round: LearningPromptRound | null,
  triggerType: LearningPromptInput["triggerType"],
): LearningPromptOutput {
  const domain = claimDomain(claim);
  const type = claimType(claim);
  const responseText = round?.userResponse?.trim() ?? "";
  const lowEngagement = triggerType === "low_engagement" || responseText.length < 24 || round?.responseClassification?.type === "dismissal";
  const confidenceDrop = triggerType === "confidence_drop" || (round?.confidenceDelta ?? 0) <= -10;
  const compoundClaim = type === "compound" || type === "conditional";

  if (compoundClaim) {
    return {
      promptType: "framework",
      headline: "Thinking tool: split the claim",
      body:
        `This claim is carrying more than one moving part. Split it into the smallest testable pieces, then defend or challenge each piece on its own. That makes it easier to see whether ${claim.text.slice(0, 80)}${claim.text.length > 80 ? "…" : ""} is fragile because of one assumption or because the whole structure is too broad.`,
      source: "Penny framework library",
      actionLabel: null,
      actionUrl: null,
    };
  }

  if (confidenceDrop) {
    return {
      promptType: "framework",
      headline: "Thinking tool: the evidence ladder",
      body:
        `Your confidence moved, which is often a sign that the claim needs a clearer evidence ladder. Start with the strongest concrete evidence, then walk down to the weakest assumption and ask which rung actually supports the claim.`,
      source: "Penny framework library",
      actionLabel: null,
      actionUrl: null,
    };
  }

  if (lowEngagement) {
    return {
      promptType: "framework",
      headline: "Thinking tool: the pre-mortem",
      body:
        `Try the pre-mortem: imagine it is six months from now and this claim failed. What happened first? What did you miss? For ${domain} claims, that story often exposes the pressure point faster than a generic defense.`,
      source: "Gary Klein, pre-mortem technique",
      actionLabel: null,
      actionUrl: null,
    };
  }

  return {
    promptType: "framework",
    headline: "Thinking tool: five whys",
    body:
      `If you feel stuck defending this claim, ask "why" five times until the answer stops sounding like a slogan. The goal is to get from a surface belief to the actual assumption doing the work.`,
    source: "Penny framework library",
    actionLabel: null,
    actionUrl: null,
  };
}

function buildConceptPrompt(failureType: string): LearningPromptOutput | null {
  const prompt = CONCEPT_EXPLANATIONS[cleanFailureType(failureType)];
  if (!prompt) {
    return null;
  }

  return {
    promptType: "concept_explanation",
    headline: prompt.headline,
    body: prompt.body,
    source: prompt.source,
    actionLabel: null,
    actionUrl: null,
  };
}

export function generateLearningPrompt(input: LearningPromptInput): LearningPromptOutput | null {
  const normalizedResponse = input.userResponse?.trim() ?? "";
  const round = input.round;

  if (input.triggerType === "high_confidence_entry" && clampConfidence(input.claim.confidence) >= 80) {
    return buildBaseRatePrompt(input.claim, input.personalBaseRateLibrary ?? null);
  }

  if (input.triggerType === "post_challenge") {
    const failureTypes = round?.critiqueFailureTypes ?? [];
    for (const failureType of failureTypes) {
      const prompt = buildConceptPrompt(failureType);
      if (prompt) {
        return prompt;
      }
    }

    if (round) {
      const prompt = buildFrameworkPrompt(input.claim, round, input.triggerType);
      if (normalizedResponse.length < 24 || round.responseClassification?.type === "dismissal" || (round.confidenceDelta ?? 0) <= 0) {
        return prompt;
      }
    }
  }

  if (input.triggerType === "low_engagement" || input.triggerType === "confidence_drop") {
    return buildFrameworkPrompt(input.claim, round, input.triggerType);
  }

  return null;
}
