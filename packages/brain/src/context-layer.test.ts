import assert from "node:assert/strict";
import test from "node:test";
import {
  checkMemoryGraph,
  createLearnCardsForShards,
  planConnectorScope,
  processEphemeralContext,
  rankMemoryShards,
  redactPrivateText,
  type BrainEdgeDraft,
  type RetrievalShard,
} from "./context-layer.ts";

test("planConnectorScope enforces source-specific minimum scope rules", () => {
  const chatgptBlocked = planConnectorScope({
    provider: "chatgpt",
  });
  const chatgptImport = planConnectorScope({
    provider: "chatgpt",
    manualExport: true,
  });
  const gmailBroad = planConnectorScope({
    provider: "gmail",
  });
  const gmailSelective = planConnectorScope({
    provider: "gmail",
    labels: ["Penny"],
    searchQueries: ["from:founder@example.com newer_than:90d"],
  });
  const calendarWrite = planConnectorScope({
    provider: "calendar",
    readOnly: false,
  });
  const slack = planConnectorScope({
    provider: "slack",
    channelIds: ["C123"],
  });

  assert.equal(chatgptBlocked.allowed, false);
  assert.equal(chatgptBlocked.stage, "manual_only");
  assert.equal(chatgptImport.allowed, true);
  assert.equal(chatgptImport.sourceClass, "private_export");
  assert.equal(gmailBroad.allowed, false);
  assert.equal(gmailBroad.warnings.some((warning) => warning.includes("requires labels")), true);
  assert.equal(gmailSelective.allowed, true);
  assert.equal(gmailSelective.minimumScope.metadataFirst, true);
  assert.equal(calendarWrite.allowed, false);
  assert.equal(calendarWrite.warnings.some((warning) => warning.includes("read-only")), true);
  assert.equal(slack.allowed, false);
  assert.equal(slack.stage, "later");
});

test("redactPrivateText blocks secrets, identity data, and sensitive message classes", () => {
  const redacted = redactPrivateText(
    [
      "api_key: sk_1234567890abcdef and password: swordfish",
      "Email founder@example.com at 415-555-1212.",
      "SSN 123-45-6789, card 4242 4242 4242 4242, 12 Market Street.",
      "Off the record therapy note about my child.",
    ].join("\n"),
  );

  assert.equal(redacted.text.includes("sk_1234567890abcdef"), false);
  assert.equal(redacted.text.includes("founder@example.com"), false);
  assert.equal(redacted.text.includes("123-45-6789"), false);
  assert.equal(redacted.text.includes("4242 4242"), false);
  assert.equal(redacted.findings.some((finding) => finding.type === "api_key"), true);
  assert.equal(redacted.findings.some((finding) => finding.type === "password"), true);
  assert.equal(redacted.findings.some((finding) => finding.type === "private_message"), true);
  assert.equal(redacted.findings.some((finding) => finding.type === "medical"), true);
  assert.equal(redacted.findings.some((finding) => finding.type === "minor"), true);
});

test("processEphemeralContext extracts permissioned memory and deletes raw content by default", () => {
  const result = processEphemeralContext({
    provider: "chatgpt",
    sourceUri: "chatgpt-export:conversation-1",
    label: "ChatGPT export",
    fetchedAt: "2026-05-08T12:00:00.000Z",
    text: [
      "I think Penny should help founders challenge assumptions before fundraising.",
      "My goal is to turn scattered founder context into a working memory graph.",
      "I prefer direct writing style and avoid generic chatbot language.",
      "The launch project deadline is by 2026-06-01.",
      "Learn concept maps through teach back loops.",
      "Contact me at founder@example.com with token: ghp_1234567890abcdefghijkl.",
    ].join("\n"),
  });

  assert.equal(result.source.sourceClass, "private_export");
  assert.equal(result.chunk.processingStatus, "deleted");
  assert.equal(result.chunk.rawDeleted, true);
  assert.equal(result.redaction.text.includes("founder@example.com"), false);
  assert.equal(result.redaction.text.includes("ghp_1234567890abcdefghijkl"), false);
  assert.equal(result.digest.provenance.rawRetained, false);
  assert.equal(result.memoryShards.some((shard) => shard.type === "claim"), true);
  assert.equal(result.memoryShards.some((shard) => shard.type === "goal"), true);
  assert.equal(result.memoryShards.some((shard) => shard.type === "style"), true);
  assert.equal(result.memoryShards.some((shard) => shard.type === "deadline"), true);
  assert.equal(result.memoryShards.every((shard) => shard.evidence.length > 0), true);
  assert.equal(result.brainNodes.length, result.memoryShards.length);
  assert.equal(result.auditEvents.includes("chunk.deleted"), true);
});

