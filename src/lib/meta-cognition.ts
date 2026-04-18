import type {
  MetaCognitionCondition,
  MetaCognitionSessionContext,
  MetaCognitionResponseType,
  MetaCognitionTone,
  MetaCognitionTrigger,
  ThoughtMapModel,
  ThoughtNodeModel,
} from "@/types/thought-map";
import type { PennyShape } from "@/lib/penny-insights";

export interface MetaCognitionPromptSnapshot {
  id: string;
  trigger: MetaCognitionTrigger;
  prompt: string;
  evidence: string[];
  tellMeMore: string;
  sessionContext: MetaCognitionSessionContext;
  shapesAssociated: string[];
  selectedNodeId: string | null;
  createdAt: Date;
}

const META_COGNITION_TRIGGERS: Array<Omit<MetaCognitionTrigger, "id" | "shapesAssociated">> = [
  {
    condition: "rapid_dismissal_pattern",
    promptTemplate:
      "You've pushed back on three critiques in a row without updating. That might mean they're all wrong. It might also mean you're in defensive mode. Which do you think it is?",
    promptTone: "gentle_challenge",
    minimumSessionLength: 5,
    cooldownPeriod: 15,
    biasAssociated: "confirmation_bias",
  },
  {
    condition: "emotional_language",
    promptTemplate:
      "Notice that this claim has some strong language in it. Does the strength of the language match the strength of your evidence?",
    promptTone: "observation",
    minimumSessionLength: 5,
    cooldownPeriod: 20,
    biasAssociated: "overconfidence",
  },
  {
    condition: "speed_pattern",
    promptTemplate:
      "You've added several claims quickly. That's a good capture mode. When you're ready, some of these might benefit from a bit of pressure.",
    promptTone: "pattern_notice",
    minimumSessionLength: 5,
    cooldownPeriod: 20,
    biasAssociated: "shallow_abstraction",
  },
  {
    condition: "confidence_stickiness",
    promptTemplate:
      "Your confidence estimates are clustering around [X]%. That might be accurate. It might also be an anchoring pattern. Do these claims actually all feel equally uncertain to you?",
    promptTone: "curious",
    minimumSessionLength: 5,
    cooldownPeriod: 30,
    biasAssociated: "overconfidence",
  },
  {
    condition: "sunk_cost_signal",
    promptTemplate:
      "You've been around this claim five times with no change to your confidence. It might be very well-grounded. Or there might be something making it hard to move. What would have to be true for you to actually update this one?",
    promptTone: "gentle_challenge",
    minimumSessionLength: 5,
    cooldownPeriod: 30,
    biasAssociated: "confirmation_bias",
  },
  {
    condition: "positive_pattern_recognition",
    promptTemplate:
      "You just updated your confidence based on a challenging critique. That's calibration working. Worth noting.",
    promptTone: "pattern_notice",
    minimumSessionLength: 5,
    cooldownPeriod: 15,
    biasAssociated: null,
  },
];

function minutesSince(from: Date, to: Date) {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / (1000 * 60)));
}

function latestClaimEvents(map: ThoughtMapModel, nodeId: string | null, limit = 20) {
  return map.events
    .filter((event) => (nodeId ? event.nodeId === nodeId : true))
    .slice(-limit);
}

function sessionContextForMap(map: ThoughtMapModel, node: ThoughtNodeModel | null): MetaCognitionSessionContext {
  const firstEventAt = map.events[0]?.createdAt ?? map.createdAt;
  const now = new Date();
  const elapsed = minutesSince(firstEventAt, now);
  const roundNumber = map.events.filter((event) => event.eventType === "dialectic_round" && (node ? event.nodeId === node.id : true)).length;
  const claimsOpen = map.nodes.filter((claim) => claim.kind !== "root" && claim.nodeStatus !== "superseded").length;

  return {
    roundNumber,
    claimsOpen,
    minutesElapsed: elapsed,
  };
}

function activeShapeLabels(shapes: PennyShape[]) {
  return shapes.slice(0, 3).map((shape) => shape.label);
}

function hasHighValenceLanguage(text: string) {
  return /\b(obviously|definitely|everyone knows|clearly|certainly|undeniably|of course|literally|massive|huge)\b/i.test(text);
}

function lastPromptEventForTrigger(map: ThoughtMapModel, triggerId: string, nodeId: string | null) {
  return [...map.events]
    .reverse()
    .find((event) => event.eventType === "meta_cognition_prompt" && (nodeId ? event.nodeId === nodeId : true) && event.payload?.triggerId === triggerId);
}

