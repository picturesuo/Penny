import type { MarginFragmentModel, SessionCardModel } from "@/types/penny";
import {
  ONBOARDING_EXAMPLE_CLAIMS,
} from "@/types/onboarding";
import type {
  ChecklistItem,
  OnboardingChecklist,
  OnboardingPrompt,
  OnboardingRole,
  OnboardingState,
  OnboardingStep,
  OnboardingWorkspaceState,
} from "@/types/onboarding";
import type { ThoughtMapModel } from "@/types/thought-map";

const PROMPTS: Record<OnboardingStep, OnboardingPrompt> = {
  welcome: {
    step: "welcome",
    headline: "Start with one real thought",
    body: "Penny is easiest to understand when you give it a claim, not a blank promise. Use the guided path to get one useful win fast.",
    actionLabel: "Start onboarding",
    skipLabel: "Skip for now",
    exampleContent: "The biggest risk in my plan is that the team cannot sustain the pace long enough to learn.",
    highlightSelector: "[data-onboarding-target='start-map']",
  },
  explain_the_model: {
    step: "explain_the_model",
    headline: "Claims are the nodes, moves are the history",
    body: "A claim is what you currently believe. A move is what you do after pressure-testing that belief.",
    actionLabel: "Show me the first claim",
    skipLabel: "Skip explanation",
    exampleContent: "The market is big enough if this category keeps expanding for the next 18 months.",
    highlightSelector: "[data-onboarding-target='home-claim']",
  },
  first_claim_prompted: {
    step: "first_claim_prompted",
    headline: "Give Penny a first claim",
    body: "Use a real belief, not a slogan. The model gets better when the first map is anchored to something concrete.",
    actionLabel: "Create first claim",
    skipLabel: "Skip example",
    exampleContent: null,
    highlightSelector: "[data-onboarding-target='quick-capture']",
  },
  first_structure: {
    step: "first_structure",
    headline: "Watch the claim turn into structure",
    body: "Once the claim exists, Penny can branch assumptions, risks, and pressure-tests from it.",
    actionLabel: "See the structure",
    skipLabel: "Skip this step",
    exampleContent: null,
    highlightSelector: "[data-onboarding-target='map-preview']",
  },
  first_steel_man: {
    step: "first_steel_man",
    headline: "Write the strongest opposing view",
    body: "A steel man keeps the map honest. It is the first signal that this is a reasoning system, not a note dump.",
    actionLabel: "Add the opposing view",
    skipLabel: "Skip steel man",
    exampleContent: null,
    highlightSelector: "[data-onboarding-target='challenge-lane']",
  },
  first_critique: {
    step: "first_critique",
    headline: "Run one critique round",
    body: "The first critique should feel like pressure, not punishment. It is there to reveal what is load-bearing.",
    actionLabel: "Run critique",
    skipLabel: "Skip critique",
    exampleContent: null,
    highlightSelector: "[data-onboarding-target='critique-lane']",
  },
  see_the_response_options: {
    step: "see_the_response_options",
    headline: "Choose how you respond to critique",
    body: "Accept, override, or decouple. The response is the product because it becomes the next move.",
    actionLabel: "Show response options",
    skipLabel: "Skip responses",
    exampleContent: null,
    highlightSelector: "[data-onboarding-target='response-options']",
  },
  first_update: {
    step: "first_update",
    headline: "Update confidence in public",
    body: "The system is more useful when the user can visibly revise. That is how the loop stays alive.",
    actionLabel: "Update confidence",
    skipLabel: "Skip update",
    exampleContent: null,
    highlightSelector: "[data-onboarding-target='confidence-control']",
  },
  see_the_map: {
    step: "see_the_map",
    headline: "See the map as a map",
    body: "The graph is the structure behind the claims. The user should always be able to step back and see the larger shape.",
    actionLabel: "Open the map",
    skipLabel: "Skip map view",
    exampleContent: null,
    highlightSelector: "[data-onboarding-target='graph-view']",
  },
  explain_compounding: {
    step: "explain_compounding",
    headline: "This compounds over time",
    body: "Each move changes what Penny knows about how you think. The value is in the accumulation, not the individual note.",
    actionLabel: "Show compounding",
    skipLabel: "Skip compounding",
    exampleContent: null,
    highlightSelector: "[data-onboarding-target='compounding']",
  },
  complete: {
    step: "complete",
    headline: "You have the first loop",
    body: "Penny should now feel like a system you can return to, not a one-off form.",
    actionLabel: "Finish onboarding",
    skipLabel: null,
    exampleContent: null,
    highlightSelector: null,
  },
};

