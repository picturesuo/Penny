import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CreateOptionBoard, CreateOptionDetailsDrawer } from "../src/components/CheckWorkspace";
import type { CandidateOption } from "../src/types/brain";

test("CreateOptionBoard shows memory and source grounding counts on option cards", () => {
  const markup = renderToStaticMarkup(
    createElement(CreateOptionBoard, {
      options: [memoryGroundedOption(), contextLightOption()],
      selectedOptionIds: [],
      busy: false,
      onToggleOption: () => undefined,
    }),
  );

  assert.match(markup, /2 memories/);
  assert.match(markup, /2 sources/);
  assert.match(markup, /0 memories/);
  assert.match(markup, /1 sources/);
  assert.match(markup, /Context-light/);
  assert.match(markup, /Details/);
});

test("CreateOptionDetailsDrawer renders rationale, memories, sources, and grounding details", () => {
  const markup = renderToStaticMarkup(
    createElement(CreateOptionDetailsDrawer, {
      option: memoryGroundedOption(),
      onClose: () => undefined,
    }),
  );

  assert.match(markup, /Why suggested/);
  assert.match(markup, /Memories used/);
  assert.match(markup, /Sources used/);
  assert.match(markup, /Grounded/);
  assert.match(markup, /Inferred/);
  assert.match(markup, /Founder workflow notes/);
  assert.match(markup, /Prefers source-backed cards/);
});

function memoryGroundedOption(): CandidateOption {
  return {
    id: "create-option-personal",
    lens: "Personal",
    title: "Make Create use remembered founder taste",
    oneLine: "Ground options in private memory.",
    rationale: "Use remembered preferences as constraints rather than inventing context.",
    nextMove: "Keep source-backed cards visible.",
    risks: ["Could imply more memory than Penny has."],
    memoryUsed: [
      {
        id: "memory-1",
        label: "Preference: source-backed cards",
        kind: "preference",
        summary: "Prefers source-backed cards over generic suggestions.",
      },
      {
        id: "memory-2",
        label: "Project: founder workflow",
        kind: "brain",
        summary: "Penny Create should help founders shape startup ideas.",
      },
    ],
    sourcesUsed: [
      {
        id: "source-1",
        label: "Founder workflow notes",
        kind: "source",
        excerpt: "I prefer source-backed cards over generic suggestions.",
        sourceRange: "chunk 1",
      },
      {
        id: "source-rough",
        label: "Rough idea",
        kind: "rough_idea",
        excerpt: "Build memory-grounded Create.",
      },
    ],
    scores: { intentMatch: 90, buildability: 80, value: 85, novelty: 70, risk: 30 },
  };
}

function contextLightOption(): CandidateOption {
  return {
    ...memoryGroundedOption(),
    id: "create-option-practical",
    lens: "Practical",
    title: "Ship the smallest Create loop",
    rationale: "Context-light: no imported Penny memory matched this idea.",
    memoryUsed: [],
    sourcesUsed: [
      {
        id: "source-rough",
        label: "Rough idea",
        kind: "rough_idea",
        excerpt: "Build memory-grounded Create.",
      },
    ],
  };
}
