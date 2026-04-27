import {
  BrainSeedInputSchema,
  BrainSeedOutputSchema,
  BrainSeedValidationError,
  flattenIssues,
  type BrainSeedInput,
  type BrainSeedOutput,
} from "./schema.ts";
import { createDefaultBrainSeedProvider, type BrainSeedProvider } from "./providers.ts";

export async function generateBrainSeed(
  input: unknown,
  options: { provider?: BrainSeedProvider } = {},
): Promise<BrainSeedOutput> {
  const normalizedInput = parseBrainSeedInput(input);
  const provider = options.provider ?? createDefaultBrainSeedProvider();
  const rawOutput = await provider.generate(normalizedInput);

  return parseBrainSeedOutput(rawOutput);
}

export function parseBrainSeedInput(input: unknown): BrainSeedInput {
  const parsed = BrainSeedInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new BrainSeedValidationError("Brain seed input failed validation.", flattenIssues(parsed.error));
  }

  return parsed.data;
}

export function parseBrainSeedOutput(output: unknown): BrainSeedOutput {
  const parsed = BrainSeedOutputSchema.safeParse(output);

  if (!parsed.success) {
    throw new BrainSeedValidationError("Brain seed output failed validation.", flattenIssues(parsed.error));
  }

  return parsed.data;
}

export type { BrainSeedInput, BrainSeedOutput } from "./schema.ts";
export { BrainSeedOutputSchema, BrainSeedValidationError } from "./schema.ts";
export {
  BrainSeedProviderError,
  buildBrainSeedPrompt,
  createDefaultBrainSeedProvider,
  createHeuristicBrainSeedProvider,
  createXaiBrainSeedProvider,
  type BrainSeedProvider,
} from "./providers.ts";
