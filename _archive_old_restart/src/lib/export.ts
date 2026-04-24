import { serializeBeliefGraph } from "@/lib/bayesian-propagation";
import { buildClaimEvidenceSummary } from "@/lib/evidence-quality";
import { buildCalibrationDashboard, type PennyLensSnapshot, type PennyShape } from "@/lib/penny-insights";
import type { Session as PrismaSession } from "@prisma/client";
import type { ConversationMessage, SessionState, StructuredPoint } from "@/types/penny";
import type {
  CalibrationCoaching,
  CognitiveBiasProfile,
  ThoughtMapEvent,
  ThoughtMapModel,
  ThoughtNodeModel,
  ExportRequest,
  ExportSchemaVersion,
  BlindSpotMap,
} from "@/types/thought-map";

export const EXPORT_PORTABILITY_GUARANTEE =
  "Your data is yours. You can export everything at any time in an open format. Penny will keep the schema documentation public so you can import it into other tools.";

export interface ExportClaimHistoryEntry {
  claimId: string;
  claim: ThoughtNodeModel;
  history: ThoughtMapEvent[];
}

export interface ExportMapSnapshot {
  map: ThoughtMapModel;
  lens: PennyLensSnapshot;
  shapes: PennyShape[];
  claimHistory: ExportClaimHistoryEntry[];
  focusClaimId: string | null;
  focusClaimText: string | null;
  sessions: SessionState[];
}

export interface ExportCalibrationSnapshot {
  biasProfile: CognitiveBiasProfile | null;
  coaching: CalibrationCoaching | null;
  blindSpotMap: BlindSpotMap | null;
  dashboard: ReturnType<typeof buildCalibrationDashboard> | null;
}

export interface ExportCalibrationRecord {
  biasProfile: CognitiveBiasProfile | null;
  coaching: CalibrationCoaching | null;
  blindSpotMap: BlindSpotMap | null;
  dashboard: ReturnType<typeof buildCalibrationDashboard> | null;
}

export interface MapExportDocument {
  schemaVersion: ExportSchemaVersion;
  exportedAt: string;
  exportRequest: ExportRequest;
  map: {
    id: string;
    userId: string;
    title: string;
    status: ThoughtMapModel["status"];
    rawThought: string | null;
    createdAt: string;
    updatedAt: string;
    claims: Array<Record<string, unknown>>;
    dialecticRounds: Array<Record<string, unknown>>;
    shapes: Array<Record<string, unknown>>;
    artifacts: Array<Record<string, unknown>>;
    importSources: Array<Record<string, unknown>>;
    sessions: Array<Record<string, unknown>>;
    calibration: ExportCalibrationRecord | null;
  };
}

export interface OpenFormatExportBundle {
  schemaVersion: ExportSchemaVersion;
  exportedAt: Date;
  request: ExportRequest;
  portabilityGuarantee: string;
  userId: string;
  maps: ExportMapSnapshot[];
  sessions: SessionState[];
  calibration: ExportCalibrationSnapshot;
}

type CsvRow = Record<string, string | number | boolean | null>;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "export";
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "n/a";
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "n/a" : date.toISOString().slice(0, 10);
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "n/a";
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "n/a" : date.toISOString();
}

function confidenceLabel(score: number | null | undefined) {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return "n/a";
  }

  return `${Math.round(score * 100)}%`;
}

function escapeCsv(value: string | number | boolean | null | undefined) {
  if (value == null) {
    return "";
  }

  const text = String(value);
  if (!/[,"\n]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function serializeBeliefGraphIfNeeded(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "nodes" in value &&
    "edges" in value &&
    (value as { nodes?: unknown; edges?: unknown }).nodes instanceof Map &&
    (value as { nodes?: unknown; edges?: unknown }).edges instanceof Map
  ) {
    return serializeBeliefGraph(value as Parameters<typeof serializeBeliefGraph>[0]);
  }

  return value;
}

export function serializeExportValue<T>(value: T): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    return Object.fromEntries(Array.from(value.entries(), ([key, entry]) => [key, serializeExportValue(entry)]));
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeExportValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const beliefGraph = serializeBeliefGraphIfNeeded(value);
  if (beliefGraph !== value) {
    return serializeExportValue(beliefGraph);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, serializeExportValue(entry)]),
  );
}

