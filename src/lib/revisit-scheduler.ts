import type { RevisitAction, RevisitLeitnerBox, RevisitPriority, RevisitReason, RevisitSchedule, TriggerDefinition, ThoughtMapModel, ThoughtNodeModel } from "@/types/thought-map";

export interface RevisitQueueItem {
  schedule: RevisitSchedule;
  claim: ThoughtNodeModel;
  worldChangePrompt: string;
}

export interface RevisitTriggerInput {
  triggerDefinition: TriggerDefinition;
  triggerType: RevisitSchedule["triggerType"];
  reason: RevisitReason;
  priority: RevisitPriority;
  scheduledFor: Date;
}

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

function clampPriority(value: number): RevisitPriority {
  if (value >= 75) return "urgent";
  if (value >= 50) return "high";
  if (value >= 25) return "medium";
  return "low";
}

function priorityWeight(priority: RevisitPriority) {
  return priority === "urgent" ? 4 : priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}

function baseIntervalForNode(node: ThoughtNodeModel, dependentsCount: number) {
  if (node.kind === "root" || node.kind === "core_claim" || node.kind === "why_it_matters") {
    return 30;
  }

  if (dependentsCount >= 3) {
    return 45;
  }

  if (node.kind === "assumption" || node.kind === "research") {
    return 60;
  }

  return 90;
}

function dependenceCount(map: ThoughtMapModel, nodeId: string) {
  return map.nodes.filter((node) => node.parentId === nodeId || node.supersedesNodeId === nodeId).length;
}

function claimDialects(map: ThoughtMapModel, nodeId: string) {
  return map.events.filter((event) => event.nodeId === nodeId && event.eventType === "dialectic_round");
}

function confidenceFromNode(node: ThoughtNodeModel) {
  const confidence = node.scores?.confidence;
  return typeof confidence === "number" ? confidence : null;
}

function renderWorldChangePrompt(params: {
  node: ThoughtNodeModel;
  reason: RevisitReason;
  ageDays: number;
  dependencyCount: number;
}) {
  const provenanceHint = params.node.note?.trim() || params.node.content;
  const dependencyHint =
    params.dependencyCount > 0
      ? `it now supports ${params.dependencyCount} downstream claim${params.dependencyCount === 1 ? "" : "s"}`
      : "its dependency footprint is still small";

  return `When you made this claim, ${provenanceHint}. Since then, ${params.ageDays} day${params.ageDays === 1 ? "" : "s"} have passed and ${dependencyHint}. Does your confidence still hold?`;
}

function defaultTriggerDefinition(): TriggerDefinition {
  return {
    triggerType: "manual_flag",
    dateTarget: null,
    eventKeyword: null,
    confidenceThreshold: null,
    dependencyClaimId: null,
  };
}

export function computeLeitnerBox(params: {
  currentBox?: RevisitLeitnerBox | null;
  reviewAction?: RevisitAction["type"] | null;
  majorChange?: boolean;
  dependencyChanged?: boolean;
  unstable?: boolean;
}) {
  const currentBox = params.currentBox ?? 1;

  if (params.majorChange || params.dependencyChanged || params.unstable) {
    return 1 as RevisitLeitnerBox;
  }

  if (params.reviewAction === "reviewed_no_change") {
    return Math.min(5, currentBox + 1) as RevisitLeitnerBox;
  }

  if (params.reviewAction === "confidence_updated" || params.reviewAction === "claim_updated") {
    return Math.max(1, currentBox - 1) as RevisitLeitnerBox;
  }

  return currentBox as RevisitLeitnerBox;
}

