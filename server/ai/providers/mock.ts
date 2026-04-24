import type { AiProvider, AiProviderRequest, AiProviderResponse } from "./types.ts";

export type MockAiProviderOutputFactory = (request: AiProviderRequest, callIndex: number) => unknown;

export type MockAiProviderOptions = {
  output?: unknown | MockAiProviderOutputFactory;
  providerName?: string;
  text?: string | null;
};

export type MockAiProviderCall = {
  callIndex: number;
  request: AiProviderRequest;
};

export class MockAiProvider implements AiProvider {
  readonly name: string;

  #calls: MockAiProviderCall[] = [];
  #output: unknown | MockAiProviderOutputFactory;
  #text: string | null;

  constructor(options: MockAiProviderOptions = {}) {
    this.name = options.providerName ?? "mock";
    this.#output = options.output;
    this.#text = options.text ?? null;
  }

  get calls(): readonly MockAiProviderCall[] {
    return this.#calls;
  }

  async invokeStructured(request: AiProviderRequest): Promise<AiProviderResponse> {
    const callIndex = this.#calls.length;
    this.#calls.push({ callIndex, request });

    const json = this.resolveOutput(request, callIndex);
    const text = this.#text ?? JSON.stringify(json);

    return {
      cost: {
        currency: "USD",
        totalUsd: 0,
      },
      json,
      output: json,
      raw: {
        callIndex,
        provider: this.name,
        schemaName: request.schemaName,
      },
      stopReason: "mock",
      text,
      usage: estimateUsage(request, text),
    };
  }

  private resolveOutput(request: AiProviderRequest, callIndex: number): unknown {
    if (typeof this.#output === "function") {
      return this.#output(request, callIndex);
    }

    if (this.#output !== undefined) {
      return this.#output;
    }

    return buildDemoOutput(request, callIndex);
  }
}

export function createMockAiProvider(options?: MockAiProviderOptions): MockAiProvider {
  return new MockAiProvider(options);
}

