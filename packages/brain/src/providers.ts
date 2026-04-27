import type { BrainSeedInput, BrainSeedOutput } from "./schema.ts";
import { brainSeedJsonSchema } from "./json-schema.ts";

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

export function createXaiBrainSeedProvider(env: Record<string, string | undefined> = process.env): BrainSeedProvider {
  return {
    name: "xai",
    async generate(input) {
      const apiKey = env.XAI_API_KEY?.trim();

      if (!apiKey) {
        throw new BrainSeedProviderError("XAI_API_KEY is required for the xAI brain seed provider.");
      }

      const model = env.XAI_BRAIN_SEED_MODEL?.trim() || env.XAI_MODEL?.trim();

      if (!model) {
        throw new BrainSeedProviderError("XAI_BRAIN_SEED_MODEL or XAI_MODEL is required for the xAI brain seed provider.");
      }

      const response = await fetch(`${resolveXaiBaseUrl(env)}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: buildBrainSeedPrompt(input),
          temperature: 0.2,
          text: {
            format: {
              type: "json_schema",
              name: "penny_brain_seed",
              schema: brainSeedJsonSchema,
              strict: true,
            },
          },
        }),
      });

      const payload = await readJsonResponse(response);

      if (!response.ok) {
        throw new BrainSeedProviderError(`xAI brain seed request failed with status ${response.status}: ${readProviderError(payload)}`);
      }

      return JSON.parse(extractXaiOutputText(payload));
    },
  };
}

export function buildBrainSeedPrompt(input: BrainSeedInput): string {
  return [
    "You are Penny, a controllable thinking instrument, not a chatbot.",
    "Turn the user's raw idea into a compact thinking structure.",
    "Extract hidden assumptions, create a small thought map, choose useful exploration directions, and challenge the weakest part.",
    "Return durable thinking history as claims, edges, moves, and artifacts.",
    "Do not invent citations or external facts. Return only valid JSON matching the requested schema.",
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
      status: "seeded",
    },
    seedClaim: {
      id: "claim.seed",
      kind: "belief",
      text: idea,
      confidence: 0.62,
    },
    assumptions: [
      {
        id: "claim.assumption.1",
        kind: "assumption",
        text: "The raw idea contains one central claim worth pressure-testing now.",
        confidence: 0.55,
        pressure: "high",
        whyItMatters: "If the idea is actually several claims, the first map can hide the weakest dependency.",
      },
      {
        id: "claim.assumption.2",
        kind: "assumption",
        text: "The user can act on a sharper version of this idea within the current session.",
        confidence: 0.5,
        pressure: "medium",
        whyItMatters: "Penny should create useful next thinking moves, not just summarize the input.",
      },
    ],
    thoughtMap: {
      claims: [
        {
          id: "claim.seed",
          kind: "belief",
          text: idea,
          confidence: 0.62,
        },
        {
          id: "claim.assumption.1",
          kind: "assumption",
          text: "The raw idea contains one central claim worth pressure-testing now.",
          confidence: 0.55,
        },
        {
          id: "claim.assumption.2",
          kind: "assumption",
          text: "The user can act on a sharper version of this idea within the current session.",
          confidence: 0.5,
        },
      ],
      edges: [
        {
          id: "edge.seed.assumption.1",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.1",
          kind: "assumes",
          label: "depends on this being the central pressure point",
        },
        {
          id: "edge.seed.assumption.2",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.2",
          kind: "assumes",
          label: "depends on there being an actionable next move",
        },
      ],
    },
    explorationPaths: [
      {
        id: "path.decompose",
        title: "Separate the claim from the bet",
        prompt: "What would need to be true for this idea to work, and which part is still only a guess?",
        expectedValue: "Turns a broad thought into claims that can be defended, revised, or absorbed.",
      },
      {
        id: "path.counterexample",
        title: "Find the counterexample",
        prompt: "Where would this idea fail even if the user is smart, motivated, and well resourced?",
        expectedValue: "Surfaces the weakest assumption before it becomes hidden product debt.",
      },
    ],
    keyInsight: "The fastest useful move is to expose the assumption that carries the most risk, not to expand the idea.",
    firstChallenge: {
      targetClaimId: "claim.assumption.1",
      weakestPart: "The input may be compressing multiple beliefs into one statement.",
      challenge: "Defend why this is the central claim. If it is not, revise the idea into separate claims before building around it.",
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
        summary: "A compact map of the seed claim, hidden assumptions, and typed assumption edges.",
        claimIds: ["claim.seed", "claim.assumption.1", "claim.assumption.2"],
        edgeIds: ["edge.seed.assumption.1", "edge.seed.assumption.2"],
      },
      {
        id: "artifact.challenge_brief",
        kind: "challenge_brief",
        title: "Challenge Brief",
        summary: "The weakest assumption, the first challenge, and the Defend / Revise / Absorb response options.",
        claimIds: ["claim.assumption.1"],
        edgeIds: ["edge.seed.assumption.1"],
      },
    ],
  };
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  const parsed: unknown = JSON.parse(text);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BrainSeedProviderError("xAI returned a non-object JSON response.");
  }

  return parsed as Record<string, unknown>;
}

function extractXaiOutputText(payload: Record<string, unknown>): string {
  const output = Array.isArray(payload.output) ? payload.output : [];

  for (const item of output) {
    if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "message") {
      continue;
    }

    const rawContent = (item as { content?: unknown }).content;
    const content = Array.isArray(rawContent) ? rawContent : [];

    for (const block of content) {
      if (block && typeof block === "object" && (block as { type?: unknown }).type === "output_text") {
        const text = (block as { text?: unknown }).text;

        if (typeof text === "string" && text.trim()) {
          return text;
        }
      }
    }
  }

  throw new BrainSeedProviderError("xAI response did not contain output_text.");
}

function readProviderError(payload: Record<string, unknown>): string {
  const error = payload.error;

  if (error && typeof error === "object" && !Array.isArray(error)) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return JSON.stringify(payload);
}

function resolveXaiBaseUrl(env: Record<string, string | undefined>): string {
  return (env.XAI_BASE_URL?.trim() || "https://api.x.ai/v1").replace(/\/+$/, "");
}
