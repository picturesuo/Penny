import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();

const requiredFolders = [
  "server/ai/providers",
  "server/ai/operations",
  "server/ai/prompts",
  "server/ai/schemas",
  "server/ai/routing",
  "server/ai/tracing",
] as const;

const representativeModules = [
  {
    folder: "server/ai/providers",
    modulePath: "server/ai/providers/anthropic.ts",
    exportName: "invokeAnthropic",
    exportType: "function",
  },
  {
    folder: "server/ai/operations",
    modulePath: "server/ai/operations/generateChallengeCritique.ts",
    exportName: "generateChallengeCritique",
    exportType: "function",
  },
  {
    folder: "server/ai/prompts",
    modulePath: "server/ai/prompts/generateChallengeCritique/v1.ts",
    exportName: "buildGenerateChallengeCritiquePrompt",
    exportType: "function",
  },
  {
    folder: "server/ai/schemas",
    modulePath: "server/ai/schemas/challengeCritique.ts",
    exportName: "GenerateChallengeCritiqueOutputSchema",
    exportType: "object",
  },
  {
    folder: "server/ai/routing",
    modulePath: "server/ai/routing/modelPolicy.ts",
    exportName: "selectModelForOperation",
    exportType: "function",
  },
  {
    folder: "server/ai/tracing",
    modulePath: "server/ai/tracing/langfuse.ts",
    exportName: "startAiTrace",
    exportType: "function",
  },
] as const;

test("required AI folders exist", () => {
  for (const folder of requiredFolders) {
    assert.equal(existsSync(resolve(projectRoot, folder)), true, `Missing required folder: ${folder}`);
  }
});

test("representative AI module imports compile for each required folder", async () => {
  for (const moduleInfo of representativeModules) {
    const moduleUrl = pathToFileURL(resolve(projectRoot, moduleInfo.modulePath)).href;
    const imported = await import(moduleUrl);

    assert.notEqual(imported[moduleInfo.exportName], undefined, `Missing export ${moduleInfo.exportName}`);
    assert.equal(typeof imported[moduleInfo.exportName], moduleInfo.exportType);
  }
});
