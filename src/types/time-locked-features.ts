export type LockRequirementType =
  | "min_claims"
  | "min_days"
  | "min_resolutions"
  | "min_dialectic_rounds"
  | "min_shapes"
  | "domain_coverage";

export type LockRequirement = {
  requirementType: LockRequirementType;
  threshold: number;
  currentValue: number;
  isMet: boolean;
  progressPercent: number;
};

export type TimeLockRequirement = {
  featureId: string;
  featureName: string;
  featureDescription: string;
  requirements: LockRequirement[];
  unlockMessage: string;
  valuePropOnUnlock: string;
};

export type FeatureUnlockStatus = {
  userId: string;
  featureId: string;
  isUnlocked: boolean;
  unlockedAt: Date | null;
  requirements: LockRequirement[];
  allRequirementsMet: boolean;
  percentComplete: number;
  estimatedUnlockDate: Date | null;
};

export const TIME_LOCKED_FEATURES: TimeLockRequirement[] = [
  {
    featureId: "personal_base_rates",
    featureName: "Personal Base Rates",
    featureDescription: "Statistical base rates derived from your own prediction history.",
    requirements: [{ requirementType: "min_resolutions", threshold: 20, currentValue: 0, isMet: false, progressPercent: 0 }],
    unlockMessage: "You now have enough resolved predictions to compute your personal base rates.",
    valuePropOnUnlock: "Unlike general statistics, these reflect how you specifically predict in this domain.",
  },
  {
    featureId: "intellectual_biography",
    featureName: "Intellectual Biography",
    featureDescription: "A narrative of how your thinking has evolved.",
    requirements: [
      { requirementType: "min_days", threshold: 30, currentValue: 0, isMet: false, progressPercent: 0 },
      { requirementType: "min_claims", threshold: 15, currentValue: 0, isMet: false, progressPercent: 0 },
    ],
    unlockMessage: "You've been thinking with Penny for a month. Your first chapter is ready.",
    valuePropOnUnlock: "This is the start of an intellectual autobiography that only gets richer over time.",
  },
  {
    featureId: "here_before_signal",
    featureName: "You've Been Here Before Signals",
    featureDescription: "Penny detects when new claims are structurally similar to your past claims.",
    requirements: [{ requirementType: "min_claims", threshold: 30, currentValue: 0, isMet: false, progressPercent: 0 }],
    unlockMessage: "You have enough claim history for Penny to start recognizing patterns across your maps.",
    valuePropOnUnlock: "Penny will now tell you when you're in structurally familiar territory and what happened last time.",
  },
  {
    featureId: "cognitive_fingerprint",
    featureName: "Cognitive Fingerprint",
    featureDescription: "A deep profile of your specific reasoning patterns.",
    requirements: [
      { requirementType: "min_dialectic_rounds", threshold: 25, currentValue: 0, isMet: false, progressPercent: 0 },
      { requirementType: "min_shapes", threshold: 3, currentValue: 0, isMet: false, progressPercent: 0 },
    ],
    unlockMessage: "You've done enough thinking on Penny for a meaningful cognitive fingerprint to emerge.",
    valuePropOnUnlock: "This profile took 25 critique rounds to build. It describes you specifically, not people in general.",
  },
  {
    featureId: "calibration_coaching",
    featureName: "Calibration Coaching",
    featureDescription: "Domain-specific coaching based on your prediction track record.",
    requirements: [
      { requirementType: "min_resolutions", threshold: 15, currentValue: 0, isMet: false, progressPercent: 0 },
      { requirementType: "domain_coverage", threshold: 2, currentValue: 0, isMet: false, progressPercent: 0 },
    ],
    unlockMessage: "You have enough resolved predictions across domains for meaningful calibration coaching.",
    valuePropOnUnlock: "This coaching is specific to where you over and underestimate. General advice can't give you this.",
  },
  {
    featureId: "intellectual_velocity",
    featureName: "Intellectual Velocity Dashboard",
    featureDescription: "Metrics showing how your thinking quality is improving over time.",
    requirements: [
      { requirementType: "min_days", threshold: 60, currentValue: 0, isMet: false, progressPercent: 0 },
      { requirementType: "min_dialectic_rounds", threshold: 15, currentValue: 0, isMet: false, progressPercent: 0 },
    ],
    unlockMessage: "Two months of data makes velocity meaningful. Your intellectual growth metrics are now available.",
    valuePropOnUnlock: "Before this, you were just thinking. Now you can see if you're getting better.",
  },
];
