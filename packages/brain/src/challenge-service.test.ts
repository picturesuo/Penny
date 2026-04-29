import assert from "node:assert/strict";
import test from "node:test";
import { buildTemplateChallenge } from "./services/challenge-service.ts";
import { parseMovePayload } from "./move-payloads.ts";

test("buildTemplateChallenge returns the exact demo challenge when the target claim matches the spec", () => {
  const challenge = buildTemplateChallenge({
    targetClaimId: uuidAt(202),
    targetKind: "assumption",
    targetText: "Pre-seed founders will pay for structured thinking before traction.",
    targetConfidence: 42,
    candidateAction: "challenge",
    candidateReason: "The founder wedge depends on willingness to pay before traction.",
    candidateScore: 930,
  });

  assert.equal(challenge.failureType, "shaky_assumption");
  assert.equal(challenge.strength, "strong");
  assert.match(challenge.critique, /budget and attention usually go to building, selling, fundraising, or finding customers/);
  assert.match(challenge.whyThis, /willingness to pay before traction/);
  assert.match(challenge.whatWouldResolveIt, /urgent pre-seed moment/);
  assert.equal(challenge.provenanceTag, "penny:template.challenge.v0");
});

test("buildTemplateChallenge infers explainable V0 challenge types from candidate action", () => {
  const clarify = buildTemplateChallenge({
    targetClaimId: uuidAt(203),
    targetKind: "belief",
    targetText: "Penny is better structured thinking.",
    targetConfidence: 50,
    candidateAction: "clarify",
    candidateReason: "The claim uses broad language.",
    candidateScore: 640,
  });
  const verify = buildTemplateChallenge({
    targetClaimId: uuidAt(204),
    targetKind: "belief",
    targetText: "The retention lift is already proven.",
    targetConfidence: 86,
    candidateAction: "verify",
    candidateReason: "Confidence is high without enough visible evidence.",
    candidateScore: 760,
  });

  assert.equal(clarify.failureType, "definition_failure");
  assert.equal(clarify.strength, "moderate");
  assert.match(clarify.whatWouldResolveIt, /defining/);
  assert.equal(verify.failureType, "weak_evidence");
  assert.equal(verify.strength, "strong");
  assert.match(verify.critique, /visible evidence/);
});

test("focus_completed payload validates the Wave 5 challenge response receipt", () => {
  const payload = parseMovePayload("focus_completed", {
    focusSource: "challenge_response",
    completedByMoveId: uuidAt(603),
    completedByMoveKind: "claim_revised",
    challengeRoundId: uuidAt(901),
    targetClaimId: uuidAt(202),
    targetEdgeId: uuidAt(302),
    outcome: "revise",
    claimIds: [uuidAt(202), uuidAt(203)],
    edgeIds: [uuidAt(302)],
    artifactIds: [],
  });

  assert.equal(payload.completedByMoveKind, "claim_revised");
  assert.equal(payload.outcome, "revise");
  assert.equal(payload.focusSource, "challenge_response");
});

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}
