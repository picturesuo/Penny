import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel } from "ai";
import { BrainSeedAiOutputSchema, type BrainSeedAiOutput, type BrainSeedInput, type BrainSeedOutput } from "./schema.ts";

export const defaultXaiBrainSeedModel = "grok-4.20-reasoning";

const brainSeedOutputSpec = Output.object<BrainSeedAiOutput>({
  schema: BrainSeedAiOutputSchema,
  name: "penny_brain_seed",
  description: "Penny's first-loop seed extraction with claims, edges, moves, and artifacts.",
});

export type BrainSeedGenerateText = (request: {
  model: LanguageModel;
  system: string;
  prompt: string;
  output: typeof brainSeedOutputSpec;
  maxRetries: number;
  providerOptions: {
    xai: {
      reasoningEffort: "medium";
      store: false;
    };
  };
}) => Promise<{ output: unknown }>;

export type XaiBrainSeedProviderOptions = {
  generateText?: BrainSeedGenerateText;
};

export type BrainSeedProvider = {
  name: string;
  generate(input: BrainSeedInput): Promise<unknown>;
};

export class BrainSeedProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrainSeedProviderError";
  }
}

export function createDefaultBrainSeedProvider(env: Record<string, string | undefined> = process.env): BrainSeedProvider {
  if (env.XAI_API_KEY?.trim()) {
    return createXaiBrainSeedProvider(env);
  }

  return createHeuristicBrainSeedProvider();
}

export function createHeuristicBrainSeedProvider(): BrainSeedProvider {
  return {
    name: "heuristic",
    async generate(input) {
      return buildHeuristicSeed(input);
    },
  };
}

export function createXaiBrainSeedProvider(
  env: Record<string, string | undefined> = process.env,
  options: XaiBrainSeedProviderOptions = {},
): BrainSeedProvider {
  return createAiSdkXaiBrainSeedProvider(env, options);
}

export function createAiSdkXaiBrainSeedProvider(
  env: Record<string, string | undefined> = process.env,
  options: XaiBrainSeedProviderOptions = {},
): BrainSeedProvider {
  return {
    name: "xai",
    async generate(input) {
      const apiKey = env.XAI_API_KEY?.trim();

      if (!apiKey) {
        throw new BrainSeedProviderError("XAI_API_KEY is required for the xAI brain seed provider.");
      }

      const xai = createXai(createXaiSettings(apiKey, env));
      const callGenerateText = options.generateText ?? generateStructuredBrainSeed;

      try {
        const result = await callGenerateText({
          model: xai.responses(resolveXaiBrainSeedModel(env)),
          system: buildBrainSeedSystemPrompt(),
          prompt: buildBrainSeedPrompt(input),
          output: brainSeedOutputSpec,
          maxRetries: 1,
          providerOptions: {
            xai: {
              reasoningEffort: "medium",
              store: false,
            },
          },
        });

        return result.output;
      } catch (error) {
        if (error instanceof BrainSeedProviderError) {
          throw error;
        }

        throw new BrainSeedProviderError(`xAI brain seed request failed: ${formatUnknownError(error)}`);
      }
    },
  };
}

export function resolveXaiBrainSeedModel(env: Record<string, string | undefined> = process.env): string {
  return env.XAI_BRAIN_SEED_MODEL?.trim() || env.XAI_MODEL?.trim() || defaultXaiBrainSeedModel;
}

export function buildBrainSeedSystemPrompt(): string {
  return [
    "You are Penny, a controllable thinking instrument enhanced by AI.",
    "You are on the user's team, but you push them when their structure is weak.",
    "Extract hidden assumptions from the raw idea. Do not provide generic advice.",
    "Build a compact thought map from Claims and typed Edges.",
    "The first challenge must attack the load-bearing structure: the assumption whose failure would make the idea collapse or need major revision.",
    "Avoid generic startup, product, productivity, or AI-app platitudes.",
    "Do not invent citations, market facts, or external evidence.",
    "Return only the structured seed extraction.",
  ].join("\n");
}