const CHECKLIST_BASE: Omit<ChecklistItem, "isCompleted" | "completedAt">[] = [
  {
    id: "first_claim",
    label: "Make your first claim",
    description: "Capture something you believe and assign it a probability.",
    pointsToFeature: "capture",
    estimatedMinutes: 3,
  },
  {
    id: "first_steel_man",
    label: "Write a steel man",
    description: "State the strongest opposing view before Penny critiques you.",
    pointsToFeature: "steel_man",
    estimatedMinutes: 5,
  },
  {
    id: "first_critique",
    label: "Run your first critique round",
    description: "Let Penny stress-test your claim.",
    pointsToFeature: "dialectic",
    estimatedMinutes: 5,
  },
  {
    id: "first_update",
    label: "Update your confidence",
    description: "Change your probability in response to a critique.",
    pointsToFeature: "confidence_update",
    estimatedMinutes: 2,
  },
  {
    id: "set_resolution_date",
    label: "Set a resolution date on a claim",
    description: "Commit to when you will know if this is true.",
    pointsToFeature: "calibration",
    estimatedMinutes: 1,
  },
  {
    id: "add_second_claim",
    label: "Add a second claim and connect it",
    description: "Build the start of a belief graph.",
    pointsToFeature: "graph",
    estimatedMinutes: 4,
  },
  {
    id: "generate_artifact",
    label: "Generate your first artifact",
    description: "Turn your map into a structured output.",
    pointsToFeature: "artifact",
    estimatedMinutes: 3,
  },
];

const ONBOARDING_STEP_ORDER: OnboardingStep[] = [
  "welcome",
  "explain_the_model",
  "first_claim_prompted",
  "first_structure",
  "first_steel_man",
  "first_critique",
  "see_the_response_options",
  "first_update",
  "see_the_map",
  "explain_compounding",
  "complete",
];

function mapCountToStep(maps: ThoughtMapModel[], sessions: SessionCardModel[], fragments: MarginFragmentModel[]): OnboardingStep {
  if (maps.length === 0) {
    return "welcome";
  }

  const hasSteelMan = maps.some((map) => map.nodes.some((node) => node.kind === "counter_argument"));
  const hasCritique = maps.some((map) => map.critiqueFeedbacks.length > 0 || map.events.some((event) => /critique/i.test(event.eventType)));
  const hasUpdate = maps.some((map) => map.nodes.some((node) => node.nodeStatus !== "active"));
  const hasArtifact = maps.some((map) => map.artifacts.length > 0);

  if (maps.some((map) => map.nodes.length <= 2)) {
    return "first_claim_prompted";
  }

  if (!hasSteelMan) {
    return "first_steel_man";
  }

  if (!hasCritique) {
    return "first_critique";
  }

  if (!hasUpdate) {
    return "first_update";
  }

  if (maps.some((map) => map.nodes.length >= 4)) {
    return "see_the_map";
  }

  if (hasArtifact || sessions.some((session) => session.status === "brief-ready")) {
    return "explain_compounding";
  }

  if (fragments.length > 0) {
    return "first_structure";
  }

  return "explain_the_model";
}

export function getOnboardingExampleClaim(role: OnboardingRole): string {
  return ONBOARDING_EXAMPLE_CLAIMS[role] ?? ONBOARDING_EXAMPLE_CLAIMS.default;
}