function responseChangedConfidence(map: ThoughtMapModel, node: ThoughtNodeModel | null) {
  if (!node) {
    return false;
  }

  const recentRounds = map.events
    .filter((event) => event.eventType === "dialectic_round" && event.nodeId === node.id)
    .slice(-3);

  return recentRounds.some((event) => {
    const payload = event.payload ?? {};
    const round = payload.dialecticRound && typeof payload.dialecticRound === "object" ? (payload.dialecticRound as Record<string, unknown>) : null;
    const delta = round && typeof round.confidenceDelta === "number" ? Number(round.confidenceDelta) : null;
    return delta != null && delta < 0;
  });
}

function metaCognitionEvidence(condition: MetaCognitionCondition, map: ThoughtMapModel, node: ThoughtNodeModel | null) {
  const nodeText = node?.content ?? "";
  const rounds = latestClaimEvents(map, node?.id ?? null, 20).filter((event) => event.eventType === "dialectic_round");

  switch (condition) {
    case "rapid_dismissal_pattern":
      return rounds
        .slice(-15)
        .filter((event) => {
          const payload = event.payload ?? {};
          const round = payload.dialecticRound && typeof payload.dialecticRound === "object" ? (payload.dialecticRound as Record<string, unknown>) : null;
          const responseClassification = round?.responseClassification && typeof round.responseClassification === "object"
            ? (round.responseClassification as Record<string, unknown>)
            : null;
          const responseType = typeof responseClassification?.type === "string" ? String(responseClassification.type) : null;
          const responsePath = typeof payload.responsePath === "string" ? String(payload.responsePath) : null;
          return responseType === "dismissal" || responsePath === "absorb";
        })
        .map((event) => `Round ${typeof event.payload?.round === "string" ? event.payload.round : "?"} ended in dismissal without a confidence update.`);
    case "emotional_language":
      return hasHighValenceLanguage(nodeText)
        ? [`The claim text uses high-valence language: "${nodeText.match(/\b(obviously|definitely|everyone knows|clearly|certainly|undeniably|of course|literally|massive|huge)\b/i)?.[0] ?? "strong language"}".`]
        : [];
    case "speed_pattern":
      return map.nodes
        .filter((claim) => claim.kind !== "root")
        .slice(-5)
        .map((claim) => `Claim "${claim.content.slice(0, 80)}${claim.content.length > 80 ? "…" : ""}" was added recently.`);
    case "confidence_stickiness":
      return map.nodes
        .filter((claim) => claim.kind !== "root" && claim.scores?.confidence != null)
        .slice(-5)
        .map((claim) => `Confidence on "${claim.content.slice(0, 60)}${claim.content.length > 60 ? "…" : ""}" is ${Math.round((claim.scores?.confidence ?? 0) * 100)}%.`);
    case "sunk_cost_signal":
      return node
        ? [
            `This claim has been through ${rounds.length} dialectic round${rounds.length === 1 ? "" : "s"} and sits near a self-image stake.`,
          ]
        : [];
    case "positive_pattern_recognition":
      return responseChangedConfidence(map, node) ? ["A recent critique produced a downward confidence update."] : [];
  }
}

function promptTemplateForCondition(condition: MetaCognitionCondition) {
  return META_COGNITION_TRIGGERS.find((trigger) => trigger.condition === condition)?.promptTemplate ?? "";
}

function promptToneForCondition(condition: MetaCognitionCondition): MetaCognitionTone {
  return META_COGNITION_TRIGGERS.find((trigger) => trigger.condition === condition)?.promptTone ?? "observation";
}

