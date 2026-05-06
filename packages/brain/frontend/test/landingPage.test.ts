import assert from "node:assert/strict";
import test from "node:test";
import { landingShortcutIntent, landingShortcuts, landingSubmitIntent } from "../src/components/LandingPage";

test("landing shortcuts either open Brain or select a composer destination", () => {
  assert.deepEqual(landingShortcutIntent("Q"), {
    action: "select-destination",
    destination: "QuickNote",
  });
  assert.deepEqual(landingShortcutIntent("L"), {
    action: "select-destination",
    destination: "Learn",
  });
  assert.deepEqual(landingShortcutIntent("C"), {
    action: "select-destination",
    destination: "Check",
  });
  assert.deepEqual(landingShortcutIntent("B"), {
    action: "open-mode",
    mode: "Brain",
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

test("landing shortcut row renders Brain, Check, Learn while Quick note uses the composer icon", () => {
  assert.deepEqual(
    landingShortcuts.map((shortcut) => `${shortcut.key} ${shortcut.label}`),
    ["B for Brain", "C for Check", "L for Learn"],
  );
});
