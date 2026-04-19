export type OnboardingStep =
  | "welcome"
  | "explain_the_model"
  | "first_claim_prompted"
  | "first_structure"
  | "first_steel_man"
  | "first_critique"
  | "see_the_response_options"
  | "first_update"
  | "see_the_map"
  | "explain_compounding"
  | "complete";

export interface OnboardingState {
  userId: string;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  firstMapId: string | null;
  firstClaimId: string | null;
  firstCritiqueRoundId: string | null;
  skippedAt: Date | null;
  completedAt: Date | null;
  startedAt: Date;
}

export interface OnboardingPrompt {
  step: OnboardingStep;
  headline: string;
  body: string;
  actionLabel: string;
  skipLabel: string | null;
  exampleContent: string | null;
  highlightSelector: string | null;
}

export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  isCompleted: boolean;
  completedAt: Date | null;
  pointsToFeature: string;
  estimatedMinutes: number;
}

export interface OnboardingChecklist {
  items: ChecklistItem[];
  completedCount: number;
  totalCount: number;
  nextRecommended: ChecklistItem | null;
}

export const ONBOARDING_EXAMPLE_CLAIMS: Record<string, string> = {
  founder:
    "Our biggest risk in the next 6 months is that we can't close enterprise deals fast enough to hit our Series A metrics.",
  researcher: "My core hypothesis will survive peer review in its current form.",
  investor: "The market timing for this category is right and will remain right for at least 18 months.",
  operator: "The team we have now can execute this roadmap without a key hire.",
  default: "The most important decision I'm facing right now is the right one to make.",
};
