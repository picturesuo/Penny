export const brainSeedJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "source",
    "session",
    "seedClaim",
    "assumptions",
    "thoughtMap",
    "explorationPaths",
    "keyInsight",
    "firstChallenge",
    "moves",
    "artifacts",
  ],
  properties: {
    source: { $ref: "#/$defs/source" },
    session: { $ref: "#/$defs/session" },
    seedClaim: { $ref: "#/$defs/claim" },
    assumptions: {
      type: "array",
      items: { $ref: "#/$defs/assumption" },
    },
    thoughtMap: {
      type: "object",
      additionalProperties: false,
      required: ["claims", "edges"],
      properties: {
        claims: {
          type: "array",
          items: { $ref: "#/$defs/claim" },
        },
        edges: {
          type: "array",
          items: { $ref: "#/$defs/edge" },
        },
      },
    },
    explorationPaths: {
      type: "array",
      items: { $ref: "#/$defs/explorationPath" },
    },
    keyInsight: { type: "string" },
    firstChallenge: { $ref: "#/$defs/challenge" },
    moves: {
      type: "array",
      items: { $ref: "#/$defs/move" },
    },
    artifacts: {
      type: "array",
      items: { $ref: "#/$defs/artifact" },
    },
  },
  $defs: {
    source: {
      type: "object",
      additionalProperties: false,
      required: ["id", "rawText"],
      properties: {
        id: { type: "string" },
        rawText: { type: "string" },
      },
    },
    session: {
      type: "object",
      additionalProperties: false,
      required: ["id", "sourceId", "status"],
      properties: {
        id: { type: "string" },
        sourceId: { type: "string" },
        status: { enum: ["seeded"] },
      },
    },
    claim: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "text", "confidence"],
      properties: {
        id: { type: "string" },
        kind: { enum: ["belief", "assumption", "question", "concept"] },
        text: { type: "string" },
        confidence: { type: "number" },
      },
    },
    assumption: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "text", "confidence", "pressure", "whyItMatters"],
      properties: {
        id: { type: "string" },
        kind: { enum: ["assumption"] },
        text: { type: "string" },
        confidence: { type: "number" },
        pressure: { enum: ["low", "medium", "high"] },
        whyItMatters: { type: "string" },
      },
    },
    edge: {
      type: "object",
      additionalProperties: false,
      required: ["id", "fromClaimId", "toClaimId", "kind", "label"],
      properties: {
        id: { type: "string" },
        fromClaimId: { type: "string" },
        toClaimId: { type: "string" },
        kind: { enum: ["assumes", "supports", "questions", "challenges", "clarifies"] },
        label: { type: "string" },
      },
    },
    explorationPath: {
      type: "object",
      additionalProperties: false,
      required: ["id", "title", "prompt", "expectedValue"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        prompt: { type: "string" },
        expectedValue: { type: "string" },
      },
    },
    challenge: {
      type: "object",
      additionalProperties: false,
      required: ["targetClaimId", "weakestPart", "challenge", "responseOptions"],
      properties: {
        targetClaimId: { type: "string" },
        weakestPart: { type: "string" },
        challenge: { type: "string" },
        responseOptions: {
          type: "array",
          items: { enum: ["Defend", "Revise", "Absorb"] },
        },
      },
    },
    move: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "summary", "claimIds", "edgeIds", "artifactIds"],
      properties: {
        id: { type: "string" },
        kind: {
          enum: [
            "source.recorded",
            "claim.created",
            "edge.created",
            "assumption.extracted",
            "exploration.suggested",
            "challenge.created",
            "artifact.created",
          ],
        },
        summary: { type: "string" },
        claimIds: {
          type: "array",
          items: { type: "string" },
        },
        edgeIds: {
          type: "array",
          items: { type: "string" },
        },
        artifactIds: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    artifact: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "title", "summary", "claimIds", "edgeIds"],
      properties: {
        id: { type: "string" },
        kind: { enum: ["idea_map", "challenge_brief"] },
        title: { type: "string" },
        summary: { type: "string" },
        claimIds: {
          type: "array",
          items: { type: "string" },
        },
        edgeIds: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
} as const;
