import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AskPennyRenderedText, tokenizeMath } from "../src/components/AskPennyRenderedText";

test("Ask Penny text renderer detects inline and display math", () => {
  assert.deepEqual(tokenizeMath("Use $F=ma$ and $$E=mc^2$$."), [
    { kind: "text", value: "Use " },
    { kind: "math", value: "F=ma", display: false },
    { kind: "text", value: " and " },
    { kind: "math", value: "E=mc^2", display: true },
    { kind: "text", value: "." },
  ]);
});

test("Ask Penny text renderer formats common LaTeX math", () => {
  const markup = renderToStaticMarkup(
    createElement(AskPennyRenderedText, {
      text: "Compute $$\\frac{1}{2}mv^2 + \\sqrt{x_0} + \\theta^2$$.",
    }),
  );

  assert.match(markup, /ask-penny-math is-display/);
  assert.match(markup, /ask-penny-frac/);
  assert.match(markup, /ask-penny-root/);
  assert.match(markup, /<sub/);
  assert.match(markup, /<sup/);
  assert.match(markup, /is-theta/);
});
