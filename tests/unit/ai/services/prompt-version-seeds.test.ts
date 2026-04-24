import assert from "node:assert/strict";
import test from "node:test";

import { AI_OPERATION_NAMES } from "../../../../server/ai/services/operation-names.ts";
import { PROMPT_VERSION_SEED_RECORDS } from "../../../../server/ai/services/prompt-version-seeds.ts";

test("prompt version seeds include one v1 record for every MVP AI operation", () => {
  assert.equal(PROMPT_VERSION_SEED_RECORDS.length, AI_OPERATION_NAMES.length);
  assert.deepEqual(
    PROMPT_VERSION_SEED_RECORDS.map((record) => record.operation),
    AI_OPERATION_NAMES,
  );

  for (const record of PROMPT_VERSION_SEED_RECORDS) {
    assert.equal(record.version, "v1");
    assert.match(record.promptHash, /^[a-f0-9]{64}$/);
    assert.match(record.promptText, new RegExp(record.operation));
    assert.equal(record.outputSchemaJson.type, "object");
    assert.deepEqual(record.outputSchemaJson.required, ["result", "confidence", "notes"]);
  }
});

test("prompt version seed hashes are unique", () => {
  const hashes = new Set(PROMPT_VERSION_SEED_RECORDS.map((record) => record.promptHash));

  assert.equal(hashes.size, PROMPT_VERSION_SEED_RECORDS.length);
});