export function serializeOpenFormatExportBundle(bundle: OpenFormatExportBundle) {
  return serializeExportValue(bundle) as Record<string, unknown>;
}

function claimHistoryHighlights(history: ThoughtMapEvent[]) {
  return history
    .slice(-3)
    .map((event) => {
      const payload = event.payload ?? {};

      if (event.eventType === "dialectic_round") {
        const round = typeof payload.round === "string" ? String(payload.round) : "dialectic round";
        const responsePath =
          payload.responsePath === "defend" || payload.responsePath === "revise" || payload.responsePath === "absorb"
            ? payload.responsePath
            : "response";
        const prompt = typeof payload.prompt === "string" ? String(payload.prompt) : "";
        return `${round}: ${responsePath} — ${prompt}`;
      }

      if (event.eventType === "repair_action") {
        const actionType = typeof payload.actionType === "string" ? String(payload.actionType) : "repair";
        return `Repair action: ${actionType}`;
      }

      if (event.eventType === "claim_resolution") {
        const resolutionType = typeof payload.resolutionType === "string" ? String(payload.resolutionType) : "resolved";
        return `Resolution: ${resolutionType}`;
      }

      if (event.eventType === "confidence_override") {
        const reasoning = typeof payload.reason === "string" ? String(payload.reason) : "confidence override";
        return `Override: ${reasoning}`;
      }

      if (event.eventType === "move_applied") {
        const action = typeof payload.action === "string" ? String(payload.action).replaceAll("_", " ") : "move";
        return `Move applied: ${action}`;
      }

      if (event.eventType === "evidence_added") {
        const evidenceText = typeof payload.evidenceText === "string" ? String(payload.evidenceText) : "evidence added";
        return `Evidence: ${evidenceText}`;
      }

      return `${event.eventType.replaceAll("_", " ")} at ${formatDateTime(event.createdAt)}`;
    })
    .filter((item) => item.trim().length > 0);
}

function mapClaimRows(map: ThoughtMapModel, includeHistory: boolean): CsvRow[] {
  const capture = map.rawThought.includes("## Claim capture") ? map.rawThought : "";

  return map.nodes.map((node) => {
    const evidenceSummary = buildClaimEvidenceSummary({
      claimId: node.id,
      evidence: map.evidence,
    });
    const history = includeHistory ? map.events.filter((event) => event.nodeId === node.id) : [];
    const historySummary = includeHistory ? claimHistoryHighlights(history).join(" | ") : "";

    return {
      recordType: "claim",
      mapId: map.id,
      claimId: node.id,
      title: map.title,
      kind: node.kind,
      status: node.nodeStatus,
      confidence: confidenceLabel(node.scores?.confidence),
      provenance: capture ? "capture_envelope" : "unknown",
      evidenceCount: evidenceSummary.evidenceCount,
      evidenceQuality:
        evidenceSummary.averageQualityScore == null ? "n/a" : Math.round(evidenceSummary.averageQualityScore),
      historyEvents: history.length,
      historySummary,
      content: node.content,
      note: node.note ?? "",
      createdAt: formatDateTime(node.createdAt),
      updatedAt: formatDateTime(node.updatedAt),
    };
  });
}

function mapArtifactRows(map: ThoughtMapModel): CsvRow[] {
  return map.artifacts.map((artifact) => ({
    recordType: "artifact",
    mapId: map.id,
    artifactId: artifact.id,
    artifactType: artifact.artifactTypeName,
    title: artifact.title,
    audience: artifact.audience ?? "",
    version: artifact.version,
    generatedAt: formatDateTime(artifact.generatedAt),
    latestOutcome: artifact.latestOutcome?.outcomeType ?? "",
    qualityRating: artifact.latestOutcome?.artifactQualityRating ?? "",
  }));
}

function parseSessionJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseSessionStatus(value: string | null | undefined): SessionState["status"] {
  return value === "active" || value === "brief-ready" || value === "reflection-logged" || value === "closed" ? value : "active";
}