export function getOnboardingPrompt(step: OnboardingStep, role: OnboardingRole = "default"): OnboardingPrompt {
  const prompt = PROMPTS[step];

  if (step === "welcome" || step === "first_claim_prompted") {
    return {
      ...prompt,
      exampleContent: getOnboardingExampleClaim(role),
    };
  }

  return prompt;
}

export function buildOnboardingWorkspaceState(params: {
  userId: string;
  maps: ThoughtMapModel[];
  sessions: SessionCardModel[];
  fragments: MarginFragmentModel[];
  role?: OnboardingRole;
  persistedStep?: OnboardingStep | null;
}): OnboardingWorkspaceState {
  const state = buildOnboardingState(params);
  const role = params.role ?? "default";
  const prompt = getOnboardingPrompt(params.persistedStep ?? state.currentStep, role);
  const checklist = buildOnboardingChecklist(params);

  return {
    state,
    prompt,
    checklist,
    role,
    exampleClaim: getOnboardingExampleClaim(role),
    isComplete: state.currentStep === "complete",
  };
}

export function buildOnboardingState(params: {
  userId: string;
  maps: ThoughtMapModel[];
  sessions: SessionCardModel[];
  fragments: MarginFragmentModel[];
}): OnboardingState {
  const orderedMaps = [...params.maps].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const firstMap = orderedMaps[0] ?? null;
  const currentStep = mapCountToStep(params.maps, params.sessions, params.fragments);
  const currentStepIndex = ONBOARDING_STEP_ORDER.indexOf(currentStep);
  const completedSteps = currentStepIndex > 0 ? ONBOARDING_STEP_ORDER.slice(0, currentStepIndex) : [];

  return {
    userId: params.userId,
    currentStep,
    completedSteps,
    firstMapId: firstMap?.id ?? null,
    firstClaimId: firstMap?.nodes.find((node) => node.kind !== "root")?.id ?? null,
    firstCritiqueRoundId: firstMap?.events.find((event) => event.eventType === "dialectic_round")?.id ?? null,
    skippedAt: null,
    completedAt: currentStep === "complete" ? new Date() : null,
    startedAt: firstMap?.createdAt ?? new Date(),
  };
}

export function buildOnboardingChecklist(params: {
  maps: ThoughtMapModel[];
  sessions: SessionCardModel[];
  fragments: MarginFragmentModel[];
}): OnboardingChecklist {
  const maps = params.maps;
  const completedMap = new Map<string, Date | null>();
  const firstClaim = maps[0]?.nodes.find((node) => node.kind !== "root") ?? null;
  const hasSteelMan = maps.some((map) => map.nodes.some((node) => node.kind === "counter_argument"));
  const hasCritique = maps.some((map) => map.critiqueFeedbacks.length > 0 || map.events.some((event) => /critique/i.test(event.eventType)));
  const hasUpdate = maps.some((map) => map.nodes.some((node) => node.nodeStatus !== "active"));
  const hasArtifact = maps.some((map) => map.artifacts.length > 0);
  const hasSecondClaim = maps.some((map) => map.nodes.filter((node) => node.kind !== "root").length >= 2);

  completedMap.set("first_claim", firstClaim?.createdAt ?? null);
  completedMap.set("first_steel_man", hasSteelMan ? new Date() : null);
  completedMap.set("first_critique", hasCritique ? new Date() : null);
  completedMap.set("first_update", hasUpdate ? new Date() : null);
  completedMap.set("set_resolution_date", maps.some((map) => map.nodes.some((node) => /20\d\d-\d\d-\d\d/.test(node.content))) ? new Date() : null);
  completedMap.set("add_second_claim", hasSecondClaim ? new Date() : null);
  completedMap.set("generate_artifact", hasArtifact ? new Date() : null);

  const items = CHECKLIST_BASE.map((item) => ({
    ...item,
    isCompleted: Boolean(completedMap.get(item.id)),
    completedAt: completedMap.get(item.id) ?? null,
  }));
  const nextRecommended = items.find((item) => !item.isCompleted) ?? null;

  return {
    items,
    completedCount: items.filter((item) => item.isCompleted).length,
    totalCount: items.length,
    nextRecommended,
  };
}
