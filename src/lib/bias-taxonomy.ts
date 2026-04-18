import type { BiasType } from "@/types/thought-map";

export const BIAS_TAXONOMY: BiasType[] = [
  {
    id: "overconfidence_bias",
    name: "Overconfidence Bias",
    description: "Confidence runs ahead of calibration, especially in novel or high-uncertainty claims.",
    detectionSignals: [
      { signalType: "confidence_vs_calibration", direction: "confirms_bias", weight: 0.45 },
      { signalType: "update_asymmetry", direction: "confirms_bias", weight: 0.25 },
      { signalType: "defense_rate", direction: "confirms_bias", weight: 0.2 },
      { signalType: "confidence_vs_calibration", direction: "disconfirms_bias", weight: 0.2 },
    ],
    claimDomains: ["market", "technical", "operational", "general"],
    mitigationPrompts: [
      "Prioritize calibration-challenging critiques and surface the base rate explicitly.",
      "Ask what evidence would force a downward revision before accepting the current confidence.",
    ],
    evidenceRequiredToConfirm: 3,
    evidenceRequiredToRetire: 2,
  },
  {
    id: "availability_heuristic",
    name: "Availability Heuristic",
    description: "Recent or vivid events disproportionately influence confidence and urgency.",
    detectionSignals: [
      { signalType: "first_impression_stickiness", direction: "confirms_bias", weight: 0.3 },
      { signalType: "source_concentration", direction: "confirms_bias", weight: 0.25 },
      { signalType: "confidence_vs_calibration", direction: "confirms_bias", weight: 0.15 },
    ],
    claimDomains: ["market", "general", "operational", "people"],
    mitigationPrompts: [
      "Force a base-rate check and a slower counterfactual before accepting the vivid example.",
      "Ask what changed in the long-run distribution, not just what happened most recently.",
    ],
    evidenceRequiredToConfirm: 2,
    evidenceRequiredToRetire: 2,
  },
  {
    id: "confirmation_bias",
    name: "Confirmation Bias",
    description: "The user keeps selecting evidence that supports the current frame while dismissing opposing pressure.",
    detectionSignals: [
      { signalType: "source_concentration", direction: "confirms_bias", weight: 0.35 },
      { signalType: "round_dismissal_rate", direction: "confirms_bias", weight: 0.35 },
      { signalType: "defense_rate", direction: "confirms_bias", weight: 0.2 },
      { signalType: "round_dismissal_rate", direction: "disconfirms_bias", weight: 0.2 },
    ],
    claimDomains: ["market", "technical", "research", "people", "general"],
    mitigationPrompts: [
      "Surface the strongest counterargument before you let the claim stay intact.",
      "Name the evidence that would make the current frame fail, not just the evidence that supports it.",
    ],
    evidenceRequiredToConfirm: 3,
    evidenceRequiredToRetire: 2,
  },
  {
    id: "anchoring_bias",
    name: "Anchoring Bias",
    description: "The first confidence estimate keeps the claim pinned even after critique should have moved it.",
    detectionSignals: [
      { signalType: "update_asymmetry", direction: "confirms_bias", weight: 0.4 },
      { signalType: "confidence_vs_calibration", direction: "confirms_bias", weight: 0.25 },
      { signalType: "defense_rate", direction: "confirms_bias", weight: 0.15 },
    ],
    claimDomains: ["market", "operational", "general"],
    mitigationPrompts: [
      "Ask what would justify moving confidence by 20 points, not just 5.",
      "Force a before/after comparison against a fresh estimate, not the original anchor.",
    ],
    evidenceRequiredToConfirm: 3,
    evidenceRequiredToRetire: 2,
  },
  {
    id: "planning_fallacy",
    name: "Planning Fallacy",
    description: "The timeline looks cleaner than the actual path to resolution.",
    detectionSignals: [
      { signalType: "confidence_vs_calibration", direction: "confirms_bias", weight: 0.3 },
      { signalType: "update_asymmetry", direction: "confirms_bias", weight: 0.2 },
      { signalType: "first_impression_stickiness", direction: "confirms_bias", weight: 0.15 },
    ],
    claimDomains: ["operational", "market", "technical", "research"],
    mitigationPrompts: [
      "Break the plan into one-week checkpoints and ask where the schedule can slip.",
      "Compare the forecast to similar past projects before trusting the deadline.",
    ],
    evidenceRequiredToConfirm: 2,
    evidenceRequiredToRetire: 2,
  },
  {
    id: "sunk_cost_pattern",
    name: "Sunk-Cost Pattern",
    description: "High emotional investment makes it harder to update or abandon a weak line of thought.",
    detectionSignals: [
      { signalType: "round_dismissal_rate", direction: "confirms_bias", weight: 0.35 },
      { signalType: "defense_rate", direction: "confirms_bias", weight: 0.3 },
      { signalType: "update_asymmetry", direction: "confirms_bias", weight: 0.2 },
    ],
    claimDomains: ["people", "general", "market", "operational"],
    mitigationPrompts: [
      "Separate the value of the original investment from the value of the current claim.",
      "Ask what you would conclude if you had never spent the earlier effort.",
    ],
    evidenceRequiredToConfirm: 2,
    evidenceRequiredToRetire: 2,
  },
  {
    id: "first_impression_stickiness",
    name: "First-Impression Stickiness",
    description: "An intuition-based first capture keeps its shape even after repeated critique.",
    detectionSignals: [
      { signalType: "first_impression_stickiness", direction: "confirms_bias", weight: 0.4 },
      { signalType: "update_asymmetry", direction: "confirms_bias", weight: 0.25 },
      { signalType: "defense_rate", direction: "confirms_bias", weight: 0.15 },
    ],
    claimDomains: ["general", "people", "market", "technical"],
    mitigationPrompts: [
      "Check whether the first framing is still doing too much work.",
      "Ask for a second-pass estimate that ignores the original intuition.",
    ],
    evidenceRequiredToConfirm: 2,
    evidenceRequiredToRetire: 2,
  },
];

export function biasTypeById(id: string) {
  return BIAS_TAXONOMY.find((biasType) => biasType.id === id) ?? null;
}
