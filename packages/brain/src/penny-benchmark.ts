export type PennyBenchmarkDimension =
  | "seed_idea"
  | "assumptions"
  | "challenge_quality"
  | "response_handling"
  | "artifact_usefulness"
  | "history_sensitivity";

export type PennyBenchmarkCase = {
  id: string;
  title: string;
  seedIdea: string;
  minimumPassingScore: number;
  assumptionSignals: string[][];
  challengeSpecificSignals: string[];
  usefulArtifactSignals: string[];
};

export type PennyBenchmarkRun = {
  seedIdea: string;
  assumptions: string[];
  challenge: {
    critique: string;
    failureType: string;
    whyThisCritique: string;
    whatWouldResolveIt: string;
    suggestedNextMove: string;
  };
  responseHandling: {
    supportedResponses: string[];
    emittedMoveKinds: string[];
    graphChanges: string[];
  };
  artifact: {
    summary: string;
    keyInsight: string;
    responseState: string;
    nextMoves: Array<{ title: string; rationale: string }>;
    claimRefRoles: string[];
    edgeRefCount: number;
  };
  historyProbe: {
    priorMoves: string[];
    critiqueBeforePriorMoves: string;
    critiqueAfterPriorMoves: string;
    afterRationale: string;
  };
};

export type PennyBenchmarkCheck = {
  dimension: PennyBenchmarkDimension;
  passed: boolean;
  detail: string;
};

export type PennyBenchmarkReport = {
  benchmarkId: string;
  score: number;
  maxScore: number;
  minimumPassingScore: number;
  passed: boolean;
  checks: PennyBenchmarkCheck[];
  failures: PennyBenchmarkCheck[];
};

export const internalPennyBenchmark: PennyBenchmarkCase = {
  id: "penny-mvp-loop-v1",
  title: "Penny MVP loop benchmark",
  seedIdea:
    "A district-facing AI coach that helps new teachers turn messy classroom notes into a defensible weekly improvement plan.",
  minimumPassingScore: 6,
  assumptionSignals: [
    ["district", "teacher"],
    ["messy", "notes"],
    ["weekly", "plan"],
    ["defensible", "improvement"],
  ],
  challengeSpecificSignals: ["district", "teacher", "classroom", "notes", "weekly", "workflow", "evidence"],
  usefulArtifactSignals: ["challenge", "assumption", "response", "next", "evidence"],
};

export function scorePennyBenchmarkRun(
  run: PennyBenchmarkRun,
  benchmark: PennyBenchmarkCase = internalPennyBenchmark,
): PennyBenchmarkReport {
  const checks: PennyBenchmarkCheck[] = [
    seedIdeaCheck(run, benchmark),
    assumptionsCheck(run, benchmark),
    challengeQualityCheck(run, benchmark),
    responseHandlingCheck(run),
    artifactUsefulnessCheck(run, benchmark),
    historySensitivityCheck(run),
  ];
  const score = checks.filter((check) => check.passed).length;
  const failures = checks.filter((check) => !check.passed);

  return {
    benchmarkId: benchmark.id,
    score,
    maxScore: checks.length,
    minimumPassingScore: benchmark.minimumPassingScore,
    passed: score >= benchmark.minimumPassingScore,
    checks,
    failures,
  };
}

function seedIdeaCheck(run: PennyBenchmarkRun, benchmark: PennyBenchmarkCase): PennyBenchmarkCheck {
  const passed = normalize(run.seedIdea) === normalize(benchmark.seedIdea);

  return {
    dimension: "seed_idea",
    passed,
    detail: passed ? "Seed idea is preserved exactly enough to benchmark the same thought." : "Seed idea drifted.",
  };
}

function assumptionsCheck(run: PennyBenchmarkRun, benchmark: PennyBenchmarkCase): PennyBenchmarkCheck {
  const assumptions = run.assumptions.map(normalize);
  const matchedSignals = benchmark.assumptionSignals.filter((signals) =>
    assumptions.some((assumption) => signals.every((signal) => assumption.includes(signal))),
  );
  const passed = run.assumptions.length >= 4 && matchedSignals.length === benchmark.assumptionSignals.length;

  return {
    dimension: "assumptions",
    passed,
    detail: passed
      ? "Assumptions cover the benchmark's load-bearing product, workflow, cadence, and evidence premises."
      : `Matched ${matchedSignals.length}/${benchmark.assumptionSignals.length} assumption signal groups.`,
  };
}