function buildDemoOutput(request: AiProviderRequest, callIndex: number): unknown {
  const normalizedSchemaName = normalizeSchemaName(request.schemaName);
  const subject = extractSubject(request.userPrompt);
  const title = toTitle(subject);

  if (normalizedSchemaName === "capturethought") {
    return {
      thought: {
        title,
        summary: `Demo capture: ${sentence(subject)}`,
      },
      claims: [
        {
          text: `Penny should pressure-test whether "${trimForSentence(subject)}" is true before treating it as a core claim.`,
          confidenceBps: 8100,
          rationale: "The mock provider turns the captured thought into a reviewable claim candidate.",
        },
        {
          text: "Useful demo output should stay deterministic so local acceptance flows are repeatable.",
          confidenceBps: 7600,
          rationale: "The provider is running without a live model key.",
        },
      ],
    };
  }

  if (normalizedSchemaName === "generatechallengecritique" || normalizedSchemaName === "challengecritique") {
    return {
      summary: `The claim needs clearer evidence before Penny should increase confidence in "${trimForSentence(subject)}".`,
      strongestCounterargument:
        "The observed signal may be caused by selection bias, manual founder effort, or a narrow pilot context rather than the claim itself.",
      assumptions: [
        "The current evidence represents the broader target audience.",
        "The outcome would persist without extra manual intervention.",
      ],
      failureModes: [
        "The claim works only for the highest-intent users.",
        "A missing counterexample reverses the conclusion once tested.",
      ],
      followUpQuestions: [
        "What is the fastest experiment that could disprove this claim?",
        "Which user segment would be the first place this breaks?",
      ],
      suggestedConfidenceBps: 5400,
      uncertaintyNote: "This is deterministic mock critique data for local demo flows, not a live model judgment.",
    };
  }

  if (normalizedSchemaName === "challengeidea") {
    return {
      strongestObjection: "The idea may be directionally right but lacks a concrete falsification test.",
      hiddenAssumption: "The same evidence standard applies across users, contexts, and time horizons.",
      counterexample: "Find one adjacent case where the proposed idea sounds plausible but fails under real constraints.",
      betterVersion: `A stronger version would say: "${sentence(subject)} This is most likely true when the audience, constraint, and exception case are explicit."`,
      confidenceQuestion: `What evidence would lower your confidence in "${trimForSentence(subject)}" by at least 20 points?`,
    };
  }

  if (normalizedSchemaName === "extractclaims") {
    return {
      confidence: 0.84,
      notes: ["Extracted from deterministic mock provider output."],
      result: {
        claims: [
          {
            text: `The key claim to test is: ${sentence(subject)}`,
            confidenceBps: 8200,
          },
        ],
      },
    };
  }

  if (normalizedSchemaName === "suggestconnections") {
    return {
      confidence: 0.78,
      notes: ["Mock connection suggestions use stable demo relationships."],
      result: {
        suggestions: [
          {
            targetId: `demo-related-${callIndex + 1}`,
            relation: "supports",
            confidenceBps: 7800,
            reason: "The candidate appears to share the same product-risk theme.",
          },
          {
            targetId: `demo-tension-${callIndex + 1}`,
            relation: "related",
            confidenceBps: 6900,
            reason: "The candidate may expose a useful challenge path.",
          },
        ],
      },
    };
  }

  if (normalizedSchemaName === "detectcontradictions") {
    return {
      confidence: 0.73,
      notes: ["Mock contradiction detection is illustrative only."],
      result: {
        contradictions: [
          {
            summary: "One claim assumes the behavior scales, while another suggests it depends on manual effort.",
            severity: "medium",
          },
        ],
      },
    };
  }

  if (normalizedSchemaName === "explainblocker") {
    return {
      confidence: 0.8,
      notes: ["Deterministic blocker explanation."],
      result: {
        blocker: "The next decision is unclear because the claim has not been tied to a falsifiable test.",
        explanation: "Penny needs the claim, the evidence threshold, and the first counterexample before it can move confidently.",
        nextStep: "Write one experiment that would make the claim less likely.",
      },
    };
  }

  if (normalizedSchemaName === "summarizemap") {
    return {
      confidence: 0.86,
      notes: ["Stable local summary from the mock provider."],
      result: {
        title,
        summary: `This map is currently centered on "${trimForSentence(subject)}" and should next identify evidence, risks, and contradiction checks.`,
        highlights: [
          "One central claim is ready for Challenge mode.",
          "The next useful action is to attach a falsifiable test.",
        ],
        openQuestions: [
          "Which assumption carries the most risk?",
          "What observation would change confidence fastest?",
        ],
      },
    };
  }

  return {
    confidence: 0.82,
    notes: ["Deterministic mock response for local demo use."],
    result: {
      model: request.model,
      schemaName: request.schemaName,
      subject,
    },
  };
}

function normalizeSchemaName(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function extractSubject(userPrompt: string): string {
  const parsed = tryParseJson(userPrompt);
  const fromJson = findLikelySubject(parsed);

  if (fromJson) {
    return fromJson;
  }

  const compact = userPrompt.replace(/\s+/g, " ").trim();
  return compact || "the current Penny idea";
}

function findLikelySubject(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findLikelySubject(item);

      if (found) {
        return found;
      }
    }

    return null;
  }

  const record = value as Record<string, unknown>;
  const direct =
    readString(record.text) ??
    readString(record.claimText) ??
    readString(record.summary) ??
    readString(record.title) ??
    readString(record.userPrompt);

  if (direct) {
    return direct;
  }

  for (const key of ["input", "claim", "context", "target", "thought"]) {
    const found = findLikelySubject(record[key]);

    if (found) {
      return found;
    }
  }

  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toTitle(value: string): string {
  const words = trimForSentence(value)
    .replace(/[^a-z0-9\s-]/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);

  if (words.length === 0) {
    return "Penny Demo Thought";
  }

  return words.map((word) => word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

function trimForSentence(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= 120) {
    return compact;
  }

  return `${compact.slice(0, 117).trim()}...`;
}

function sentence(value: string): string {
  const trimmed = trimForSentence(value);
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function estimateUsage(request: AiProviderRequest, text: string) {
  const inputTokens = estimateTokens(`${request.systemPrompt}\n${request.userPrompt}`);
  const outputTokens = estimateTokens(text);

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function estimateTokens(value: string): number {
  const trimmed = value.trim();

  if (!trimmed) {
    return 0;
  }

  return Math.max(1, Math.ceil(trimmed.length / 4));
}
