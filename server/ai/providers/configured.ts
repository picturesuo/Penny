import { createMockAiProvider } from "./mock.ts";
import { openAIProvider } from "./openai.ts";
import type { AiProvider } from "./types.ts";

export type AIProviderEnvironment = Record<string, string | undefined>;

export function createConfiguredAiProvider(env: AIProviderEnvironment = process.env): AiProvider {
  if (hasOpenAIKey(env)) {
    return openAIProvider;
  }

  return createMockAiProvider();
}

export function hasOpenAIKey(env: AIProviderEnvironment = process.env): boolean {
  return typeof env.OPENAI_API_KEY === "string" && env.OPENAI_API_KEY.trim().length > 0;
}
