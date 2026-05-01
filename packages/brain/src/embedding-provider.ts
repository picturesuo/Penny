export type EmbeddingVector = readonly number[];

export type EmbeddingProvider = {
  name: string;
  kind: "deterministic_mock" | "external";
  embed(texts: readonly string[]): Promise<readonly EmbeddingVector[]>;
};

export type ExternalEmbeddingClient = (texts: readonly string[]) => Promise<readonly EmbeddingVector[]>;

export type EmbeddingProviderOptions = {
  apiKey?: string | null;
  embed?: ExternalEmbeddingClient | null;
  dimensions?: number;
};

export function createEmbeddingProvider(options: EmbeddingProviderOptions = {}): EmbeddingProvider {
  const apiKey = options.apiKey?.trim();

  if (apiKey && options.embed) {
    return {
      name: "external_embedding_provider",
      kind: "external",
      async embed(texts) {
        const vectors = await options.embed?.(texts);

        return normalizeVectors(vectors ?? [], options.dimensions);
      },
    };
  }

  return createDeterministicEmbeddingProvider(options.dimensions);
}

export function createDeterministicEmbeddingProvider(dimensions = 64): EmbeddingProvider {
  return {
    name: "deterministic_mock_embedding_provider",
    kind: "deterministic_mock",
    async embed(texts) {
      return texts.map((text) => deterministicEmbedding(text, dimensions));
    },
  };
}

export function deterministicEmbedding(text: string, dimensions = 64): EmbeddingVector {
  const vector = Array.from({ length: Math.max(8, dimensions) }, () => 0);

  for (const term of termsFor(text)) {
    const index = positiveHash(term) % vector.length;
    const sign = positiveHash(`sign:${term}`) % 2 === 0 ? 1 : -1;

    vector[index] = (vector[index] ?? 0) + sign * (1 + Math.min(2, term.length / 10));
  }

  return normalizeVector(vector);
}

export function cosineSimilarity(left: EmbeddingVector, right: EmbeddingVector): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;

  for (let index = 0; index < length; index += 1) {
    dot += (left[index] ?? 0) * (right[index] ?? 0);
  }

  return Math.max(0, roundScore(dot));
}

function normalizeVectors(vectors: readonly EmbeddingVector[], dimensions = 64): readonly EmbeddingVector[] {
  return vectors.map((vector) => {
    const normalized = normalizeVector(vector);

    if (normalized.length > 0) {
      return normalized;
    }

    return Array.from({ length: Math.max(8, dimensions) }, () => 0);
  });
}

function normalizeVector(vector: readonly number[]): EmbeddingVector {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (magnitude === 0) {
    return vector.map(() => 0);
  }

  return vector.map((value) => value / magnitude);
}

function termsFor(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9][a-z0-9'-]{1,}/g) ?? [];

  return [...new Set(matches.map(stemTerm).filter((term) => term.length > 1 && !stopWords.has(term)))];
}

function stemTerm(term: string): string {
  return term
    .replace(/'s$/, "")
    .replace(/(?:ing|ers|er|ed|es|s)$/i, "");
}

function positiveHash(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function roundScore(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

const stopWords = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "into",
  "will",
  "would",
  "could",
  "should",
  "before",
  "after",
  "about",
  "because",
  "when",
  "where",
  "what",
  "which",
  "who",
  "why",
  "how",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "not",
  "but",
  "you",
  "your",
  "their",
  "they",
  "them",
  "our",
  "its",
]);
