import {
  BrainSeedInputSchema,
  BrainSeedValidationError,
  SeedProviderSchema,
  SeedStrictSchema,
  flattenIssues,
  type BrainSeedInput,
  type BrainSeedOutput,
} from "./schema.ts";
import { createDefaultBrainSeedProvider, type BrainSeedProvider } from "./providers.ts";
import { requireRecordedBrainRun, type BrainRunGuardOptions } from "./brain-run-guard.ts";

export async function generateBrainSeed(
  input: unknown,
  options: { provider?: BrainSeedProvider } & BrainRunGuardOptions = {},
): Promise<BrainSeedOutput> {
  requireRecordedBrainRun("brain.seed", options);

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
  const providerParsed = SeedProviderSchema.safeParse(output);

  if (!providerParsed.success) {
    throw new BrainSeedValidationError("Brain seed provider output failed validation.", flattenIssues(providerParsed.error));
  }

  const strictParsed = SeedStrictSchema.safeParse(providerParsed.data);

  if (!strictParsed.success) {
    throw new BrainSeedValidationError("Brain seed output failed strict validation.", flattenIssues(strictParsed.error));
  }

  return strictParsed.data;
}

export type { BrainSeedInput, BrainSeedOutput } from "./schema.ts";
export { BrainSeedOutputSchema, BrainSeedValidationError, SeedProviderSchema, SeedStrictSchema } from "./schema.ts";
export {
  BrainSeedProviderError,
  buildBrainSeedPrompt,
  buildBrainSeedSystemPrompt,
  createAiSdkXaiBrainSeedProvider,
  createDefaultBrainSeedProvider,
  createHeuristicBrainSeedProvider,
  createXaiBrainSeedProvider,
  defaultXaiBrainSeedModel,
  resolveXaiBrainSeedModel,
  type BrainSeedGenerateText,
  type BrainSeedProvider,
} from "./providers.ts";
