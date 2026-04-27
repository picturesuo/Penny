import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel } from "ai";
import { SeedProviderSchema, type BrainSeedInput, type BrainSeedOutput, type SeedProviderOutput } from "./schema.ts";

export const defaultXaiBrainSeedModel = "grok-4.20-reasoning";

const brainSeedOutputSpec = Output.object<SeedProviderOutput>({
  schema: SeedProviderSchema,
  name: "penny_brain_seed",
  description: "Penny's first-loop seed extraction with claims, assumption edges, exploration paths, and a challenge preview.",
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
    "- firstChallenge.failureType must be one of weak_evidence, missing_counterargument, shaky_assumption, analogy_break, dependency_risk, unaddressed_precedent, premise_rejection, definition_failure.",
    "- learnCandidates must include contextual terms that could confuse the user inside this idea.",
    "- Do not return moves. Penny creates immutable Moves locally after persistence.",
    "- Do not return artifacts. Penny compiles artifacts later from actual session state.",
    "",
    "Quality bar:",
    "- Return at least 3 hidden assumptions specific to the user's raw idea, not generic implementation advice.",
    "- Return at least 6 exploration paths that help the user decide what to inspect next in Brain.",
    "- The challenge should name the weakest load-bearing assumption and pressure it directly.",
    "- Keep the output compact enough for a first session.",
    "",
    `Raw idea: ${input.rawIdea}`,
  ].join("\n");
}

function buildHeuristicSeed(input: BrainSeedInput): BrainSeedOutput {
  const idea = input.rawIdea.trim();
  const sessionId = input.sessionId ?? "00000000-0000-4000-8000-000000000001";
  const focusTerm = extractFocusTerm(idea);
  const learnTerm = extractLearnTerm(idea);
  const assumptionOne =
    `The claim "${idea}" names a real study bottleneck rather than a vague product benefit.`;
  const assumptionTwo =
    `The proposed assistant can reduce ${focusTerm} by structuring attention, choices, and next steps instead of adding more material to process.`;
  const assumptionThree =
    `Lower ${focusTerm} will improve learning outcomes enough for the user to notice and trust the system.`;

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
        text: assumptionOne,
        confidence: 55,
        pressure: "high",
        whyItMatters: "If the input is only a broad slogan, the map will look useful while hiding the real mechanism.",
      },
      {
        id: "claim.assumption.2",
        kind: "assumption",
        text: assumptionTwo,
        confidence: 50,
        pressure: "high",
        whyItMatters: "If the assistant adds more decisions or explanations, it can increase the exact burden it claims to reduce.",
      },
      {
        id: "claim.assumption.3",
        kind: "assumption",
        text: assumptionThree,
        confidence: 48,
        pressure: "medium",
        whyItMatters: "If reduced load does not change retention, confidence, or study behavior, the product benefit is cosmetic.",
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
          text: assumptionOne,
          confidence: 55,
        },
        {
          id: "claim.assumption.2",
          kind: "assumption",
          text: assumptionTwo,
          confidence: 50,
        },
        {
          id: "claim.assumption.3",
          kind: "assumption",
          text: assumptionThree,
          confidence: 48,
        },
      ],
      edges: [
        {
          id: "edge.seed.assumption.1",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.1",
          kind: "depends_on",
          label: "depends on the raw idea naming a real bottleneck",
        },
        {
          id: "edge.seed.assumption.2",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.2",
          kind: "depends_on",
          label: `depends on the assistant reducing ${focusTerm}`,
        },
        {
          id: "edge.seed.assumption.3",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.3",
          kind: "depends_on",
          label: "depends on reduced load improving learning outcomes",
        },
      ],
    },
    explorationPaths: [
      {
        id: "path.define-load",
        title: `Define ${focusTerm}`,
        prompt: `What exactly counts as ${focusTerm} in the user's study session, and how would the user recognize it dropping?`,
        expectedValue: "Turns a broad benefit into an inspectable claim.",
      },
      {
        id: "path-find-burden",
        title: "Find the burden source",
        prompt: "Is the load coming from choosing what to study, holding context in memory, judging confidence, or translating feedback into action?",
        expectedValue: "Identifies which claim the product has to prove first.",
      },
      {
        id: "path-mechanism",
        title: "Name the reduction mechanism",
        prompt: "What does the assistant remove or simplify: options, reminders, explanations, feedback loops, or context switching?",
        expectedValue: "Prevents the idea from relying on a vague AI improvement claim.",
      },
      {
        id: "path-counterexample",
        title: "Find the overload counterexample",
        prompt: "Where could an AI study assistant increase load by producing more suggestions, explanations, or notifications?",
        expectedValue: "Surfaces the weakest version before building around it.",
      },
      {
        id: "path-measure",
        title: "Choose the proof signal",
        prompt: "What observable signal would prove reduced load: faster recall, fewer abandoned sessions, better quiz performance, or lower self-reported effort?",
        expectedValue: "Connects the claim to a falsifiable outcome.",
      },
      {
        id: "path-alternative",
        title: "Compare the non-AI alternative",
        prompt: "Could a checklist, spaced repetition flow, or teacher-created guide reduce the same load with less risk?",
        expectedValue: "Tests whether AI is necessary for the value proposition.",
      },
    ],
    keyInsight: `The load-bearing question is whether the assistant can reduce ${focusTerm} without creating a new layer of work.`,
    firstChallenge: {
      targetClaimId: "claim.assumption.1",
      failureType: "definition_failure",
      weakestPart: `The idea does not yet define ${focusTerm} tightly enough to prove reduction.`,
      challenge: `Defend what ${focusTerm} means here. If the load is really motivation, poor materials, or weak feedback rather than mental effort, revise the seed claim before building the assistant around it.`,
      responseOptions: ["Defend", "Revise", "Absorb"],
    },
    learnCandidates: [
      {
        id: "learn.cognitive-load",
        claimId: "claim.assumption.1",
        term: learnTerm,
        whyItMatters: `The seed idea relies on ${learnTerm} being concrete enough to challenge and measure.`,
        unblockExplanation: `${capitalize(learnTerm)} is the mental effort needed to process a task. In this idea, Penny should ask what part of studying consumes that effort before assuming AI reduces it.`,
      },
    ],
  };
}

function extractFocusTerm(idea: string): string {
  const reductionMatch = /\breduces?\s+(.+)$/i.exec(idea.trim());

  if (reductionMatch?.[1]?.trim()) {
    return reductionMatch[1].trim().replace(/[.?!]+$/, "").toLowerCase();
  }

  return "the user's cognitive load";
}

function extractLearnTerm(idea: string): string {
  if (/\bcognitive load\b/i.test(idea)) {
    return "cognitive load";
  }

  return extractFocusTerm(idea);
}

function capitalize(value: string): string {
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;
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
