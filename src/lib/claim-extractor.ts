import { randomUUID } from "node:crypto";
import type { ExtractedClaim, ImportSource, ImportSourceType } from "@/types/thought-map";

export interface ClaimExtractionInput {
  mapId: string;
  userId: string;
  sourceType: ImportSourceType;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceContent: string;
  importedAt?: Date;
}

type SentenceMatch = {
  structureKind: string;
  inferredConfidence: number | null;
};

const DOMAIN_KEYWORDS: Array<{ domain: string; keywords: RegExp }> = [
  { domain: "market", keywords: /\b(market|customers?|demand|revenue|growth|pricing|distribution|go-to-market|gtm|retention|conversion)\b/i },
  { domain: "financial", keywords: /\b(financial|cash|runway|burn|profit|loss|unit economics|margin|valuation|funding|budget)\b/i },
  { domain: "technical", keywords: /\b(technical|code|engineering|api|system|architecture|latency|scalable|model|algorithm|infrastructure)\b/i },
  { domain: "research", keywords: /\b(research|study|experiment|hypothesis|dataset|evidence|analysis|paper|literature)\b/i },
  { domain: "operational", keywords: /\b(operations?|process|workflow|execution|ship|deploy|delivery|runbook|coordination)\b/i },
  { domain: "people", keywords: /\b(team|hiring|people|manager|culture|leadership|organization|stakeholder)\b/i },
];

export function extractImportSource(input: ClaimExtractionInput): ImportSource {
  const importedAt = input.importedAt ?? new Date();
  const sourceId = randomUUID();
  const sourceContent = normalizeWhitespace(input.sourceContent);
  const sentences = splitIntoSentences(sourceContent);
  const extractedClaims = sentences
    .map((sentence) => buildExtractedClaim({ ...input, sourceId }, sentence, importedAt))
    .filter((claim): claim is ExtractedClaim => claim !== null);

  return {
    id: sourceId,
    mapId: input.mapId,
    userId: input.userId,
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    sourceContent,
    importedAt,
    extractedClaims,
    acceptedClaimIds: [],
    rejectedClaimCount: 0,
    editedClaimCount: 0,
  };
}

export function extractTextFromHtml(html: string) {
  const source = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header\b[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form\b[\s\S]*?<\/form>/gi, " ");

  const mainMatch =
    source.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ??
    source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ??
    source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i) ??
    null;

  const content = mainMatch ? mainMatch[1] : source;
  return decodeHtmlEntities(
    content
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/section>/gi, "\n\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function buildExtractedClaim(
  input: ClaimExtractionInput & { sourceId: string },
  sentence: { text: string; offset: number },
  importedAt: Date,
): ExtractedClaim | null {
  const rawText = sentence.text.trim();
  if (rawText.length < 12) {
    return null;
  }

  const match = classifySentence(rawText);
  if (!match) {
    return null;
  }

  return {
    id: randomUUID(),
    importSourceId: input.sourceId,
    rawText,
    extractedText: rawText,
    structureKind: match.structureKind,
    inferredConfidence: match.inferredConfidence,
    inferredDomain: inferDomain(rawText),
    sourceAttribution: buildSourceAttribution(input, importedAt),
    offsetInSource: sentence.offset,
    userDecision: "pending",
    editedText: null,
    resultingClaimId: null,
  };
}

function classifySentence(sentence: string): SentenceMatch | null {
  const normalized = sentence.toLowerCase();

  if (/\bif\b[\s\S]*\bthen\b/.test(normalized) || /\bif\b[\s\S]*,\s*(?:then|will|should|can|could)\b/.test(normalized)) {
    return { structureKind: "conditional", inferredConfidence: 0.82 };
  }

  if (/\b(we should|the best approach is|recommend(?:ed|s|ation)? is|should)\b/.test(normalized)) {
    return { structureKind: "recommendation", inferredConfidence: 0.68 };
  }

  if (/\b(because|leads to|result(?:s)? in|caus(?:e|es)|therefore|so that)\b/.test(normalized)) {
    return { structureKind: "causal", inferredConfidence: 0.7 };
  }

  if (/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?%?\b/.test(normalized) || /\b(?:19|20)\d{2}\b/.test(normalized) || /\bq[1-4]\b/.test(normalized)) {
    return { structureKind: "quantitative_prediction", inferredConfidence: 0.74 };
  }

  if (/\b(will|going to|is expected to|will likely|will probably)\b/.test(normalized) && /\bby\b/.test(normalized)) {
    return { structureKind: "future_assertion", inferredConfidence: 0.7 };
  }

  if (/\b(likely|probably|i expect|we believe|estimates suggest|appears likely)\b/.test(normalized)) {
    return { structureKind: "probabilistic_claim", inferredConfidence: 0.66 };
  }

  return null;
}

function inferDomain(text: string) {
  for (const entry of DOMAIN_KEYWORDS) {
    if (entry.keywords.test(text)) {
      return entry.domain;
    }
  }

  return "general";
}

function buildSourceAttribution(input: ClaimExtractionInput, importedAt: Date) {
  const label = input.sourceTitle?.trim() || input.sourceUrl?.trim() || input.sourceType.replaceAll("_", " ");
  return `${label} · imported ${importedAt.toLocaleDateString()}`;
}

function normalizeWhitespace(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoSentences(text: string) {
  const matches = [...text.matchAll(/[^.!?\n]+[.!?]?/g)];

  return matches
    .map((match) => {
      const textValue = match[0];
      const rawOffset = match.index ?? 0;
      const leadingWhitespace = textValue.match(/^\s*/)?.[0].length ?? 0;
      const trailingWhitespace = textValue.match(/\s*$/)?.[0].length ?? 0;
      const trimmedText = textValue.slice(leadingWhitespace, textValue.length - trailingWhitespace);

      return {
        text: trimmedText,
        offset: rawOffset + leadingWhitespace,
      };
    })
    .filter((sentence) => sentence.text.trim().length > 0);
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
