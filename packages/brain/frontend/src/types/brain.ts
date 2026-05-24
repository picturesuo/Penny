export type ClaimStatus = "exploratory" | "committed" | "rejected" | "resolved" | string;

export interface BrainClaim {
  id: string;
  text: string;
  kind: string;
  status: ClaimStatus;
  confidence?: number;
  seedId?: string;
}

export interface BrainEdge {
  id: string;
  kind: string;
  fromClaimId: string;
  toClaimId: string;
  label?: string;
  status?: string;
}

export interface BrainGraphPathNode {
  id: string;
  claimId: string;
  label: string;
  role: string;
  kind: string;
  status: ClaimStatus;
  confidence: number;
  depth: number;
  lane: number;
  rank: number;
  moveCount: number;
  edgeIds: string[];
  selected: boolean;
  suggested: boolean;
}

export interface BrainGraphPathEdge {
  id: string;
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  kind: string;
  status: string;
  label: string | null;
}

export interface BrainGraphPath {
  layout: "top_down";
  generatedFrom: "claims_edges_moves" | string;
  focusClaimId: string | null;
  nodes: BrainGraphPathNode[];
  edges: BrainGraphPathEdge[];
  meta: {
    nodeCount: number;
    edgeCount: number;
    maxDepth: number;
  };
}

export interface ExplorationPath {
  title: string;
  prompt?: string;
  expectedValue?: string;
}

export interface LearnCandidate {
  term: string;
  unblockExplanation: string;
  whyItMatters: string;
}

export interface ChallengeSuggestion {
  id?: string;
  status?: "open" | "responded" | string;
  response?: ChallengeResponseKind | null;
  targetClaimId?: string;
  weakestPart?: string;
  failureType?: string;
  strength?: string;
  challenge?: string;
  critique?: string;
  whatWouldResolveIt?: string;
  responseOptions?: string[];
  targetClaim?: BrainClaim | null;
  critiqueClaim?: BrainClaim | null;
}

export interface BrainSession {
  id: string;
  status: string;
}

export interface BrainRun {
  status?: string;
  operation?: string;
}

export type BrainSearchMode = "learn" | "verify" | "check" | "brain" | "autopilot" | string;
export type BrainSearchDepth = "fast" | "deep" | string;

export interface BrainSearchFilters {
  allowedDomains?: string[];
  excludedDomains?: string[];
  recencyDays?: number;
  academic?: boolean;
}

export interface BrainSearchDecision {
  mode: BrainSearchMode;
  useWebSearch: boolean;
  depth: BrainSearchDepth;
  reason: string;
  reasonCodes: string[];
  signals: string[];
  query: string;
  filters: BrainSearchFilters;
}

export interface BrainSearchTraceResult {
  title: string | null;
  url: string | null;
  snippet: string | null;
  sourceType: string | null;
}

export interface BrainSearchTrace {
  mode: BrainSearchMode;
  decision: BrainSearchDecision;
  providerName: string;
  providerToolAvailable: boolean;
  providerToolAttached: boolean;
  toolOptions: {
    allowedDomains?: string[];
    excludedDomains?: string[];
    enableImageUnderstanding: false;
  } | null;
  resultCount: number;
  results: BrainSearchTraceResult[];
  savedSourceIds?: string[];
  savedSourceSpanIds?: string[];
}

export interface BrainDocumentClaim {
  id: string;
  kind: string;
  status: ClaimStatus;
  text: string;
  versionId: string;
  createdAt: string;
}

export interface BrainScope {
  userId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  sphereId: string | null;
}

export interface BrainDocumentSummary {
  id: string;
  sessionId: string;
  scope: BrainScope;
  title: string;
  description: string;
  status: string;
  originalIdea: string | null;
  mainClaim: BrainDocumentClaim | null;
  strongestOptions: BrainDocumentClaim[];
  rejectedOptions: BrainDocumentClaim[];
  todoLaterIdeas: string[];
  finalRecommendations: string[];
  nextActions: string[];
  counts: {
    claims: number;
    edges: number;
    moves: number;
    artifacts: number;
    versions: number;
  };
  latestArtifact: {
    id: string;
    kind: string;
    title: string;
    summary: string;
    createdAt: string;
  } | null;
  lastMove: {
    id: string;
    kind: string;
    summary: string;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export type BrainDocumentBlockKind =
  | "original_idea"
  | "main_claim"
  | "current_direction"
  | "assumptions"
  | "evidence"
  | "questions"
  | "notes"
  | "tensions"
  | "takeaways"
  | "related_ideas"
  | "mini_summary";

export interface BrainDocumentBlockData {
  id: string;
  kind: BrainDocumentBlockKind;
  eyebrow: string;
  title: string;
  body: string;
  items?: string[];
}

export type BrainDocumentCanvasNodeKind =
  | "Concept"
  | "Claim"
  | "Assumption"
  | "Evidence"
  | "Tension"
  | "Question"
  | "Next Move";

export interface BrainDocumentCanvasNode {
  id: string;
  kind: BrainDocumentCanvasNodeKind;
  title: string;
  body: string;
  x: number;
  y: number;
}

export interface BrainDocumentCanvasEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface BrainDocumentV2 {
  title: string;
  subtitle: string;
  summary: string;
  originalIdea: string;
  mainClaim: string;
  currentDirection: string;
  keyQuestions: string[];
  assumptions: string[];
  evidence: string[];
  tensions: string[];
  notes: string[];
  takeaways: string[];
  relatedIdeas: string[];
  miniSummary: string;
  canvas: {
    nodes: BrainDocumentCanvasNode[];
    edges: BrainDocumentCanvasEdge[];
  };
  metadata: {
    sessionId: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    claimCount: number;
    edgeCount: number;
    moveCount: number;
    artifactCount: number;
    generatedFrom: "ai_session_state";
  };
  blocks: BrainDocumentBlockData[];
}

export type BrainDocumentFileKind = "source" | "claim" | "artifact" | "moves" | string;

export interface BrainDocumentFile {
  id: string;
  sessionId: string;
  kind: BrainDocumentFileKind;
  title: string;
  subtitle: string | null;
}

export interface BrainHierarchyDocument {
  id: string;
  sessionId: string;
  title: string;
  status: string;
  updatedAt: string;
  fileCount: number;
  files: BrainDocumentFile[];
}

export interface BrainHierarchyFolder {
  id: string;
  label: string;
  kind: "project" | "status" | "inbox" | string;
  documentCount: number;
  documents: BrainHierarchyDocument[];
}

export interface BrainHierarchySpace {
  id: string;
  label: string;
  kind: "sphere" | "workspace" | "default" | string;
  documentCount: number;
  folders: BrainHierarchyFolder[];
}

export interface BrainQuickNote {
  id: string;
  sessionId: string;
  text: string;
  meta: string;
  kind: "next_action" | "open_question" | "recent_move" | string;
}

export interface BrainResearchItem {
  id: string;
  sessionId: string;
  kind: "source" | "research_lead" | "positive_example" | "failure_example" | "artifact" | string;
  title: string;
  subtitle: string | null;
}

export interface BrainSidebarData {
  quickNotes: BrainQuickNote[];
  folders: BrainHierarchyFolder[];
  research: BrainResearchItem[];
}

export interface BrainDocumentGraphNode {
  id: string;
  type: "document" | "claim" | "risk" | "concept" | string;
  label: string;
  sessionId: string;
  status: string;
}

export interface BrainDocumentGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  label: string | null;
  sessionId: string;
}

export interface BrainDocumentsData {
  sourceOfTruth: "sessions_sources_claims_claim_versions_edges_moves_artifacts" | string;
  documents: BrainDocumentSummary[];
  hierarchy: BrainHierarchySpace[];
  sidebar: BrainSidebarData;
  graph: {
    nodes: BrainDocumentGraphNode[];
    edges: BrainDocumentGraphEdge[];
  };
  meta: {
    documentCount: number;
    claimCount: number;
    edgeCount: number;
  };
}

export interface BrainDocumentsResponse {
  data: BrainDocumentsData;
}

export type CanvasNodeKind = "claim" | "assumption" | "question" | "concept" | "artifact" | "source" | string;
export type CanvasNodeAction = "learn" | "check" | "verify" | "save" | "related";

export interface CanvasNode {
  id: string;
  kind: CanvasNodeKind;
  title: string;
  summary?: string | null;
  status?: string | null;
  confidence?: number | null;
  x?: number;
  y?: number;
  refs?: {
    claimId?: string | null;
    sourceId?: string | null;
    artifactId?: string | null;
  };
  actions?: CanvasNodeAction[];
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  label?: string | null;
}

export interface SessionCanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  recommendedPath?: string[];
  selectedNodeId?: string;
}

