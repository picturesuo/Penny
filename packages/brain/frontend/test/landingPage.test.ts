import assert from "node:assert/strict";
import test from "node:test";
import { landingShortcutIntent, landingSubmitIntent } from "../src/components/LandingPage";

test("landing shortcuts either open Brain or select a composer destination", () => {
  assert.deepEqual(landingShortcutIntent("B"), {
    action: "open-mode",
    mode: "Brain",
  });
  assert.deepEqual(landingShortcutIntent("L"), {
    action: "select-destination",
    destination: "Learn",
  });
  assert.deepEqual(landingShortcutIntent("C"), {
    action: "select-destination",
    destination: "Check",
  });
  assert.deepEqual(landingShortcutIntent("Q"), {
    action: "select-destination",
    destination: "QuickNote",
  });
  assert.equal(landingShortcutIntent("X"), null);
});

test("landing submit requires a selected destination and prompt", () => {
  assert.equal(landingSubmitIntent(null, "Founder pricing risk"), null);
  assert.equal(landingSubmitIntent("Learn", "   "), null);
  assert.deepEqual(landingSubmitIntent("Learn", "Founder pricing risk"), {
    action: "submit-prompt",
    mode: "Learn",
    rawIdea: "Founder pricing risk",
  });
  assert.deepEqual(landingSubmitIntent("Check", "  Founder pricing risk  "), {
    action: "submit-prompt",
    mode: "Check",
    rawIdea: "Founder pricing risk",
  });
  assert.deepEqual(landingSubmitIntent("QuickNote", "Founder pricing risk"), {
    action: "quick-note",
    rawIdea: "Founder pricing risk",
  });
});