export function buildBrainSeedPrompt(input: BrainSeedInput): string {
  const sessionId = resolveSeedSessionId(input);

  return [
    "Create Penny's first-loop seed extraction for this raw idea.",
    "",
    "Required IDs and values:",
    "- source.id must be source.raw_idea.",
    `- source.rawText must exactly equal: ${JSON.stringify(input.rawIdea.trim())}.`,
    `- session.id must be ${sessionId}.`,
    "- session.sourceId must be source.raw_idea.",
    "- session.status must be open.",
    "- seedClaim.id should be claim.seed.",
    "- Confidence values must be integer percentages from 0 to 100.",
    "- responseOptions must be exactly Defend, Revise, Absorb in that order.",
    "- artifacts must include one idea_map and one challenge_brief.",
    "- moves must include source.recorded, claim.created, edge.created, challenge.created, and artifact.created.",
    "",
    "Quality bar:",
    "- Hidden assumptions should be specific commitments underneath the user's idea, not generic implementation advice.",
    "- Exploration paths should help the user decide what to inspect next in Brain.",
    "- The challenge should name the weakest load-bearing assumption and pressure it directly.",
    "- Keep the output compact enough for a first session.",
    "",
    `Raw idea: ${input.rawIdea}`,
  ].join("\n");
}

