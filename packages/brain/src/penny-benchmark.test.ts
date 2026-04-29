import assert from "node:assert/strict";
import test from "node:test";
import {
  internalPennyBenchmark,
  scorePennyBenchmarkRun,
  type PennyBenchmarkDimension,
  type PennyBenchmarkRun,
} from "./penny-benchmark.ts";

test("internal Penny benchmark covers the full MVP loop", () => {
  const report = scorePennyBenchmarkRun(passingRun());

  assert.equal(report.benchmarkId, internalPennyBenchmark.id);
  assert.equal(report.maxScore, 6);
  assert.equal(report.score, 6);
  assert.equal(report.passed, true);
  assert.deepEqual(
    report.checks.map((check) => check.dimension).sort(),
    [
      "artifact_usefulness",
      "assumptions",
      "challenge_quality",
      "history_sensitivity",
      "response_handling",
      "seed_idea",
    ] satisfies PennyBenchmarkDimension[],
  );
});

test("internal Penny benchmark fails generic output and unchanged later critique", () => {
  const run = passingRun();
  run.challenge = {
    critique: "This might not work because there is a hidden premise.",
    failureType: "shaky_assumption",
    whyThisCritique: "It is a hidden premise.",
    whatWouldResolveIt: "More evidence.",
    suggestedNextMove: "Think harder.",
  };
  run.artifact = {
    summary: "A generic summary.",
    keyInsight: "Keep going.",
    responseState: "not_recorded",
    nextMoves: [{ title: "Continue", rationale: "It may help." }],
    claimRefRoles: ["seed"],
    edgeRefCount: 0,
  };
  run.historyProbe = {
    priorMoves: ["user_defended"],
    critiqueBeforePriorMoves: "This might not work because there is a hidden premise.",
    critiqueAfterPriorMoves: "This might not work because there is a hidden premise.",
    afterRationale: "Same critique.",
  };

  const report = scorePennyBenchmarkRun(run);

  assert.equal(report.passed, false);
  assert.deepEqual(
    report.failures.map((check) => check.dimension).sort(),
    ["artifact_usefulness", "challenge_quality", "history_sensitivity"] satisfies PennyBenchmarkDimension[],
  );
});

function passingRun(): PennyBenchmarkRun {
  return {
    seedIdea: internalPennyBenchmark.seedIdea,
    assumptions: [
      "District leaders have a real new teacher coaching bottleneck that makes this worth buying.",
      "New teachers' messy classroom notes contain enough signal to guide decisions instead of just creating noise.",
      "A weekly improvement plan is the right cadence for classroom practice and administrator review.",
      "Defensible improvement means the plan must cite evidence and not merely rephrase the teacher's notes.",
    ],
    challenge: {
      critique:
        "The district-facing teacher coach is weak if classroom notes do not map cleanly into a weekly workflow that coaches and administrators already trust.",
      failureType: "dependency_risk",
      whyThisCritique:
        "The claim depends on a specific district workflow: new teachers must capture classroom evidence, Penny must convert those notes into a plan, and reviewers must treat the result as defensible rather than extra paperwork.",
      whatWouldResolveIt:
        "A small pilot would weaken this critique by showing that teachers can submit notes, receive a weekly improvement plan, and have coaches accept the evidence trail without adding a second workflow.",
      suggestedNextMove:
        "Ask one district coach to mark which parts of a weekly teacher plan would need evidence before it could be trusted.",
    },
    responseHandling: {
      supportedResponses: ["Defend", "Revise", "Absorb"],
      emittedMoveKinds: ["user_defended", "claim_revised", "critique_absorbed"],
      graphChanges: [
        "Defend records a user_defended move and keeps the challenge edge active.",
        "Revise creates a new claim version and a claim_revised move.",
        "Absorb records critique_absorbed and updates the challenge edge as acknowledged vulnerability.",
      ],
    },
    artifact: {
      summary:
        "The challenge brief links the seed idea, the risky district assumption, the user's response, and the evidence needed for the next decision.",
      keyInsight:
        "The useful artifact should make the next move obvious: test whether classroom evidence survives the weekly workflow.",
      responseState: "defended",
      nextMoves: [
        {
          title: "Inspect evidence trail",
          rationale: "The next challenge depends on whether teacher notes can justify the weekly plan.",
        },
        {
          title: "Review response",
          rationale: "The user's response changes whether the assumption needs defense, revision, or absorption.",
        },
      ],
      claimRefRoles: ["seed", "assumption", "challenge"],
      edgeRefCount: 1,
    },
    historyProbe: {
      priorMoves: ["challenge_issued", "user_defended"],
      critiqueBeforePriorMoves:
        "The first critique questions whether classroom notes can become a defensible weekly plan.",
      critiqueAfterPriorMoves:
        "Because the prior move defended the evidence workflow, the later critique shifts to whether district coaches will accept that defended evidence as operationally useful.",
      afterRationale:
        "The lens should treat prior move history as a signal, so later critique changes after a defend response instead of repeating the first objection.",
    },
  };
}
