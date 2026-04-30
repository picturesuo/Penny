import assert from "node:assert/strict";
import test from "node:test";
import {
  isMvpMode,
  mvpModeForThinkingMode,
  mvpModeValues,
  thinkingModeForMvpMode,
  thinkingModeValues,
} from "./modes.ts";

test("MVP mode contract exposes only Learn, Check, and Brain", () => {
  assert.deepEqual([...mvpModeValues], ["Learn", "Check", "Brain"]);
  assert.equal(isMvpMode("Learn"), true);
  assert.equal(isMvpMode("Check"), true);
  assert.equal(isMvpMode("Brain"), true);
  assert.equal(isMvpMode("Cents"), false);
  assert.equal(isMvpMode("Search"), false);
  assert.equal(isMvpMode("Settings"), false);
});

test("legacy thinking modes map onto the MVP mode contract", () => {
  assert.deepEqual([...thinkingModeValues], ["brain", "challenge", "verify", "learn", "artifact"]);
  assert.equal(mvpModeForThinkingMode("brain"), "Brain");
  assert.equal(mvpModeForThinkingMode("challenge"), "Check");
  assert.equal(mvpModeForThinkingMode("verify"), "Check");
  assert.equal(mvpModeForThinkingMode("artifact"), "Check");
  assert.equal(mvpModeForThinkingMode("learn"), "Learn");
});

test("MVP modes choose stable default thinking modes", () => {
  assert.equal(thinkingModeForMvpMode("Brain"), "brain");
  assert.equal(thinkingModeForMvpMode("Check"), "challenge");
  assert.equal(thinkingModeForMvpMode("Learn"), "learn");
});