function buildHeuristicSeed(input: BrainSeedInput): BrainSeedOutput {
  const idea = input.rawIdea.trim();
  const sessionId = input.sessionId ?? "00000000-0000-4000-8000-000000000001";

  return {
    source: {
      id: "source.raw_idea",
      rawText: idea,
    },
    session: {
      id: sessionId,
      sourceId: "source.raw_idea",
      status: "open",
    },
    seedClaim: {
      id: "claim.seed",
      kind: "belief",
      text: idea,
      confidence: 62,
    },
    assumptions: [
      {
        id: "claim.assumption.1",
        kind: "assumption",
        text: "The user's real bottleneck is weak thinking structure, not just missing information or motivation.",
        confidence: 55,
        pressure: "high",
        whyItMatters: "If the bottleneck is something else, Penny's map and challenge loop can feel clever without changing the user's work.",
      },
      {
        id: "claim.assumption.2",
        kind: "assumption",
        text: "A visible Idea Map plus Challenge Brief will be more useful than a conversational answer in the first session.",
        confidence: 50,
        pressure: "medium",
        whyItMatters: "If the user needs trust, examples, or evidence first, the MVP should not optimize only for fast structure.",
      },
    ],
    thoughtMap: {
      claims: [
        {
          id: "claim.seed",
          kind: "belief",
          text: idea,
          confidence: 62,
        },
        {
          id: "claim.assumption.1",
          kind: "assumption",
          text: "The user's real bottleneck is weak thinking structure, not just missing information or motivation.",
          confidence: 55,
        },
        {
          id: "claim.assumption.2",
          kind: "assumption",
          text: "A visible Idea Map plus Challenge Brief will be more useful than a conversational answer in the first session.",
          confidence: 50,
        },
      ],
      edges: [
        {
          id: "edge.seed.assumption.1",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.1",
          kind: "assumes",
          label: "depends on structure being the real bottleneck",
        },
        {
          id: "edge.seed.assumption.2",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.2",
          kind: "assumes",
          label: "depends on mapped structure beating conversational output",
        },
      ],
    },
    explorationPaths: [
      {
        id: "path.decompose",
        title: "Name the work the structure improves",
        prompt: "Where would this idea make a user's next real decision sharper, and where would it merely organize thoughts?",
        expectedValue: "Separates a real thinking instrument from a nicer note-taking surface.",
      },
      {
        id: "path.counterexample",
        title: "Find the failure despite engagement",
        prompt: "Where could a user enjoy the map and challenge but still leave without a usable artifact?",
        expectedValue: "Surfaces whether first-session structure actually changes the user's work.",
      },
    ],
    keyInsight: "The load-bearing question is whether Penny improves the user's thinking output, not whether it can produce an impressive AI response.",
    firstChallenge: {
      targetClaimId: "claim.assumption.1",
      weakestPart: "The idea assumes structure is the user's true constraint.",
      challenge: "Defend why weak structure is the bottleneck. If users already know what they believe but lack evidence, courage, or execution leverage, the first-loop map may not be the right wedge.",
      responseOptions: ["Defend", "Revise", "Absorb"],
    },
    moves: [
      {
        id: "move.source.recorded",
        kind: "source.recorded",
        summary: "Recorded the user's raw idea as the session source.",
        claimIds: [],
        edgeIds: [],
        artifactIds: [],
      },
      {
        id: "move.claim.created",
        kind: "claim.created",
        summary: "Created the seed claim and extracted hidden assumptions as claims.",
        claimIds: ["claim.seed", "claim.assumption.1", "claim.assumption.2"],
        edgeIds: [],
        artifactIds: [],
      },
      {
        id: "move.assumption.extracted",
        kind: "assumption.extracted",
        summary: "Marked the riskiest hidden assumptions for pressure-testing.",
        claimIds: ["claim.assumption.1", "claim.assumption.2"],
        edgeIds: [],
        artifactIds: [],
      },
      {
        id: "move.edge.created",
        kind: "edge.created",
        summary: "Connected the seed claim to its assumptions in the thought map.",
        claimIds: ["claim.seed", "claim.assumption.1", "claim.assumption.2"],
        edgeIds: ["edge.seed.assumption.1", "edge.seed.assumption.2"],
        artifactIds: [],
      },
      {
        id: "move.exploration.suggested",
        kind: "exploration.suggested",
        summary: "Suggested exploration directions that preserve structure over chat.",
        claimIds: ["claim.seed", "claim.assumption.1"],
        edgeIds: ["edge.seed.assumption.1"],
        artifactIds: [],
      },
      {
        id: "move.challenge.created",
        kind: "challenge.created",
        summary: "Challenged the weakest part and exposed Defend, Revise, and Absorb response paths.",
        claimIds: ["claim.assumption.1"],
        edgeIds: ["edge.seed.assumption.1"],
        artifactIds: [],
      },
      {
        id: "move.artifact.created",
        kind: "artifact.created",
        summary: "Created the Idea Map and Challenge Brief session artifacts.",
        claimIds: ["claim.seed", "claim.assumption.1", "claim.assumption.2"],
        edgeIds: ["edge.seed.assumption.1", "edge.seed.assumption.2"],
        artifactIds: ["artifact.idea_map", "artifact.challenge_brief"],
      },
    ],
    artifacts: [
      {
        id: "artifact.idea_map",
        kind: "idea_map",
        title: "Idea Map",
        summary: "A compact map of the seed claim, the bottleneck assumption, and the first-session artifact assumption.",
        claimIds: ["claim.seed", "claim.assumption.1", "claim.assumption.2"],
        edgeIds: ["edge.seed.assumption.1", "edge.seed.assumption.2"],
      },
      {
        id: "artifact.challenge_brief",
        kind: "challenge_brief",
        title: "Challenge Brief",
        summary: "The load-bearing bottleneck assumption, the first challenge, and the Defend / Revise / Absorb response options.",
        claimIds: ["claim.assumption.1"],
        edgeIds: ["edge.seed.assumption.1"],
      },
    ],
  };
}

async function generateStructuredBrainSeed(request: Parameters<BrainSeedGenerateText>[0]): Promise<{ output: unknown }> {
  const result = await generateText(request);

  return { output: result.output };
}

function resolveSeedSessionId(input: BrainSeedInput): string {
  return input.sessionId ?? "00000000-0000-4000-8000-000000000001";
}

function createXaiSettings(apiKey: string, env: Record<string, string | undefined>) {
  const baseURL = env.XAI_BASE_URL?.trim();

  if (!baseURL) {
    return { apiKey };
  }

  return { apiKey, baseURL: baseURL.replace(/\/+$/, "") };
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}
