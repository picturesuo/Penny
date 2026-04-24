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

    return {
      confidence: 1,
      notes: ["Mock AI provider response."],
      result: {
        model: request.model,
        schemaName: request.schemaName,
      },
    };
  }
}

export function createMockAiProvider(options?: MockAiProviderOptions): MockAiProvider {
  return new MockAiProvider(options);
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