export function evaluateMetaCognitionTrigger(params: {
  map: ThoughtMapModel;
  node: ThoughtNodeModel | null;
  shapes: PennyShape[];
  now?: Date;
}): MetaCognitionPromptSnapshot | null {
  const now = params.now ?? new Date();
  const node = params.node;
  const context = sessionContextForMap(params.map, node);
  const activeShapes = activeShapeLabels(params.shapes);
  const triggerTemplates: Array<{
    condition: MetaCognitionCondition;
    shouldTrigger: () => boolean;
  }> = [
    {
      condition: "rapid_dismissal_pattern",
      shouldTrigger: () =>
        node != null &&
        params.map.events.filter((event) => {
          if (event.eventType !== "dialectic_round" || event.nodeId !== node.id || minutesSince(event.createdAt, now) > 15) {
            return false;
          }

          const payload = event.payload ?? {};
          const round =
            payload.dialecticRound && typeof payload.dialecticRound === "object"
              ? (payload.dialecticRound as Record<string, unknown>)
              : null;
          const responseClassification =
            round?.responseClassification && typeof round.responseClassification === "object"
              ? (round.responseClassification as Record<string, unknown>)
              : null;
          const responseType = typeof responseClassification?.type === "string" ? String(responseClassification.type) : null;
          const confidenceDelta =
            round && typeof round.confidenceDelta === "number" ? Number(round.confidenceDelta) : 0;

          return (responseType === "dismissal" || responseType === "partial_concession" || responseType === "reframe") && confidenceDelta === 0;
        }).length >= 3,
    },
    {
      condition: "emotional_language",
      shouldTrigger: () => node != null && hasHighValenceLanguage(node.content),
    },
    {
      condition: "speed_pattern",
      shouldTrigger: () => {
        const recentClaims = params.map.nodes.filter(
          (claim) => claim.kind !== "root" && minutesSince(claim.createdAt, now) <= 10,
        );

        return recentClaims.length >= 5;
      },
    },
    {
      condition: "confidence_stickiness",
      shouldTrigger: () => {
        const confidences = params.map.nodes
          .filter((claim) => claim.kind !== "root" && claim.scores?.confidence != null)
          .slice(-4)
          .map((claim) => Math.round((claim.scores?.confidence ?? 0) * 100));
        return confidences.length >= 4 && new Set(confidences).size === 1;
      },
    },
    {
      condition: "sunk_cost_signal",
      shouldTrigger: () => node != null && params.map.events.filter((event) => event.eventType === "dialectic_round" && event.nodeId === node.id).length >= 5,
    },
    {
      condition: "positive_pattern_recognition",
      shouldTrigger: () => responseChangedConfidence(params.map, node),
    },
  ];

  const eligible = triggerTemplates.find(({ condition, shouldTrigger }) => {
    const trigger = META_COGNITION_TRIGGERS.find((candidate) => candidate.condition === condition);
    if (!trigger) {
      return false;
    }

    if (context.minutesElapsed < trigger.minimumSessionLength) {
      return false;
    }

    const lastPrompt = lastPromptEventForTrigger(params.map, condition, node?.id ?? null);
    if (lastPrompt && minutesSince(lastPrompt.createdAt, now) < trigger.cooldownPeriod) {
      return false;
    }

    return shouldTrigger();
  });

  if (!eligible) {
    return null;
  }

  const triggerLibraryEntry = META_COGNITION_TRIGGERS.find((candidate) => candidate.condition === eligible.condition);
  if (!triggerLibraryEntry) {
    return null;
  }

  const evidence = metaCognitionEvidence(eligible.condition, params.map, node);
  const derivedTrigger: MetaCognitionTrigger = {
    id: `${eligible.condition}:${node?.id ?? "session"}:${Math.floor(now.getTime() / (Math.max(1, triggerLibraryEntry.cooldownPeriod) * 60 * 1000))}`,
    condition: eligible.condition,
    promptTemplate: promptTemplateForCondition(eligible.condition),
    promptTone: promptToneForCondition(eligible.condition),
    minimumSessionLength: triggerLibraryEntry.minimumSessionLength,
    cooldownPeriod: triggerLibraryEntry.cooldownPeriod,
    biasAssociated: triggerLibraryEntry.biasAssociated,
    shapesAssociated: activeShapes,
  };

  const prompt =
    eligible.condition === "confidence_stickiness" && evidence.length > 0
      ? derivedTrigger.promptTemplate.replace("[X]", evidence[0]!.match(/\d+%/)?.[0] ?? "X")
      : derivedTrigger.promptTemplate;

  return {
    id: derivedTrigger.id,
    trigger: derivedTrigger,
    prompt,
    evidence,
    tellMeMore:
      evidence.length > 0
        ? "Evidence behind the prompt: " + evidence.slice(0, 3).join(" ")
        : "This prompt is derived from the current session pattern rather than a single sentence.",
    sessionContext: context,
    shapesAssociated: activeShapes,
    selectedNodeId: node?.id ?? null,
    createdAt: now,
  };
}

export function buildMetaCognitionEventPayload(params: {
  prompt: MetaCognitionPromptSnapshot;
  responseType: MetaCognitionResponseType | null;
  responseText?: string | null;
  tellMeMoreOpened?: boolean;
  behaviorChangedWithinTenMinutes?: boolean | null;
}) {
  return {
    triggerId: params.prompt.trigger.id,
    condition: params.prompt.trigger.condition,
    prompt: params.prompt.prompt,
    promptTone: params.prompt.trigger.promptTone,
    sessionContext: params.prompt.sessionContext,
    evidence: params.prompt.evidence,
    shapesAssociated: params.prompt.shapesAssociated,
    selectedNodeId: params.prompt.selectedNodeId,
    responseType: params.responseType,
    responseText: params.responseText ?? null,
    tellMeMoreOpened: params.tellMeMoreOpened ?? false,
    behaviorChangedWithinTenMinutes: params.behaviorChangedWithinTenMinutes ?? null,
    createdAt: params.prompt.createdAt,
  };
}
