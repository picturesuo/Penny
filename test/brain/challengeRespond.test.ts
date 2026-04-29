import test from "node:test";

test.todo("Defend creates user_defended", () => {
  /*
   * Arrange an open challenge edge against an assumption.
   *
   * POST a Defend response with user reasoning.
   *
   * Assert a `user_defended` Move is appended with the challenge edge, target
   * claim, critique claim, and user reasoning. Assert the claim text and
   * ClaimVersion chain are unchanged.
   */
});

test.todo("Revise creates new ClaimVersion and claim_revised", () => {
  /*
   * Arrange an open challenge edge against the current ClaimVersion.
   *
   * POST a Revise response with revised claim text.
   *
   * Assert the previous ClaimVersion is preserved as old, a new current
   * ClaimVersion is created, and a `claim_revised` Move links the old version,
   * new version, target claim, and challenge edge.
   */
});

test.todo("Absorb creates critique_absorbed", () => {
  /*
   * Arrange an open challenge edge against a claim the user is not ready to
   * revise.
   *
   * POST an Absorb response with reasoning.
   *
   * Assert a `critique_absorbed` Move is appended and the challenge edge is
   * marked as an acknowledged vulnerability without changing claim text.
   */
});

test.todo("Challenge Brief includes what changed", () => {
  /*
   * Arrange a completed session containing one defended challenge, one revised
   * claim, and one absorbed critique.
   *
   * Generate the Challenge Brief artifact.
   *
   * Assert the artifact names what changed, what stayed defended, what remains
   * an acknowledged risk, and which ClaimVersion replaced the old text.
   */
});
