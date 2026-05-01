import assert from "node:assert/strict";
import test from "node:test";
import { navItems } from "../src/components/Header";

test("main nav exposes only implemented mode destinations", () => {
  assert.deepEqual([...navItems], ["Learn", "Check", "Brain"]);
  assert.equal(navItems.includes("Search" as (typeof navItems)[number]), false);
  assert.equal(navItems.includes("Settings" as (typeof navItems)[number]), false);
});
