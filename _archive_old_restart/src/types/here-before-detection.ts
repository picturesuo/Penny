export type HereBeforeSignal = {
  triggeredFor: string;
  similarMapId: string;
  similarClaimId: string;
  similarClaimText: string;
  similarityScore: number;
  similarityReasons: SimilarityReason[];
  whatHappened: HereBeforeOutcome;
  lesson: string | null;
  urgency: "low" | "medium" | "high";
};

export type SimilarityReason = {
  dimension:
    | "domain"
    | "claim_type"
    | "stakes_level"
    | "structure_kind"
    | "provenance"
    | "confidence_level"
    | "text_similarity";
  explanation: string;
  weight: number;
};

export type HereBeforeOutcome = {
  wasResolved: boolean;
  outcomeType: string | null;
  confidenceJourney: string;
  roundCount: number;
  concessionsMade: number;
  finalLesson: string | null;
};
