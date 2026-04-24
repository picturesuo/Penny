import { createHash } from "node:crypto";

import { AI_OPERATION_NAMES, type AiOperationName } from "./operation-names.ts";

export type PromptVersionSeedRecord = {
  operation: AiOperationName;
  version: "v1";
  promptHash: string;
  promptText: string;
  outputSchemaJson: {
    additionalProperties: false;
    properties: Readonly<Record<string, unknown>>;
    required: readonly string[];
    type: "object";
  };
};

const BASE_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["result", "confidence", "notes"],
  properties: {
    result: { type: "object" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    notes: { type: "array", items: { type: "string" } },
  },
} as const;

function toPromptText(operation: AiOperationName) {
  return [
    `Penny AI operation: ${operation}`,
    "Use only backend-provided workspace context.",
    "Return structured JSON that matches the registered output schema.",
    "Do not write directly to source-of-truth tables or emit events.",
  ].join("\n");
}

function hashPrompt(operation: AiOperationName, version: string, promptText: string) {
  return createHash("sha256").update(`${operation}:${version}:${promptText}`).digest("hex");
}

export const PROMPT_VERSION_SEED_RECORDS: PromptVersionSeedRecord[] = AI_OPERATION_NAMES.map((operation) => {
  const version = "v1";
  const promptText = toPromptText(operation);

  return {
    operation,
    version,
    promptText,
    promptHash: hashPrompt(operation, version, promptText),
    outputSchemaJson: BASE_OUTPUT_SCHEMA,
  };
});
