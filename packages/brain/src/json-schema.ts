export const brainSeedJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["seedClaim", "assumptions", "thoughtMap", "explorationPaths", "keyInsight", "firstChallenge"],
  properties: {
    seedClaim: { $ref: "#/$defs/claim" },
    assumptions: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { $ref: "#/$defs/assumption" },
    },
    thoughtMap: {
      type: "object",
      additionalProperties: false,
      required: ["claims", "edges"],
      properties: {
        claims: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: { $ref: "#/$defs/claim" },
        },
        edges: {
          type: "array",
          maxItems: 20,
          items: { $ref: "#/$defs/edge" },
        },
      },
    },
    explorationPaths: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { $ref: "#/$defs/explorationPath" },
    },
    keyInsight: { type: "string", minLength: 1, maxLength: 700 },
    firstChallenge: { $ref: "#/$defs/challenge" },
  },
  $defs: {
    claim: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "text", "confidence"],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 80 },
        kind: { enum: ["belief", "assumption", "question", "concept"] },
        text: { type: "string", minLength: 1, maxLength: 700 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    assumption: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "text", "confidence", "pressure", "whyItMatters"],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 80 },
        kind: { const: "assumption" },
        text: { type: "string", minLength: 1, maxLength: 700 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        pressure: { enum: ["low", "medium", "high"] },
        whyItMatters: { type: "string", minLength: 1, maxLength: 600 },
      },
    },
    edge: {
      type: "object",
      additionalProperties: false,
      required: ["id", "fromClaimId", "toClaimId", "kind", "label"],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 80 },
        fromClaimId: { type: "string", minLength: 1, maxLength: 80 },
        toClaimId: { type: "string", minLength: 1, maxLength: 80 },
        kind: { enum: ["assumes", "supports", "questions", "challenges", "clarifies"] },
        label: { type: "string", minLength: 1, maxLength: 160 },
      },
    },
    explorationPath: {
      type: "object",
      additionalProperties: false,
      required: ["id", "title", "prompt", "expectedValue"],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 80 },
        title: { type: "string", minLength: 1, maxLength: 120 },
        prompt: { type: "string", minLength: 1, maxLength: 500 },
        expectedValue: { type: "string", minLength: 1, maxLength: 400 },
      },
    },
    challenge: {
      type: "object",
      additionalProperties: false,
      required: ["targetClaimId", "weakestPart", "challenge", "responseOptions"],
      properties: {
        targetClaimId: { type: "string", minLength: 1, maxLength: 80 },
        weakestPart: { type: "string", minLength: 1, maxLength: 500 },
        challenge: { type: "string", minLength: 1, maxLength: 900 },
        responseOptions: {
          type: "array",
          prefixItems: [{ const: "Defend" }, { const: "Revise" }, { const: "Absorb" }],
          minItems: 3,
          maxItems: 3,
        },
      },
    },
  },
} as const;