export interface SessionCanvasResponse {
  data: SessionCanvasData;
}

export interface SaveBrainObjectResponse {
  data: {
    object: {
      id: string;
      objectType: string;
      sessionId: string | null;
      title: string;
      summary: string | null;
      status: string | null;
      createdAt: string;
      updatedAt: string;
    };
    memoryImport?: {
      status: "queued" | "running" | "completed" | "failed";
      jobId: string;
      sourceId: string | null;
      sourceLabel: string | null;
      memoryNodeCount: number;
    };
  };
}

export interface BrainHybridSearchResult {
  id: string;
  title: string;
  summary: string | null;
  kind: string;
  sessionId?: string | null;
  claimId?: string | null;
  score?: number | null;
}

export interface BrainHybridSearchResponse {
  data: {
    available: boolean;
    sourceOfTruth?: "brain_rows_hybrid_retrieval" | string;
    strategy?: "hybrid_lexical_vector" | "lexical" | string;
    results: BrainHybridSearchResult[];
    meta?: {
      query: string;
      resultCount: number;
    };
  };
}

export interface CodebaseScanSummary {
  scanId: string;
  repoRoot: string;
  gitCommit: string | null;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  fileCount: number;
  chunkCount: number;
  symbolCount: number;
  importCount: number;
  routeCount: number;
  testCount: number;
  docCount: number;
  findingCount: number;
  memoryNoteCount: number;
  changedFileCount: number;
  staleFileCount: number;
  excludedCount: number;
}

export interface CodebaseScanDetail extends CodebaseScanSummary {
  changedFiles: Array<{ path: string; previousHash: string; hash: string }>;
  staleFiles: string[];
  files: Array<{
    path: string;
    hash: string;
    previousHash: string | null;
    size: number;
    language: string;
    sourceKind: string;
    chunkCount: number;
    symbolCount: number;
    routeCount: number;
    testCount: number;
    docCount: number;
  }>;
}

export interface CodebaseSearchResult {
  chunkId: string;
  fileId: string;
  path: string;
  title: string;
  chunkKind: string;
  language: string;
  sourceKind: string;
  lineStart: number;
  lineEnd: number;
  score: number;
  reasons: string[];
  snippet: string;
  symbols: string[];
  routes: Array<{ method: string; routePath: string }>;
  tests: Array<{ name: string; subjectPath: string | null }>;
  docs: Array<{ title: string; references: string[] }>;
}

export interface CodebaseFinding {
  id: string;
  path: string | null;
  hash: string | null;
  size: number;
  language: string;
  sourceKind: string;
  severity: "info" | "warning" | "error";
  kind: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
}

export interface CodebaseAuditResponse {
  data: {
    sourceOfTruth: "codebase_db_index";
    latestScan: CodebaseScanSummary | null;
    staleFiles: string[];
    changedFiles: Array<{ path: string; previousHash: string; hash: string }>;
    topFindings: CodebaseFinding[];
  };
}

export interface CodebaseSearchResponse {
  data: {
    sourceOfTruth: "codebase_db_index";
    strategy: "bm25_dependency_adjacency";
    query: string;
    results: CodebaseSearchResult[];
    meta: {
      resultCount: number;
    };
  };
}

export interface CodebaseIngestResponse {
  data: CodebaseScanDetail;
}