export function serializeSessionRecord(record: PrismaSession): SessionState {
  const sessionEvents = parseSessionJson<Array<Record<string, unknown>>>(record.sessionEvents, []).map((event) => ({
    id: typeof event.id === "string" ? event.id : "",
    sessionId: typeof event.sessionId === "string" ? event.sessionId : record.id,
    eventType:
      event.eventType === "session_started" ||
      event.eventType === "session_dismissed" ||
      event.eventType === "session_closed" ||
      event.eventType === "claim_opened" ||
      event.eventType === "critique_round" ||
      event.eventType === "confidence_update" ||
      event.eventType === "claim_created" ||
      event.eventType === "artifact_generated" ||
      event.eventType === "blind_spot_reviewed" ||
      event.eventType === "revisit_completed"
        ? event.eventType
        : "session_started",
    claimId: typeof event.claimId === "string" ? event.claimId : null,
    description: typeof event.description === "string" ? event.description : "",
    timestamp:
      typeof event.timestamp === "string"
        ? new Date(event.timestamp)
        : event.timestamp instanceof Date
          ? event.timestamp
          : record.updatedAt,
  }));

  const closingRitualRaw = parseSessionJson<Record<string, unknown> | null>(record.closingRitual, null);
  const closingRitual =
    closingRitualRaw
      ? {
          sessionId: typeof closingRitualRaw.sessionId === "string" ? closingRitualRaw.sessionId : record.id,
          questionsAnswered: Array.isArray(closingRitualRaw.questionsAnswered)
            ? closingRitualRaw.questionsAnswered
                .map((entry) => ({
                  question: typeof entry === "object" && entry !== null && typeof (entry as Record<string, unknown>).question === "string"
                    ? String((entry as Record<string, unknown>).question)
                    : "",
                  answer: typeof entry === "object" && entry !== null && typeof (entry as Record<string, unknown>).answer === "string"
                    ? String((entry as Record<string, unknown>).answer)
                    : "",
                }))
                .filter((entry) => entry.question.length > 0 || entry.answer.length > 0)
            : [],
          openItemsNoted: Array.isArray(closingRitualRaw.openItemsNoted)
            ? closingRitualRaw.openItemsNoted.filter((item): item is string => typeof item === "string")
            : [],
          nextSessionIntention:
            typeof closingRitualRaw.nextSessionIntention === "string"
              ? closingRitualRaw.nextSessionIntention
              : null,
          completedAt:
            typeof closingRitualRaw.completedAt === "string"
              ? new Date(closingRitualRaw.completedAt)
              : record.endedAt ?? record.updatedAt,
        }
      : null;

  const sessionSummaryRaw = parseSessionJson<Record<string, unknown> | null>(record.sessionSummary, null);
  const sessionSummary =
    sessionSummaryRaw
      ? {
          sessionId: typeof sessionSummaryRaw.sessionId === "string" ? sessionSummaryRaw.sessionId : record.id,
          claimsExamined: typeof sessionSummaryRaw.claimsExamined === "number" ? sessionSummaryRaw.claimsExamined : 0,
          claimsUpdated: typeof sessionSummaryRaw.claimsUpdated === "number" ? sessionSummaryRaw.claimsUpdated : 0,
          claimsCreated: typeof sessionSummaryRaw.claimsCreated === "number" ? sessionSummaryRaw.claimsCreated : 0,
          critiquesRun: typeof sessionSummaryRaw.critiquesRun === "number" ? sessionSummaryRaw.critiquesRun : 0,
          concessionsMade: typeof sessionSummaryRaw.concessionsMade === "number" ? sessionSummaryRaw.concessionsMade : 0,
          artifactsGenerated: typeof sessionSummaryRaw.artifactsGenerated === "number" ? sessionSummaryRaw.artifactsGenerated : 0,
          keyInsight: typeof sessionSummaryRaw.keyInsight === "string" ? sessionSummaryRaw.keyInsight : "",
          generatedAt:
            typeof sessionSummaryRaw.generatedAt === "string"
              ? new Date(sessionSummaryRaw.generatedAt)
              : record.updatedAt,
        }
      : null;

  return {
    id: record.id,
    userId: record.userId,
    mapId: record.mapId,
    declaredIntention: record.declaredIntention ?? "",
    intentionType: record.intentionType as SessionState["intentionType"],
    scopedClaimIds: parseSessionJson<string[]>(record.scopedClaimIds, []),
    timeBudgetMinutes: record.timeBudgetMinutes,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    actualDurationMinutes: record.actualDurationMinutes,
    sessionEvents: sessionEvents.map((event) => ({
      ...event,
      timestamp: event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp),
    })) as SessionState["sessionEvents"],
    closingRitual: closingRitual as SessionState["closingRitual"],
    sessionSummary: sessionSummary as SessionState["sessionSummary"],
    energyRating: record.energyRating as SessionState["energyRating"],
    focusRating: record.focusRating as SessionState["focusRating"],
    productivityRating: record.productivityRating,
    currentStage: record.currentStage as SessionState["currentStage"],
    status: parseSessionStatus(record.status),
    title: record.title,
    rawIdea: record.rawIdea,
    category: record.category,
    questionBudget: record.questionBudget,
    clarityScore: record.clarityScore,
    extractedProblem: record.extractedProblem,
    extractedCustomer: record.extractedCustomer,
    extractedSolution: record.extractedSolution,
    ideaSummary: record.ideaSummary,
    targetUser: record.targetUser,
    problem: record.problem,
    solution: record.solution,
    assumptions: parseSessionJson<string[]>(record.assumptions, []),
    resolvedAssumptions: parseSessionJson<string[]>(record.resolvedAssumptions, []),
    risks: parseSessionJson<string[]>(record.risks, []),
    unknowns: parseSessionJson<string[]>(record.unknowns, []),
    evidenceFor: parseSessionJson<StructuredPoint[]>(record.evidenceFor, []) as SessionState["evidenceFor"],
    evidenceAgainst: parseSessionJson<StructuredPoint[]>(record.evidenceAgainst, []) as SessionState["evidenceAgainst"],
    marketPatterns: parseSessionJson<StructuredPoint[]>(record.marketPatterns, []) as SessionState["marketPatterns"],
    questionsAsked: parseSessionJson<string[]>(record.questionsAsked, []),
    answers: parseSessionJson<string[]>(record.answers, []),
    conversation: parseSessionJson<ConversationMessage[]>(record.conversation, []) as SessionState["conversation"],
    conceptBrief: record.conceptBrief,
    logicOnlyMode: record.logicOnlyMode,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapSessionRows(sessions: SessionState[]): CsvRow[] {
  return sessions.map((session) => ({
    recordType: "session",
    sessionId: session.id,
    mapId: session.mapId ?? "",
    title: session.title,
    declaredIntention: session.declaredIntention,
    intentionType: session.intentionType,
    status: session.status,
    currentStage: session.currentStage,
    clarityScore: session.clarityScore,
    startedAt: formatDateTime(session.startedAt),
    endedAt: formatDateTime(session.endedAt),
    actualDurationMinutes: session.actualDurationMinutes ?? "",
    claimsExamined: session.sessionSummary?.claimsExamined ?? "",
    claimsUpdated: session.sessionSummary?.claimsUpdated ?? "",
    artifactsGenerated: session.sessionSummary?.artifactsGenerated ?? "",
  }));
}

function calibrationRows(calibration: ExportCalibrationSnapshot | null) {
  if (!calibration) {
    return [];
  }

  const rows: CsvRow[] = [];

  if (calibration.biasProfile) {
    rows.push({
      recordType: "calibration_profile",
      userId: calibration.biasProfile.userId,
      profileVersion: calibration.biasProfile.profileVersion,
      overallTrend: calibration.biasProfile.overallCalibrationTrend,
      strongestBias: calibration.biasProfile.strongestBias?.name ?? "",
      mostImprovedBias: calibration.biasProfile.mostImprovedBias?.name ?? "",
      lastUpdated: formatDateTime(calibration.biasProfile.lastUpdated),
    });
  }

  if (calibration.coaching) {
    rows.push({
      recordType: "calibration_coaching",
      userId: calibration.coaching.userId,
      overallTrend: calibration.coaching.overallTrend,
      recommendations: calibration.coaching.coachingRecommendations.length,
      generatedAt: formatDateTime(calibration.coaching.generatedAt),
    });
  }

  if (calibration.blindSpotMap) {
    rows.push({
      recordType: "blind_spot_map",
      userId: calibration.blindSpotMap.userId,
      computedAt: formatDateTime(calibration.blindSpotMap.computedAt),
      loadBearingUntestedNodes: calibration.blindSpotMap.loadBearingUntestedNodes.length,
      untestedHighConfidenceClaims: calibration.blindSpotMap.untestedHighConfidenceClaims.length,
    });
  }

  if (calibration.dashboard) {
    rows.push({
      recordType: "calibration_dashboard",
      domainCount: calibration.dashboard.domains.length,
      resolvedClaims: calibration.dashboard.resolvedClaims.length,
      privateBets: calibration.dashboard.privateBets.length,
    });
  }

  return rows;
}

export function buildCsvExport(bundle: OpenFormatExportBundle) {
  const rows: CsvRow[] = [];
  const includeHistory = bundle.request.includeHistory;

  for (const mapSnapshot of bundle.maps) {
    rows.push({
      recordType: "map",
      mapId: mapSnapshot.map.id,
      title: mapSnapshot.map.title,
      status: mapSnapshot.map.status,
      createdAt: formatDateTime(mapSnapshot.map.createdAt),
      updatedAt: formatDateTime(mapSnapshot.map.updatedAt),
      focusClaimId: mapSnapshot.focusClaimId ?? "",
      claims: mapSnapshot.map.nodes.length,
      shapes: mapSnapshot.shapes.length,
      artifacts: mapSnapshot.map.artifacts.length,
      sessions: mapSnapshot.sessions.length,
    });

    rows.push(...mapClaimRows(mapSnapshot.map, includeHistory));
    rows.push(...mapArtifactRows(mapSnapshot.map));
  }

  rows.push(...mapSessionRows(bundle.sessions));
  rows.push(...calibrationRows(bundle.calibration));

  const headers = rows.length
    ? Array.from(
        rows.reduce((accumulator, row) => {
          Object.keys(row).forEach((key) => accumulator.add(key));
          return accumulator;
        }, new Set<string>()),
      )
    : ["recordType"];

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
  ].join("\n");
}

