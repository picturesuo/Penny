import test from "node:test";

test.todo("ranking chooses the founder willingness-to-pay assumption", () => {
  /*
   * Arrange a deterministic graph snapshot for a founder seed:
   * - primary claim: Penny can sell to founders who need sharper thinking.
   * - assumption: founders will pay for explicit reasoning and challenge loops.
   * - lower-leverage nodes: UI polish, naming, and broad productivity positioning.
   *
   * Assert the next-move engine ranks the willingness-to-pay assumption first
   * and returns a rationale that points to market-risk leverage, not generic
   * curiosity or graph recency.
   */
});

test.todo("open challenge returns resume_open_challenge", () => {
  /*
   * Arrange a session with an unanswered challenge edge and other available
   * exploration candidates.
   *
   * Assert the engine returns action `resume_open_challenge`, targets the open
   * challenge, and explains that unresolved challenge work outranks fresh
   * exploration.
   */
});
