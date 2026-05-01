import assert from "node:assert/strict";
import test from "node:test";
import { navItems } from "../src/components/Header";

test("smoke: main nav exposes Learn, Brain, and Check only", () => {
  assert.deepEqual([...navItems], ["Learn", "Brain", "Check"]);
  assert.equal(navItems.includes("Learn"), true);
  assert.equal(navItems.includes("Brain"), true);
  assert.equal(navItems.includes("Check"), true);
  assert.equal(navItems.includes("Search" as (typeof navItems)[number]), false);
  assert.equal(navItems.includes("Settings" as (typeof navItems)[number]), false);
});