export function computeRevisitScheduleForNode(
  map: ThoughtMapModel,
  node: ThoughtNodeModel,
  params?: {
    now?: Date;
    existing?: RevisitSchedule | null;
    triggerDefinition?: TriggerDefinition | null;
  },
): RevisitSchedule {
  const now = params?.now ?? new Date();
  const existing = params?.existing ?? null;
  const triggerDefinition = params?.triggerDefinition ?? existing?.triggerDefinition ?? defaultTriggerDefinition();
  const dependentsCount = dependenceCount(map, node.id);
  const ageDays = daysBetween(node.createdAt, now);
  const updatedDays = daysBetween(node.updatedAt, now);
  const confidence = confidenceFromNode(node);
  const rounds = claimDialects(map, node.id).length;
  const baseInterval = baseIntervalForNode(node, dependentsCount);

  let scheduledDays = baseInterval;
  let reason: RevisitReason = {
    type: "manual",
    description: "Scheduled for routine review.",
    urgencyScore: 20,
  };
  let triggerType: RevisitSchedule["triggerType"] = "time_based";

  if (triggerDefinition.triggerType === "date" && triggerDefinition.dateTarget) {
    scheduledDays = Math.max(0, daysBetween(now, triggerDefinition.dateTarget));
    reason = {
      type: "external_trigger",
      description: `Date trigger set for ${triggerDefinition.dateTarget.toLocaleDateString()}.`,
      urgencyScore: 92,
    };
    triggerType = "external_trigger";
  } else if (triggerDefinition.triggerType === "event_keyword" && triggerDefinition.eventKeyword) {
    scheduledDays = Math.min(scheduledDays, 30);
    reason = {
      type: "external_trigger",
      description: `Event trigger watching for "${triggerDefinition.eventKeyword}".`,
      urgencyScore: 68,
    };
    triggerType = "event_based";
  } else if (triggerDefinition.triggerType === "dependency_update" && triggerDefinition.dependencyClaimId) {
    scheduledDays = Math.min(scheduledDays, 14);
    reason = {
      type: "dependency_changed",
      description: `Claim ${triggerDefinition.dependencyClaimId} moves should revisit this claim.`,
      urgencyScore: 84,
    };
    triggerType = "dependency_change";
  } else if (triggerDefinition.triggerType === "confidence_threshold" && triggerDefinition.confidenceThreshold != null) {
    scheduledDays = Math.min(scheduledDays, confidence != null && confidence * 100 < triggerDefinition.confidenceThreshold ? 7 : scheduledDays);
    reason = {
      type: "confidence_drift",
      description: `Surface this when confidence elsewhere drops below ${triggerDefinition.confidenceThreshold}%.`,
      urgencyScore: 80,
    };
    triggerType = "confidence_drift";
  } else if (triggerDefinition.triggerType === "manual_flag") {
    reason = {
      type: "manual",
      description: "User asked Penny to remind them later.",
      urgencyScore: 55,
    };
  }

  if (rounds === 0) {
    scheduledDays = Math.min(scheduledDays, 14);
    reason = {
      type: "untested",
      description: "This claim has not been stress-tested yet.",
      urgencyScore: 88,
    };
  } else if (rounds === 1) {
    scheduledDays = Math.min(scheduledDays, 30);
  } else if (rounds >= 3) {
    scheduledDays = Math.max(scheduledDays, 60);
  }

  if (confidence != null && confidence > 80 && rounds === 0) {
    scheduledDays = Math.min(scheduledDays, 21);
    reason = {
      type: "untested",
      description: "High-confidence untested claims should be revisited soon.",
      urgencyScore: 90,
    };
  }

  if (confidence != null && confidence < 40 && (node.kind === "root" || node.kind === "core_claim" || dependentsCount > 1)) {
    scheduledDays = Math.min(scheduledDays, 7);
    reason = {
      type: "confidence_drift",
      description: "Low-confidence load-bearing claims need attention quickly.",
      urgencyScore: 95,
    };
  }

  if (updatedDays > baseInterval * 2) {
    scheduledDays = Math.min(scheduledDays, 14);
    reason = {
      type: "age_threshold",
      description: `This claim has gone ${updatedDays} days untouched.`,
      urgencyScore: 82,
    };
  } else if (updatedDays <= 7) {
    scheduledDays = Math.ceil(scheduledDays * 1.5);
  }

  if (ageDays <= 2) {
    scheduledDays = Math.max(scheduledDays, baseInterval);
  }

  const scheduledFor = new Date(now);
  scheduledFor.setDate(scheduledFor.getDate() + scheduledDays);

  return {
    id: existing?.id ?? `${map.id}:${node.id}:revisit`,
    claimId: node.id,
    mapId: map.id,
    userId: map.userId,
    scheduledFor,
    schedulingReason: reason,
    priority: clampPriority(reason.urgencyScore),
    status: existing?.status ?? "pending",
    leitnerBox: existing?.leitnerBox ?? 1,
    surfacedAt: existing?.surfacedAt ?? null,
    userAction: existing?.userAction ?? null,
    snoozedUntil: existing?.snoozedUntil ?? null,
    triggerType,
    triggerDefinition,
    lastComputedAt: now,
  };
}

export function buildRevisitQueue(map: ThoughtMapModel, limit = 5, now = new Date()) {
  const schedules = map.revisitSchedules.length ? map.revisitSchedules : computeRevisitSchedulesForMap(map, now);

  return schedules
    .filter((schedule) => schedule.status === "pending" && schedule.scheduledFor.getTime() <= now.getTime())
    .map((schedule) => {
      const claim = map.nodes.find((node) => node.id === schedule.claimId) ?? null;
      if (!claim) {
        return null;
      }

      return {
        schedule,
        claim,
        worldChangePrompt: renderWorldChangePrompt({
          node: claim,
          reason: schedule.schedulingReason,
          ageDays: daysBetween(claim.createdAt, now),
          dependencyCount: dependenceCount(map, claim.id),
        }),
      } satisfies RevisitQueueItem;
    })
    .filter((item): item is RevisitQueueItem => item !== null)
    .sort((a, b) => priorityWeight(b.schedule.priority) - priorityWeight(a.schedule.priority) || a.schedule.scheduledFor.getTime() - b.schedule.scheduledFor.getTime())
    .slice(0, limit);
}

export function computeRevisitSchedulesForMap(map: ThoughtMapModel, now = new Date()) {
  const existingByClaim = new Map(map.revisitSchedules.map((schedule) => [schedule.claimId, schedule]));

  return map.nodes
    .filter((node) => node.kind !== "root")
    .map((node) => computeRevisitScheduleForNode(map, node, { now, existing: existingByClaim.get(node.id) ?? null }))
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || a.scheduledFor.getTime() - b.scheduledFor.getTime());
}