function challengeQualityCheck(run: PennyBenchmarkRun, benchmark: PennyBenchmarkCase): PennyBenchmarkCheck {
  const challengeText = normalize(
    [
      run.challenge.critique,
      run.challenge.whyThisCritique,
      run.challenge.whatWouldResolveIt,
      run.challenge.suggestedNextMove,
    ].join(" "),
  );
  const specificSignalCount = benchmark.challengeSpecificSignals.filter((signal) =>
    challengeText.includes(signal),
  ).length;
  const allowedFailureTypes = new Set([
    "weak_evidence",
    "missing_counterargument",
    "shaky_assumption",
    "dependency_risk",
    "unaddressed_precedent",
  ]);
  const passed =
    allowedFailureTypes.has(run.challenge.failureType) &&
    specificSignalCount >= 4 &&
    run.challenge.whyThisCritique.trim().length >= 80 &&
    run.challenge.whatWouldResolveIt.trim().length >= 80;

  return {
    dimension: "challenge_quality",
    passed,
    detail: passed
      ? "Challenge is specific, load-bearing, and resolvable."
      : `Challenge matched ${specificSignalCount}/${benchmark.challengeSpecificSignals.length} specificity signals.`,
  };
}

function responseHandlingCheck(run: PennyBenchmarkRun): PennyBenchmarkCheck {
  const supportedResponses = new Set(run.responseHandling.supportedResponses.map(normalize));
  const emittedMoves = new Set(run.responseHandling.emittedMoveKinds);
  const graphChanges = normalize(run.responseHandling.graphChanges.join(" "));
  const passed =
    ["defend", "revise", "absorb"].every((response) => supportedResponses.has(response)) &&
    ["user_defended", "claim_revised", "critique_absorbed"].every((moveKind) => emittedMoves.has(moveKind)) &&
    graphChanges.includes("edge") &&
    graphChanges.includes("claim") &&
    graphChanges.includes("version");

  return {
    dimension: "response_handling",
    passed,
    detail: passed
      ? "Defend, Revise, and Absorb are all represented as graph-changing moves."
      : "Response handling did not cover all response modes and graph mutations.",
  };
}

function artifactUsefulnessCheck(run: PennyBenchmarkRun, benchmark: PennyBenchmarkCase): PennyBenchmarkCheck {
  const artifactText = normalize(
    [
      run.artifact.summary,
      run.artifact.keyInsight,
      run.artifact.responseState,
      ...run.artifact.nextMoves.flatMap((move) => [move.title, move.rationale]),
      ...run.artifact.claimRefRoles,
    ].join(" "),
  );
  const matchedSignals = benchmark.usefulArtifactSignals.filter((signal) => artifactText.includes(signal));
  const roleSet = new Set(run.artifact.claimRefRoles);
  const passed =
    matchedSignals.length === benchmark.usefulArtifactSignals.length &&
    run.artifact.nextMoves.length >= 2 &&
    roleSet.has("seed") &&
    roleSet.has("assumption") &&
    roleSet.has("challenge") &&
    run.artifact.edgeRefCount > 0 &&
    run.artifact.responseState !== "not_recorded";

  return {
    dimension: "artifact_usefulness",
    passed,
    detail: passed
      ? "Artifact references graph state, response posture, and concrete next moves."
      : `Artifact matched ${matchedSignals.length}/${benchmark.usefulArtifactSignals.length} usefulness signals.`,
  };
}

function historySensitivityCheck(run: PennyBenchmarkRun): PennyBenchmarkCheck {
  const before = normalize(run.historyProbe.critiqueBeforePriorMoves);
  const after = normalize(run.historyProbe.critiqueAfterPriorMoves);
  const rationale = normalize(run.historyProbe.afterRationale);
  const priorMoves = normalize(run.historyProbe.priorMoves.join(" "));
  const historySignals = ["prior", "move", "history", "defend", "revise", "absorb", "lens", "shape"];
  const passed =
    before !== after &&
    run.historyProbe.priorMoves.length > 0 &&
    historySignals.some((signal) => rationale.includes(signal) || after.includes(signal) || priorMoves.includes(signal));

  return {
    dimension: "history_sensitivity",
    passed,
    detail: passed
      ? "Later critique changes after prior moves and explains the historical signal."
      : "Later critique did not visibly change based on prior moves.",
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
