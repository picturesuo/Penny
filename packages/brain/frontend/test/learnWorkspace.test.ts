import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LearnWorkspace } from "../src/components/LearnWorkspace";

test("LearnWorkspace first screen shows the idea drop, next move, and clean save choices", () => {
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

  assert.match(markup, /Start with the raw idea/);
  assert.match(markup, /Next move/);
  assert.match(markup, /Save to Brain/);
  assert.match(markup, /Keep in Recents/);
  assert.match(markup, /Use web sources/);
  assert.doesNotMatch(markup, /Search\/Settings|Settings|Makes Cents|MAKES CENTS/);
});
