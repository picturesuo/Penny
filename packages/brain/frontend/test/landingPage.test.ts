import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isYcDemoCreatePrompt, pennyYcCreatePrompt } from "../src/App";
import { landingShortcutIntent, landingShortcuts, landingSubmitIntent } from "../src/components/LandingPage";
import { LandingPage } from "../src/components/LandingPage";

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
    destination: "Create",
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
  assert.deepEqual(landingSubmitIntent("Create", "  Founder pricing risk  "), {
    action: "submit-prompt",
    mode: "Create",
    rawIdea: "Founder pricing risk",
  });
  assert.deepEqual(landingSubmitIntent("QuickNote", "Founder pricing risk"), {
    action: "quick-note",
    rawIdea: "Founder pricing risk",
  });
});

test("landing shortcuts render in Brain, Create, Learn, Quick note order", () => {
  assert.deepEqual(
    landingShortcuts.map((shortcut) => `${shortcut.key} ${shortcut.label}`),
    ["B for Brain", "C for Create", "L for Learn", "Q for Quick note"],
  );
});

test("landing page exposes Start with your Brain first-run CTA", () => {
  const markup = renderToStaticMarkup(
    createElement(LandingPage, {
      disabled: false,
      status: "Ready",
      onModeSelect: () => undefined,
      onPromptSubmit: async () => undefined,
      onQuickNote: async () => undefined,
    }),
  );

  assert.match(markup, /Start with your Brain/);
});

test("landing page exposes a small YC fixture fallback when fixture loader is wired", () => {
  const markup = renderToStaticMarkup(
    createElement(LandingPage, {
      disabled: false,
      status: "Ready",
      onModeSelect: () => undefined,
      onPromptSubmit: async () => undefined,
      onQuickNote: async () => undefined,
      onBuildWithPenny: async () => undefined,
    }),
  );

  assert.match(markup, /Use YC demo fixture/);
  assert.match(markup, /data-testid="landing-yc-demo-fixture"/);
  assert.doesNotMatch(markup, /Build with Penny/);
});

test("landing Create prompt detector recognizes the narrated YC demo prompt", () => {
  assert.equal(isYcDemoCreatePrompt(pennyYcCreatePrompt), true);
  assert.equal(isYcDemoCreatePrompt("Build a quiet weekly planning view."), false);
});
