import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LearnWorkspace } from "../src/components/LearnWorkspace";

test("LearnWorkspace first screen opens directly to the lesson view", () => {
  const markup = renderToStaticMarkup(
    createElement(LearnWorkspace, {
      documentsData: null,
      selectedDocument: null,
      data: null,
      autopilot: null,
      recents: [],
      focusedClaimId: null,
      focusNode: null,
      relatedBrainSearch: null,
      status: "Ready",
      isThinking: false,
      async onSeed() {},
      async onKeepRecent() {},
      onSelectDocument() {},
      onOpenBrain() {},
      onOpenCanvas() {},
      onOpenCheck() {},
      onOpenVerify() {},
      async onSearchBrainRelated() {
        return { available: false, results: [], meta: { query: "", resultCount: 0 } };
      },
    }),
  );

  assert.match(markup, /LEARNING PATH/);
  assert.match(markup, /YOUR GOAL/);
  assert.match(markup, /CORE IDEA/);
  assert.match(markup, /FULLY FLESHED-OUT EXAMPLE/);
  assert.match(markup, /ASK PENNY/);
  assert.match(markup, /1\.1/);
  assert.match(markup, /1\.2/);
  assert.match(markup, /1\.3/);
  assert.match(markup, /Enter forward \/ Esc back/);
  assert.doesNotMatch(markup, /What shall we think through/);
  assert.doesNotMatch(markup, /Save to Brain/);
  assert.doesNotMatch(markup, /Search\/Settings|Settings|Makes Cents|MAKES CENTS/);
});
