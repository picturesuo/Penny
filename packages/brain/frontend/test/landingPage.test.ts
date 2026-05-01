import assert from "node:assert/strict";
import test from "node:test";
import { landingShortcutIntent } from "../src/components/LandingPage";

test("landing shortcuts either open a mode or send the composer prompt", () => {
  assert.deepEqual(landingShortcutIntent("B", "Founder pricing risk"), {
    action: "open-mode",
    mode: "Brain",
  });
  assert.deepEqual(landingShortcutIntent("L", "Founder pricing risk"), {
    action: "submit-prompt",
    mode: "Learn",
    rawIdea: "Founder pricing risk",
  });
  assert.deepEqual(landingShortcutIntent("C", "Founder pricing risk"), {
    action: "submit-prompt",
    mode: "Check",
    rawIdea: "Founder pricing risk",
  });
  assert.deepEqual(landingShortcutIntent("Q", "Founder pricing risk"), {
    action: "quick-note",
    rawIdea: "Founder pricing risk",
  });
});

test("landing shortcuts without a prompt fall back to mode navigation", () => {
  assert.deepEqual(landingShortcutIntent("L", "   "), {
    action: "open-mode",
    mode: "Learn",
  });
  assert.deepEqual(landingShortcutIntent("C", ""), {
    action: "open-mode",
    mode: "Check",
  });
  assert.deepEqual(landingShortcutIntent("Q", ""), {
    action: "open-mode",
    mode: "Learn",
  });
  assert.equal(landingShortcutIntent("X", "Founder pricing risk"), null);
});
