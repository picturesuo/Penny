import assert from "node:assert/strict";
import test from "node:test";
import { formatErrorMessage } from "../src/App";

test("formatErrorMessage hides raw local database setup errors", () => {
  assert.equal(
    formatErrorMessage(new Error("DATABASE_URL is required to create the Penny database client.")),
    "Local demo mode",
  );
  assert.equal(formatErrorMessage(new Error("ENOTFOUND invalid.invalid")), "Local demo mode");
  assert.equal(formatErrorMessage(new Error("Create ready")), "Create ready");
});