test("rankMemoryShards returns the smallest useful provenance-backed set", () => {
  const results = rankMemoryShards(
    {
      query: "founder working memory graph deadline",
      sourceGroup: "private_export",
      limit: 2,
      now: "2026-05-08T12:00:00.000Z",
    },
    [
      shard({
        id: "high-fit",
        text: "Goal: build a founder working memory graph with provenance.",
        type: "goal",
        sourceClass: "private_export",
        confidence: 88,
        decay: 5,
        graphDistance: 1,
        projectRelevance: 0.95,
        novelty: 0.7,
      }),
      shard({
        id: "stale-contradicted",
        text: "Maybe make a generic chatbot for everyone.",
        type: "claim",
        sourceClass: "private_export",
        confidence: 35,
        decay: 80,
        lastSeen: "2025-01-01T12:00:00.000Z",
        contradicted: true,
      }),
      shard({
        id: "email-out-of-group",
        text: "Founder deadline discussed in email.",
        type: "deadline",
        sourceClass: "email",
        confidence: 90,
      }),
      shard({
        id: "deadline",
        text: "The project deadline is 2026-06-01 for the working memory prototype.",
        type: "deadline",
        sourceClass: "private_export",
        confidence: 78,
        graphDistance: 2,
      }),
    ],
  );

  assert.equal(results.length, 2);
  assert.equal(results[0]?.id, "high-fit");
  assert.equal(results.some((result) => result.id === "email-out-of-group"), false);
  assert.equal(results.every((result) => result.provenance.length > 0), true);
  assert.ok((results[0]?.score ?? 0) > (results[1]?.score ?? 0));
});

test("checkMemoryGraph detects weak evidence, stale claims, missing goals, risky decisions, and cycles", () => {
  const staleClaim = shard({
    id: "stale",
    text: "I think we should launch the fundraising decision flow.",
    type: "claim",
    sourceClass: "private_export",
    confidence: 30,
    lastSeen: "2025-01-01T12:00:00.000Z",
    contradicted: true,
  });
  const cycle: BrainEdgeDraft[] = [
    { fromNode: "node:a", toNode: "node:b", type: "depends_on", weight: 50, evidenceIds: ["ev1"] },
    { fromNode: "node:b", toNode: "node:a", type: "depends_on", weight: 50, evidenceIds: ["ev2"] },
  ];
  const signals = checkMemoryGraph({
    shards: [staleClaim],
    edges: cycle,
    now: "2026-05-08T12:00:00.000Z",
  });

  assert.equal(signals.some((signal) => signal.risk === "contradiction"), true);
  assert.equal(signals.some((signal) => signal.risk === "weak_evidence"), true);
  assert.equal(signals.some((signal) => signal.risk === "stale_assumption"), true);
  assert.equal(signals.some((signal) => signal.risk === "missing_user_goal"), true);
  assert.equal(signals.some((signal) => signal.risk === "risky_decision"), true);
  assert.equal(signals.some((signal) => signal.risk === "circular_reasoning"), true);
});

test("createLearnCardsForShards creates active-recall cards for concepts, goals, and claims", () => {
  const cards = createLearnCardsForShards(
    [
      shard({
        id: "concept",
        text: "Concept maps show dependencies between claims.",
        type: "concept",
        confidence: 80,
      }),
      shard({
        id: "goal",
        text: "Goal: make Penny's retrieval provenance obvious.",
        type: "goal",
        confidence: 70,
      }),
      shard({
        id: "preference",
        text: "I prefer terse UI copy.",
        type: "preference",
        confidence: 90,
      }),
    ],
    { now: "2026-05-08T12:00:00.000Z" },
  );

  assert.equal(cards.length, 2);
  assert.equal(cards[0]?.nodeId, "node:concept");
  assert.equal(cards[0]?.prompt.startsWith("Teach back this concept"), true);
  assert.equal(cards[1]?.prompt.startsWith("What current work does this goal affect"), true);
  assert.equal(cards[0]?.dueAt, "2026-05-09T12:00:00.000Z");
});

function shard(input: Partial<RetrievalShard> & Pick<RetrievalShard, "id" | "text">): RetrievalShard {
  return {
    type: input.type ?? "claim",
    sourceClass: input.sourceClass ?? "private_export",
    confidence: input.confidence ?? 70,
    decay: input.decay ?? 0,
    lastSeen: input.lastSeen ?? "2026-05-08T12:00:00.000Z",
    topicCluster: input.topicCluster ?? "founder_working_memory",
    evidence: input.evidence ?? [
      {
        sourceUri: "chatgpt-export:conversation-1",
        locator: {
          chunkHash: `hash-${input.id}`,
        },
        snippetPolicy: "redacted_snippet",
      },
    ],
    id: input.id,
    text: input.text,
    ...(input.graphDistance === undefined ? {} : { graphDistance: input.graphDistance }),
    ...(input.projectRelevance === undefined ? {} : { projectRelevance: input.projectRelevance }),
    ...(input.novelty === undefined ? {} : { novelty: input.novelty }),
    ...(input.contradicted === undefined ? {} : { contradicted: input.contradicted }),
  };
}