export interface BrainRecentIdea {
  id: string;
  rawIdea: string;
  status?: "active" | "archived";
  archivedAt?: string | null;
  archiveExpiresAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface BrainRecentsResponse {
  data: {
    recents: BrainRecentIdea[];
    archived?: BrainRecentIdea[];
  };
}

export interface KeepBrainRecentIdeaResponse {
  data: {
    recent: BrainRecentIdea;
    recents?: BrainRecentIdea[];
    archived?: BrainRecentIdea[];
  };
}

export interface UpdateBrainRecentStatusResponse {
  data: {
    recents: BrainRecentIdea[];
    archived?: BrainRecentIdea[];
  };
}

export interface BrainSessionNote {
  sessionId: string;
  content: string;
  updatedAt: string;
}

export interface BrainSessionNoteResponse {
  data: {
    note: BrainSessionNote | null;
  };
}

export interface BrainData {
  ideaMap?: {
    claims?: BrainClaim[];
    edges?: BrainEdge[];
    keyInsight?: string;
  };
  graphPath?: BrainGraphPath;
  workStructure?: WorkStructure;
  source?: {
    kind?: string;
    rawText?: string;
  };
  explorationPaths?: ExplorationPath[];
  learnCandidates?: LearnCandidate[];
  learningPlan?: LearningPlan;
  learn?: {
    learningPlan?: LearningPlan;
    sessionV2?: LearnSessionV2;
  };
  sourceContext?: {
    kind: "text" | "pdf" | "slides" | "document" | string;
    fileName: string | null;
    mainIdea: string;
    clusters: Array<{
      id: string;
      title: string;
      summary: string;
      sourceRange: string;
    }>;
  } | null;
  firstChallenge?: ChallengeSuggestion;
  session?: BrainSession;
  brainRun?: BrainRun;
}

export interface LearningPlan {
  expertRole: string;
  goal: string;
  paragraphFit: "one_subgroup_per_page";
  groups: LearningPlanGroup[];
}

export interface LearningPlanGroup {
  id: string;
  title: string;
  purpose: string;
  subgroups: LearningPlanSubgroup[];
}

export interface LearningPlanSubgroup {
  id: string;
  title: string;
  oneLineGoal?: string;
  teachingParagraph: string;
  teachingSections?: Array<{
    title: string;
    body: string;
  }>;
  keyMoves: string[];
  misconceptions?: string[];
  workedExample: string;
  visualExample: {
    title: string;
    description: string;
  };
  sourceContext?: {
    clusterId: string;
    clusterTitle: string;
    localSummary: string;
    sourceRange: string;
  };
}

export type LearnVisualType = "diagram" | "latex" | "image" | "code" | "comparison" | "concept_map";

export interface LearnSourceSpanV2 {
  sourceId: string;
  label: string;
  text: string;
  sourceRange?: string;
}

export interface LearnVisualV2 {
  type: LearnVisualType;
  title: string;
  description: string;
  body: string;
  items?: Array<{
    label: string;
    text: string;
  }>;
}

export interface LearnPageV2 {
  id: string;
  lessonNumber: number;
  title: string;
  explanation: string;
  visual: LearnVisualV2;
  quickCheck: string;
  takeaway: string;
  sourceSpans: LearnSourceSpanV2[];
}

export interface LearnSessionV2 {
  version: "learn_session_v2";
  goal: string;
  pages: LearnPageV2[];
  visualTypes: LearnVisualType[];
  sourceOfTruth: "ai_generated_learn_pages_validated_locally";
}

export interface LearnSessionOutput {
  coreIdea: string;
  claims: BrainClaim[];
  assumptions: BrainClaim[];
  questions: BrainClaim[];
  creativePotential: string[];
  learningPlan?: LearningPlan;
  sessionV2?: LearnSessionV2;
  autopilotNextMove: AutopilotSuggestion | null;
}

export type BrainVerifyVerdict = "supported" | "weakened" | "mixed" | "not_enough_evidence";
export type BrainVerifyEvidenceStance = "supports" | "weakens" | "mixed" | "unclear";

export interface BrainVerifyEvidenceCard {
  title: string;
  summary: string;
  stance: BrainVerifyEvidenceStance;
  sourceName?: string | null;
  sourceUrl?: string | null;
  citation?: string | null;
}

export interface BrainVerifyCitation {
  title: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  citation?: string | null;
}

export interface BrainVerifyUnsupportedPart {
  part: string;
  reason: string;
  neededEvidence?: string | null;
}

export interface BrainVerifyRecipeStep {
  step: string;
  title: string;
  status: "completed" | "limited" | "skipped";
  summary: string;
  inputs: string[];
  outputs: string[];
}

export interface BrainVerifyCitationSource {
  evidenceTitle: string;
  source: {
    id: string;
    kind: "verification_citation";
    rawText: string;
  };
  sourceSpan: {
    id: string;
    sourceId: string;
    claimId: string | null;
    claimVersionId: string | null;
    label: string | null;
  };
}

export interface BrainVerifyMove {
  id: string;
  kind: "verify_run" | "confidence_update_accepted" | "confidence_update_rejected" | string;
  summary: string;
  claimIds: string[];
  edgeIds: string[];
  artifactIds: string[];
}

export interface BrainVerifyTargetClaim {
  id: string;
  versionId: string;
  kind: string;
  status: ClaimStatus;
  text: string;
  confidence: number;
}

export interface BrainVerifyConfidenceUpdate {
  suggestedDelta: number;
  autoApplied?: false;
  decision?: "pending_user_decision";
}

export interface BrainVerifyResult {
  verdict: BrainVerifyVerdict;
  summary: string;
  evidenceCards: BrainVerifyEvidenceCard[];
  citations: BrainVerifyCitation[];
  unsupportedParts: BrainVerifyUnsupportedPart[];
  confidenceDeltaSuggestion: number;
  whatWouldChangeThis: string;
  nextQuestion: string;
  recipe: {
    steps: BrainVerifyRecipeStep[];
  };
  targetClaim: BrainVerifyTargetClaim;
  move: BrainVerifyMove;
  brainRun: {
    id: string;
    status: string;
  };
  citationSources: BrainVerifyCitationSource[];
  searchTrace?: BrainSearchTrace | null;
  confidenceUpdate: BrainVerifyConfidenceUpdate;
}

export interface BrainVerifyResponse {
  data: BrainVerifyResult;
}

export interface BrainVerifyConfidenceCascade {
  claimId: string;
  viaEdgeId: string;
  depth: number;
  previousVersionId: string;
  currentVersionId: string;
  previousConfidence: number;
  currentConfidence: number;
  appliedDelta: number;
}

export interface BrainVerifyConfidenceDecisionResponse {
  data: {
    decision: "accept" | "reject";
    targetClaim: BrainVerifyTargetClaim;
    move: BrainVerifyMove;
    confidenceUpdate: {
      verifyMoveId: string;
      suggestedDelta: number;
      accepted: boolean;
      previousConfidence: number;
      currentConfidence: number;
      appliedDelta: number;
      cascade: BrainVerifyConfidenceCascade[];
    };
  };
}

export interface BrainMove {
  id: string;
  type?: string;
  kind?: string;
  actor?: string;
  summary: string;
  createdAt?: string;
}

export interface ClaimDetailClaim extends BrainClaim {
  scope?: BrainScope;
  versionId?: string;
  sessionId?: string;
  sourceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClaimDetailVersion {
  id: string;
  claimId: string;
  sourceId: string | null;
  brainRunId: string | null;
  moveId: string | null;
  content: string;
  status: ClaimStatus;
  confidence: number;
  state: "current" | "old" | string;
  isCurrent: boolean;
  validFrom: string;
  validUntil: string | null;
  supersededByVersionId: string | null;
  createdAt: string;
}

export interface ClaimDetailEdge {
  id: string;
  fromClaimId: string;
  toClaimId: string;
  kind: string;
  status: string;
  label: string | null;
  createdAt: string;
}

export interface ClaimDetailMove extends BrainMove {
  kind: string;
  claimIds: string[];
  edgeIds: string[];
  artifactIds: string[];
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface ClaimDetailSource {
  id: string;
  sessionId: string;
  kind: string;
  rawText: string;
  createdAt: string;
}

export interface ClaimDetailSourceSpan {
  id: string;
  sourceId: string;
  claimId: string | null;
  claimVersionId: string | null;
  startOffset: number;
  endOffset: number;
  label: string | null;
  text: string;
  createdAt: string;
}

export interface ClaimDetailArtifactReference {
  id: string;
  kind: string;
  title: string;
  summary: string;
  referenceReasons: string[];
  createdAt: string;
}

export interface ClaimDetailConnection {
  edge: ClaimDetailEdge;
  direction: "incoming" | "outgoing";
  claim: ClaimDetailClaim;
}

export interface ClaimDetailActiveChallenge {
  edge: ClaimDetailEdge;
  targetClaim: ClaimDetailClaim | null;
  critiqueClaim: ClaimDetailClaim | null;
  responseState: string;
  moves: ClaimDetailMove[];
}

export interface ClaimDetailLearnedConcept {
  edge: ClaimDetailEdge;
  conceptClaim: ClaimDetailClaim;
  attachedClaim: ClaimDetailClaim;
}

export interface ClaimDetailData {
  claim: ClaimDetailClaim;
  currentVersion: ClaimDetailVersion;
  oldVersions: ClaimDetailVersion[];
  versions: ClaimDetailVersion[];
  confidenceHistory: Array<{
    versionId: string;
    confidence: number;
    status: ClaimStatus;
    state: string;
    validFrom: string;
    validUntil: string | null;
    supersededByVersionId: string | null;
    createdAt: string;
  }>;
  moves: ClaimDetailMove[];
  provenance: {
    source: ClaimDetailSource | null;
    sources: ClaimDetailSource[];
    spans: ClaimDetailSourceSpan[];
  };
  artifactReferences: ClaimDetailArtifactReference[];
  connectedClaims: ClaimDetailConnection[];
  activeChallenges: ClaimDetailActiveChallenge[];
  learnedConcepts: ClaimDetailLearnedConcept[];
}

export interface ClaimDetailResponse {
  data: ClaimDetailData;
}

export interface AutopilotSuggestion {
  id?: string;
  candidateId: string;
  action: string;
  mode: string;
  label: string;
  primaryActionLabel: string;
  targetClaimId: string | null;
  targetEdgeId: string | null;
  score: number;
  why: string;
  reasonCodes?: string[];
  exitCriteria: NextMoveExitCriteria;
}

export interface AutopilotTickData {
  status: "ready" | "paused" | "empty" | string;
  sessionId: string;
  suggestion: AutopilotSuggestion | null;
  candidates?: AutopilotSuggestion[];
  selectedCandidate?: AutopilotSuggestion | null;
  focusState?: FocusState;
  move?: {
    id: string;
    kind: string;
    summary: string;
    claimIds?: string[];
    edgeIds?: string[];
    artifactIds?: string[];
  } | null;
  pause?: {
    paused: boolean;
    manualMoveId: string | null;
    focusedClaimId: string | null;
    pausedAt: string | null;
  };
}

export interface AutopilotTickResponse {
  data: AutopilotTickData;
}

export interface ManualNodeSelectionResponse {
  data: {
    status: "paused";
    brainId?: string;
    sessionId: string;
    focusState?: FocusState;
    focusClaim: BrainClaim;
    move: {
      id: string;
      kind: "manual_node_selected";
      summary: string;
      claimIds?: string[];
      edgeIds?: string[];
      artifactIds?: string[];
    };
    pause?: {
      paused: true;
      manualMoveId: string;
      focusedClaimId: string;
      pausedAt: string;
    };
  };
}

export interface SeedBrainResponse {
  data: BrainData;
}

export interface LearnSessionResponse {
  data: BrainData & {
    autopilot?: AutopilotTickData;
  };
}

export type SourceImportKind =
  | "text"
  | "markdown"
  | "pdf"
  | "email_fixture"
  | "linkedin_context"
  | "manual_messages_transcript"
  | "founder_notes"
  | "chatgpt_export"
  | "claude_export"
  | "docs_text"
  | "canvas_text"
  | "json"
  | "csv"
  | "zip";

export type MemoryNodeType =
  | "idea"
  | "project"
  | "preference"
  | "goal"
  | "frustration"
  | "question"
  | "source_fact"
  | "decision"
  | "rejected_direction";

export type MemoryEdgeKind = "derived_from" | "related_to" | "same_cluster" | "supports" | "challenges" | "rejects";
export type MemoryEvidenceLevel = "user_confirmed" | "grounded" | "inferred";
export type MemoryLabel = "taste" | "preference" | "project" | "frustration";
export type MemoryReviewAction = "correct" | "wrong" | "forget" | "boost" | "restore";

export interface SourcePermission {
  visibility: "private";
  trainingUse: false;
  source: "user_upload" | "manual_import";
  allowedUses: Array<"private_memory" | "create_retrieval">;
}

export interface SourcePreview {
  status: "ready" | "partial";
  excerpt: string;
  explanation: string;
  warnings: string[];
}

export interface SourceImport {
  id: string;
  kind: SourceImportKind;
  label: string;
  scope: BrainScope;
  privacy: {
    visibility: "private";
    trainingUse: false;
    rawRetention: boolean;
  };
  permission: SourcePermission;
  textHash: string;
  contentLength: number;
  chunkCount: number;
  memoryNodeCount: number;
  createdAt: string;
  updatedAt: string;
  fileName?: string;
  mimeType?: string;
  sourceUri?: string;
  preview?: SourcePreview;
}

export interface SourceChunk {
  id: string;
  sourceId: string;
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
  tokenEstimate: number;
  hash: string;
  createdAt: string;
}

export interface MemoryNode {
  id: string;
  type: MemoryNodeType;
  title: string;
  summary: string;
  text: string;
  sourceId: string;
  chunkIds: string[];
  confidence: number;
  tags: string[];
  labels: MemoryLabel[];
  evidenceLevel: MemoryEvidenceLevel;
  permission: SourcePermission;
  createdAt: string;
  lastSeenAt: string;
}

export interface MemoryEdge {
  id: string;
  kind: MemoryEdgeKind;
  fromNodeId: string;
  toNodeId: string;
  sourceId: string;
  weight: number;
  createdAt: string;
}

export type UserProfileSignalKind =
  | "recurring_interest"
  | "active_idea_cluster"
  | "taste_signal"
  | "common_frustration"
  | "preferred_build_style"
  | "repeated_rejected_direction";

export interface UserProfileSignal {
  id: string;
  kind: UserProfileSignalKind;
  label: string;
  summary: string;
  weight: number;
  sourceNodeIds: string[];
  updatedAt: string;
}

export interface BrainProfileIdeaCluster {
  id: string;
  label: string;
  summary: string;
  memoryNodeIds: string[];
  currentMemoryNodeId: string | null;
  supersededMemoryNodeIds: string[];
  weight: number;
  updatedAt: string;
}

export interface BrainProfileRecentActivity {
  id: string;
  kind: "source_imported" | "source_synced" | "memory_extracted" | "memory_confirmed" | "memory_boosted";
  label: string;
  summary: string;
  occurredAt: string;
  sourceId: string | null;
  memoryNodeIds: string[];
}

export interface IngestionJob {
  id: string;
  status: "completed" | "failed";
  sourceImport: SourceImport | null;
  sourceId: string | null;
  errorMessages: string[];
  importedAt: string;
  completedAt: string;
  counts: {
    sources: number;
    chunks: number;
    memoryNodes: number;
    memoryEdges: number;
    profileSignals: number;
  };
}

export interface RetrievalResult {
  id: string;
  nodeId: string;
  sourceId: string;
  chunkId: string;
  type: MemoryNodeType;
  title: string;
  summary: string;
  excerpt: string;
  score: number;
  confidence: number;
  evidenceLevel: MemoryEvidenceLevel;
  lastSeenAt: string;
  memoryRef: {
    id: string;
    label: string;
    kind: "brain" | "preference" | "context";
    summary: string;
  };
  sourceRef: {
    id: string;
    label: string;
    kind: "source";
    excerpt: string;
    sourceRange: string;
    url?: string | null;
  };
  permission: SourcePermission;
}

export interface BrainMemoryProfileReviewData {
  fingerprint: string;
  reviewedAt: string;
  sourceOfTruth: "brain_development_events" | "local_memory" | string;
  summary: string;
}

export interface BrainMemoryProfileData {
  sourceOfTruth: "private_user_memory_sources_chunks_nodes_edges_profile_signals" | string;
  scope: BrainScope;
  sources: SourceImport[];
  jobs: IngestionJob[];
  recentMemoryNodes: MemoryNode[];
  memoryEdges: MemoryEdge[];
  profile: {
    recurringInterests: UserProfileSignal[];
    activeIdeaClusters: UserProfileSignal[];
    activeProjects?: UserProfileSignal[];
    tasteSignals: UserProfileSignal[];
    commonFrustrations: UserProfileSignal[];
    preferredBuildStyle: UserProfileSignal[];
    repeatedRejectedDirections: UserProfileSignal[];
    ideaClusters?: BrainProfileIdeaCluster[];
    highValueMemories?: MemoryNode[];
    staleMemories?: MemoryNode[];
    supersededMemories?: MemoryNode[];
    recentMeaningfulActivity?: BrainProfileRecentActivity[];
    privacySafeSummary: string;
  };
  stats: {
    sourceCount: number;
    chunkCount: number;
    memoryNodeCount: number;
    memoryEdgeCount: number;
    profileSignalCount: number;
  };
  profileReview: BrainMemoryProfileReviewData | null;
  profileReviewHistory?: BrainMemoryProfileReviewData[];
}

export interface BrainImportInput {
  kind?: SourceImportKind;
  label?: string;
  fileName?: string;
  mimeType?: string;
  sourceUri?: string;
  content?: string;
  text?: string;
  rawRetention?: boolean;
  privacy?: {
    visibility?: "private" | "private_memory";
    trainingUse?: false;
    rawRetention?: boolean;
    source?: "user_upload" | "manual_import";
    allowedUses?: Array<"private_memory" | "create_retrieval">;
  };
}

export interface BrainImportResponse {
  data: {
    job: IngestionJob;
    profile: BrainMemoryProfileData;
  };
}

export interface BrainDemoFixtureResponse {
  data: {
    importInput: BrainImportInput;
    importInputs?: BrainImportInput[];
    demoPrompt?: string | null;
    safetyCopy?: string | null;
  };
}

export interface BrainImportJobResponse {
  data: {
    job: IngestionJob;
  };
}

export interface BrainMemoryProfileResponse {
  data: BrainMemoryProfileData;
}

export interface BrainMemoryProfileReviewResponse {
  data: {
    reviewed: true;
    profileReview: NonNullable<BrainMemoryProfileData["profileReview"]>;
    profile: BrainMemoryProfileData;
  };
}

export interface BrainRetrieveInput {
  query: string;
  limit?: number;
  nodeTypes?: MemoryNodeType[];
}

export interface BrainRetrieveResponse {
  data: {
    sourceOfTruth: "private_user_memory_retrieval" | string;
    query: string;
    contextLight: boolean;
    results: RetrievalResult[];
  };
}

export interface BrainMemoryReviewInput {
  action: MemoryReviewAction;
}

export interface BrainMemoryReviewResponse {
  data: {
    reviewed: boolean;
    action: MemoryReviewAction;
    memory: MemoryNode | null;
    profile: BrainMemoryProfileData;
  };
}

export interface BrainCodingPromptExport {
  sourceOfTruth: "private_user_memory_profile_export" | string;
  export: {
    id: string;
    format: "coding_agent_prompt";
    targets: string[];
    fileName: string;
    text: string;
    qualitySignals: {
      hasPrivateContext: boolean;
      hasSourceEvidence: boolean;
      hasMemoryEvidence: boolean;
      hasHumanJudgmentGuardrails: boolean;
      sourceCount: number;
      memoryCount: number;
      promptCompletenessScore: number;
      missing: string[];
    };
    createdAt: string;
  };
  profileStats: BrainMemoryProfileData["stats"];
}

export interface BrainCodingPromptExportResponse {
  data: BrainCodingPromptExport;
}

export interface BrainSourceDeleteResponse {
  data: {
    deleted: boolean;
    profile: BrainMemoryProfileData;
  };
}

export type CreateLens = "Personal" | "Practical" | "Valuable" | "Critical" | "Weird";
export type CreateCheckStatus = "pass" | "warn" | "fail";
export type CreateProviderMode = "deterministic" | "model_backed" | "deterministic_fallback";
export type CreateSchemaValidationStatus = "not_run" | "success" | "failure";
export type BrainGroundingLabel = "grounded" | "inferred" | "context_light";

export interface BrainRankedCandidate {
  id: string;
  lens: CreateLens;
  title: string;
  topReason: string;
  reasons: string[];
  memoryClass: "semantic" | "episodic" | "procedural" | "emotional_taste";
  grounding: BrainGroundingLabel;
  contextLabel: string;
  memoryCount: number;
  sourceCount: number;
  memoryRefs: MemoryRef[];
  sourceReferences: Array<{
    id: string;
    sourceNode: {
      id: string;
      label: string;
      kind: SourceRef["kind"];
      excerpt: string;
      url?: string | null;
    };
    chunk: {
      id: string;
      sourceNodeId: string;
      range: string;
      excerpt: string;
    } | null;
    grounded: boolean;
  }>;
  uncertainty: string[];
  nextBestMove: string;
}

export interface NextBestMove {
  id: string;
  title: string;
  action: string;
  whyItMatters: string;
  contextUsed: string[];
  uncertainty: string[];
  grounded: boolean;
  createdAt: string;
}

export interface MemoryRef {
  id: string;
  label: string;
  kind: "brain" | "session" | "preference" | "context";
  summary: string;
}

export interface SourceRef {
  id: string;
  label: string;
  kind: "rough_idea" | "session" | "source" | "user_comment";
  excerpt: string;
  url?: string | null;
  sourceRange?: string | null;
}

export interface CandidateOption {
  id: string;
  lens: CreateLens;
  title: string;
  oneLine: string;
  rationale: string;
  nextMove: string;
  topReason: string;
  grounding: BrainGroundingLabel;
  contextLabel: string;
  memoryCount: number;
  sourceCount: number;
  rankReasons: string[];
  uncertainty: string[];
  risks: string[];
  memoryUsed: MemoryRef[];
  sourcesUsed: SourceRef[];
  scores: {
    intentMatch: number;
    buildability: number;
    value: number;
    novelty: number;
    risk: number;
  };
}

export interface PromptExportQualitySignals {
  hasRoughIdea: boolean;
  hasSelectedOptionHistory: boolean;
  hasRelevantPersonalContext: boolean;
  hasRepeatedRejectedDirections: boolean;
  hasProductGoal: boolean;
  hasNonGoals: boolean;
  hasUxRequirements: boolean;
  hasFrontendRequirements: boolean;
  hasBackendRequirements: boolean;
  hasDataModel: boolean;
  hasPrivacyConstraints: boolean;
  hasVerificationRequirements: boolean;
  hasImplementationSequence: boolean;
  hasAcceptanceTests: boolean;
  hasDoNotBreakList: boolean;
  promptCompletenessScore: number;
  missing: string[];
}

export interface CreateObservability {
  providerMode: CreateProviderMode;
  providerName: "deterministic" | "xai" | "test" | "disabled";
  schemaValidation: CreateSchemaValidationStatus;
  schemaValidationErrors: string[];
  fallbackReason: string | null;
  memoryCountUsed: number;
  sourceCountUsed: number;
  rejectedDirectionsUsed: string[];
  generatedLenses: CreateLens[];
  selectedOptionIds: string[];
  selectedLenses: CreateLens[];
  exportQualitySignals: PromptExportQualitySignals;
}

export interface OptionSet {
  id: string;
  projectId: string;
  sessionId: string;
  sourceOfTruth: "rough_idea_context_deterministic_create_lenses" | "rough_idea_context_model_backed_create_lenses" | string;
  rawIdea: string;
  options: CandidateOption[];
  nextBestMove: NextBestMove;
  rankedCandidates: BrainRankedCandidate[];
  memoryUsed: MemoryRef[];
  sourcesUsed: SourceRef[];
  createdAt: string;
}

export type ArtifactSectionTitle =
  | "Product goal"
  | "User intent"
  | "Target user"
  | "Core loop"
  | "UX requirements"
  | "Frontend requirements"
  | "Backend requirements"
  | "Data model"
  | "AI/memory orchestration"
  | "Privacy constraints"
  | "Verification constraints"
  | "Implementation plan"
  | "Acceptance tests"
  | "Do-not-break list"
  | "Final coding-agent prompt";

export interface ArtifactSection {
  id: string;
  title: ArtifactSectionTitle;
  body: string;
  status: "draft" | "updated" | "needs_input";
}

export interface ArtifactDelta {
  id: string;
  updatedSectionIds: string[];
  selectedOptionIds: string[];
  summary: string;
  createdAt: string;
}

export interface CodingPromptArtifact {
  id: string;
  projectId: string;
  sessionId: string;
  title: string;
  version: number;
  rawIdea: string;
  sections: ArtifactSection[];
  sourceOptionSetIds: string[];
  judgmentEventIds: string[];
  updatedAt: string;
}

export interface JudgmentEvent {
  id: string;
  projectId: string;
  sessionId: string;
  optionSetId: string;
  selectedOptionIds: string[];
  userComment: string;
  inferredSignals: string[];
  artifactDelta: ArtifactDelta;
  createdAt: string;
}

export interface VerificationSummary {
  id: string;
  artifactId: string;
  createdAt: string;
  verdict: "ready" | "needs_revision";
  scores: {
    intentMatch: number;
    personalMemoryGrounding: number;
    buildability: number;
    nonGenericness: number;
    userAutonomyPreserved: number;
    fakeClaimRisk: number;
    promptCompleteness: number;
  };
  checks: Array<{
    key:
      | "intent_match"
      | "personal_memory_grounding"
      | "buildability"
      | "non_genericness"
      | "user_autonomy_preserved"
      | "fake_claim_risk"
      | "prompt_completeness";
    label: string;
    status: CreateCheckStatus;
    score: number;
    summary: string;
  }>;
  missingInfo: string[];
  risks: string[];
}

export interface PromptExport {
  id: string;
  artifactId: string;
  format: "coding_agent_prompt";
  targets: Array<"Codex" | "Claude Code" | "Cursor">;
  text: string;
  fileName: string;
  qualitySignals: PromptExportQualitySignals;
  createdAt: string;
}

export interface CreateCanvasNode {
  id: string;
  label: "Penny" | "Brain" | "Create" | "Learn" | "Export" | string;
  detail: string;
  note?: string;
  edgeToNext: "grounds" | "suggests" | "explains" | "returns" | "ships" | string;
  refs?: {
    projectId: string;
    sessionId: string;
    optionSetId?: string | null;
    artifactId?: string | null;
    judgmentEventId?: string | null;
    memoryIds: string[];
    sourceIds: string[];
  };
}

export interface CreateCanvasSnapshot {
  sourceOfTruth: "create_option_set_artifact_judgment_canvas" | string;
  generatedFrom: {
    projectId: string;
    sessionId: string;
    optionSetId: string;
    artifactId: string;
    judgmentEventId: string | null;
    selectedOptionIds: string[];
    sourceOptionSetIds: string[];
  };
  nodes: CreateCanvasNode[];
}

export type CreateExportFeedbackRating = "useful" | "not_useful";

export type CreateExportFeedbackReason =
  | "strong_output"
  | "too_generic"
  | "too_complex"
  | "not_personal_enough"
  | "wrong_memory"
  | "missing_constraints"
  | "ready_to_ship";

export interface CreateExportFeedback {
  sourceOfTruth: "create_export_feedback";
  id: string;
  projectId: string;
  sessionId: string;
  artifactId: string;
  exportId: string;
  rating: CreateExportFeedbackRating;
  reasons: CreateExportFeedbackReason[];
  comment: string | null;
  promptCompletenessScore: number | null;
  createdAt: string;
}

export interface CreateNextInput {
  rawIdea: string;
  projectId?: string | null;
  sessionId?: string | null;
  optionSetId?: string | null;
  selectedOptionIds?: string[];
  userComment?: string;
  artifact?: CodingPromptArtifact;
  memory?: MemoryRef[];
  sources?: SourceRef[];
  context?: {
    summary?: string;
    sessionTitle?: string;
    activeClaim?: string;
    sourceText?: string;
  };
}

export interface CreateNextResponse {
  data: {
    sourceOfTruth: "create_options_judgments_artifacts_verification" | string;
    optionSet: OptionSet;
    artifact: CodingPromptArtifact;
    verification: VerificationSummary;
    judgmentEvent: JudgmentEvent | null;
    canvas?: CreateCanvasSnapshot;
    observability: CreateObservability;
    exportReady: boolean;
  };
}

export interface CreateProviderComparisonArm {
  label: "deterministic" | "model_backed";
  providerUsed: CreateProviderMode;
  fallbackReason: string | null;
  optionSet: OptionSet;
  artifact: CodingPromptArtifact;
  verification: VerificationSummary;
  promptExport: PromptExport;
  observability: CreateObservability;
}

export interface CreateProviderComparisonResponse {
  data: {
    sourceOfTruth: "deterministic_model_backed_create_comparison" | string;
    rawIdea: string;
    deterministic: CreateProviderComparisonArm;
    modelBacked: CreateProviderComparisonArm;
  };
}

export interface ExportCodingPromptInput {
  artifact: CodingPromptArtifact;
  verification?: VerificationSummary;
  judgmentEvent?: JudgmentEvent | null;
}

export interface PromptExportResponse {
  data: {
    export: PromptExport;
  };
}

export interface CreateExportFeedbackInput {
  projectId: string;
  sessionId: string;
  artifactId: string;
  exportId: string;
  rating: CreateExportFeedbackRating;
  reasons?: CreateExportFeedbackReason[];
  comment?: string;
  promptCompletenessScore?: number | null;
}

export interface CreateExportFeedbackResponse {
  data: {
    feedback: CreateExportFeedback;
  };
}

export interface FocusState {
  sessionId: string;
  mode: string;
  focusedClaimId: string | null;
  focusedEdgeId: string | null;
  source: string;
  suggestionMoveId: string | null;
  manualMoveId: string | null;
  paused: boolean;
  reason: string | null;
  updatedAt: string | null;
}

export interface NextMoveExitCriteria {
  label: string;
  acceptedMoveKinds: string[];
}

export interface ThinkingModeCandidate {
  id: string;
  candidateId: string;
  action: string;
  mode: string;
  targetClaimId: string | null;
  targetEdgeId: string | null;
  score: number;
  reason: string;
  reasonCodes?: string[];
  exitCriteria?: NextMoveExitCriteria;
  selected?: boolean;
}

export interface ThinkingModeStateData {
  status: "ready" | "paused" | "empty" | string;
  brainId?: string;
  sessionId: string;
  focusState: FocusState;
  candidates: ThinkingModeCandidate[];
  selectedCandidate: ThinkingModeCandidate | null;
  move?: {
    id: string;
    kind: string;
    summary: string;
    payload?: Record<string, unknown>;
    createdAt?: string;
  } | null;
  persistedMoveIds?: string[];
}

export interface StartNextMoveResponse {
  data: {
    status: "started";
    brainId?: string;
    sessionId: string;
    focusState: FocusState;
    selectedCandidate: ThinkingModeCandidate;
    move: {
      id: string;
      kind: "autopilot_focus_started";
      summary: string;
      payload?: Record<string, unknown>;
      createdAt?: string;
    };
  };
}

export type ChallengeResponseKind = "defend" | "revise" | "absorb";
export type ChallengeResponseMoveKind = "user_defended" | "claim_revised" | "critique_absorbed";

export interface ChallengeRound {
  id: string;
  sessionId: string;
  status: "open" | "responded" | string;
  response: ChallengeResponseKind | null;
  targetClaimId: string;
  targetClaimVersionId: string;
  critiqueClaimId: string;
  critiqueClaimVersionId: string;
  challengeEdgeId: string;
  challengeMoveId: string;
  responseMoveId: string | null;
  focusCompletedMoveId: string | null;
  failureType: string;
  strength: string;
  critique: string;
  whyThis: string;
  whatWouldResolveIt: string;
  createdAt: string;
  respondedAt: string | null;
  updatedAt: string;
}

export interface ChallengeMove {
  id: string;
  kind: ChallengeResponseMoveKind | "challenge_issued" | "focus_completed";
  summary: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
}

export interface ChallengeDerivedEffect {
  id: string;
  kind: string;
  status: string;
  version: number;
  title: string;
  summary: string;
  payload?: unknown;
  createdAt: string;
}

export interface ChallengeResponseReceipt {
  response: ChallengeResponseKind;
  moveKind: ChallengeResponseMoveKind;
  targetClaimId: string;
  challengeEdgeId: string;
  previousClaimVersionId: string | null;
  currentClaimVersionId: string;
  claimTextChanged: boolean;
  unresolvedRisk: boolean;
}

export interface ChallengeNextMoveDirective {
  status: "client_tick_required";
  requiredCommand: "tick_autopilot";
  sessionId: string;
  method: "POST";
  endpoint: string;
  body: {
    resume: true;
  };
  reason: string;
  expectedMoveKind: "next_move_recomputed";
}

export interface IssueChallengeResponse {
  data: {
    status: "issued";
    brainId: string;
    sessionId: string;
    challengeRound: ChallengeRound;
    targetClaim: BrainClaim;
    critiqueClaim: BrainClaim;
    critique: string;
    failureType: string;
    strength: string;
    whyThis: string;
    whatWouldResolveIt: string;
    suggestedNextMove: string;
    move: ChallengeMove;
  };
}

export interface RespondToChallengeResponse {
  data: {
    status: "responded";
    challengeRound: ChallengeRound;
    response: ChallengeResponseKind;
    targetClaim: BrainClaim;
    critiqueClaimId: string;
    move: ChallengeMove;
    focusCompletedMove: ChallengeMove;
    derivedEffects: ChallengeDerivedEffect[];
    receipt: ChallengeResponseReceipt;
    nextMove: ChallengeNextMoveDirective;
  };
}

export interface ChallengeBriefSections {
  originalSeedIdea: {
    text: string;
    sourceId: string | null;
  };
  currentPrimaryClaim: {
    claimId: string;
    claimVersionId: string;
    text: string;
    confidence: number;
  };
  keyAssumptions: Array<{
    claimId: string;
    claimVersionId: string;
    text: string;
    confidence: number;
    markers: string[];
  }>;
  selectedPressurePoint: {
    targetClaimId: string;
    targetClaimVersionId: string;
    targetEdgeId: string | null;
    failureType: string | null;
    text: string;
  };
  whyPennyChoseIt: string[];
  challengeIssued: {
    text: string;
    strength: string | null;
    whatWouldResolveIt: string | null;
    challengeMoveId: string | null;
    challengeRoundId: string | null;
  };
  userResponse: {
    text: string;
    response: "Defend" | "Revise" | "Absorb" | null;
    reasoning: string | null;
    moveId: string | null;
  };
  whatChanged: Array<{
    text: string;
    previousClaimVersionId: string | null;
    currentClaimVersionId: string | null;
    moveId: string | null;
  }>;
  openRisks: Array<{
    kind: "challenge" | "assumption" | "unsupported_claim" | "none";
    text: string;
    claimId: string | null;
    edgeId: string | null;
    reason: string;
  }>;
  recommendedNextMove: {
    action: string;
    targetClaimId: string | null;
    targetEdgeId: string | null;
    why: string;
    expectedCompletionMove: string | null;
  };
  moveTimelineSummary: Array<{
    moveId: string;
    kind: string;
    summary: string;
    createdAt: string;
  }>;
}

export interface ChallengeBriefPayload {
  kind: "challenge_brief";
  title: "Challenge Brief";
  sessionId: string;
  sections: ChallengeBriefSections;
  refs?: {
    sourceIds?: string[];
    sourceSpanIds?: string[];
    claimIds?: string[];
    claimVersionIds?: string[];
    edgeIds?: string[];
    moveIds?: string[];
    artifactIds?: string[];
  };
}

export interface ChallengeBriefArtifact {
  id: string;
  sessionId?: string;
  kind: string;
  title: string;
  summary: string;
  payload?: ChallengeBriefPayload | Record<string, unknown>;
  createdAt?: string;
}

export interface ChallengeBriefResponse {
  data: {
    status: "created";
    artifact: ChallengeBriefArtifact & { sessionId: string };
    move: {
      id: string;
      kind: "artifact_created";
      summary: string;
      payload?: Record<string, unknown>;
      createdAt?: string;
    };
    brief?: unknown;
  };
}

export type WorkStructureType = "essay" | "startup" | "research" | "decision" | "general";
export type WorkStructureStepStatus = "not_started" | "active" | "resolved" | "stale";

export interface WorkStructureChoice {
  id: string;
  label: string;
  description: string;
  claimIds: string[];
  edgeIds: string[];
}

export interface WorkStructureStep {
  id: string;
  title: string;
  purpose: string;
  rank: number;
  fragility: number;
  importance: number;
  status: WorkStructureStepStatus;
  claimIds: string[];
  edgeIds: string[];
  whyNow: string;
  detailChoices: WorkStructureChoice[];
}

export interface WorkStructure {
  structureType: WorkStructureType;
  label: string;
  description: string;
  activeStepId: string | null;
  steps: WorkStructureStep[];
}

export interface SessionCockpitData {
  session: BrainSession;
  ideaMap: {
    claims: BrainClaim[];
    edges: BrainEdge[];
    keyInsight?: string | null;
  };
  graphPath: BrainGraphPath;
  workStructure?: WorkStructure | null;
  moves: BrainMove[];
  autopilot: AutopilotTickData;
  activeChallenge: (ChallengeSuggestion & {
    id: string;
    critique?: string;
    targetClaim?: BrainClaim | null;
    critiqueClaim?: BrainClaim | null;
  }) | null;
  latestArtifact?: ChallengeBriefArtifact | null;
}

export interface SessionCockpitResponse {
  data: SessionCockpitData;
}

export interface InlineLearnOutput {
  term: string;
  explanation: string;
  whyItMattersHere: string;
  example: string;
  relatedConcepts: string[];
  saveSuggestion: string;
}

export interface InlineLearnResponse {
  data: InlineLearnOutput & {
    brainRun?: {
      id: string;
      status: string;
    };
    saved?: InlineLearnSavedConcept;
  };
}

export interface AskPennyResponse {
  data: {
    answer: string;
    provider: "anthropic" | "xai" | "heuristic";
    model: string | null;
  };
}

export interface InlineLearnSaveResponse {
  data: {
    saved: InlineLearnSavedConcept;
  };
}

export interface InlineLearnSavedConcept {
  conceptClaim: {
    id: string;
    versionId: string;
    text: string;
  };
  teachesEdge: {
    id: string;
    fromClaimId: string;
    toClaimId: string;
  };
  move: {
    id: string;
    kind: string;
    summary: string;
  };
}