function renderClaimMarkdown(map: ThoughtMapModel, claim: ThoughtNodeModel, history: ThoughtMapEvent[], includeHistory: boolean) {
  const evidenceSummary = buildClaimEvidenceSummary({
    claimId: claim.id,
    evidence: map.evidence,
  });
  const lines = [
    `### ${claim.content}`,
    `- Kind: ${claim.kind.replaceAll("_", " ")}`,
    `- Status: ${claim.nodeStatus}`,
    `- Confidence: ${confidenceLabel(claim.scores?.confidence)}`,
    `- Provenance: ${map.rawThought.includes("provenance") ? "captured in map" : "not explicitly tagged"}`,
    `- Evidence quality: ${evidenceSummary.averageQualityScore == null ? "n/a" : evidenceSummary.averageQualityScore.toFixed(1)}`,
    `- Evidence count: ${evidenceSummary.evidenceCount}`,
  ];

  if (claim.note) {
    lines.push(`- Note: ${claim.note}`);
  }

  if (includeHistory) {
    const highlights = claimHistoryHighlights(history);
    if (highlights.length) {
      lines.push("- History:");
      highlights.forEach((line) => {
        lines.push(`  - ${line}`);
      });
    }
  }

  return lines.join("\n");
}

function renderMapMarkdown(mapSnapshot: ExportMapSnapshot, includeHistory: boolean) {
  const { map, lens, shapes, claimHistory } = mapSnapshot;
  const lines = [
    `# ${map.title}`,
    `- Created: ${formatDate(map.createdAt)}`,
    `- Updated: ${formatDate(map.updatedAt)}`,
    `- Map ID: ${map.id}`,
    `- User ID: ${map.userId}`,
    "",
    "## Claims",
  ];

  for (const entry of claimHistory) {
    lines.push(renderClaimMarkdown(map, entry.claim, entry.history, includeHistory));
    lines.push("");
  }

  lines.push("## Shapes detected");
  if (shapes.length) {
    for (const shape of shapes) {
      lines.push(
        `- ${shape.label} (${shape.confidence}% confidence) — ${shape.summary}${shape.derivation ? ` · ${shape.derivation.derivationFormula}` : ""}`,
      );
    }
  } else {
    lines.push("- No shapes were active yet.");
  }

  lines.push("");
  lines.push("## Artifacts generated");
  if (map.artifacts.length) {
    for (const artifact of map.artifacts) {
      lines.push(`- ${artifact.title} (${artifact.artifactTypeName})`);
      lines.push(`  - Audience: ${artifact.audience ?? "unspecified"}`);
      lines.push(`  - Generated: ${formatDate(artifact.generatedAt)}`);
      if (artifact.sections.length) {
        lines.push("  - Sections:");
        artifact.sections.forEach((section) => {
          lines.push(`    - ${section.title}: ${section.body}`);
        });
      }
    }
  } else {
    lines.push("- No artifacts generated yet.");
  }

  lines.push("");
  lines.push("## Calibration summary");
  if (map.critiqueQualityProfile) {
    lines.push(`- Critique ratings: ${map.critiqueQualityProfile.totalRatings}`);
    lines.push(`- Last updated: ${formatDate(map.critiqueQualityProfile.lastUpdated)}`);
  } else {
    lines.push("- No critique quality profile yet.");
  }

  if (map.founderBriefReadiness.evidenceGateMessage) {
    lines.push(`- Evidence gate: ${map.founderBriefReadiness.evidenceGateMessage}`);
  }

  if (lens.effectiveShapes.length) {
    const activeShapes = lens.effectiveShapes.filter((shape) => shape.confidence >= 76);
    lines.push(`- Active shapes: ${activeShapes.length}`);
  }

  lines.push("");
  lines.push("## Sessions");
  if (mapSnapshot.sessions.length) {
    for (const session of mapSnapshot.sessions) {
      lines.push(`- ${session.title} (${session.currentStage.replaceAll("_", " ")})`);
      lines.push(`  - Started: ${formatDate(session.startedAt)}`);
      lines.push(`  - Ended: ${formatDate(session.endedAt)}`);
      if (session.sessionSummary?.keyInsight) {
        lines.push(`  - Key insight: ${session.sessionSummary.keyInsight}`);
      }
    }
  } else {
    lines.push("- No sessions tied to this map yet.");
  }

  return lines.join("\n");
}

