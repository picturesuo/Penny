import test from "node:test";

test.todo("GET routes do not mutate", () => {
  /*
   * Arrange a DB-backed session with known Move and ClaimVersion counts.
   *
   * Exercise GET/read-only Thinking Mode routes, including invalid method
   * guards for mutation routes such as `/autopilot/tick`.
   *
   * Assert Move, ClaimVersion, Edge, and Artifact counts are unchanged.
   */
});

test.todo("POST /autopilot/tick creates candidate", () => {
  /*
   * Arrange a persisted Thinking Mode session with claims, assumptions, and
   * edges created from a raw idea.
   *
   * POST the Thinking Mode Autopilot tick command.
   *
   * Assert a `next_move_recomputed` Move is created, candidate rows are
   * persisted with target and rationale, and no claim text or confidence
   * changes.
   */
});

test.todo("start focus creates autopilot_focus_started", () => {
  /*
   * Arrange a persisted Autopilot suggestion and simulate the user accepting
   * the suggested focus with "Go there".
   *
   * Assert Penny records an `autopilot_focus_started` Move that references the
   * suggestion Move and selected target. This Move kind is not implemented yet;
   * this skeleton fixes the desired contract for the next wave.
   */
});

test.todo("manual node click creates manual_node_selected", () => {
  /*
   * Arrange an active Autopilot suggestion.
   *
   * Simulate a manual map node click through the service or route boundary.
   *
   * Assert a `manual_node_selected` Move is appended, Autopilot is paused, and
   * the selected claim becomes the explicit focus without mutating truth.
   */
});
