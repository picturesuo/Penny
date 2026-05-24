import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isYcDemoCreatePrompt, pennyYcCreatePrompt } from "../src/App";
import { landingShortcutIntent, landingShortcutModifierLabel, landingShortcuts, landingSubmitIntent } from "../src/components/LandingPage";
import { LandingPage } from "../src/components/LandingPage";

test("landing shortcuts either open Brain or select a composer destination", () => {
  assert.deepEqual(landingShortcutIntent("N"), {
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
  assert.deepEqual(landingShortcutIntent("KeyC"), {
    action: "select-destination",
    destination: "Create",
  });
  assert.deepEqual(landingShortcutIntent("B"), {
    action: "open-mode",
    mode: "Brain",
  });
  assert.deepEqual(landingShortcutIntent("KeyN"), {
    action: "select-destination",
    destination: "QuickNote",
  });
  assert.equal(landingShortcutIntent("X"), null);
});

test("landing submit defaults rough ideas to Create and honors selected destinations", () => {
  assert.deepEqual(landingSubmitIntent(null, "Founder pricing risk"), {
    action: "submit-prompt",
    mode: "Create",
    rawIdea: "Founder pricing risk",
  });
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
    ["B Brain", "C Create", "L Learn", "N Note"],
  );
});

test("landing shortcut modifier label follows the browser platform", () => {
  assert.equal(landingShortcutModifierLabel("MacIntel"), "⌥");
  assert.equal(landingShortcutModifierLabel("iPhone"), "⌥");
  assert.equal(landingShortcutModifierLabel("Win32"), "Alt");
  assert.equal(landingShortcutModifierLabel("Linux x86_64"), "Alt");
});

test("landing page exposes direct Create and Brain first-run CTAs", () => {
  const markup = renderToStaticMarkup(
    createElement(LandingPage, {
      disabled: false,
      status: "Ready",
      onModeSelect: () => undefined,
      onPromptSubmit: async () => undefined,
      onQuickNote: async () => undefined,
    }),
  );

  assert.match(markup, /Start with Create/);
  assert.match(markup, /data-testid="landing-create-start"/);
  assert.match(markup, /Start with your Brain/);
  assert.match(markup, /Alt|⌥/);
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

  assert.match(markup, /Start Create/);
  assert.match(markup, /data-testid="landing-yc-demo-fixture"/);
  assert.doesNotMatch(markup, /Build with Penny/);
});

test("landing Create prompt detector recognizes the narrated YC demo prompt", () => {
  assert.equal(isYcDemoCreatePrompt(pennyYcCreatePrompt), true);
  assert.equal(isYcDemoCreatePrompt("Build a quiet weekly planning view."), false);
});