function renderSessionsMarkdown(sessions: SessionState[]) {
  const lines = ["# Session history", ""];

  if (!sessions.length) {
    lines.push("No sessions were found for this export.");
    return lines.join("\n");
  }

  for (const session of sessions) {
    lines.push(`## ${session.title}`);
    lines.push(`- Session ID: ${session.id}`);
    lines.push(`- Map ID: ${session.mapId ?? "n/a"}`);
    lines.push(`- Stage: ${session.currentStage.replaceAll("_", " ")}`);
    lines.push(`- Intention: ${session.declaredIntention}`);
    lines.push(`- Started: ${formatDate(session.startedAt)}`);
    lines.push(`- Ended: ${formatDate(session.endedAt)}`);
    lines.push(`- Duration: ${session.actualDurationMinutes ?? "n/a"} minutes`);
    lines.push(`- Energy: ${session.energyRating ?? "n/a"}`);
    lines.push(`- Focus: ${session.focusRating ?? "n/a"}`);
    if (session.sessionSummary?.keyInsight) {
      lines.push(`- Key insight: ${session.sessionSummary.keyInsight}`);
    }
    if (session.closingRitual?.questionsAnswered.length) {
      lines.push("- Closing ritual:");
      session.closingRitual.questionsAnswered.forEach((item) => {
        lines.push(`  - ${item.question}: ${item.answer}`);
      });
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderCalibrationMarkdown(calibration: ExportCalibrationSnapshot | null) {
  const lines = ["# Calibration data", ""];

  if (!calibration) {
    lines.push("No calibration records were found.");
    return lines.join("\n");
  }

  if (calibration.biasProfile) {
    lines.push(`## Bias profile`);
    lines.push(`- User: ${calibration.biasProfile.userId}`);
    lines.push(`- Profile version: ${calibration.biasProfile.profileVersion}`);
    lines.push(`- Trend: ${calibration.biasProfile.overallCalibrationTrend}`);
    lines.push(`- Last updated: ${formatDate(calibration.biasProfile.lastUpdated)}`);
    lines.push("");
  }

  if (calibration.coaching) {
    lines.push("## Coaching");
    lines.push(`- Recommendations: ${calibration.coaching.coachingRecommendations.length}`);
    lines.push(`- Trend: ${calibration.coaching.overallTrend}`);
    lines.push(`- Generated: ${formatDate(calibration.coaching.generatedAt)}`);
    lines.push("");
  }

  if (calibration.blindSpotMap) {
    lines.push("## Blind spot map");
    lines.push(`- Untested high-confidence claims: ${calibration.blindSpotMap.untestedHighConfidenceClaims.length}`);
    lines.push(`- Unexamined domains: ${calibration.blindSpotMap.unexaminedDomains.length}`);
    lines.push(`- Load-bearing untested nodes: ${calibration.blindSpotMap.loadBearingUntestedNodes.length}`);
    lines.push("");
  }

  if (calibration.dashboard) {
    lines.push("## Dashboard");
    lines.push(`- Resolved claims: ${calibration.dashboard.resolvedClaims.length}`);
    lines.push(`- Private bets: ${calibration.dashboard.privateBets.length}`);
    lines.push(`- Post-mortems: ${calibration.dashboard.postMortems.length}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function buildMarkdownExport(bundle: OpenFormatExportBundle) {
  const lines = [
    `# Penny export`,
    `- Schema version: ${bundle.schemaVersion}`,
    `- Exported at: ${formatDateTime(bundle.exportedAt)}`,
    `- Export type: ${bundle.request.exportType.replaceAll("_", " ")}`,
    `- Format: ${bundle.request.format}`,
    `- Include history: ${bundle.request.includeHistory ? "yes" : "no"}`,
    `- Include private: ${bundle.request.includePrivate ? "yes" : "no"}`,
    "",
    bundle.portabilityGuarantee,
    "",
  ];

  if (bundle.maps.length) {
    for (const mapSnapshot of bundle.maps) {
      lines.push(renderMapMarkdown(mapSnapshot, bundle.request.includeHistory));
      lines.push("");
    }
  }

  if (bundle.sessions.length) {
    lines.push(renderSessionsMarkdown(bundle.sessions));
    lines.push("");
  }

  lines.push(renderCalibrationMarkdown(bundle.calibration));

  return lines.join("\n").trim() + "\n";
}

export function buildExportFilename(request: ExportRequest, extension: "json" | "md" | "csv", title?: string | null) {
  const descriptor = title ? slugify(title) : request.exportType.replaceAll("_", "-");
  return `penny-${descriptor}-${formatDateTime(request.requestedAt).slice(0, 10)}.${extension}`;
}

export function buildExportCsv(bundle: OpenFormatExportBundle) {
  const rows: CsvRow[] = [];

  for (const mapSnapshot of bundle.maps) {
    rows.push({
      recordType: "map",
      mapId: mapSnapshot.map.id,
      title: mapSnapshot.map.title,
      exportedAt: formatDateTime(bundle.exportedAt),
      focusClaimId: mapSnapshot.focusClaimId ?? "",
      claims: mapSnapshot.map.nodes.length,
      shapes: mapSnapshot.shapes.length,
      artifacts: mapSnapshot.map.artifacts.length,
      sessions: mapSnapshot.sessions.length,
    });

    rows.push(...mapClaimRows(mapSnapshot.map, bundle.request.includeHistory));
    rows.push(...mapArtifactRows(mapSnapshot.map));
  }

  rows.push(...mapSessionRows(bundle.sessions));
  rows.push(...calibrationRows(bundle.calibration));

  if (!rows.length) {
    return "recordType\n";
  }

  const headers = Array.from(rows.reduce((accumulator, row) => {
    Object.keys(row).forEach((key) => accumulator.add(key));
    return accumulator;
  }, new Set<string>()));

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
  ].join("\n");
}

export function buildExportPayloadForType(bundle: OpenFormatExportBundle) {
  if (bundle.request.format === "markdown") {
    return buildMarkdownExport(bundle);
  }

  if (bundle.request.format === "csv") {
    return buildExportCsv(bundle);
  }

  return serializeOpenFormatExportBundle(bundle);
}

export function buildExportMapSectionSummary(map: ThoughtMapModel) {
  return {
    claimCount: map.nodes.length,
    artifactCount: map.artifacts.length,
    evidenceCount: map.evidence.length,
    sessionCount: 0,
  };
}
