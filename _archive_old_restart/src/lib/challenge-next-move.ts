export type BestNextMoveKey = "revise_claim" | "gather_evidence" | "challenge_dependency" | "run_another_round" | "mark_for_revisit";

export type ChallengeNextMoveSnapshot = {
  classification?: string | null;
  confidenceDelta?: number | null;
  followUpPrompt?: string | null;
  critiqueFailureTypes?: string[];
  roundIndex?: number;
};

export type BestNextMoveRecommendation = {
  primary: {
    key: BestNextMoveKey;
    label: string;
    description: string;
  };
  alternates: Array<{
    key: BestNextMoveKey;
    label: string;
  }>;
  signalLabel: string | null;
};

export function deriveBestNextMove(snapshot: ChallengeNextMoveSnapshot): BestNextMoveRecommendation {
  const classification = snapshot.classification ?? null;
  const confidenceDelta = snapshot.confidenceDelta ?? 0;
  const followUpPrompt = snapshot.followUpPrompt ?? null;
  const roundIndex = snapshot.roundIndex ?? 0;
  const normalizedFailureTypes = (snapshot.critiqueFailureTypes ?? []).map((value) => value.trim().toLowerCase());
  const stagnantThread =
    typeof followUpPrompt === "string" &&
    /(no confidence change|stagnation|lack of confidence change|new evidence)/i.test(followUpPrompt);

  const scoreByMove = new Map<BestNextMoveKey, number>([
    ["revise_claim", 0],
    ["gather_evidence", 0],
    ["challenge_dependency", 0],
    ["run_another_round", 0],
    ["mark_for_revisit", 0],
  ]);

  if (classification === "concession") {
    scoreByMove.set("revise_claim", 5);
  } else if (classification === "partial_concession") {
    scoreByMove.set("revise_claim", 4);
    scoreByMove.set("run_another_round", 1);
  } else if (classification === "evidence_addition") {
    scoreByMove.set("gather_evidence", 4);
  } else if (classification === "defense") {
    scoreByMove.set("run_another_round", 2);
  } else if (classification === "reframe") {
    scoreByMove.set("revise_claim", 3);
  } else if (classification === "dismissal") {
    scoreByMove.set("run_another_round", 2);
    scoreByMove.set("mark_for_revisit", 2);
  }

  if (confidenceDelta <= -10) {
    scoreByMove.set("revise_claim", (scoreByMove.get("revise_claim") ?? 0) + 4);
  } else if (confidenceDelta < 0) {
    scoreByMove.set("revise_claim", (scoreByMove.get("revise_claim") ?? 0) + 2);
  } else if (confidenceDelta === 0) {
    scoreByMove.set("run_another_round", (scoreByMove.get("run_another_round") ?? 0) + 2);
  }

  if (normalizedFailureTypes.some((value) => value === "weak-evidence" || value === "unaddressed-precedent" || value === "definition-failure")) {
    scoreByMove.set("gather_evidence", (scoreByMove.get("gather_evidence") ?? 0) + 3);
  }

  if (normalizedFailureTypes.some((value) => value === "dependency-risk" || value === "shaky-assumption")) {
    scoreByMove.set("challenge_dependency", (scoreByMove.get("challenge_dependency") ?? 0) + 4);
  }

  if (normalizedFailureTypes.some((value) => value === "missing-counterargument" || value === "premise-rejection" || value === "analogy-break")) {
    scoreByMove.set("revise_claim", (scoreByMove.get("revise_claim") ?? 0) + 2);
  }

  if (stagnantThread) {
    if (roundIndex >= 2) {
      scoreByMove.set("mark_for_revisit", (scoreByMove.get("mark_for_revisit") ?? 0) + 5);
    } else {
      scoreByMove.set("run_another_round", (scoreByMove.get("run_another_round") ?? 0) + 3);
    }
  }

  const rankedMoves = [...scoreByMove.entries()]
    .filter(([, score]) => score > 0)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return moveSortOrder(left[0]) - moveSortOrder(right[0]);
    });

  const [primaryKey] = rankedMoves[0] ?? [["run_another_round", 1] as const];
  const primary = bestNextMoveCopy(primaryKey);
  const alternates = rankedMoves.slice(1, 3).map(([key]) => {
    const candidate = bestNextMoveCopy(key);

    return {
      key,
      label: candidate.label,
    };
  });

  const leadFailureType = normalizedFailureTypes[0] ?? null;
  const signalLabel =
    classification || leadFailureType || confidenceDelta !== 0
      ? [
          classification ? formatClassification(classification) : null,
          leadFailureType ? formatClassification(leadFailureType) : null,
          confidenceDelta !== 0 ? `${confidenceDelta > 0 ? "+" : ""}${formatPercentValue(confidenceDelta)} confidence` : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" · ")
      : null;

  return {
    primary,
    alternates,
    signalLabel,
  };
}

export function bestNextMoveCopy(key: BestNextMoveKey): BestNextMoveRecommendation["primary"] {
  switch (key) {
    case "revise_claim":
      return {
        key,
        label: "Revise claim",
        description: "Your saved response changed the shape of the claim enough that the next useful move is to rewrite it in a form you can still defend cleanly.",
      };
    case "gather_evidence":
      return {
        key,
        label: "Gather evidence",
        description: "This round still points at evidence or precedent gaps, so add one concrete source, example, or test before you escalate the claim again.",
      };
    case "challenge_dependency":
      return {
        key,
        label: "Challenge a dependency",
        description: "The pressure is landing on an assumption beneath the claim. Attack that dependency directly instead of replaying the headline argument.",
      };
    case "mark_for_revisit":
      return {
        key,
        label: "Mark for revisit",
        description: "The round is saved, but this thread looks temporarily exhausted. Leave it visible for revisit when you have new evidence or a sharper objection.",
      };
    case "run_another_round":
    default:
      return {
        key: "run_another_round",
        label: "Run another round",
        description: "The saved result still leaves a live pressure point, so the best next move is one more challenge while the claim and response are still in context.",
      };
  }
}

function moveSortOrder(key: BestNextMoveKey): number {
  switch (key) {
    case "revise_claim":
      return 0;
    case "gather_evidence":
      return 1;
    case "challenge_dependency":
      return 2;
    case "run_another_round":
      return 3;
    case "mark_for_revisit":
      return 4;
  }
}

function formatClassification(type: string): string {
  return type.replaceAll("_", " ");
}

function formatPercentValue(value: number): string {
  return `${Math.round(value)}%`;
}
