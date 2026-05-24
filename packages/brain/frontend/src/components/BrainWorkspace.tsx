import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  Database,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Lightbulb,
  Mail,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import type {
  AutopilotTickData,
  BrainImportInput,
  BrainMemoryProfileData,
  BrainClaim,
  BrainData,
  BrainDocumentBlockData,
  BrainDocumentCanvasEdge,
  BrainDocumentCanvasNode,
  BrainDocumentGraphEdge,
  BrainDocumentGraphNode,
  BrainDocumentsData,
  BrainDocumentSummary,
  BrainDocumentV2,
  BrainEdge,
  BrainGraphPath,
  BrainGraphPathNode,
  BrainHierarchyFolder,
  BrainRecentIdea,
  BrainSidebarData,
  IngestionJob,
  MemoryReviewAction,
  MemoryNode,
  CanvasNode,
  CanvasNodeAction,
  BrainMove,
  ClaimDetailConnection,
  ClaimDetailData,
  ClaimDetailMove,
  SessionCanvasData,
  SessionCockpitData,
  SourceImport,
  SourceImportKind,
  UserProfileSignal,
  WorkStructure,
} from "../types/brain";
import {
  createGoogleGmailConnectSession,
  deleteBrainSource,
  fetchBrainDemoFixtureImport,
  fetchBrainYcFounderFixtureImport,
  fetchBrainMemoryProfile,
  fetchGoogleGmailStatus,
  fetchGoogleConnectorProvider,
  fetchClaimDetail,
  fetchSessionNote,
  importBrainSource,
  reviewBrainMemory,
  revokeGoogleGmail,
  saveSessionNote,
  searchGoogleGmail,
  semanticSearchGoogleGmail,
  syncGoogleGmail,
  type GoogleGmailSearchInput,
  type GoogleGmailSearchResponse,
  type GoogleGmailSemanticSearchInput,
  type GoogleGmailSemanticSearchResponse,
  type GoogleGmailStatusResponse,
  type GoogleConnectorProviderView,
  type GoogleConnectorSurfaceView,
} from "../api/brainClient";
import { formatLabel, shortId } from "../lib/format";
import { truncateWords } from "../lib/text";
import { CanvasWorkspace } from "./CanvasWorkspace";

type ClaimDetailStatus = "idle" | "loading" | "ready" | "error";
type BrainMemoryStatus = "idle" | "loading" | "ready" | "importing" | "deleting" | "error";
type BrainDemoFixtureKind = "penny" | "yc-founder";
type GoogleConnectorUiStatus = "idle" | "loading" | "ready" | "connecting" | "syncing" | "revoking" | "deleting" | "error";

type GoogleConnectorConnectionView = {
  id: string;
  status: string;
  surfaces: string[];
  scopes: string[];
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  revokedAt: string | null;
  sourceCounts: Record<string, number>;
  credential: {
    connectionId: string;
    providerConfigKey: string;
    credentialRef?: string;
    accountId?: string;
    accountEmail?: string;
    accountLabel?: string;
    endUserId?: string;
  };
};

type GoogleConnectorSyncJobView = {
  id: string;
  connectionId: string;
  surface: string;
  status: string;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

type GoogleConnectorSourceView = {
  id: string;
  connectionId: string;
  kind: string;
  label: string;
  sourceUri: string;
  brainSourceId?: string | null;
  privacy: {
    retrievalAccess: string;
  };
};

type GoogleConnectorStateView = {
  connections: GoogleConnectorConnectionView[];
  syncJobs: GoogleConnectorSyncJobView[];
  sources: GoogleConnectorSourceView[];
};

type GoogleConnectorProviderStateResponse = {
  data: {
    provider: GoogleConnectorProviderView;
    state?: GoogleConnectorStateView;
  };
};

export type GmailSearchConnectionCandidate = {
  status: string;
  surfaces: string[];
};

type GmailStatusView = GoogleGmailStatusResponse["data"];
type GmailKeywordSearchData = GoogleGmailSearchResponse["data"];
type GmailSemanticSearchData = GoogleGmailSemanticSearchResponse["data"];
type GmailKeywordFilterDraft = {
  from: string;
  to: string;
  subject: string;
  label: string;
  after: string;
  before: string;
  hasAttachment: boolean;
};

interface BrainWorkspaceProps {
  documentsData: BrainDocumentsData | null;
  selectedDocument: BrainDocumentSummary | null;
  data: BrainData | null;
  moves: BrainMove[];
  autopilot: AutopilotTickData | null;
  latestArtifact: SessionCockpitData["latestArtifact"] | null;
  focusedClaimId: string | null;
  canvasOpen: boolean;
  status: string;
  isThinking: boolean;
  recents?: BrainRecentIdea[];
  archivedRecents?: BrainRecentIdea[];
  onSelectDocument: (sessionId: string) => void;
  onBackToLibrary: () => void;
  onNewThought: () => void;
  onSeed: (rawIdea: string) => Promise<void>;
  onQuickNoteCreate?: ((rawIdea: string) => Promise<void>) | undefined;
  onQuickNoteAction?:
    | ((recent: BrainRecentIdea, action: "build" | "brain" | "check" | "learn" | "archive" | "restore") => Promise<void>)
    | undefined;
  onClaimSelect: (claimId: string) => void;
  onReworkDocument: () => Promise<void>;
  onCanvasOpenChange: (open: boolean) => void;
  onCanvasNodeAction: (action: CanvasNodeAction, node: CanvasNode) => void;
  onStartCreateWithBrain?: ((profile: BrainMemoryProfileData) => void) | undefined;
}

interface GraphPoint {
  id: string;
  x: number;
  y: number;
}

interface GraphCardPoint extends GraphPoint {
  width: number;
  height: number;
}

interface BrainSidebarProps {
  sidebar: BrainSidebarData | null;
  documents: BrainDocumentSummary[];
  selectedSessionId: string | null;
  selectedQuickNoteId: string | null;
  recents?: BrainRecentIdea[];
  archivedRecents?: BrainRecentIdea[];
  onSelectDocument: (sessionId: string) => void;
  onSelectQuickNote: (recent: BrainRecentIdea) => void;
  onNewDocument: () => void;
  onQuickNoteCreate?: ((rawIdea: string) => Promise<void>) | undefined;
  onQuickNoteAction?:
    | ((recent: BrainRecentIdea, action: "build" | "brain" | "check" | "learn" | "archive" | "restore") => Promise<void>)
    | undefined;
}

export function BrainWorkspace({
  documentsData,
  selectedDocument,
  data,
  moves,
  autopilot,
  latestArtifact,
  focusedClaimId,
  canvasOpen,
  status,
  isThinking,
  recents = [],
  archivedRecents = [],
  onSelectDocument,
  onBackToLibrary,
  onNewThought,
  onSeed,
  onQuickNoteCreate,
  onQuickNoteAction,
  onClaimSelect,
  onReworkDocument,
  onCanvasOpenChange,
  onCanvasNodeAction,
  onStartCreateWithBrain,
}: BrainWorkspaceProps) {
  const claims = selectedDocument ? data?.ideaMap?.claims ?? [] : [];
  const edges = selectedDocument ? data?.ideaMap?.edges ?? [] : [];
  const graphPath = selectedDocument ? data?.graphPath ?? null : null;
  const initialCanvasData = useMemo(
    () => (selectedDocument ? canvasDataFromBrainData(data, focusedClaimId) : undefined),
    [data, focusedClaimId, selectedDocument],
  );
  const focusedClaim = claims.find((claim) => claim.id === focusedClaimId) ?? null;
  const [claimDetail, setClaimDetail] = useState<ClaimDetailData | null>(null);
  const [claimDetailStatus, setClaimDetailStatus] = useState<ClaimDetailStatus>("idle");
  const [claimDetailError, setClaimDetailError] = useState<string | null>(null);
  const [selectedQuickNoteId, setSelectedQuickNoteId] = useState<string | null>(null);
  const [memoryProfile, setMemoryProfile] = useState<BrainMemoryProfileData | null>(null);
  const [memoryStatus, setMemoryStatus] = useState<BrainMemoryStatus>("idle");
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [memoryNotice, setMemoryNotice] = useState<string | null>(null);
  const [memoryReviewingId, setMemoryReviewingId] = useState<string | null>(null);
  const [documentSeedFocusRequest, setDocumentSeedFocusRequest] = useState(0);
  const quickNotes = useMemo(() => [...recents, ...archivedRecents], [recents, archivedRecents]);
  const selectedQuickNote = quickNotes.find((recent) => recent.id === selectedQuickNoteId) ?? null;
  const selectedQuickNoteArchived = archivedRecents.some((recent) => recent.id === selectedQuickNoteId);
  const selectedSessionLoaded = !selectedDocument || data?.session?.id === selectedDocument.sessionId;
  const documentV2Result = useMemo(
    () =>
      selectedDocument && selectedSessionLoaded
        ? buildBrainDocumentV2({
            document: selectedDocument,
            data,
            moves,
            latestArtifact,
            autopilot,
            canvasData: initialCanvasData,
          })
        : null,
    [autopilot, data, initialCanvasData, latestArtifact, moves, selectedDocument, selectedSessionLoaded],
  );

  useEffect(() => {
    if (!selectedDocument || !focusedClaimId) {
      setClaimDetail(null);
      setClaimDetailStatus("idle");
      setClaimDetailError(null);
      return;
    }

    let cancelled = false;
    setClaimDetailStatus("loading");
    setClaimDetailError(null);

    fetchClaimDetail(focusedClaimId)
      .then((response) => {
        if (!cancelled) {
          setClaimDetail(response.data);
          setClaimDetailStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setClaimDetail(null);
          setClaimDetailStatus("error");
          setClaimDetailError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [focusedClaimId, selectedDocument]);

  useEffect(() => {
    let cancelled = false;
    setMemoryStatus("loading");
    setMemoryError(null);

    fetchBrainMemoryProfile()
      .then((response) => {
        if (!cancelled) {
          setMemoryProfile(response.data);
          setMemoryStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMemoryStatus("error");
          setMemoryError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedQuickNoteId && !selectedQuickNote) {
      setSelectedQuickNoteId(null);
    }
  }, [selectedQuickNote, selectedQuickNoteId]);

  function handleSelectDocument(sessionId: string) {
    setSelectedQuickNoteId(null);
    onSelectDocument(sessionId);
  }

  function handleBackToLibrary() {
    setSelectedQuickNoteId(null);
    onBackToLibrary();
  }

  function handleNewDocument() {
    setSelectedQuickNoteId(null);
    onBackToLibrary();
    setDocumentSeedFocusRequest((request) => request + 1);
  }

  async function handleQuickNoteAction(
    recent: BrainRecentIdea,
    action: "build" | "brain" | "check" | "learn" | "archive" | "restore",
  ) {
    await onQuickNoteAction?.(recent, action);

    if (action === "archive" && recent.id === selectedQuickNoteId) {
      setSelectedQuickNoteId(null);
    }
  }

  async function handleMemoryImport(input: BrainImportInput) {
    setMemoryStatus("importing");
    setMemoryError(null);
    setMemoryNotice(null);

    try {
      const response = await importBrainSource(input);
      setMemoryProfile(response.data.profile);

      if (response.data.job.status === "failed") {
        setMemoryStatus("error");
        setMemoryError(response.data.job.errorMessages.join(" ") || "Brain import failed.");
        return;
      }

      setMemoryStatus("ready");
      setMemoryNotice("Import completed. Review the memories below before starting Create.");
    } catch (error) {
      setMemoryStatus("error");
      setMemoryError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleMemoryDemoFixtureImport(fixtureKind: BrainDemoFixtureKind = "penny") {
    setMemoryStatus("importing");
    setMemoryError(null);
    setMemoryNotice(null);

    try {
      const fixture =
        fixtureKind === "yc-founder" ? await fetchBrainYcFounderFixtureImport() : await fetchBrainDemoFixtureImport();
      const importInputs =
        fixtureKind === "yc-founder" && fixture.data.importInputs?.length ? fixture.data.importInputs : [fixture.data.importInput];
      let profile: BrainMemoryProfileData | null = null;

      for (const [index, importInput] of importInputs.entries()) {
        setMemoryNotice(
          fixtureKind === "yc-founder"
            ? `Importing safe YC fixture source ${index + 1}/${importInputs.length}.`
            : "Importing demo fixture.",
        );
        const response = await importBrainSource(importInput);

        if (response.data.job.status === "failed") {
          setMemoryStatus("error");
          setMemoryError(response.data.job.errorMessages.join(" ") || "Brain fixture import failed.");
          return;
        }

        profile = response.data.profile;
        setMemoryProfile(profile);
      }

      if (!profile) {
        setMemoryStatus("error");
        setMemoryError("Brain fixture did not contain importable sources.");
        return;
      }

      setMemoryStatus("ready");
      setMemoryNotice(
        fixtureKind === "yc-founder"
          ? `YC founder fixture imported from ${importInputs.length} safe fixture/manual sources. Review the derived source-backed memories below before starting Create.`
          : "Demo fixture imported. Review the source-backed memories below before starting Create.",
      );
    } catch (error) {
      setMemoryStatus("error");
      setMemoryError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleMemorySourceDelete(sourceId: string) {
    setMemoryStatus("deleting");
    setMemoryError(null);
    setMemoryNotice(null);

    try {
      const response = await deleteBrainSource(sourceId);
      setMemoryProfile(response.data.profile);
      setMemoryStatus("ready");
      setMemoryNotice("Source deleted. Related chunks and source-backed memories were removed from retrieval and Create.");
    } catch (error) {
      setMemoryStatus("error");
      setMemoryError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleGoogleConnectorSourceDelete(sourceId: string) {
    setMemoryStatus("deleting");
    setMemoryError(null);
    setMemoryNotice(null);

    try {
      const response = await postGoogleConnectorAction("/api/connectors/google/source-delete", { sourceId });

      if (isBrainMemoryProfileData(response.data.profile)) {
        setMemoryProfile(response.data.profile);
      } else {
        const profileResponse = await fetchBrainMemoryProfile();
        setMemoryProfile(profileResponse.data);
      }

      setMemoryStatus("ready");
      setMemoryNotice("Google source deleted. Connector retrieval access and linked Brain source access were removed.");
    } catch (error) {
      setMemoryStatus("error");
      setMemoryError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleMemoryReview(nodeId: string, action: MemoryReviewAction) {
    setMemoryReviewingId(nodeId);
    setMemoryError(null);
    setMemoryNotice(null);
    const targetMemoryTitle = memoryProfile?.recentMemoryNodes.find((node) => node.id === nodeId)?.title ?? "Memory";

    try {
      const response = await reviewBrainMemory(nodeId, { action });
      setMemoryProfile(response.data.profile);
      setMemoryStatus("ready");
      setMemoryNotice(memoryReviewNotice(action, targetMemoryTitle));
    } catch (error) {
      setMemoryStatus("error");
      setMemoryError(error instanceof Error ? error.message : String(error));
    } finally {
      setMemoryReviewingId(null);
    }
  }

  return (
    <main className={`brain-workspace-shell${selectedQuickNote ? " is-quick-note-doc" : ""}`}>
      <BrainSidebar
        sidebar={documentsData?.sidebar ?? null}
        documents={documentsData?.documents ?? []}
        selectedSessionId={selectedDocument?.sessionId ?? null}
        selectedQuickNoteId={selectedQuickNoteId}
        recents={recents}
        archivedRecents={archivedRecents}
        onSelectDocument={handleSelectDocument}
        onSelectQuickNote={(recent) => setSelectedQuickNoteId(recent.id)}
        onNewDocument={handleNewDocument}
        onQuickNoteCreate={onQuickNoteCreate}
        onQuickNoteAction={handleQuickNoteAction}
      />
      {selectedQuickNote ? (
        <QuickNoteDocumentView
          recent={selectedQuickNote}
          archived={selectedQuickNoteArchived}
          disabled={!onQuickNoteAction || isThinking}
          onBack={handleBackToLibrary}
          onAction={handleQuickNoteAction}
        />
      ) : selectedDocument ? (
        <BrainDocumentPage
          document={selectedDocument}
          buildResult={documentV2Result}
          loading={!selectedSessionLoaded}
          isThinking={isThinking}
          status={status}
          onBack={handleBackToLibrary}
          onNewDocument={handleNewDocument}
          onReworkDocument={onReworkDocument}
          onRetry={() => handleSelectDocument(selectedDocument.sessionId)}
          onAsk={onSeed}
        />
      ) : (
        <BrainDocumentsIndex
          documentsData={documentsData}
          memoryProfile={memoryProfile}
          memoryStatus={memoryStatus}
          memoryError={memoryError}
          memoryNotice={memoryNotice}
          memoryReviewingId={memoryReviewingId}
          disabled={isThinking}
          onCreateDocument={onSeed}
          onSelectDocument={handleSelectDocument}
          onMemoryImport={handleMemoryImport}
          onMemoryDemoFixtureImport={handleMemoryDemoFixtureImport}
          onMemorySourceDelete={handleMemorySourceDelete}
          onGoogleConnectorSourceDelete={handleGoogleConnectorSourceDelete}
          onMemoryReview={handleMemoryReview}
          onStartCreateWithBrain={onStartCreateWithBrain}
          focusSeedRequest={documentSeedFocusRequest}
        />
      )}
    </main>
  );
}

type BrainDocumentBuildResult =
  | {
      status: "ready";
      document: BrainDocumentV2;
    }
  | {
      status: "error";
      message: string;
      issues: string[];
    };

type BuildBrainDocumentV2Input = {
  document: BrainDocumentSummary;
  data: BrainData | null;
  moves: BrainMove[];
  latestArtifact: SessionCockpitData["latestArtifact"] | null;
  autopilot: AutopilotTickData | null;
  canvasData: SessionCanvasData | undefined;
};

function BrainDocumentPage({
  document,
  buildResult,
  loading,
  isThinking,
  status,
  onBack,
  onNewDocument,
  onReworkDocument,
  onRetry,
  onAsk,
}: {
  document: BrainDocumentSummary;
  buildResult: BrainDocumentBuildResult | null;
  loading: boolean;
  isThinking: boolean;
  status: string;
  onBack: () => void;
  onNewDocument: () => void;
  onReworkDocument: () => Promise<void>;
  onRetry: () => void;
  onAsk: (rawIdea: string) => Promise<void>;
}) {
  const [askOpen, setAskOpen] = useState(false);

  return (
    <section className="brain-document-main" aria-label="Brain document">
      <div className="brain-doc-toolbar">
        <button type="button" className="text-command" onClick={onBack}>
          All docs
        </button>
        <div className="brain-doc-actions">
          <button type="button" className="text-command" disabled={isThinking} onClick={onReworkDocument}>
            Rework in Create
          </button>
          <button type="button" className="text-command" disabled={isThinking} onClick={() => setAskOpen(true)}>
            Ask Penny
          </button>
          <button type="button" className="primary-command" onClick={onNewDocument}>
            New Document
          </button>
        </div>
      </div>
      {loading ? (
        <article className="brain-document-loading">
          <Sparkles size={18} aria-hidden="true" />
          <strong>Opening structured document</strong>
          <span>{status}</span>
        </article>
      ) : buildResult?.status === "ready" ? (
        <>
          <article className="brain-document-page">
            <DocumentHero document={buildResult.document} />
            <div className="brain-document-card-grid">
              <InlineDocumentCard title="Mini summary" body={buildResult.document.miniSummary} />
              <InlineDocumentCard title="Takeaways" values={buildResult.document.takeaways} />
              <InlineDocumentCard title="Related ideas" values={buildResult.document.relatedIdeas} />
            </div>
            <div className="brain-document-blocks">
              {buildResult.document.blocks.map((block) => (
                <BrainDocumentBlock key={block.id} block={block} />
              ))}
            </div>
            <InlineThinkingCanvas canvas={buildResult.document.canvas} />
            <WorkingNotes sessionId={document.sessionId} title={document.title} />
            <DocumentProvenance document={buildResult.document} rawDocument={document} />
          </article>
          <BrainAskDrawer
            open={askOpen}
            document={buildResult.document}
            disabled={isThinking}
            onClose={() => setAskOpen(false)}
            onAsk={onAsk}
          />
        </>
      ) : (
        <BrainDocumentError
          title={document.title}
          message={buildResult?.message ?? "The structured document could not be generated from the current AI session state."}
          issues={buildResult?.issues ?? ["The session has not finished loading."]}
          disabled={isThinking}
          onRetry={onRetry}
        />
      )}
    </section>
  );
}

function DocumentHero({ document }: { document: BrainDocumentV2 }) {
  return (
    <header className="brain-document-v2-hero">
      <div className="brain-document-v2-kicker">
        <span>Brain Document</span>
        <span>{formatLabel(document.metadata.status)}</span>
      </div>
      <h1>{document.title}</h1>
      <p>{document.subtitle}</p>
      <div className="brain-document-v2-meta" aria-label="Document metadata">
        <span>Created {formatDate(document.metadata.createdAt)}</span>
        <span>Updated {formatDate(document.metadata.updatedAt)}</span>
        <span>{document.metadata.claimCount} claims</span>
        <span>{document.metadata.edgeCount} edges</span>
        <span>{document.metadata.moveCount} moves</span>
      </div>
    </header>
  );
}

function InlineDocumentCard({
  title,
  body,
  values,
}: {
  title: string;
  body?: string;
  values?: string[];
}) {
  const cleanedValues = (values ?? []).map((value) => value.trim()).filter(Boolean);

  return (
    <section className="inline-document-card">
      <h2>{title}</h2>
      {cleanedValues.length > 0 ? (
        <ul>
          {cleanedValues.map((value, index) => (
            <li key={`${title}-${index}`}>{value}</li>
          ))}
        </ul>
      ) : (
        <p>{body}</p>
      )}
    </section>
  );
}

function BrainDocumentBlock({ block }: { block: BrainDocumentBlockData }) {
  const items = block.items?.map((item) => item.trim()).filter(Boolean) ?? [];

  return (
    <section className={`brain-document-block is-${block.kind}`}>
      <span>{block.eyebrow}</span>
      <h2>{block.title}</h2>
      <p>{block.body}</p>
      {items.length > 0 ? (
        <ul>
          {items.map((item, index) => (
            <li key={`${block.id}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function InlineThinkingCanvas({ canvas }: { canvas: BrainDocumentV2["canvas"] }) {
  const initialNodes = useMemo(() => layoutInlineCanvasNodes(canvas.nodes), [canvas.nodes]);
  const [nodes, setNodes] = useState(initialNodes);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    nodeId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const boardSize = inlineCanvasBoardSize(nodes);

  useEffect(() => {
    setNodes(initialNodes);
    setDraggingNodeId(null);
    dragRef.current = null;
  }, [initialNodes]);

  function handleNodePointerDown(event: React.PointerEvent<HTMLElement>, node: InlineCanvasPositionedNode) {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y,
    };
    setDraggingNodeId(node.id);
  }

  function handleNodePointerMove(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const nextX = drag.originX + event.clientX - drag.startX;
    const nextY = drag.originY + event.clientY - drag.startY;

    setNodes((current) => {
      const moved = current.map((node) => {
        if (node.id !== drag.nodeId) {
          return node;
        }

        return {
          ...node,
          ...clampInlineCanvasPosition(node, nextX, nextY),
        };
      });

      return resolveInlineCanvasOverlaps(moved, drag.nodeId);
    });
  }

  function stopNodeDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setDraggingNodeId(null);
  }

  return (
    <section className="inline-thinking-canvas" aria-label="Inline thinking canvas">
      <div className="inline-thinking-canvas-head">
        <div>
          <span>Thinking Canvas</span>
          <h2>How this idea works</h2>
        </div>
        <small>{canvas.nodes.length} cards</small>
      </div>
      <div className="inline-thinking-canvas-board">
        <div className="inline-thinking-canvas-plane" style={{ width: boardSize.width, height: boardSize.height }}>
          <svg viewBox={`0 0 ${boardSize.width} ${boardSize.height}`} aria-hidden="true">
            <defs>
              <marker
                id="inline-canvas-arrow"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            {canvas.edges.map((edge, index) => {
              const source = nodeMap.get(edge.source);
              const target = nodeMap.get(edge.target);

              if (!source || !target) {
                return null;
              }

              const route = inlineCanvasEdgeRoute(source, target, index);

              return (
                <g key={edge.id}>
                  <path className="inline-canvas-edge" d={route.path} markerEnd="url(#inline-canvas-arrow)" />
                  <text className="inline-canvas-edge-label" x={route.labelX} y={route.labelY}>
                    {edge.label}
                  </text>
                </g>
              );
            })}
          </svg>
          {nodes.map((node) => (
            <article
              key={node.id}
              className={`inline-canvas-node is-${node.kind.toLowerCase().replaceAll(" ", "-")}${draggingNodeId === node.id ? " is-dragging" : ""}`}
              style={{ left: `${node.x}px`, top: `${node.y}px`, width: node.width, height: node.height }}
              tabIndex={0}
              aria-label={`${node.kind} card: ${node.title}`}
              onPointerDown={(event) => handleNodePointerDown(event, node)}
              onPointerMove={handleNodePointerMove}
              onPointerUp={stopNodeDrag}
              onPointerCancel={stopNodeDrag}
            >
              <span>{node.kind}</span>
              <strong>{node.title}</strong>
              <p>{node.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function BrainAskDrawer({
  open,
  document,
  disabled,
  onClose,
  onAsk,
}: {
  open: boolean;
  document: BrainDocumentV2;
  disabled: boolean;
  onClose: () => void;
  onAsk: (rawIdea: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();

    if (!question) {
      return;
    }

    setError(null);

    try {
      await onAsk(`In the Brain document "${document.title}", ${question}`);
      setDraft("");
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className="brain-ask-drawer" role="dialog" aria-modal="false" aria-label="Ask Penny about this document">
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="brain-ask-drawer-head">
          <div>
            <span>Ask Penny</span>
            <strong>{document.title}</strong>
          </div>
          <button type="button" aria-label="Close Ask Penny" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask for a sharper claim, a missing assumption, or the next stress test."
          rows={4}
        />
        {error ? <p>{error}</p> : null}
        <button type="submit" className="primary-command" disabled={disabled || !draft.trim()}>
          Send to Brain
        </button>
      </form>
    </div>
  );
}

function DocumentProvenance({
  document,
  rawDocument,
}: {
  document: BrainDocumentV2;
  rawDocument: BrainDocumentSummary;
}) {
  return (
    <details className="brain-document-provenance">
      <summary>Provenance</summary>
      <dl>
        <div>
          <dt>Session</dt>
          <dd>{document.metadata.sessionId}</dd>
        </div>
        <div>
          <dt>Generated from</dt>
          <dd>{formatLabel(document.metadata.generatedFrom)}</dd>
        </div>
        {rawDocument.latestArtifact ? (
          <div>
            <dt>Latest artifact</dt>
            <dd>{rawDocument.latestArtifact.title}</dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

function BrainDocumentError({
  title,
  message,
  issues,
  disabled,
  onRetry,
}: {
  title: string;
  message: string;
  issues: string[];
  disabled: boolean;
  onRetry: () => void;
}) {
  return (
    <article className="brain-document-error" role="alert">
      <CircleHelp size={20} aria-hidden="true" />
      <span>Structured document unavailable</span>
      <h1>{title}</h1>
      <p>{message}</p>
      <ul>
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
      <button type="button" className="primary-command" disabled={disabled} onClick={onRetry}>
        Retry
      </button>
    </article>
  );
}

function buildBrainDocumentV2(input: BuildBrainDocumentV2Input): BrainDocumentBuildResult {
  const { document, data, moves, latestArtifact, autopilot, canvasData } = input;
  const claims = data?.ideaMap?.claims ?? [];
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const mainClaim = firstNonEmpty(document.mainClaim?.text, claims.find((claim) => claim.kind === "belief")?.text);
  const originalIdea = firstNonEmpty(document.originalIdea, data?.source?.rawText);
  const currentDirection = firstNonEmpty(
    document.finalRecommendations[0],
    document.nextActions[0],
    latestArtifact?.summary,
    autopilot?.suggestion?.why,
  );
  const assumptions = uniqueDocumentStrings([
    ...claims.filter((claim) => claim.kind === "assumption").map((claim) => claim.text),
    ...document.strongestOptions.filter((claim) => claim.kind === "assumption").map((claim) => claim.text),
  ]).slice(0, 5);
  const keyQuestions = uniqueDocumentStrings([
    ...claims.filter((claim) => claim.kind === "question").map((claim) => claim.text),
    ...document.todoLaterIdeas,
    autopilot?.suggestion?.exitCriteria?.label,
  ]).slice(0, 5);
  const tensions = uniqueDocumentStrings([
    ...document.rejectedOptions.map((claim) => claim.text),
    autopilot?.suggestion?.why,
    ...claims.filter((claim) => claim.status === "rejected").map((claim) => claim.text),
  ]).slice(0, 5);
  const evidence = uniqueDocumentStrings([
    originalIdea ? `Source seed: ${originalIdea}` : null,
    latestArtifact?.summary ? `Latest artifact: ${latestArtifact.summary}` : null,
    document.latestArtifact?.summary ? `Saved artifact: ${document.latestArtifact.summary}` : null,
  ]).slice(0, 4);
  const notes = uniqueDocumentStrings([
    ...moves.slice(-4).map((move) => move.summary),
    document.lastMove?.summary,
  ]).slice(0, 5);
  const takeaways = uniqueDocumentStrings([
    ...document.finalRecommendations,
    latestArtifact?.summary,
    document.latestArtifact?.summary,
  ]).slice(0, 5);
  const relatedIdeas = uniqueDocumentStrings([
    ...document.strongestOptions.map((claim) => claim.text),
    ...claims.filter((claim) => claim.kind === "concept").map((claim) => claim.text),
  ]).slice(0, 5);
  const miniSummary = firstNonEmpty(document.description, latestArtifact?.summary, takeaways[0]);
  const subtitle = firstNonEmpty(document.description, miniSummary);
  const summary = firstNonEmpty(latestArtifact?.summary, document.latestArtifact?.summary, document.description);
  const missing = [
    ["original idea", originalIdea],
    ["main claim", mainClaim],
    ["current direction", currentDirection],
    ["assumptions", assumptions[0]],
    ["evidence", evidence[0]],
    ["questions", keyQuestions[0]],
    ["notes", notes[0]],
    ["takeaways", takeaways[0]],
    ["related ideas", relatedIdeas[0]],
    ["mini summary", miniSummary],
  ]
    .filter(([, value]) => !value)
    .map(([label]) => `Missing ${label} from the AI/session projection.`);

  if (missing.length > 0) {
    return {
      status: "error",
      message: "Penny did not receive enough structured AI session content to render a complete document.",
      issues: missing,
    };
  }

  const canvas = buildInlineDocumentCanvas({
    mainClaim,
    assumptions,
    evidence,
    tensions,
    keyQuestions,
    currentDirection,
    relatedIdeas,
    claimById,
    canvasData,
  });
  const blocks = documentBlocks({
    originalIdea,
    mainClaim,
    currentDirection,
    assumptions,
    evidence,
    keyQuestions,
    notes,
    tensions,
  });

  return {
    status: "ready",
    document: {
      title: document.title,
      subtitle,
      summary,
      originalIdea,
      mainClaim,
      currentDirection,
      keyQuestions,
      assumptions,
      evidence,
      tensions,
      notes,
      takeaways,
      relatedIdeas,
      miniSummary,
      canvas,
      metadata: {
        sessionId: document.sessionId,
        status: document.status,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        claimCount: document.counts.claims,
        edgeCount: document.counts.edges,
        moveCount: document.counts.moves,
        artifactCount: document.counts.artifacts,
        generatedFrom: "ai_session_state",
      },
      blocks,
    },
  };
}

function documentBlocks(input: {
  originalIdea: string;
  mainClaim: string;
  currentDirection: string;
  assumptions: string[];
  evidence: string[];
  keyQuestions: string[];
  notes: string[];
  tensions: string[];
}): BrainDocumentBlockData[] {
  return [
    documentBlock("original_idea", "Seed", "Original idea", input.originalIdea),
    documentBlock("main_claim", "Claim", "Main claim", input.mainClaim),
    documentBlock("current_direction", "Direction", "Current direction", input.currentDirection),
    documentBlock("assumptions", "Structure", "Assumptions", "The idea currently depends on these claims.", input.assumptions),
    documentBlock("evidence", "Grounding", "Evidence", "Penny is grounding this document in the available source and artifact trail.", input.evidence),
    documentBlock("questions", "Open loops", "Questions", "These questions should shape the next review pass.", input.keyQuestions),
    documentBlock("tensions", "Stress test", "Tensions", "These are the current contradictions, rejected options, or challenge pressure points.", input.tensions),
    documentBlock("notes", "Moves", "Notes", "Recent session moves and saved notes keep this document connected to thinking history.", input.notes),
  ];
}

function documentBlock(
  kind: BrainDocumentBlockData["kind"],
  eyebrow: string,
  title: string,
  body: string,
  items?: string[],
): BrainDocumentBlockData {
  const cleanedItems = items?.map((item) => item.trim()).filter(Boolean);

  return {
    id: kind,
    kind,
    eyebrow,
    title,
    body,
    ...(cleanedItems?.length ? { items: cleanedItems } : {}),
  };
}

function buildInlineDocumentCanvas(input: {
  mainClaim: string;
  assumptions: string[];
  evidence: string[];
  tensions: string[];
  keyQuestions: string[];
  currentDirection: string;
  relatedIdeas: string[];
  claimById: Map<string, BrainClaim>;
  canvasData: SessionCanvasData | undefined;
}): BrainDocumentV2["canvas"] {
  const graphConcept = input.canvasData?.nodes.find((node) => node.kind === "concept");
  const graphClaim = input.canvasData?.nodes.find((node) => node.kind === "claim" || node.kind === "belief");
  const graphAssumption = input.canvasData?.nodes.find((node) => node.kind === "assumption");
  const graphQuestion = input.canvasData?.nodes.find((node) => node.kind === "question");
  const nodes: BrainDocumentCanvasNode[] = [
    inlineCanvasNode("concept", "Concept", graphConcept?.title ?? input.relatedIdeas[0], graphConcept?.summary ?? input.relatedIdeas[0], 70, 70),
    inlineCanvasNode("claim", "Claim", graphClaim?.title ?? input.mainClaim, graphClaim?.summary ?? input.mainClaim, 360, 70),
    inlineCanvasNode("assumption", "Assumption", graphAssumption?.title ?? input.assumptions[0], graphAssumption?.summary ?? input.assumptions[0], 650, 70),
    inlineCanvasNode("evidence", "Evidence", "Available grounding", input.evidence[0], 110, 300),
    inlineCanvasNode("tension", "Tension", "Pressure point", input.tensions[0], 360, 330),
    inlineCanvasNode("question", "Question", graphQuestion?.title ?? input.keyQuestions[0], graphQuestion?.summary ?? input.keyQuestions[0], 620, 310),
    inlineCanvasNode("next", "Next Move", "Next move", input.currentDirection, 365, 455),
  ];
  const edges: BrainDocumentCanvasEdge[] = [
    { id: "edge-concept-claim", source: "concept", target: "claim", label: "frames" },
    { id: "edge-claim-assumption", source: "claim", target: "assumption", label: "depends on" },
    { id: "edge-evidence-claim", source: "evidence", target: "claim", label: "grounds" },
    { id: "edge-assumption-tension", source: "assumption", target: "tension", label: "pressures" },
    { id: "edge-tension-question", source: "tension", target: "question", label: "opens" },
    { id: "edge-question-next", source: "question", target: "next", label: "drives" },
  ];

  return { nodes, edges };
}

function inlineCanvasNode(
  id: string,
  kind: BrainDocumentCanvasNode["kind"],
  title: string | undefined,
  body: string | undefined,
  x: number,
  y: number,
): BrainDocumentCanvasNode {
  return {
    id,
    kind,
    title: firstNonEmpty(title, body),
    body: firstNonEmpty(body, title),
    x,
    y,
  };
}

type InlineCanvasPositionedNode = BrainDocumentCanvasNode & {
  width: number;
  height: number;
};

const inlineCanvasNodeWidth = 260;
const inlineCanvasNodeHeight = 198;
const inlineCanvasPadding = 72;
const inlineCanvasGap = 42;
const inlineCanvasMinWidth = 1240;
const inlineCanvasMinHeight = 930;
const inlineCanvasDefaultPositions: Record<string, { x: number; y: number }> = {
  concept: { x: 72, y: 92 },
  claim: { x: 490, y: 92 },
  assumption: { x: 908, y: 92 },
  evidence: { x: 72, y: 400 },
  tension: { x: 490, y: 400 },
  question: { x: 908, y: 400 },
  next: { x: 490, y: 690 },
};

function layoutInlineCanvasNodes(nodes: BrainDocumentCanvasNode[]): InlineCanvasPositionedNode[] {
  return resolveInlineCanvasOverlaps(
    nodes.map((node, index) => {
      const fallbackColumn = index % 3;
      const fallbackRow = Math.floor(index / 3);
      const defaultPosition = inlineCanvasDefaultPositions[node.id] ?? {
        x: inlineCanvasPadding + fallbackColumn * (inlineCanvasNodeWidth + 158),
        y: inlineCanvasPadding + fallbackRow * (inlineCanvasNodeHeight + 110),
      };

      return {
        ...node,
        ...defaultPosition,
        width: inlineCanvasNodeWidth,
        height: inlineCanvasNodeHeight,
      };
    }),
  );
}

function inlineCanvasBoardSize(nodes: InlineCanvasPositionedNode[]): { width: number; height: number } {
  if (nodes.length === 0) {
    return { width: inlineCanvasMinWidth, height: inlineCanvasMinHeight };
  }

  return {
    width: Math.max(inlineCanvasMinWidth, Math.ceil(Math.max(...nodes.map((node) => node.x + node.width)) + inlineCanvasPadding)),
    height: Math.max(inlineCanvasMinHeight, Math.ceil(Math.max(...nodes.map((node) => node.y + node.height)) + inlineCanvasPadding)),
  };
}

function clampInlineCanvasPosition(node: InlineCanvasPositionedNode, x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(inlineCanvasPadding, Math.min(x, inlineCanvasMinWidth - node.width - inlineCanvasPadding)),
    y: Math.max(inlineCanvasPadding, y),
  };
}

function resolveInlineCanvasOverlaps(
  nodes: InlineCanvasPositionedNode[],
  preferredNodeId?: string,
): InlineCanvasPositionedNode[] {
  const ordered = preferredNodeId
    ? [
        ...nodes.filter((node) => node.id === preferredNodeId),
        ...nodes.filter((node) => node.id !== preferredNodeId),
      ]
    : nodes;
  const placed: InlineCanvasPositionedNode[] = [];

  for (const node of ordered) {
    const candidate = { ...node };
    let guard = 0;

    while (placed.some((placedNode) => inlineCanvasNodesOverlap(candidate, placedNode)) && guard < 80) {
      const overlapping = placed.find((placedNode) => inlineCanvasNodesOverlap(candidate, placedNode));

      if (!overlapping) {
        break;
      }

      candidate.y = overlapping.y + overlapping.height + inlineCanvasGap;
      guard += 1;
    }

    placed.push(candidate);
  }

  return nodes.map((node) => placed.find((placedNode) => placedNode.id === node.id) ?? node);
}

function inlineCanvasNodesOverlap(first: InlineCanvasPositionedNode, second: InlineCanvasPositionedNode): boolean {
  return !(
    first.x + first.width + inlineCanvasGap <= second.x ||
    second.x + second.width + inlineCanvasGap <= first.x ||
    first.y + first.height + inlineCanvasGap <= second.y ||
    second.y + second.height + inlineCanvasGap <= first.y
  );
}

function inlineCanvasEdgeRoute(
  source: InlineCanvasPositionedNode,
  target: InlineCanvasPositionedNode,
  index: number,
): { path: string; labelX: number; labelY: number } {
  const sourceCenterX = source.x + source.width / 2;
  const sourceCenterY = source.y + source.height / 2;
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;
  const deltaX = targetCenterX - sourceCenterX;
  const deltaY = targetCenterY - sourceCenterY;
  const laneOffset = ((index % 3) - 1) * 22;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    const direction = deltaX >= 0 ? 1 : -1;
    const sourceX = direction > 0 ? source.x + source.width : source.x;
    const targetX = direction > 0 ? target.x : target.x + target.width;
    const sourceY = sourceCenterY + laneOffset;
    const targetY = targetCenterY + laneOffset;
    const controlDistance = Math.max(88, Math.abs(targetX - sourceX) * 0.42);

    return {
      path: `M ${sourceX} ${sourceY} C ${sourceX + direction * controlDistance} ${sourceY}, ${targetX - direction * controlDistance} ${targetY}, ${targetX} ${targetY}`,
      labelX: (sourceX + targetX) / 2,
      labelY: (sourceY + targetY) / 2 - 12,
    };
  }

  const direction = deltaY >= 0 ? 1 : -1;
  const sourceY = direction > 0 ? source.y + source.height : source.y;
  const targetY = direction > 0 ? target.y : target.y + target.height;
  const sourceX = sourceCenterX + laneOffset;
  const targetX = targetCenterX + laneOffset;
  const controlDistance = Math.max(84, Math.abs(targetY - sourceY) * 0.42);

  return {
    path: `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY + direction * controlDistance}, ${targetX} ${targetY - direction * controlDistance}, ${targetX} ${targetY}`,
    labelX: (sourceX + targetX) / 2,
    labelY: (sourceY + targetY) / 2 - 12,
  };
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? "";
}

function uniqueDocumentStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const cleaned = value?.replace(/\s+/g, " ").trim();

    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(cleaned);
  }

  return output;
}

function canvasDataFromBrainData(data: BrainData | null, focusedClaimId: string | null): SessionCanvasData | undefined {
  if (!data) {
    return undefined;
  }

  if (data.graphPath?.nodes.length) {
    const nodes = data.graphPath.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      title: node.label,
      status: node.status,
      confidence: node.confidence,
      x: 104 + node.lane * 340,
      y: 112 + node.depth * 248,
      refs: {
        claimId: node.claimId,
      },
    }));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = data.graphPath.edges
      .filter((edge) => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId))
      .map((edge) => ({
        id: edge.id,
        source: edge.fromNodeId,
        target: edge.toNodeId,
        kind: edge.kind,
        label: edge.label,
      }));
    const selectedNodeId =
      nodes.find((node) => node.refs.claimId === focusedClaimId)?.id ??
      nodes.find((node) => data.graphPath?.focusClaimId && node.refs.claimId === data.graphPath.focusClaimId)?.id ??
      nodes.find((node) => data.graphPath?.nodes.some((pathNode) => pathNode.id === node.id && pathNode.selected))?.id ??
      nodes[0]?.id;
    const recommendedPath = data.graphPath.nodes
      .filter((node) => node.suggested || node.selected)
      .sort((left, right) => left.rank - right.rank)
      .map((node) => node.id);

    return {
      nodes,
      edges,
      ...(recommendedPath.length ? { recommendedPath } : {}),
      ...(selectedNodeId ? { selectedNodeId } : {}),
    };
  }

  const claims = data.ideaMap?.claims ?? [];

  if (!claims.length) {
    return undefined;
  }

  const nodes = claims.map((claim) => ({
    id: `claim:${claim.id}`,
    kind: claim.kind,
    title: claim.text,
    status: claim.status,
    confidence: claim.confidence ?? null,
    refs: {
      claimId: claim.id,
    },
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (data.ideaMap?.edges ?? [])
    .map((edge) => ({
      id: edge.id,
      source: `claim:${edge.fromClaimId}`,
      target: `claim:${edge.toClaimId}`,
      kind: edge.kind,
      label: edge.label ?? null,
    }))
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const selectedNodeId =
    (focusedClaimId ? nodes.find((node) => node.refs.claimId === focusedClaimId)?.id : undefined) ?? nodes[0]?.id;

  return {
    nodes,
    edges,
    ...(selectedNodeId ? { selectedNodeId } : {}),
  };
}

function QuickNoteDocumentView({
  recent,
  archived,
  disabled,
  onBack,
  onAction,
}: {
  recent: BrainRecentIdea;
  archived: boolean;
  disabled: boolean;
  onBack: () => void;
  onAction: (
    recent: BrainRecentIdea,
    action: "build" | "brain" | "check" | "learn" | "archive" | "restore",
  ) => Promise<void>;
}) {
  const title = truncateWords(recent.rawIdea, 10);
  const updatedAt = recent.updatedAt ?? recent.createdAt;

  return (
    <section className="quick-note-document-main" aria-label="Quick note document">
      <div className="brain-doc-toolbar">
        <button type="button" className="text-command" onClick={onBack}>
          All notes
        </button>
        <div className="brain-doc-actions">
          {archived ? (
            <button
              type="button"
              className="primary-command"
              disabled={disabled}
              onClick={() => void onAction(recent, "restore")}
            >
              Restore
            </button>
          ) : (
            <>
              <button
                type="button"
                className="text-command"
                disabled={disabled}
                onClick={() => void onAction(recent, "build")}
              >
                Build
              </button>
              <button
                type="button"
                className="text-command"
                disabled={disabled}
                onClick={() => void onAction(recent, "check")}
              >
                Create
              </button>
              <button
                type="button"
                className="text-command"
                disabled={disabled}
                onClick={() => void onAction(recent, "learn")}
              >
                Learn
              </button>
              <button
                type="button"
                className="primary-command"
                disabled={disabled}
                onClick={() => void onAction(recent, "brain")}
              >
                Save to Brain
              </button>
            </>
          )}
        </div>
      </div>
      <article className="quick-note-document">
        <header className="quick-note-document-head">
          <span>Quick Note</span>
          <h1>{title}</h1>
          <small>{archived ? archiveMeta(recent) : `Updated ${formatDate(updatedAt)}`}</small>
        </header>
        <div className="quick-note-document-body" role="textbox" aria-readonly="true" tabIndex={0}>
          {recent.rawIdea}
        </div>
      </article>
    </section>
  );
}

function FocusedGraphDetail({
  focusedClaim,
  detail,
  detailStatus,
  detailError,
  localClaims,
  localEdges,
  moves,
}: {
  focusedClaim: BrainClaim | null;
  detail: ClaimDetailData | null;
  detailStatus: ClaimDetailStatus;
  detailError: string | null;
  localClaims: BrainClaim[];
  localEdges: BrainEdge[];
  moves: BrainMove[];
}) {
  const claim = detail?.claim ?? focusedClaim;
  const focusKey = claim?.id ?? "none";
  const [stitchMode, setStitchMode] = useState(false);

  useEffect(() => {
    setStitchMode(false);
  }, [focusKey]);

  if (!claim) {
    return null;
  }

  const connections = detail?.connectedClaims ?? localClaimConnections(claim, localClaims, localEdges);
  const supportConnections = connections.filter((connection) => isSupportConnection(connection.edge.kind));
  const tensionConnections = connections.filter((connection) => isTensionConnection(connection.edge.kind));
  const contextConnections = connections.filter(
    (connection) => !isSupportConnection(connection.edge.kind) && !isTensionConnection(connection.edge.kind),
  );
  const reasoningItems = detail
    ? reasoningFromDetailMoves(detail.moves)
    : moves.slice(0, 5).map((move) => ({
        id: move.id,
        label: formatLabel(move.kind ?? move.type ?? "move"),
        text: move.summary,
        meta: move.createdAt ? formatDate(move.createdAt) : null,
      }));
  const sourceSpans = detail?.provenance.spans.filter((span) => span.text.trim()).slice(0, 3) ?? [];
  const artifactReferences = detail?.artifactReferences.slice(0, 3) ?? [];
  const latestVersion = detail?.currentVersion;

  return (
    <section className="focused-graph-detail" aria-label="Selected graph part full view">
      <div className="focused-detail-head">
        <div>
          <span className="section-label">FULL VIEW</span>
          <h2>{claim.text}</h2>
        </div>
        <div className="focused-detail-actions" aria-label="Full view options">
          <button
            type="button"
            className={`stitch-toggle${stitchMode ? " is-active" : ""}`}
            onClick={() => setStitchMode((current) => !current)}
            aria-pressed={stitchMode}
          >
            Stitch {stitchMode ? "On" : "Off"}
          </button>
        </div>
      </div>
      <div className="focused-detail-meta" aria-label="Selected claim state">
        <span>{formatLabel(claim.kind)}</span>
        <span>{formatLabel(claim.status)}</span>
        {latestVersion ? <span>Version {shortId(latestVersion.id)}</span> : null}
      </div>
      {detailStatus === "loading" ? <p className="focused-detail-note">Loading graph detail.</p> : null}
      {detailStatus === "error" ? (
        <p className="focused-detail-note">Using the current graph slice. {detailError}</p>
      ) : null}
      {stitchMode ? (
        <StitchedReference
          claimText={claim.text}
          supportConnections={supportConnections}
          tensionConnections={tensionConnections}
          contextConnections={contextConnections}
          reasoningItems={reasoningItems}
        />
      ) : (
        <div className="focused-detail-grid">
          <DetailList
            title="Chosen Ideas"
            emptyLabel="No connected ideas recorded yet."
            items={[...supportConnections, ...contextConnections].slice(0, 6).map((connection) => ({
              id: connection.edge.id,
              label: relationshipLabel(connection),
              text: connection.claim.text,
              meta: `${formatLabel(connection.claim.kind)} / ${connection.direction}`,
            }))}
          />
          <DetailList
            title="Support / Tension"
            emptyLabel="No support or tension links recorded yet."
            items={[...supportConnections, ...tensionConnections].slice(0, 6).map((connection) => ({
              id: `${connection.edge.id}-relation`,
              label: relationshipLabel(connection),
              text: connection.claim.text,
              meta: connection.edge.status ? formatLabel(connection.edge.status) : null,
            }))}
          />
          <DetailList
            title="Reasoning"
            emptyLabel="No reasoning moves recorded for this claim yet."
            items={reasoningItems.slice(0, 6)}
          />
          <DetailList
            title="Provenance"
            emptyLabel="No source spans or artifacts reference this claim yet."
            items={[
              ...sourceSpans.map((span) => ({
                id: span.id,
                label: formatLabel(span.label ?? "source span"),
                text: span.text,
                meta: span.sourceId ? `Source ${shortId(span.sourceId)}` : null,
              })),
              ...artifactReferences.map((artifact) => ({
                id: artifact.id,
                label: formatLabel(artifact.kind),
                text: artifact.summary || artifact.title,
                meta: artifact.referenceReasons.map(formatLabel).join(", "),
              })),
            ]}
          />
        </div>
      )}
    </section>
  );
}

function DetailList({
  title,
  emptyLabel,
  items,
}: {
  title: string;
  emptyLabel: string;
  items: Array<{ id: string; label: string; text: string; meta: string | null }>;
}) {
  return (
    <section className="detail-list">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span>{item.label}</span>
              <strong>{item.text}</strong>
              {item.meta ? <small>{item.meta}</small> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyLabel}</p>
      )}
    </section>
  );
}

function StitchedReference({
  claimText,
  supportConnections,
  tensionConnections,
  contextConnections,
  reasoningItems,
}: {
  claimText: string;
  supportConnections: ClaimDetailConnection[];
  tensionConnections: ClaimDetailConnection[];
  contextConnections: ClaimDetailConnection[];
  reasoningItems: Array<{ id: string; label: string; text: string; meta: string | null }>;
}) {
  return (
    <article className="stitched-reference">
      <section>
        <h3>Core</h3>
        <p>{claimText}</p>
      </section>
      <section>
        <h3>Support</h3>
        <p>{sentenceFromConnections(supportConnections, "No supporting idea is attached yet.")}</p>
      </section>
      <section>
        <h3>Tension</h3>
        <p>{sentenceFromConnections(tensionConnections, "No active tension is attached yet.")}</p>
      </section>
      <section>
        <h3>Context</h3>
        <p>{sentenceFromConnections(contextConnections, "No extra context is attached yet.")}</p>
      </section>
      <section>
        <h3>Reasoning</h3>
        <p>{reasoningItems[0]?.text ?? "No reasoning move is attached yet."}</p>
      </section>
    </article>
  );
}

function BrainSidebar({
  sidebar,
  documents,
  selectedSessionId,
  selectedQuickNoteId,
  recents = [],
  archivedRecents = [],
  onSelectDocument,
  onSelectQuickNote,
  onNewDocument,
  onQuickNoteCreate,
  onQuickNoteAction,
}: BrainSidebarProps) {
  const folders = sidebar?.folders ?? [];
  const [searchQuery, setSearchQuery] = useState("");
  const [localFolders, setLocalFolders] = useState<BrainHierarchyFolder[]>([]);
  const [folderLabelOverrides, setFolderLabelOverrides] = useState<Record<string, string>>({});
  const [documentFolderOverrides, setDocumentFolderOverrides] = useState<Record<string, string>>({});
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const selectedFolderId =
    [...localFolders, ...folders].find((folder) => folder.documents.some((document) => document.sessionId === selectedSessionId))?.id ??
    folders[0]?.id ??
    localFolders[0]?.id ??
    null;
  const [openFolderId, setOpenFolderId] = useState<string | null>(selectedFolderId);
  const [quickNoteDraft, setQuickNoteDraft] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const visibleFolders = useMemo(
    () => applyFolderLabelOverrides(mergeSidebarFolders(folders, localFolders, documentFolderOverrides), folderLabelOverrides),
    [folders, localFolders, documentFolderOverrides, folderLabelOverrides],
  );
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return documents
      .filter((document) =>
        [document.title, document.description, document.originalIdea, document.mainClaim?.text]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 6);
  }, [documents, searchQuery]);
  const recentDocuments = useMemo(
    () => [...documents].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, 6),
    [documents],
  );

  useEffect(() => {
    setOpenFolderId(selectedFolderId);
  }, [selectedFolderId]);

  async function handleQuickNoteCreate() {
    const trimmedDraft = quickNoteDraft.trim();

    if (!trimmedDraft || !onQuickNoteCreate) {
      return;
    }

    await onQuickNoteCreate(trimmedDraft);
    setQuickNoteDraft("");
  }

  function handleAddFolder() {
    const folderNumber = localFolders.length + 1;
    const folder: BrainHierarchyFolder = {
      id: `local-folder-${Date.now()}`,
      label: `New Folder ${folderNumber}`,
      kind: "local",
      documentCount: 0,
      documents: [],
    };

    setLocalFolders((currentFolders) => [folder, ...currentFolders]);
    setOpenFolderId(folder.id);
  }

  function startFolderRename(folder: BrainHierarchyFolder) {
    setOpenFolderId(folder.id);
    setRenamingFolderId(folder.id);
    setRenameDraft(folder.label);
  }

  function commitFolderRename(folderId: string) {
    const trimmedDraft = renameDraft.trim();

    if (trimmedDraft) {
      setLocalFolders((currentFolders) =>
        currentFolders.map((folder) => (folder.id === folderId ? { ...folder, label: trimmedDraft } : folder)),
      );
      setFolderLabelOverrides((currentOverrides) => ({
        ...currentOverrides,
        [folderId]: trimmedDraft,
      }));
    }

    setRenamingFolderId(null);
    setRenameDraft("");
  }

  function cancelFolderRename() {
    setRenamingFolderId(null);
    setRenameDraft("");
  }

  function handleDocumentDrop(event: React.DragEvent<HTMLElement>, folderId: string) {
    const documentId = event.dataTransfer.getData("application/x-penny-document-id");

    if (!documentId) {
      return;
    }

    event.preventDefault();
    setDocumentFolderOverrides((currentOverrides) => ({
      ...currentOverrides,
      [documentId]: folderId,
    }));
    setOpenFolderId(folderId);
  }

  return (
    <aside className="brain-hierarchy-sidebar" aria-label="Brain sidebar">
      <section className="brain-sidebar-search" aria-label="Search Brain">
        <label htmlFor="brainSidebarSearch">
          <Search size={15} aria-hidden="true" />
          <span>Search Brain</span>
        </label>
        <input
          id="brainSidebarSearch"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          type="search"
          placeholder="Find a document or claim"
        />
        {searchResults.length > 0 ? (
          <div className="brain-sidebar-search-results">
            {searchResults.map((document) => (
              <button
                key={document.id}
                type="button"
                className="brain-sidebar-search-result"
                onClick={() => onSelectDocument(document.sessionId)}
              >
                <FileText size={14} aria-hidden="true" />
                <span title={document.title}>{truncateWords(document.title, 7)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>
      <section className="brain-sidebar-section" aria-label="Quick notes">
        <div className="brain-tree" role="tree" aria-label="Quick notes folder">
          <div className="brain-tree-folder" role="treeitem" aria-expanded="true">
            <div className="brain-tree-row is-folder">
              <Folder size={15} aria-hidden="true" />
              <span>Quick Notes</span>
              <small>{recents.length}</small>
            </div>
            <div className="brain-tree-children">
              <form
                className="quick-note-capture"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleQuickNoteCreate();
                }}
              >
                <textarea
                  value={quickNoteDraft}
                  onChange={(event) => setQuickNoteDraft(event.target.value)}
                  placeholder="Write a quick note."
                  rows={2}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      void handleQuickNoteCreate();
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={!quickNoteDraft.trim() || !onQuickNoteCreate}
                  aria-label="Send quick note"
                  title="Send quick note"
                >
                  <Send size={15} aria-hidden="true" />
                </button>
              </form>
              {recents.length > 0 ? (
                <div className="brain-quick-list">
                  {recents.slice(0, 3).map((recent) => (
                    <QuickNoteRow
                      key={recent.id}
                      recent={recent}
                      archived={false}
                      active={recent.id === selectedQuickNoteId}
                      onSelect={onSelectQuickNote}
                      onAction={onQuickNoteAction}
                    />
                  ))}
                </div>
              ) : (
                <p className="brain-sidebar-muted">Quick notes start here.</p>
              )}
            </div>
          </div>
        </div>
        {archivedRecents.length > 0 ? (
          <div className="quick-note-archive">
            <button type="button" className="quick-note-archive-toggle" onClick={() => setArchiveOpen((open) => !open)}>
              <Archive size={14} aria-hidden="true" />
              <span>Archive</span>
              <small>{archivedRecents.length}</small>
            </button>
            {archiveOpen ? (
              <div className="brain-quick-list">
                {archivedRecents.slice(0, 6).map((recent) => (
                  <QuickNoteRow
                    key={recent.id}
                    recent={recent}
                    archived
                    active={recent.id === selectedQuickNoteId}
                    onSelect={onSelectQuickNote}
                    onAction={onQuickNoteAction}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      <section className="brain-sidebar-section" aria-label="Documents">
        <div className="brain-sidebar-section-head">
          <FileText size={15} aria-hidden="true" />
          <strong>Documents</strong>
          <button type="button" className="brain-sidebar-add-doc" onClick={onNewDocument}>
            <Plus size={14} aria-hidden="true" />
            <span>New Document</span>
          </button>
        </div>
        {recentDocuments.length > 0 ? (
          <div className="brain-sidebar-documents">
            {recentDocuments.map((document) => {
              const active = document.sessionId === selectedSessionId;

              return (
                <button
                  key={document.id}
                  type="button"
                  className={`brain-sidebar-document-row${active ? " is-active" : ""}`}
                  onClick={() => onSelectDocument(document.sessionId)}
                  aria-current={active ? "page" : undefined}
                >
                  <span title={document.title}>{truncateWords(document.title, 10)}</span>
                  <small>{formatDate(document.updatedAt)}</small>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="brain-sidebar-muted">Create a document from a seed idea.</p>
        )}
      </section>
      <section className="brain-sidebar-section" aria-label="Document folders">
        <div className="brain-sidebar-section-head">
          <Folder size={15} aria-hidden="true" />
          <strong>Folders</strong>
          <button
            type="button"
            className="brain-sidebar-add-doc"
            disabled
            title="Folder persistence is not in this demo yet."
            aria-label="Add Folder is not in this demo yet"
          >
            <FolderPlus size={14} aria-hidden="true" />
            <span>Add Folder unavailable</span>
          </button>
        </div>
        {visibleFolders.length > 0 ? (
          <div className="brain-tree" role="tree" aria-label="Folders and documents">
            {visibleFolders.map((folder) => {
              const open = folder.id === openFolderId;

              return (
                <div
                  key={folder.id}
                  className="brain-tree-folder"
                  role="treeitem"
                  aria-expanded={open}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDocumentDrop(event, folder.id)}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className="brain-tree-row is-folder"
                    onClick={() => setOpenFolderId((current) => (current === folder.id ? null : folder.id))}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      startFolderRename(folder);
                    }}
                    onKeyDown={(event) => {
                      if (renamingFolderId === folder.id) {
                        return;
                      }

                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setOpenFolderId((current) => (current === folder.id ? null : folder.id));
                      }
                    }}
                  >
                    <Folder size={15} aria-hidden="true" />
                    {renamingFolderId === folder.id ? (
                      <input
                        className="brain-folder-rename-input"
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onContextMenu={(event) => event.stopPropagation()}
                        onBlur={() => commitFolderRename(folder.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitFolderRename(folder.id);
                          }

                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelFolderRename();
                          }
                        }}
                        autoFocus
                        aria-label={`Rename ${folder.label}`}
                      />
                    ) : (
                      <span title={folder.label}>{folder.label}</span>
                    )}
                    <small>{folder.documentCount}</small>
                  </div>
                  {open ? (
                    <div className="brain-tree-children">
                      <button type="button" className="brain-tree-row is-doc is-new-doc" onClick={onNewDocument}>
                        <FilePlus size={14} aria-hidden="true" />
                        <span>New document</span>
                      </button>
                      {folder.documents.map((document) => {
                        const active = document.sessionId === selectedSessionId;

                        return (
                          <div key={document.id} className="brain-tree-document" role="treeitem">
                            <button
                              type="button"
                              className={`brain-tree-row is-doc${active ? " is-active" : ""}`}
                              onClick={() => onSelectDocument(document.sessionId)}
                              draggable
                              onDragStart={(event) => {
                                event.dataTransfer.setData("application/x-penny-document-id", document.id);
                                event.dataTransfer.effectAllowed = "move";
                              }}
                              aria-current={active ? "page" : undefined}
                            >
                              <BookOpen size={14} aria-hidden="true" />
                              <span title={document.title}>{truncateWords(document.title, 7)}</span>
                              <small>{document.fileCount}</small>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="brain-sidebar-empty">
            <strong>No folders yet</strong>
            <span>Start with a thought to create the first document folder.</span>
          </div>
        )}
      </section>
    </aside>
  );
}

function QuickNoteRow({
  recent,
  archived,
  active,
  onSelect,
  onAction,
}: {
  recent: BrainRecentIdea;
  archived: boolean;
  active: boolean;
  onSelect: (recent: BrainRecentIdea) => void;
  onAction?:
    | ((recent: BrainRecentIdea, action: "build" | "brain" | "check" | "learn" | "archive" | "restore") => Promise<void>)
    | undefined;
}) {
  return (
    <article className={`brain-quick-note is-note${archived ? " is-archived" : ""}${active ? " is-active" : ""}`}>
      <button
        type="button"
        className="quick-note-open"
        onClick={() => onSelect(recent)}
        aria-current={active ? "page" : undefined}
      >
        <span title={recent.rawIdea}>{truncateWords(recent.rawIdea, 9)}</span>
        <small>{archived ? archiveMeta(recent) : formatDate(recent.updatedAt ?? recent.createdAt)}</small>
      </button>
      {archived ? (
        <button
          type="button"
          className="quick-note-restore"
          disabled={!onAction}
          onClick={() => void onAction?.(recent, "restore")}
        >
          Restore
        </button>
      ) : null}
    </article>
  );
}

function mergeSidebarFolders(
  folders: BrainHierarchyFolder[],
  localFolders: BrainHierarchyFolder[],
  documentFolderOverrides: Record<string, string>,
): BrainHierarchyFolder[] {
  if (localFolders.length === 0 && Object.keys(documentFolderOverrides).length === 0) {
    return folders;
  }

  const folderMap = new Map<string, BrainHierarchyFolder>();

  [...localFolders, ...folders].forEach((folder) => {
    folderMap.set(folder.id, { ...folder, documents: [] });
  });

  for (const folder of folders) {
    for (const document of folder.documents) {
      const targetFolder = folderMap.get(documentFolderOverrides[document.id] ?? folder.id);

      if (!targetFolder) {
        continue;
      }

      targetFolder.documents.push(document);
    }
  }

  return [...localFolders.map((folder) => folder.id), ...folders.map((folder) => folder.id)]
    .map((folderId) => folderMap.get(folderId))
    .filter((folder): folder is BrainHierarchyFolder => Boolean(folder))
    .map((folder) => ({
      ...folder,
      documentCount: folder.documents.length,
    }));
}

function applyFolderLabelOverrides(
  folders: BrainHierarchyFolder[],
  folderLabelOverrides: Record<string, string>,
): BrainHierarchyFolder[] {
  return folders.map((folder) => ({
    ...folder,
    label: folderLabelOverrides[folder.id] ?? folder.label,
  }));
}

function archiveMeta(recent: BrainRecentIdea): string {
  if (!recent.archiveExpiresAt) {
    return "Archived";
  }

  return `Archived until ${formatDate(recent.archiveExpiresAt)}`;
}

function BrainDocumentsIndex({
  documentsData,
  memoryProfile,
  memoryStatus,
  memoryError,
  memoryNotice,
  memoryReviewingId,
  disabled,
  onCreateDocument,
  onSelectDocument,
  onMemoryImport,
  onMemoryDemoFixtureImport,
  onMemorySourceDelete,
  onGoogleConnectorSourceDelete,
  onMemoryReview,
  onStartCreateWithBrain,
  focusSeedRequest,
}: {
  documentsData: BrainDocumentsData | null;
  memoryProfile: BrainMemoryProfileData | null;
  memoryStatus: BrainMemoryStatus;
  memoryError: string | null;
  memoryNotice: string | null;
  memoryReviewingId: string | null;
  disabled: boolean;
  onCreateDocument: (rawIdea: string) => Promise<void>;
  onSelectDocument: (sessionId: string) => void;
  onMemoryImport: (input: BrainImportInput) => Promise<void>;
  onMemoryDemoFixtureImport: () => Promise<void>;
  onMemorySourceDelete: (sourceId: string) => Promise<void>;
  onGoogleConnectorSourceDelete: (sourceId: string) => Promise<void>;
  onMemoryReview: (nodeId: string, action: MemoryReviewAction) => Promise<void>;
  onStartCreateWithBrain?: ((profile: BrainMemoryProfileData) => void) | undefined;
  focusSeedRequest?: number | undefined;
}) {
  const documents = documentsData?.documents ?? [];
  const [searchQuery, setSearchQuery] = useState("");
  const [seedText, setSeedText] = useState("");
  const seedInputRef = useRef<HTMLTextAreaElement | null>(null);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const recentDocuments = useMemo(() => recentDocumentRows(documents), [documents]);
  const searchResults = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return searchDocumentRows(documents, normalizedQuery);
  }, [documents, normalizedQuery]);
  const memoryFirstRunActive = (memoryProfile?.stats.sourceCount ?? 0) === 0;
  const memoryPanel = (
    <BrainMemoryPanel
      profile={memoryProfile}
      status={memoryStatus}
      error={memoryError}
      notice={memoryNotice}
      reviewingId={memoryReviewingId}
      disabled={disabled}
      onImport={onMemoryImport}
      onDemoFixtureImport={onMemoryDemoFixtureImport}
      onDeleteSource={onMemorySourceDelete}
      onConnectorSourceDelete={onGoogleConnectorSourceDelete}
      onReviewMemory={onMemoryReview}
      onStartCreateWithBrain={onStartCreateWithBrain}
    />
  );

  useEffect(() => {
    if (focusSeedRequest) {
      seedInputRef.current?.focus();
    }
  }, [focusSeedRequest]);

  async function handleCreateDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const rawIdea = seedText.trim();

    if (!rawIdea || disabled) {
      return;
    }

    setSeedText("");
    await onCreateDocument(rawIdea);
  }

  return (
    <section className="brain-library-panel" aria-label="Brain document library">
      <div className="brain-library-head">
        <div>
          <h1>Documents</h1>
        </div>
      </div>
      {memoryFirstRunActive ? memoryPanel : null}
      <form className="brain-document-seed" onSubmit={handleCreateDocument}>
        <label htmlFor="brainDocumentSeed">Start a document</label>
        <div className="brain-document-seed-row">
          <textarea
            id="brainDocumentSeed"
            ref={seedInputRef}
            value={seedText}
            onChange={(event) => setSeedText(event.target.value)}
            placeholder="Write the thought you want Penny to structure."
            rows={3}
            disabled={disabled}
          />
          <button type="submit" className="primary-command" disabled={disabled || !seedText.trim()}>
            <Send size={15} aria-hidden="true" />
            <span>Create</span>
          </button>
        </div>
      </form>
      {memoryFirstRunActive ? null : memoryPanel}
      <section className="brain-search-panel" aria-label="Search through your thinking">
        <label className="sr-only" htmlFor="brainDocumentSearch">
          Search through your thinking
        </label>
        <input
          id="brainDocumentSearch"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search through your thinking"
          type="search"
        />
        <p>Search scans your documents and claims for matching keywords.</p>
      </section>
      {normalizedQuery ? (
        <section className="brain-search-results" aria-label="Search results">
          <div className="brain-section-title">
            <strong>Search results</strong>
            <span>{searchResults.length} matches</span>
          </div>
          {searchResults.length > 0 ? (
            <div className="document-log-table">
              {searchResults.map((result) => (
                <SearchResultRow key={result.id} result={result} onSelectDocument={onSelectDocument} />
              ))}
            </div>
          ) : (
            <article className="document-empty-state">
              <strong>No matches</strong>
              <span>Try a different keyword or phrase.</span>
            </article>
          )}
        </section>
      ) : (
        <section className="brain-recent-documents" aria-label="Most recent documents">
          <div className="brain-section-title">
            <strong>Most recent docs</strong>
            <span>{recentDocuments.length} shown</span>
          </div>
          {recentDocuments.length > 0 ? (
            <div className="document-log-table" aria-label="Most recent documents">
              {recentDocuments.map((document) => (
                <DocumentLogRow key={document.id} document={document} onSelectDocument={onSelectDocument} />
              ))}
            </div>
          ) : (
            <article className="document-empty-state">
              <strong>Start a document</strong>
              <span>Start with a thought and Penny will create the first record.</span>
            </article>
          )}
        </section>
      )}
    </section>
  );
}

export function BrainMemoryPanel({
  profile,
  status,
  error,
  notice,
  reviewingId,
  disabled,
  onImport,
  onDemoFixtureImport,
  onDeleteSource,
  onConnectorSourceDelete,
  onReviewMemory,
  onStartCreateWithBrain,
  showDemoFixture,
}: {
  profile: BrainMemoryProfileData | null;
  status: BrainMemoryStatus;
  error: string | null;
  notice?: string | null;
  reviewingId?: string | null;
  disabled: boolean;
  onImport: (input: BrainImportInput) => Promise<void>;
  onDemoFixtureImport?: ((fixtureKind?: BrainDemoFixtureKind) => Promise<void>) | undefined;
  onDeleteSource: (sourceId: string) => Promise<void>;
  onConnectorSourceDelete: (sourceId: string) => Promise<void>;
  onReviewMemory?: (nodeId: string, action: MemoryReviewAction) => Promise<void>;
  onStartCreateWithBrain?: ((profile: BrainMemoryProfileData) => void) | undefined;
  showDemoFixture?: boolean | undefined;
}) {
  const [draft, setDraft] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<SourceImportKind>("text");
  const [fileName, setFileName] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [googleProvider, setGoogleProvider] = useState<GoogleConnectorProviderView | null>(null);
  const [googleConnectorState, setGoogleConnectorState] = useState<GoogleConnectorStateView>(emptyGoogleConnectorStateView());
  const [gmailConnectorStatus, setGmailConnectorStatus] = useState<GmailStatusView | null>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleConnectorUiStatus>("idle");
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleWarning, setGoogleWarning] = useState<string | null>(null);
  const [googleConnectLink, setGoogleConnectLink] = useState<string | null>(null);
  const importing = status === "importing";
  const sources = profile?.sources ?? [];
  const recentNodes = profile?.recentMemoryNodes ?? [];
  const latestJob = profile?.jobs[0] ?? null;
  const profileSections = profile ? memoryProfileSections(profile, recentNodes) : [];
  const profileReviewKey = profileReviewFingerprint(profile);
  const [reviewedProfileKey, setReviewedProfileKey] = useState<string | null>(null);
  const profileReviewed = Boolean(profileReviewKey && reviewedProfileKey === profileReviewKey);
  const firstRunSteps = brainFirstRunSteps({ profile, recentNodes, sections: profileSections, profileReviewed });
  const hasImportedMemories = (profile?.stats.memoryNodeCount ?? 0) > 0;
  const demoFixtureVisible = showDemoFixture ?? isBrainDemoFixtureMode();
  const canImport = draft.trim().length > 0 && !disabled && !importing;
  const importHint = importHintForKind(kind);

  useEffect(() => {
    if (!profileReviewKey) {
      setReviewedProfileKey(null);
    }
  }, [profileReviewKey]);

  function applyGoogleConnectorResponse(response: GoogleConnectorProviderStateResponse) {
    setGoogleProvider(response.data.provider);
    setGoogleConnectorState(normalizeGoogleConnectorState(response.data.state));
  }

  function applyGmailStatusResponse(response: GoogleGmailStatusResponse) {
    setGmailConnectorStatus(response.data);
    if (isGoogleConnectorStateView(response.data.state)) {
      setGoogleConnectorState(normalizeGoogleConnectorState(response.data.state));
    }
  }

  useEffect(() => {
    let canceled = false;

    setGoogleStatus("loading");
    setGoogleError(null);
    setGoogleWarning(null);
    Promise.all([fetchGoogleConnectorProvider(), fetchGoogleGmailStatus()])
      .then(([providerResponse, gmailResponse]) => {
        if (canceled) {
          return;
        }

        applyGoogleConnectorResponse(providerResponse as unknown as GoogleConnectorProviderStateResponse);
        applyGmailStatusResponse(gmailResponse);
        setGoogleStatus("ready");
      })
      .catch((error) => {
        if (canceled) {
          return;
        }

        setGoogleStatus("error");
        setGoogleError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      canceled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();

    if (!content || disabled || importing) {
      return;
    }

    await onImport({
      kind,
      content,
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(fileName ? { fileName } : {}),
      ...(mimeType ? { mimeType } : {}),
    });
    setDraft("");
    setLabel("");
    setFileName(null);
    setMimeType(null);
    setKind("text");
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      return;
    }

    setFileName(file.name);
    setMimeType(file.type || null);
    setLabel((current) => current || file.name.replace(/\.[^.]+$/, ""));
    const nextKind = kindFromFile(file);

    setKind(nextKind);

    if (nextKind === "zip") {
      setDraft(arrayBufferToBase64(await file.arrayBuffer()));
      event.target.value = "";
      return;
    }

    if (nextKind === "pdf") {
      setDraft("");
      event.target.value = "";
      return;
    }

    setDraft(await file.text());
    event.target.value = "";
  }

  async function handleGoogleConnect() {
    if (disabled || googleStatus === "connecting") {
      return;
    }

    setGoogleStatus("connecting");
    setGoogleError(null);
    setGoogleWarning(null);

    try {
      const response = await createGoogleGmailConnectSession();

      setGoogleConnectLink(response.data.connectLink);
      setGoogleWarning(response.data.warnings.length ? response.data.warnings.join(" ") : null);
      setGoogleStatus("ready");

      if (typeof window !== "undefined") {
        window.location.assign(response.data.connectLink);
      }
    } catch (error) {
      setGoogleStatus("error");
      setGoogleError(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshGoogleConnector() {
    const [response, gmailResponse] = await Promise.all([fetchGoogleConnectorProvider(), fetchGoogleGmailStatus()]);

    applyGoogleConnectorResponse(response as unknown as GoogleConnectorProviderStateResponse);
    applyGmailStatusResponse(gmailResponse);
  }

  async function handleGoogleSyncNow(connectionId: string) {
    const connection = findGoogleConnection(googleConnectorState, connectionId);

    if (!connection || disabled || importing || googleStatus === "syncing") {
      return;
    }

    setGoogleStatus("syncing");
    setGoogleError(null);
    setGoogleWarning(null);

    try {
      const response = await syncGoogleGmail({
        connectionId: connection.credential.connectionId,
        providerConfigKey: connection.credential.providerConfigKey,
        maxResults: 25,
      });

      if (response.data.state) {
        setGoogleConnectorState(normalizeGoogleConnectorState(response.data.state as GoogleConnectorStateView));
      }

      await refreshGoogleConnector();
      setGoogleStatus("ready");
    } catch (error) {
      setGoogleStatus("error");
      setGoogleError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleGoogleRevoke(connectionId: string) {
    const connection = findGoogleConnection(googleConnectorState, connectionId);

    if (!connection || disabled || importing || googleStatus === "revoking") {
      return;
    }

    setGoogleStatus("revoking");
    setGoogleError(null);
    setGoogleWarning(null);

    try {
      const response = await revokeGoogleGmail({
        connectionId: connection.credential.connectionId,
        providerConfigKey: connection.credential.providerConfigKey,
      });

      if (response.data.state) {
        setGoogleConnectorState(normalizeGoogleConnectorState(response.data.state as GoogleConnectorStateView));
      }

      await refreshGoogleConnector();
      setGoogleStatus("ready");
    } catch (error) {
      setGoogleStatus("error");
      setGoogleError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleGoogleDeleteSource(sourceId: string) {
    if (disabled || importing || googleStatus === "deleting") {
      return;
    }

    setGoogleStatus("deleting");
    setGoogleError(null);
    setGoogleWarning(null);

    try {
      await onConnectorSourceDelete(sourceId);
      await refreshGoogleConnector();
      setGoogleStatus("ready");
    } catch (error) {
      setGoogleStatus("error");
      setGoogleError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleGmailKeywordSearch(input: GoogleGmailSearchInput): Promise<GmailKeywordSearchData> {
    return (await searchGoogleGmail(input)).data;
  }

  async function handleGmailSemanticSearch(input: GoogleGmailSemanticSearchInput): Promise<GmailSemanticSearchData> {
    return (await semanticSearchGoogleGmail(input)).data;
  }

  return (
    <section className="brain-memory-panel" aria-label="Second Brain memory">
      <div className="brain-memory-panel-head">
        <div>
          <span>
            <Database size={15} aria-hidden="true" />
            Second Brain memory
          </span>
          <h2>Private context for Create</h2>
        </div>
        <BrainMemoryStatusPill status={status} latestJob={latestJob} />
      </div>
      <p className="brain-memory-summary">
        {profile?.profile.privacySafeSummary ??
          "No private user memory has been imported yet. Create will label suggestions context-light until sources are added."}
      </p>
      {latestJob ? <BrainMemoryImportStatus job={latestJob} /> : null}
      {notice ? <BrainMemoryNotice message={notice} /> : null}
      <ol className="brain-first-run-steps" aria-label="Brain first-run flow">
        {firstRunSteps.map((step, index) => (
          <li key={step.label} className={`${step.done ? "is-done" : ""}${step.active ? " is-active" : ""}`.trim()}>
            <span>{index + 1}</span>
            <strong>{step.label}</strong>
          </li>
        ))}
      </ol>
      <p className="brain-memory-import-hint">
        Supports ChatGPT export ZIPs, conversations.json, extracted ChatGPT files, Claude JSON/CSV/text, notes, markdown, CSV, and
        already-extracted PDF text.
      </p>
      <GoogleConnectorControl
        provider={googleProvider}
        connectorState={googleConnectorState}
        gmailStatus={gmailConnectorStatus}
        status={googleStatus}
        error={googleError}
        warning={googleWarning}
        connectLink={googleConnectLink}
        disabled={disabled || importing}
        onConnect={handleGoogleConnect}
        onSyncNow={handleGoogleSyncNow}
        onRevoke={handleGoogleRevoke}
        onDeleteSource={handleGoogleDeleteSource}
        onKeywordSearch={handleGmailKeywordSearch}
        onSemanticSearch={handleGmailSemanticSearch}
      />
      {error ? <p className="brain-memory-error">{error}</p> : null}
      {demoFixtureVisible && onDemoFixtureImport ? (
        <div className="brain-memory-demo-fixtures" aria-label="Demo fixture loaders">
          <button
            type="button"
            className="secondary-command brain-memory-demo-button"
            disabled={disabled || importing}
            onClick={() => {
              void onDemoFixtureImport("yc-founder");
            }}
          >
            <Sparkles size={15} aria-hidden="true" />
            <span>Load YC founder fixture</span>
          </button>
          <ul className="brain-memory-demo-labels" aria-label="YC founder fixture sources">
            <li>Email fixture, not live Gmail</li>
            <li>LinkedIn-style context, not live LinkedIn</li>
            <li>Manual messages context for demo, not live WhatsApp, iMessage, or SMS</li>
            <li>Founder notes, manual/private</li>
            <li>trainingUse=false</li>
          </ul>
          <button
            type="button"
            className="secondary-command brain-memory-demo-button"
            disabled={disabled || importing}
            onClick={() => {
              void onDemoFixtureImport();
            }}
          >
            <Sparkles size={15} aria-hidden="true" />
            <span>Load Penny demo fixture</span>
          </button>
        </div>
      ) : null}
      <form className="brain-memory-import" onSubmit={handleSubmit}>
        <div className="brain-memory-import-row">
          <label>
            <span>Source label</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Product notes, conversations.json..." />
          </label>
          <label>
            <span>Kind</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as SourceImportKind)}>
              {sourceImportKindOptions.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="brain-memory-file-button">
            <Upload size={14} aria-hidden="true" />
            <span>{fileName ? truncateWords(fileName, 4) : "Choose file"}</span>
            <input
              type="file"
              accept=".txt,.md,.markdown,.json,.csv,.pdf,.zip,text/plain,text/markdown,application/json,text/csv,application/pdf,application/zip"
              onChange={(event) => {
                void handleFileChange(event);
              }}
            />
          </label>
        </div>
        <textarea
          value={kind === "zip" && fileName && draft ? `${fileName} is ready for import. Penny will extract conversations.json or readable text files.` : draft}
          onChange={(event) => {
            if (kind !== "zip") {
              setDraft(event.target.value);
            }
          }}
          placeholder="Paste notes, manual messages transcript, markdown, ChatGPT conversations.json, Claude JSON/CSV/text, docs text, or canvas notes."
          readOnly={kind === "zip" && Boolean(fileName && draft)}
          rows={4}
        />
        {importHint ? <p className="brain-memory-import-hint">{importHint}</p> : null}
        <button type="submit" className="secondary-command" disabled={!canImport}>
          <FilePlus size={15} aria-hidden="true" />
          <span>{importing ? "Importing..." : "Import to Brain"}</span>
        </button>
      </form>
      <div className="brain-memory-grid">
        <BrainMemorySourcesList sources={sources} disabled={disabled || status === "deleting"} onDeleteSource={onDeleteSource} />
        <div className="brain-memory-review-column">
          {profile && hasImportedMemories ? (
            <BrainProfileReviewCard
              profile={profile}
              reviewed={profileReviewed}
              disabled={disabled || importing}
              onReview={() => {
                if (profileReviewKey) {
                  setReviewedProfileKey(profileReviewKey);
                }
              }}
            />
          ) : null}
          <BrainMemoryProfileSummary
            profile={profile}
            recentNodes={recentNodes}
            sections={profileSections}
            reviewingId={reviewingId ?? null}
            disabled={disabled}
            onReviewMemory={onReviewMemory}
          />
        </div>
      </div>
      {profile && hasImportedMemories && onStartCreateWithBrain ? (
        <div className="brain-memory-next-step">
          <div>
            <strong>Ready for Create</strong>
            <span>
              {profile.stats.memoryNodeCount} memories from {profile.stats.sourceCount} sources will travel with the first Create request.
            </span>
          </div>
          <button type="button" className="primary-command" disabled={disabled || importing} onClick={() => onStartCreateWithBrain(profile)}>
            <Sparkles size={15} aria-hidden="true" />
            <span>Use this Brain to create something</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function GoogleConnectorControl({
  provider,
  connectorState,
  gmailStatus,
  status,
  error,
  warning,
  connectLink,
  disabled,
  onConnect,
  onSyncNow,
  onRevoke,
  onDeleteSource,
  onKeywordSearch,
  onSemanticSearch,
}: {
  provider: GoogleConnectorProviderView | null;
  connectorState: GoogleConnectorStateView;
  gmailStatus?: GmailStatusView | null | undefined;
  status: GoogleConnectorUiStatus;
  error: string | null;
  warning: string | null;
  connectLink: string | null;
  disabled: boolean;
  onConnect: () => Promise<void>;
  onSyncNow: (connectionId: string) => Promise<void>;
  onRevoke: (connectionId: string) => Promise<void>;
  onDeleteSource: (sourceId: string) => Promise<void>;
  onKeywordSearch?: ((input: GoogleGmailSearchInput) => Promise<GmailKeywordSearchData>) | undefined;
  onSemanticSearch?: ((input: GoogleGmailSemanticSearchInput) => Promise<GmailSemanticSearchData>) | undefined;
}) {
  const visibleSurfaces = provider?.surfaces ?? [];
  const gmail = visibleSurfaces.find((surface) => surface.id === "google_gmail");
  const extension = visibleSurfaces.find((surface) => surface.id === "chrome_extension_history");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keywordFilters, setKeywordFilters] = useState<GmailKeywordFilterDraft>({
    from: "",
    to: "",
    subject: "",
    label: "",
    after: "",
    before: "",
    hasAttachment: false,
  });
  const [semanticDraft, setSemanticDraft] = useState("");
  const [keywordResults, setKeywordResults] = useState<GmailKeywordSearchData | null>(null);
  const [semanticResults, setSemanticResults] = useState<GmailSemanticSearchData | null>(null);
  const [gmailSearchStatus, setGmailSearchStatus] = useState<string | null>(null);
  const connection = selectedGoogleConnection(connectorState, selectedConnectionId);
  const latestJob = latestGoogleSyncJob(connectorState, connection?.id ?? null);
  const enabledSources = connection
    ? connectorState.sources.filter(
        (source) => source.privacy.retrievalAccess === "enabled" && source.connectionId === connection.id,
      )
    : [];
  const deleteSource = enabledSources.find((source) => source.kind === "google_gmail_message") ?? null;
  const sourceCount = connection ? googleConnectionSourceCount(connection) : 0;
  const activeConnectionCount = connectorState.connections.filter((candidate) => candidate.status !== "revoked").length;
  const activeGmailConnectionCount = connectorState.connections.filter(
    (candidate) => candidate.status !== "revoked" && candidate.surfaces.includes("google_gmail"),
  ).length;
  const gmailConnectable =
    Boolean(gmailStatus?.configured) || !gmail || gmail.status === "available" || gmail.status === "connected" || gmail.status === "syncing";
  const selectedHasGmail = connection?.surfaces.includes("google_gmail") ?? false;
  const canConnect = Boolean(gmailStatus?.configured ?? provider?.configured) && status !== "connecting" && !disabled;
  const connectLabel =
    connectorState.connections.length > 0 ? (gmailConnectable ? "Add Gmail account" : "Add Google account") : "Connect Gmail";
  const canUseGmailConnection = isActiveGmailConnection({ connection, disabled });
  const canSync = canUseGmailConnection && status !== "syncing";
  const canRevoke = canUseGmailConnection && status !== "revoking";
  const canDelete = Boolean(deleteSource) && status !== "deleting" && !disabled;
  const canSearchGmail = canUseGmailConnection;
  const gmailMessageCount = gmailStatus?.messageCount ?? enabledSources.filter((source) => source.kind === "google_gmail_message").length;
  const gmailLastSyncAt = gmailStatus?.lastSyncAt ?? connection?.lastSyncedAt ?? null;
  const gmailScopes = gmailStatus?.scopes.length ? gmailStatus.scopes : gmail?.scopes.map((scope) => scope.scope).filter((scope): scope is string => Boolean(scope)) ?? [];
  const gmailConfigured = gmailStatus?.configured ?? false;
  const keywordSearchReady =
    Boolean(keywordDraft.trim()) ||
    keywordFilters.hasAttachment ||
    Boolean(keywordFilters.from.trim() || keywordFilters.to.trim() || keywordFilters.subject.trim() || keywordFilters.label.trim() || keywordFilters.after.trim() || keywordFilters.before.trim());

  function setKeywordFilter<K extends keyof GmailKeywordFilterDraft>(key: K, value: GmailKeywordFilterDraft[K]) {
    setKeywordFilters((current) => ({ ...current, [key]: value }));
  }

  async function handleKeywordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = keywordDraft.trim();

    if (!canSearchGmail || !keywordSearchReady || !onKeywordSearch) {
      return;
    }

    setGmailSearchStatus("Searching email");
    setKeywordResults(null);

    try {
      const result = await onKeywordSearch({
        ...(connection
          ? {
              connectionId: connection.credential.connectionId,
              providerConfigKey: connection.credential.providerConfigKey,
            }
          : {}),
        ...(text ? { text } : {}),
        ...(keywordFilters.from.trim() ? { from: keywordFilters.from.trim() } : {}),
        ...(keywordFilters.to.trim() ? { to: keywordFilters.to.trim() } : {}),
        ...(keywordFilters.subject.trim() ? { subject: keywordFilters.subject.trim() } : {}),
        ...(keywordFilters.label.trim() ? { label: keywordFilters.label.trim() } : {}),
        ...(keywordFilters.after.trim() ? { after: keywordFilters.after.trim() } : {}),
        ...(keywordFilters.before.trim() ? { before: keywordFilters.before.trim() } : {}),
        ...(keywordFilters.hasAttachment ? { hasAttachment: true } : {}),
        maxResults: 5,
      });

      setKeywordResults(result);
      setGmailSearchStatus(`${result.results.length} email result${result.results.length === 1 ? "" : "s"}`);
    } catch (caught) {
      setGmailSearchStatus(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleSemanticSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = semanticDraft.trim();

    if (!canSearchGmail || !query || !onSemanticSearch) {
      return;
    }

    setGmailSearchStatus("Searching synced Gmail memory");
    setSemanticResults(null);

    try {
      const result = await onSemanticSearch({
        ...(connection
          ? {
              connectionId: connection.credential.connectionId,
              providerConfigKey: connection.credential.providerConfigKey,
            }
          : {}),
        query,
        limit: 5,
      });

      setSemanticResults(result);
      setGmailSearchStatus(result.contextLight ? "Sync Gmail first." : `${result.results.length} semantic result${result.results.length === 1 ? "" : "s"}`);
    } catch (caught) {
      setGmailSearchStatus(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <section className="brain-memory-card google-connector-card" aria-label="Google Workspace connector" data-testid="gmail-connector-card">
      <div className="google-connector-hero">
        <div className="google-connector-hero-main">
          <span className="google-connector-mark" aria-hidden="true">
            <Mail size={20} />
          </span>
          <div>
            <div className="google-connector-title-row">
              <strong>Gmail</strong>
              <span>{connection ? (selectedHasGmail ? "Gmail connected" : "Google connected") : formatLabel(gmail?.status ?? provider?.configurationLabel ?? status)}</span>
            </div>
            <p>
              {connection
                ? `${googleConnectionAccountLabel(connection)} is selected for ${connection.surfaces.map(formatLabel).join(", ")}.`
                : gmailConfigured
                  ? gmailConnectable
                    ? "Gmail can sync into private Brain memory."
                    : "Gmail is waiting on restricted-scope approval."
                  : "Gmail not configured."}
            </p>
            <div className="google-connector-chips" aria-label="Google connector status">
              <span>{connectorState.connections.length ? `${activeConnectionCount} active` : formatLabel(provider?.configurationLabel ?? status)}</span>
              {gmail ? <span>Gmail {formatLabel(gmail.status)}</span> : null}
              <span>Restricted scope</span>
              <span>Private</span>
              {connection ? <span>{sourceCount} indexed</span> : null}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="primary-command google-connector-primary"
          disabled={!canConnect}
          onClick={() => void onConnect()}
          data-testid="gmail-connect-button"
        >
          <Mail size={15} aria-hidden="true" />
          <span>{status === "connecting" ? "Connecting..." : connectLabel}</span>
        </button>
      </div>
      {connection ? (
        <div className="brain-memory-import-status is-completed">
          <strong>
            {sourceCount} source{sourceCount === 1 ? "" : "s"} indexed
          </strong>
          <span>
            Last synced {formatNullableDate(connection.lastSyncedAt)} · Next sync {formatNullableDate(connection.nextSyncAt)}
          </span>
          {latestJob ? <span>{`${formatLabel(latestJob.surface)} ${formatLabel(latestJob.status)}`}</span> : null}
        </div>
      ) : null}
      {connectorState.connections.length ? (
        <div className="brain-memory-source-list google-account-list" aria-label="Connected Google accounts">
          {connectorState.connections.map((candidate) => {
            const selected = connection?.id === candidate.id;
            const candidateSourceCount = googleConnectionSourceCount(candidate);

            return (
              <label key={candidate.id} className={`brain-memory-source google-account-row${selected ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name="google-connector-connection"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => setSelectedConnectionId(candidate.id)}
                />
                <div>
                  <strong>{googleConnectionAccountLabel(candidate)}</strong>
                  <span>
                    {formatLabel(candidate.status)} · {candidateSourceCount} source{candidateSourceCount === 1 ? "" : "s"}
                  </span>
                  <small>{candidate.credential.connectionId}</small>
                </div>
              </label>
            );
          })}
        </div>
      ) : null}
      {provider?.missingConfig.length ? (
        <p className="brain-memory-import-hint">Missing config: {provider.missingConfig.join(", ")}</p>
      ) : null}
      {gmailStatus?.missingConfig.length ? (
        <p className="brain-memory-import-hint">Gmail not configured. Missing: {gmailStatus.missingConfig.join(", ")}</p>
      ) : null}
      {error ? <p className="brain-memory-error">{error}</p> : null}
      {warning ? <p className="brain-memory-import-hint">{warning}</p> : null}
      {connectLink ? <p className="brain-memory-import-hint">Connect session created. Redirecting to Google consent for Gmail.</p> : null}
      <section className="gmail-connector-privacy" aria-label="Gmail privacy" data-testid="gmail-privacy-copy">
        <span>{gmailStatus?.privacy.copy ?? "Penny reads Gmail only after consent. No human review. trainingUse=false. Delete/revoke removes retrieval access."}</span>
        <small>Scopes: {gmailScopes.join(", ") || "gmail.readonly gated"}</small>
        <small>Reason: {gmailStatus?.scopeAuditReason ?? "read email for private Brain memory and email search."}</small>
        <small>
          Last sync {formatNullableDate(gmailLastSyncAt)} · {gmailMessageCount} messages
        </small>
      </section>
      {gmailMessageCount === 0 ? <p className="brain-memory-import-hint">Sync Gmail first.</p> : null}
      {!connection && activeGmailConnectionCount > 1 ? (
        <p className="brain-memory-import-hint">Select one Gmail account before sync, search, revoke, or delete.</p>
      ) : null}
      <div className="gmail-search-grid">
        <form className="gmail-search-form" onSubmit={(event) => void handleKeywordSubmit(event)} data-testid="gmail-keyword-search-form">
          <label>
            <span>Search email</span>
            <input value={keywordDraft} onChange={(event) => setKeywordDraft(event.target.value)} placeholder="Exact words" />
          </label>
          <details className="google-connector-details gmail-filter-details" data-testid="gmail-keyword-filters">
            <summary>Filters</summary>
            <div className="gmail-filter-grid">
              <label>
                <span>From</span>
                <input
                  value={keywordFilters.from}
                  onChange={(event) => setKeywordFilter("from", event.target.value)}
                  placeholder="alice@example.com"
                  data-testid="gmail-filter-from"
                />
              </label>
              <label>
                <span>To</span>
                <input
                  value={keywordFilters.to}
                  onChange={(event) => setKeywordFilter("to", event.target.value)}
                  placeholder="bob@example.com"
                  data-testid="gmail-filter-to"
                />
              </label>
              <label>
                <span>Subject</span>
                <input
                  value={keywordFilters.subject}
                  onChange={(event) => setKeywordFilter("subject", event.target.value)}
                  placeholder="Launch plan"
                  data-testid="gmail-filter-subject"
                />
              </label>
              <label>
                <span>Label</span>
                <input
                  value={keywordFilters.label}
                  onChange={(event) => setKeywordFilter("label", event.target.value)}
                  placeholder="inbox"
                  data-testid="gmail-filter-label"
                />
              </label>
              <label>
                <span>After</span>
                <input
                  type="date"
                  value={keywordFilters.after}
                  onChange={(event) => setKeywordFilter("after", event.target.value)}
                  data-testid="gmail-filter-after"
                />
              </label>
              <label>
                <span>Before</span>
                <input
                  type="date"
                  value={keywordFilters.before}
                  onChange={(event) => setKeywordFilter("before", event.target.value)}
                  data-testid="gmail-filter-before"
                />
              </label>
              <label className="gmail-checkbox-field">
                <input
                  type="checkbox"
                  checked={keywordFilters.hasAttachment}
                  onChange={(event) => setKeywordFilter("hasAttachment", event.target.checked)}
                  data-testid="gmail-filter-has-attachment"
                />
                <span>Has attachment</span>
              </label>
            </div>
          </details>
          <button
            type="submit"
            className="secondary-command"
            disabled={!canSearchGmail || !keywordSearchReady || !onKeywordSearch}
            data-testid="gmail-keyword-search-button"
          >
            <Search size={15} aria-hidden="true" />
            <span>Search email</span>
          </button>
        </form>
        <form className="gmail-search-form" onSubmit={(event) => void handleSemanticSubmit(event)} data-testid="gmail-semantic-search-form">
          <label>
            <span>Semantic search</span>
            <input value={semanticDraft} onChange={(event) => setSemanticDraft(event.target.value)} placeholder="Meaning" />
          </label>
          <button
            type="submit"
            className="secondary-command"
            disabled={!canSearchGmail || !semanticDraft.trim() || !onSemanticSearch}
            data-testid="gmail-semantic-search-button"
          >
            <Search size={15} aria-hidden="true" />
            <span>Semantic search</span>
          </button>
        </form>
      </div>
      {gmailSearchStatus ? <p className="brain-memory-import-hint">{gmailSearchStatus}</p> : null}
      {keywordResults?.results.length ? <GmailKeywordResults results={keywordResults.results} /> : null}
      {semanticResults?.results.length ? <GmailSemanticResults results={semanticResults.results} /> : null}
      <details className="google-connector-details">
        <summary>Google source coverage</summary>
        <div className="brain-memory-source-list">
          {visibleSurfaces.slice(0, 8).map((surface) => (
            <GoogleConnectorSurfaceRow key={surface.id} surface={surface} />
          ))}
        </div>
      </details>
      <div className="brain-memory-next-step">
        <div>
          <strong>Selected account</strong>
          <span>
            {gmail ? `Gmail: ${formatLabel(gmail.status)}. ` : ""}
            {extension ? `Browser/search: ${formatLabel(extension.status)}.` : ""}
          </span>
        </div>
        <button
          type="button"
          className="secondary-command"
          disabled={!canSync}
          onClick={() => {
            if (connection) {
              void onSyncNow(connection.id);
            }
          }}
          data-testid="gmail-sync-button"
        >
          <Zap size={15} aria-hidden="true" />
          <span>{status === "syncing" ? "Syncing..." : "Sync now"}</span>
        </button>
        <button
          type="button"
          className="secondary-command"
          disabled={!canRevoke}
          onClick={() => {
            if (connection) {
              void onRevoke(connection.id);
            }
          }}
          data-testid="gmail-revoke-button"
        >
          <XCircle size={15} aria-hidden="true" />
          <span>{status === "revoking" ? "Revoking..." : "Revoke"}</span>
        </button>
        <button
          type="button"
          className="secondary-command"
          disabled={!canDelete}
          onClick={() => {
            if (deleteSource) {
              void onDeleteSource(deleteSource.id);
            }
          }}
          data-testid="gmail-delete-source-button"
        >
          <Trash2 size={15} aria-hidden="true" />
          <span>{status === "deleting" ? "Deleting..." : "Delete Gmail source"}</span>
        </button>
      </div>
    </section>
  );
}

export function GmailKeywordResults({ results }: { results: GmailKeywordSearchData["results"] }) {
  return (
    <div className="gmail-results-list" aria-label="Gmail keyword results" data-testid="gmail-keyword-results">
      {results.slice(0, 5).map((result) => (
        <article key={result.messageId} data-testid="gmail-keyword-result" data-gmail-message-id={result.messageId}>
          <strong>{result.subject}</strong>
          <span>{result.sender}</span>
          <p>{result.snippet}</p>
          <small>
            {result.messageId}
            {result.threadId ? ` · ${result.threadId}` : ""}
            {result.sourceRef.sourceUri ? ` · ${result.sourceRef.sourceUri}` : ""}
          </small>
        </article>
      ))}
    </div>
  );
}

export function GmailSemanticResults({ results }: { results: GmailSemanticSearchData["results"] }) {
  return (
    <div className="gmail-results-list" aria-label="Gmail semantic results" data-testid="gmail-semantic-results">
      {results.slice(0, 5).map((result) => (
        <article
          key={`${result.messageId}-${result.memoryRef.id}`}
          data-testid="gmail-semantic-result"
          data-gmail-message-id={result.messageId}
          data-brain-memory-id={result.memoryRef.id}
        >
          <strong>{result.subject}</strong>
          <span>
            {result.grounding} · {result.sender}
          </span>
          <p>{result.snippet}</p>
          <small>
            {result.scoreReason} · {result.sourceRef.sourceUri} · {result.memoryRef.id}
          </small>
        </article>
      ))}
    </div>
  );
}

function GoogleConnectorSurfaceRow({ surface }: { surface: GoogleConnectorSurfaceView }) {
  const productionScopes = surface.scopes.filter((scope) => scope.productionAllowed && scope.scope).map((scope) => scope.scope);
  const gatedScopes = surface.scopes.filter((scope) => scope.gated).map((scope) => scope.id);

  return (
    <article className="brain-memory-source">
      <div>
        <strong title={surface.label}>{surface.label}</strong>
        <span>
          {formatLabel(surface.status)} · {surface.sourceKinds.map(formatLabel).join(", ")}
        </span>
        <small>{surface.whyPennyCanUseThis}</small>
        <small>{surface.userExplanation}</small>
        {productionScopes.length ? <small>Scopes: {productionScopes.join(", ")}</small> : null}
        {gatedScopes.length ? <small>Gated: {gatedScopes.join(", ")}</small> : null}
        {surface.notFaked.length ? <small>{surface.notFaked.join(" ")}</small> : null}
      </div>
    </article>
  );
}

function emptyGoogleConnectorStateView(): GoogleConnectorStateView {
  return {
    connections: [],
    syncJobs: [],
    sources: [],
  };
}

function normalizeGoogleConnectorState(state: GoogleConnectorStateView | undefined): GoogleConnectorStateView {
  return {
    connections: state?.connections ?? [],
    syncJobs: state?.syncJobs ?? [],
    sources: state?.sources ?? [],
  };
}

function isGoogleConnectorStateView(value: unknown): value is GoogleConnectorStateView {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as GoogleConnectorStateView).connections) &&
      Array.isArray((value as GoogleConnectorStateView).syncJobs) &&
      Array.isArray((value as GoogleConnectorStateView).sources),
  );
}

function selectedGoogleConnection(state: GoogleConnectorStateView, selectedConnectionId: string | null): GoogleConnectorConnectionView | null {
  const selected = selectedConnectionId ? findGoogleConnection(state, selectedConnectionId) : null;
  const activeConnections = state.connections.filter((connection) => connection.status !== "revoked");
  const activeGmailConnections = activeConnections.filter((connection) => connection.surfaces.includes("google_gmail"));

  if (selected) {
    return selected;
  }

  if (activeGmailConnections.length === 1) {
    return activeGmailConnections[0]!;
  }

  if (activeGmailConnections.length > 1) {
    return null;
  }

  return activeConnections[0] ?? state.connections[0] ?? null;
}

export function isActiveGmailConnection(input: {
  connection: GmailSearchConnectionCandidate | null | undefined;
  disabled?: boolean;
}): boolean {
  return Boolean(input.connection?.surfaces.includes("google_gmail") && input.connection.status !== "revoked" && input.disabled !== true);
}

export function isGmailSearchAvailable(input: {
  connection: GmailSearchConnectionCandidate | null | undefined;
  disabled?: boolean;
}): boolean {
  return isActiveGmailConnection(input);
}

function findGoogleConnection(state: GoogleConnectorStateView, connectionId: string): GoogleConnectorConnectionView | null {
  return (
    state.connections.find(
      (connection) => connection.id === connectionId || connection.credential.connectionId === connectionId,
    ) ?? null
  );
}

function latestGoogleSyncJob(state: GoogleConnectorStateView, connectionId: string | null): GoogleConnectorSyncJobView | null {
  const jobs = connectionId ? state.syncJobs.filter((job) => job.connectionId === connectionId) : state.syncJobs;

  return [...jobs].sort((left, right) => Date.parse(right.requestedAt) - Date.parse(left.requestedAt))[0] ?? null;
}

function googleConnectionSourceCount(connection: GoogleConnectorConnectionView): number {
  return Object.values(connection.sourceCounts ?? {}).reduce((total, count) => total + count, 0);
}

function googleConnectionAccountLabel(connection: GoogleConnectorConnectionView): string {
  return (
    connection.credential.accountEmail?.trim() ||
    connection.credential.accountLabel?.trim() ||
    connection.credential.accountId?.trim() ||
    connection.credential.endUserId?.trim() ||
    connection.credential.connectionId
  );
}

async function postGoogleConnectorAction(
  path: "/api/connectors/google/sync-now" | "/api/connectors/google/revoke" | "/api/connectors/google/source-delete",
  body: Record<string, unknown>,
): Promise<{ data: { state?: GoogleConnectorStateView } & Record<string, unknown> }> {
  const response = await fetch(path, {
    method: "POST",
    headers: googleConnectorRequestHeaders(),
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(googleConnectorErrorMessage(payload, `POST ${path} failed with ${response.status}.`));
  }

  return payload as { data: { state?: GoogleConnectorStateView } & Record<string, unknown> };
}

function googleConnectorRequestHeaders(): HeadersInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = frontendRuntimeEnv("VITE_PENNY_API_TOKEN");

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  addFrontendRuntimeHeader(headers, "x-user-id", "VITE_PENNY_USER_ID");
  addFrontendRuntimeHeader(headers, "x-workspace-id", "VITE_PENNY_WORKSPACE_ID");
  addFrontendRuntimeHeader(headers, "x-project-id", "VITE_PENNY_PROJECT_ID");
  addFrontendRuntimeHeader(headers, "x-sphere-id", "VITE_PENNY_SPHERE_ID");

  return headers;
}

function addFrontendRuntimeHeader(headers: Record<string, string>, headerName: string, envName: string) {
  const value = frontendRuntimeEnv(envName);

  if (value) {
    headers[headerName] = value;
  }
}

function frontendRuntimeEnv(name: string): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const value = env?.[name];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function googleConnectorErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: unknown } }).error;

    if (typeof error?.message === "string" && error.message.trim()) {
      return error.message;
    }
  }

  return fallback;
}

function isBrainMemoryProfileData(value: unknown): value is BrainMemoryProfileData {
  return Boolean(value && typeof value === "object" && "stats" in value && "sources" in value);
}

function formatNullableDate(value: string | null): string {
  if (!value) {
    return "not yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return date.toLocaleString();
}

function BrainMemoryNotice({ message }: { message: string }) {
  return (
    <div className="brain-memory-import-status is-completed" role="status" aria-live="polite" data-testid="brain-memory-notice">
      <strong>Memory updated</strong>
      <span>{message}</span>
    </div>
  );
}

function BrainMemoryStatusPill({ status, latestJob }: { status: BrainMemoryStatus; latestJob: IngestionJob | null }) {
  const label =
    status === "loading"
      ? "Loading"
      : status === "importing"
        ? "Importing"
        : status === "deleting"
          ? "Deleting"
          : status === "error"
            ? latestJob?.status === "failed"
              ? "Import failed"
              : "Needs attention"
            : latestJob
              ? latestJob.status === "completed"
                ? `${latestJob.counts.memoryNodes} memories`
                : "Import failed"
              : "Context-light";

  return <span className={`brain-memory-status is-${status}`}>{label}</span>;
}

function memoryReviewNotice(action: MemoryReviewAction, title: string): string {
  const memoryName = truncateWords(title, 8);

  switch (action) {
    case "correct":
      return `${memoryName} marked correct. Penny will treat it as confirmed personal context.`;
    case "boost":
      return `${memoryName} boosted. Penny will rank it higher when it matches Create requests.`;
    case "wrong":
      return `${memoryName} marked wrong. Penny will keep it out of normal retrieval unless reviewed again.`;
    case "forget":
      return `${memoryName} forgotten. It was removed from retrieval and Create grounding.`;
  }
}

function BrainMemoryImportStatus({ job }: { job: IngestionJob }) {
  const failed = job.status === "failed";

  return (
    <div className={`brain-memory-import-status is-${job.status}`} aria-live="polite">
      <strong>{failed ? "Last import failed" : "Last import completed"}</strong>
      {failed ? (
        <span>{job.errorMessages.join(" ") || "No usable text was imported."}</span>
      ) : (
        <span>
          {job.counts.memoryNodes} memories from {job.counts.chunks} chunks · {job.sourceImport?.preview?.explanation ?? "Source parsed."}
        </span>
      )}
    </div>
  );
}

function BrainMemorySourcesList({
  sources,
  disabled,
  onDeleteSource,
}: {
  sources: SourceImport[];
  disabled: boolean;
  onDeleteSource: (sourceId: string) => Promise<void>;
}) {
  return (
    <section className="brain-memory-card" aria-label="Uploaded sources">
      <div className="brain-memory-card-head">
        <strong>Uploaded sources</strong>
        <span>{sources.length}</span>
      </div>
      {sources.length > 0 ? (
        <div className="brain-memory-source-list">
          {sources.slice(0, 6).map((source) => (
            <article key={source.id} className="brain-memory-source">
              <div>
                <strong title={source.label}>{truncateWords(source.label, 8)}</strong>
                <span>
                  {source.kind} · {source.chunkCount} chunks · {source.memoryNodeCount} memories
                </span>
                <small>Private user memory · no global training · {formatDate(source.createdAt)}</small>
                {source.preview ? (
                  <div className="brain-memory-source-preview">
                    <span>
                      {formatLabel(source.preview.status)} · {source.preview.explanation}
                    </span>
                    {source.preview.excerpt ? <p>{truncateWords(source.preview.excerpt, 28)}</p> : null}
                    {source.preview.warnings.length ? (
                      <small>{source.preview.warnings.map((warning) => truncateWords(warning, 16)).join(" ")}</small>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                aria-label={`Delete ${source.label}`}
                disabled={disabled}
                onClick={() => {
                  void onDeleteSource(source.id);
                }}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="brain-memory-muted">No imported sources yet.</p>
      )}
    </section>
  );
}

function BrainProfileReviewCard({
  profile,
  reviewed,
  disabled,
  onReview,
}: {
  profile: BrainMemoryProfileData;
  reviewed: boolean;
  disabled: boolean;
  onReview: () => void;
}) {
  return (
    <section className={`brain-profile-review-card${reviewed ? " is-reviewed" : ""}`} aria-label="Review Brain profile">
      <div>
        <strong>{reviewed ? "Profile reviewed" : "Profile not reviewed"}</strong>
        <p>
          Check whether Penny's source-backed read on your taste, active ideas, and rejected directions is close enough to guide Create.
        </p>
      </div>
      <dl aria-label="Profile review facts">
        <div>
          <dt>Sources</dt>
          <dd>{profile.stats.sourceCount}</dd>
        </div>
        <div>
          <dt>Memories</dt>
          <dd>{profile.stats.memoryNodeCount}</dd>
        </div>
        <div>
          <dt>Signals</dt>
          <dd>{profile.stats.profileSignalCount}</dd>
        </div>
      </dl>
      <button type="button" className="secondary-command" disabled={disabled || reviewed} onClick={onReview}>
        <CheckCircle2 size={15} aria-hidden="true" />
        <span>{reviewed ? "Profile looks right" : "Profile looks right"}</span>
      </button>
    </section>
  );
}

function BrainMemoryProfileSummary({
  profile,
  recentNodes,
  sections,
  reviewingId,
  disabled,
  onReviewMemory,
}: {
  profile: BrainMemoryProfileData | null;
  recentNodes: MemoryNode[];
  sections: Array<{ title: string; items: BrainProfileSectionItem[] }>;
  reviewingId: string | null;
  disabled: boolean;
  onReviewMemory: ((nodeId: string, action: MemoryReviewAction) => Promise<void>) | undefined;
}) {
  const sourceById = new Map((profile?.sources ?? []).map((source) => [source.id, source]));

  return (
    <section className="brain-memory-card" aria-label="Memory profile summary">
      <div className="brain-memory-card-head">
        <strong>Penny understood</strong>
        <span>{profile?.stats.memoryNodeCount ?? 0} nodes</span>
      </div>
      {sections.length > 0 ? (
        <div className="brain-profile-section-list">
          {sections.map((section) => (
            <div key={section.title} className="brain-profile-section">
              <strong>{section.title}</strong>
              <div className="brain-memory-signals">
                {section.items.map((item) => (
                  <span key={item.id} title={item.summary}>
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="brain-memory-muted">Recurring interests and build-style signals appear after import.</p>
      )}
      <div className="brain-memory-node-list">
        <div className="brain-memory-node-list-head">
          <strong>Recent memories</strong>
          <span>{recentNodes.length}</span>
        </div>
        {recentNodes.slice(0, 6).map((node) => {
          const source = sourceById.get(node.sourceId);
          const busy = reviewingId === node.id;
          const reviewState = memoryReviewState(node);

          return (
            <article key={node.id} className="brain-memory-node" data-memory-state={reviewState.kind}>
              <div className="brain-memory-node-topline">
                <span>{formatLabel(node.type)}</span>
                <span className={`brain-memory-evidence is-${node.evidenceLevel}`}>{evidenceLabel(node.evidenceLevel)}</span>
              </div>
              <strong title={node.title}>{truncateWords(node.title, 9)}</strong>
              <p>{truncateWords(node.summary, 18)}</p>
              <div className="brain-memory-quality">
                <span className={`brain-memory-review-state is-${reviewState.kind}`}>Memory state: {reviewState.label}</span>
                <span>{confidenceLabel(node.confidence)}</span>
                <span>{source ? truncateWords(source.label, 5) : "Unknown source"}</span>
                <span>{node.chunkIds[0] ? `chunk ${shortId(node.chunkIds[0])}` : "source chunk"}</span>
                <span>Reinforced {formatDate(node.lastSeenAt)}</span>
              </div>
              <div className="brain-memory-labels">
                {(node.labels.length ? node.labels : [node.evidenceLevel === "inferred" ? "inferred" : "grounded"]).map((label) => (
                  <span key={label}>{formatLabel(label)}</span>
                ))}
              </div>
              <div className="brain-memory-review-actions" aria-label={`Review ${node.title}`}>
                <button
                  type="button"
                  title="Mark correct"
                  aria-label={`Mark ${node.title} correct`}
                  disabled={disabled || busy || !onReviewMemory}
                  onClick={() => {
                    void onReviewMemory?.(node.id, "correct");
                  }}
                >
                  <CheckCircle2 size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title="Boost importance"
                  aria-label={`Boost ${node.title}`}
                  disabled={disabled || busy || !onReviewMemory}
                  onClick={() => {
                    void onReviewMemory?.(node.id, "boost");
                  }}
                >
                  <Zap size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title="Mark wrong"
                  aria-label={`Mark ${node.title} wrong`}
                  disabled={disabled || busy || !onReviewMemory}
                  onClick={() => {
                    void onReviewMemory?.(node.id, "wrong");
                  }}
                >
                  <XCircle size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title="Forget memory"
                  aria-label={`Forget ${node.title}`}
                  disabled={disabled || busy || !onReviewMemory}
                  onClick={() => {
                    void onReviewMemory?.(node.id, "forget");
                  }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

type BrainProfileSectionItem = {
  id: string;
  label: string;
  summary: string;
};

export function brainFirstRunSteps({
  profile,
  recentNodes,
  sections,
  profileReviewed,
}: {
  profile: BrainMemoryProfileData | null;
  recentNodes: MemoryNode[];
  sections: Array<{ title: string; items: BrainProfileSectionItem[] }>;
  profileReviewed: boolean;
}): Array<{ label: string; done: boolean; active: boolean }> {
  const imported = (profile?.stats.sourceCount ?? 0) > 0;
  const understood = sections.length > 0 && profileReviewed;
  const reviewed = recentNodes.some((node) => node.evidenceLevel === "user_confirmed" || node.confidence >= 0.95);
  const baseSteps = [
    { label: "Import context", done: imported },
    { label: "Review Brain profile", done: understood },
    { label: "Confirm/forget/boost memories", done: reviewed },
    { label: "Start Create with this Brain", done: false },
    { label: "Export coding prompt", done: false },
  ];
  const activeIndex = baseSteps.findIndex((step) => !step.done);

  return baseSteps.map((step, index) => ({
    ...step,
    active: index === (activeIndex === -1 ? baseSteps.length - 1 : activeIndex),
  }));
}

function profileReviewFingerprint(profile: BrainMemoryProfileData | null): string | null {
  if (!profile || profile.stats.sourceCount === 0) {
    return null;
  }

  const sourcePart = profile.sources.map((source) => `${source.id}:${source.updatedAt}`).join("|");
  const memoryPart = profile.recentMemoryNodes.map((node) => `${node.id}:${node.lastSeenAt}:${node.confidence}`).join("|");

  return [
    profile.stats.sourceCount,
    profile.stats.memoryNodeCount,
    profile.stats.profileSignalCount,
    sourcePart,
    memoryPart,
  ].join("::");
}

function memoryProfileSections(profile: BrainMemoryProfileData, recentNodes: MemoryNode[]): Array<{ title: string; items: BrainProfileSectionItem[] }> {
  const activeProjects = signalItems(profile.profile.activeProjects ?? []);
  const ideaClusters = clusterItems(profile.profile.ideaClusters ?? []);

  return [
    { title: "Recurring interests", items: signalItems(profile.profile.recurringInterests) },
    {
      title: "Active projects",
      items: activeProjects.length ? activeProjects : nodeItems(recentNodes.filter((node) => node.type === "project" || node.type === "goal")),
    },
    { title: "High-value memories", items: nodeItems(profile.profile.highValueMemories ?? []) },
    { title: "Taste signals", items: signalItems(profile.profile.tasteSignals) },
    { title: "Common frustrations", items: signalItems(profile.profile.commonFrustrations) },
    { title: "Preferred build style", items: signalItems(profile.profile.preferredBuildStyle) },
    { title: "Repeated rejected directions", items: signalItems(profile.profile.repeatedRejectedDirections ?? []) },
    { title: "Idea clusters", items: ideaClusters.length ? ideaClusters : signalItems(profile.profile.activeIdeaClusters) },
    { title: "Stale memories", items: nodeItems(profile.profile.staleMemories ?? []) },
    { title: "Superseded memories", items: nodeItems(profile.profile.supersededMemories ?? []) },
    { title: "Recent meaningful activity", items: activityItems(profile.profile.recentMeaningfulActivity ?? []) },
  ].filter((section) => section.items.length > 0);
}

export function isBrainDemoFixtureMode(env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env): boolean {
  return env?.DEV === true || env?.MODE === "test";
}

function signalItems(signals: UserProfileSignal[]): BrainProfileSectionItem[] {
  return signals
    .slice(0, 4)
    .map((signal) => ({ id: signal.id, label: signal.label, summary: `${signal.summary} Confidence ${confidenceLabel(signal.weight)}.` }));
}

function nodeItems(nodes: MemoryNode[]): BrainProfileSectionItem[] {
  return nodes.slice(0, 4).map((node) => ({ id: node.id, label: node.title, summary: node.summary }));
}

function clusterItems(clusters: NonNullable<BrainMemoryProfileData["profile"]["ideaClusters"]>): BrainProfileSectionItem[] {
  return clusters.slice(0, 4).map((cluster) => ({
    id: cluster.id,
    label: cluster.label,
    summary: `${cluster.summary} Current ${cluster.currentMemoryNodeId ?? "none"}; superseded ${cluster.supersededMemoryNodeIds.length}.`,
  }));
}

function activityItems(activities: NonNullable<BrainMemoryProfileData["profile"]["recentMeaningfulActivity"]>): BrainProfileSectionItem[] {
  return activities.slice(0, 4).map((activity) => ({
    id: activity.id,
    label: activity.label,
    summary: `${formatLabel(activity.kind)} on ${formatDate(activity.occurredAt)}. ${activity.summary}`,
  }));
}

function evidenceLabel(level: MemoryNode["evidenceLevel"]): string {
  if (level === "user_confirmed") {
    return "User confirmed";
  }

  return level === "grounded" ? "Grounded" : "Inferred";
}

function memoryReviewState(node: MemoryNode): { kind: "confirmed" | "priority" | "muted" | "active" | "weak"; label: string } {
  if (node.evidenceLevel === "user_confirmed") {
    return { kind: "confirmed", label: "Confirmed" };
  }

  if (node.confidence < 0.1) {
    return { kind: "muted", label: "Muted" };
  }

  if (node.confidence >= 0.95) {
    return { kind: "priority", label: "High priority" };
  }

  if (node.confidence >= 0.65) {
    return { kind: "active", label: "Active" };
  }

  return { kind: "weak", label: "Needs review" };
}

function confidenceLabel(confidence: number): string {
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}% confidence`;
}

function importHintForKind(kind: SourceImportKind): string | null {
  if (kind === "zip") {
    return "ZIP import will extract ChatGPT conversations.json first, then Claude JSON/CSV, markdown, or text files when present.";
  }

  if (kind === "pdf") {
    return "PDF import expects extractable text. If the file is scanned or binary-only, paste OCR or copied PDF text here.";
  }

  if (kind === "chatgpt_export") {
    return "For ChatGPT exports, upload conversations.json or choose the export ZIP with kind set to ZIP export.";
  }

  if (kind === "claude_export") {
    return "For Claude exports, JSON, CSV, copied text, and markdown notes are supported when the message text is present.";
  }

  if (kind === "manual_messages_transcript") {
    return "Manual/pasted/demo transcript only. Penny does not read SMS, iMessage, WhatsApp, or other message accounts directly in this flow.";
  }

  if (kind === "email_fixture") {
    return "Demo email-style text only. This does not claim live Gmail access or OAuth.";
  }

  if (kind === "linkedin_context") {
    return "Demo LinkedIn-style context only. This does not claim live LinkedIn access or OAuth.";
  }

  return null;
}

const sourceImportKindOptions: Array<{ kind: SourceImportKind; label: string }> = [
  { kind: "text", label: "Plain text" },
  { kind: "markdown", label: "Markdown" },
  { kind: "pdf", label: "PDF text" },
  { kind: "manual_messages_transcript", label: "Messages transcript / notes" },
  { kind: "email_fixture", label: "Demo email fixture" },
  { kind: "linkedin_context", label: "Demo LinkedIn context" },
  { kind: "founder_notes", label: "Founder notes" },
  { kind: "chatgpt_export", label: "ChatGPT JSON" },
  { kind: "claude_export", label: "Claude export" },
  { kind: "docs_text", label: "Docs text" },
  { kind: "canvas_text", label: "Canvas text" },
  { kind: "json", label: "Generic JSON" },
  { kind: "csv", label: "CSV" },
  { kind: "zip", label: "ZIP export" },
];

function kindFromFile(file: File): SourceImportKind {
  const name = file.name.toLowerCase();

  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    return "markdown";
  }

  if (name.endsWith(".json") && /conversation|chatgpt/.test(name)) {
    return "chatgpt_export";
  }

  if (name.endsWith(".json") && /claude/.test(name)) {
    return "claude_export";
  }

  if (name.endsWith(".json")) {
    return "json";
  }

  if (name.endsWith(".csv") && /claude/.test(name)) {
    return "claude_export";
  }

  if (name.endsWith(".csv")) {
    return "csv";
  }

  if (name.endsWith(".pdf")) {
    return "pdf";
  }

  if (name.endsWith(".zip")) {
    return "zip";
  }

  return "text";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }

  return btoa(binary);
}

interface SearchResult {
  id: string;
  sessionId: string;
  title: string;
  body: string;
  type: "Document" | "Claim";
  updatedAt: string;
}

function recentDocumentRows(documents: BrainDocumentSummary[]): BrainDocumentSummary[] {
  return [...documents].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, 18);
}

function searchDocumentRows(documents: BrainDocumentSummary[], query: string): SearchResult[] {
  return documents
    .flatMap((document) => {
      const results: SearchResult[] = [];
      const documentText = [document.title, document.description, document.originalIdea, document.mainClaim?.text, ...document.finalRecommendations]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (documentText.includes(query)) {
        results.push({
          id: `${document.id}-document`,
          sessionId: document.sessionId,
          title: document.title,
          body: document.description,
          type: "Document",
          updatedAt: document.updatedAt,
        });
      }

      documentClaims(document).forEach((claim, index) => {
        if (claim.text.toLowerCase().includes(query)) {
          results.push({
            id: `${document.id}-claim-${index}`,
            sessionId: document.sessionId,
            title: claim.text,
            body: document.title,
            type: "Claim",
            updatedAt: document.updatedAt,
          });
        }
      });

      return results;
    })
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function documentClaims(document: BrainDocumentSummary): Array<{ text: string; kind: string; status: string }> {
  const claims = [document.mainClaim, ...document.strongestOptions, ...document.rejectedOptions].filter((claim): claim is NonNullable<typeof claim> =>
    Boolean(claim?.text?.trim()),
  );
  const seen = new Set<string>();

  return claims.filter((claim) => {
    const key = claim.text.trim().toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function SearchResultRow({
  result,
  onSelectDocument,
}: {
  result: SearchResult;
  onSelectDocument: (sessionId: string) => void;
}) {
  return (
    <button type="button" className="document-log-row is-search-result" onClick={() => onSelectDocument(result.sessionId)}>
      <span>
        <strong title={result.title}>{truncateWords(result.title, 18)}</strong>
        <small title={result.body}>{truncateWords(result.body, 18)}</small>
      </span>
      <span className="doc-log-meta">
        <strong>Open</strong>
      </span>
      <time>{formatDate(result.updatedAt)}</time>
    </button>
  );
}

function DocumentLogRow({
  document,
  onSelectDocument,
}: {
  document: BrainDocumentSummary;
  onSelectDocument: (sessionId: string) => void;
}) {
  return (
    <button type="button" className="document-log-row is-document-summary" onClick={() => onSelectDocument(document.sessionId)}>
      <span className="document-log-copy">
        <strong title={document.title}>{truncateWords(document.title, 28)}</strong>
        <small title={document.description}>
          {truncateWords(document.description, 34)}
        </small>
      </span>
      <time>{formatDate(document.updatedAt)}</time>
    </button>
  );
}

function DocumentHeader({
  document,
  workStructure,
}: {
  document: BrainDocumentSummary;
  workStructure: WorkStructure | null;
}) {
  return (
    <header className="brain-document-head">
      <div className="breadcrumb-line">
        <span>{workStructure?.structureType ? formatLabel(workStructure.structureType) : "Brain"}</span>
        <span>Documents</span>
        <span>{shortId(document.sessionId)}</span>
      </div>
      <h1 title={document.title}>{document.title}</h1>
      <p title={document.description}>
        {truncateWords(document.description, 26)}
      </p>
      <div className="document-facts">
        <span>Created {formatDate(document.createdAt)}</span>
        <span>Updated {formatDate(document.updatedAt)}</span>
        <span>{formatLabel(document.status)}</span>
      </div>
    </header>
  );
}

function ConnectedGraphBoard({
  title,
  graphPath,
  claims,
  edges,
  focusedClaimId,
  suggestedClaimId,
  onClaimSelect,
}: {
  title: string;
  graphPath: BrainGraphPath | null;
  claims: BrainClaim[];
  edges: BrainEdge[];
  focusedClaimId: string | null;
  suggestedClaimId: string | null;
  onClaimSelect: (claimId: string) => void;
}) {
  const path = useMemo(
    () => graphPath && graphPath.nodes.length > 0 ? graphPath : fallbackGraphPath(claims, edges, focusedClaimId, suggestedClaimId),
    [claims, edges, focusedClaimId, graphPath, suggestedClaimId],
  );
  const positions = useMemo(() => graphPathPositions(path.nodes), [path.nodes]);
  const positionMap = new Map(positions.map((point) => [point.id, point]));
  const graphHeight = graphCanvasHeight(positions);

  return (
    <section className="graph-board" aria-label={title}>
      <div className="graph-board-head">
        <h2>{title}</h2>
        <span>{path.meta.nodeCount} steps</span>
      </div>
      {path.nodes.length > 0 ? (
        <svg viewBox={`0 0 ${graphCanvasWidth} ${graphHeight}`} role="img" aria-label="Connected thought graph path">
          <g className="graph-edge-layer">
            {path.edges.map((edge) => {
              const source = positionMap.get(edge.fromNodeId);
              const target = positionMap.get(edge.toNodeId);

              if (!source || !target) {
                return null;
              }

              return <path key={edge.id} className={`graph-edge graph-edge-${edge.kind}`} d={graphCardEdgePath(source, target)} />;
            })}
          </g>
          <g className="graph-node-layer">
            {path.nodes.map((node) => {
              const point = positionMap.get(node.id);

              if (!point) {
                return null;
              }

              const lines = graphNodeLines(node.label);

              return (
                <g
                  key={node.id}
                  className={`graph-node-card is-${node.role}${node.selected ? " is-focused" : ""}${node.suggested ? " is-suggested" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${node.label}`}
                  onClick={() => onClaimSelect(node.claimId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onClaimSelect(node.claimId);
                    }
                  }}
                >
                  <rect
                    x={point.x - point.width / 2}
                    y={point.y - point.height / 2}
                    width={point.width}
                    height={point.height}
                    rx="10"
                  />
                  <circle className="graph-node-dot" cx={point.x - point.width / 2 + 18} cy={point.y - 19} r="6" />
                  <text className="graph-node-role" x={point.x - point.width / 2 + 33} y={point.y - 14}>
                    {formatLabel(node.role)}
                  </text>
                  <text className="graph-node-menu" x={point.x + point.width / 2 - 18} y={point.y - 13}>
                    ...
                  </text>
                  <text className="graph-node-title" x={point.x - point.width / 2 + 18} y={point.y + 7}>
                    {lines.map((line, index) => (
                      <tspan key={`${node.id}-${index}`} x={point.x - point.width / 2 + 18} dy={index === 0 ? 0 : 22}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      ) : (
        <div className="graph-empty-state">
          <strong>Graph state will render from saved claims</strong>
          <span>Seed an idea to create connected claims.</span>
        </div>
      )}
    </section>
  );
}

function DocumentMemoryGraph({ graph }: { graph: BrainDocumentsData["graph"] | null }) {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const positions = useMemo(() => memoryGraphPositions(nodes), [nodes]);
  const positionMap = new Map(positions.map((point) => [point.id, point]));

  return (
    <section className="memory-graph-preview" aria-label="Brain memory graph">
      <div className="memory-graph-label">
        <strong>Thought map</strong>
        <span>Docs, claims, and current connections</span>
      </div>
      {nodes.length > 0 ? (
        <svg viewBox="0 0 1000 330" role="img" aria-label="Document graph preview">
          <g>
            {edges.map((edge) => {
              const source = positionMap.get(edge.source);
              const target = positionMap.get(edge.target);

              if (!source || !target) {
                return null;
              }

              return <path key={edge.id} className={`memory-edge memory-edge-${edge.kind}`} d={edgePath(source, target)} />;
            })}
          </g>
          <g>
            {nodes.map((node) => {
              const point = positionMap.get(node.id);

              if (!point) {
                return null;
              }

              return (
                <g key={node.id} className={`memory-node is-${node.type}`}>
                  <circle cx={point.x} cy={point.y} r={node.type === "document" ? 20 : 12} />
                  <text x={point.x + 24} y={point.y + 4}>
                    {truncateWords(node.label, 4)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      ) : (
        <div className="memory-empty-state">
          <strong>Documents appear after saved thinking</strong>
          <span>The graph appears after the first thought is saved.</span>
        </div>
      )}
    </section>
  );
}

function DocumentRundown({ document }: { document: BrainDocumentSummary }) {
  return (
    <section className="document-rundown" aria-label="Doc rundown">
      <RundownSection title="Original Idea" values={[document.originalIdea ?? "Original idea requires a completed AI projection."]} />
      <RundownSection title="Main Claim" values={[document.mainClaim?.text ?? "Main claim requires a completed AI projection."]} />
      <RundownSection title="Current Direction" values={document.finalRecommendations} />
      <RundownSection title="Next Action" values={document.nextActions.slice(0, 1)} />
    </section>
  );
}

function BrainDocumentAside({
  document,
  focusedClaim,
  claims,
  moves,
  latestArtifact,
}: {
  document: BrainDocumentSummary;
  focusedClaim: BrainClaim | null;
  claims: BrainClaim[];
  moves: BrainMove[];
  latestArtifact: SessionCockpitData["latestArtifact"] | null;
}) {
  const concepts = claims.filter((claim) => claim.kind === "concept").slice(0, 4);

  return (
    <aside className="brain-doc-aside" aria-label="Document context">
      <section>
        <h2 className="section-label">MOST IMPORTANT INSIGHT</h2>
        <p>{focusedClaim?.text ?? document.mainClaim?.text ?? "Selected claim requires a completed AI projection."}</p>
      </section>
      <section>
        <h2 className="section-label">RELATED CONCEPTS</h2>
        {concepts.length > 0 ? (
          <ul>
            {concepts.map((claim) => (
              <li key={claim.id}>
                <span>{claim.text}</span>
                <small>Concept</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>Related concepts require a completed AI projection.</p>
        )}
      </section>
      <section>
        <h2 className="section-label">DOCUMENT SUMMARY</h2>
        <p>{latestArtifact?.summary ?? document.finalRecommendations[0] ?? document.originalIdea ?? "Summary requires a completed AI projection."}</p>
      </section>
      <section>
        <h2 className="section-label">LAST SESSION</h2>
        <p>{document.lastMove ? `${formatDate(document.lastMove.createdAt)}: ${document.lastMove.summary}` : "Move history requires a completed AI projection."}</p>
        <small>{moves.length} moves / {document.counts.versions} versions</small>
      </section>
    </aside>
  );
}

function RundownSection({ title, values }: { title: string; values: string[] }) {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);

  return (
    <article className="rundown-section">
      <h2>{title}</h2>
      {cleaned.length > 1 ? (
        <ol>
          {cleaned.map((value, index) => (
            <li key={`${title}-${index}`}>{value}</li>
          ))}
        </ol>
      ) : (
        <p>{cleaned[0] ?? "Nothing recorded yet."}</p>
      )}
    </article>
  );
}

function WorkingNotes({ sessionId, title }: { sessionId: string; title: string }) {
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [status, setStatus] = useState("Loading notes");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setStatus("Loading notes");
    fetchSessionNote(sessionId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const content = response.data.note?.content ?? "";
        setNotes(content);
        setSavedNotes(content);
        setStatus(response.data.note ? "Notes loaded" : "No notes saved");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function handleSave() {
    setIsSaving(true);
    setStatus("Saving notes");

    try {
      const response = await saveSessionNote({ sessionId, content: notes });
      const content = response.data.note?.content ?? notes;
      setNotes(content);
      setSavedNotes(content);
      setStatus("Notes saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="working-notes" aria-label="Working notes">
      <div className="working-notes-head">
        <h2>Notes</h2>
        <span>{status}</span>
      </div>
      <textarea
        value={notes}
        aria-label={`Notes for ${title}`}
        placeholder="Capture a thought, note an unresolved issue, or write what should change next."
        onChange={(event) => setNotes(event.target.value)}
      />
      <button type="button" className="text-command" disabled={isSaving || notes === savedNotes} onClick={handleSave}>
        Save notes
      </button>
    </section>
  );
}

function localClaimConnections(claim: BrainClaim, claims: BrainClaim[], edges: BrainEdge[]): ClaimDetailConnection[] {
  const claimMap = new Map(claims.map((item) => [item.id, item]));

  return edges
    .filter((edge) => edge.fromClaimId === claim.id || edge.toClaimId === claim.id)
    .map((edge) => {
      const connectedClaimId = edge.fromClaimId === claim.id ? edge.toClaimId : edge.fromClaimId;
      const connectedClaim = claimMap.get(connectedClaimId);

      if (!connectedClaim) {
        return null;
      }

      return {
        edge: {
          id: edge.id,
          fromClaimId: edge.fromClaimId,
          toClaimId: edge.toClaimId,
          kind: edge.kind,
          status: edge.status ?? "active",
          label: edge.label ?? null,
          createdAt: "",
        },
        direction: edge.fromClaimId === claim.id ? "outgoing" : "incoming",
        claim: connectedClaim,
      };
    })
    .filter((connection): connection is ClaimDetailConnection => Boolean(connection));
}

function reasoningFromDetailMoves(moves: ClaimDetailMove[]): Array<{ id: string; label: string; text: string; meta: string | null }> {
  return moves
    .map((move) => {
      const reasoning =
        payloadString(move.payload, "reasoning") ??
        payloadString(move.payload, "candidateReason") ??
        payloadString(move.payload, "whyThis") ??
        payloadString(move.payload, "reason") ??
        move.summary;

      return {
        id: move.id,
        label: formatLabel(move.kind),
        text: reasoning,
        meta: formatDate(move.createdAt),
      };
    })
    .filter((item) => item.text.trim().length > 0);
}

function payloadString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function relationshipLabel(connection: ClaimDetailConnection): string {
  const edgeLabel = connection.edge.label?.trim();

  return edgeLabel ? `${formatLabel(connection.edge.kind)} / ${edgeLabel}` : formatLabel(connection.edge.kind);
}

function isSupportConnection(kind: string): boolean {
  return kind === "supports" || kind === "depends_on" || kind === "refines";
}

function isTensionConnection(kind: string): boolean {
  return kind === "challenges" || kind === "contradicts";
}

function sentenceFromConnections(connections: ClaimDetailConnection[], emptyLabel: string): string {
  const texts = connections.map((connection) => connection.claim.text).filter(Boolean);

  if (texts.length === 0) {
    return emptyLabel;
  }

  return texts.slice(0, 4).join(" ");
}

function fallbackGraphPath(
  claims: BrainClaim[],
  edges: BrainEdge[],
  focusedClaimId: string | null,
  suggestedClaimId: string | null,
): BrainGraphPath {
  const nodes: BrainGraphPathNode[] = claims.map((claim, index) => ({
    id: `claim:${claim.id}`,
    claimId: claim.id,
    label: claim.text,
    role: index === 0 ? "main_claim" : claim.kind,
    kind: claim.kind,
    status: claim.status,
    confidence: claim.confidence ?? 60,
    depth: index,
    lane: 0,
    rank: index + 1,
    moveCount: 0,
    edgeIds: edges.filter((edge) => edge.fromClaimId === claim.id || edge.toClaimId === claim.id).map((edge) => edge.id),
    selected: claim.id === focusedClaimId,
    suggested: claim.id === suggestedClaimId,
  }));
  const nodeIds = new Set(nodes.map((node) => node.claimId));

  return {
    layout: "top_down",
    generatedFrom: "claims_edges_moves",
    focusClaimId: focusedClaimId,
    nodes,
    edges: edges
      .filter((edge) => nodeIds.has(edge.fromClaimId) && nodeIds.has(edge.toClaimId))
      .map((edge) => ({
        id: `edge:${edge.id}`,
        edgeId: edge.id,
        fromNodeId: `claim:${edge.fromClaimId}`,
        toNodeId: `claim:${edge.toClaimId}`,
        kind: edge.kind,
        status: edge.status ?? "active",
        label: edge.label ?? null,
      })),
    meta: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      maxDepth: Math.max(0, nodes.length - 1),
    },
  };
}

function graphPathPositions(nodes: BrainGraphPathNode[]): GraphCardPoint[] {
  const groups = new Map<number, BrainGraphPathNode[]>();

  for (const node of nodes) {
    const group = groups.get(node.depth) ?? [];

    group.push(node);
    groups.set(node.depth, group);
  }

  const points: GraphCardPoint[] = [];
  let row = 0;

  for (const [, group] of [...groups.entries()].sort(([left], [right]) => left - right)) {
    const sorted = [...group].sort(graphPathNodeSort);
    const centerNode = sorted.find((node) => node.lane === 0) ?? sorted[0] ?? null;

    if (!centerNode) {
      continue;
    }

    points.push(graphPointForNode(centerNode, 0, row));
    row += 1;

    const branchNodes = sorted.filter((node) => node.id !== centerNode.id);

    for (let index = 0; index < branchNodes.length; index += 2) {
      const left = branchNodes[index] ?? null;
      const right = branchNodes[index + 1] ?? null;

      if (left && right) {
        points.push(graphPointForNode(left, -1, row));
        points.push(graphPointForNode(right, 1, row));
      } else if (left) {
        points.push(graphPointForNode(left, left.lane < 0 ? -1 : 1, row));
      }

      row += 1;
    }
  }

  return points;
}

function graphPathNodeSort(left: BrainGraphPathNode, right: BrainGraphPathNode): number {
  const leftLaneWeight = Math.abs(left.lane);
  const rightLaneWeight = Math.abs(right.lane);

  return leftLaneWeight - rightLaneWeight || left.lane - right.lane || left.rank - right.rank || left.label.localeCompare(right.label);
}

function graphPointForNode(node: BrainGraphPathNode, lane: number, row: number): GraphCardPoint {
  return {
    id: node.id,
    x: graphCenterX + lane * graphBranchOffset,
    y: graphTopY + row * graphRowGap,
    width: graphCardWidth,
    height: graphCardHeight,
  };
}

function graphCanvasHeight(points: GraphCardPoint[]): number {
  const bottom = points.reduce((max, point) => Math.max(max, point.y + point.height / 2), 0);

  return Math.max(380, bottom + graphBottomPadding);
}

function graphCardEdgePath(source: GraphCardPoint, target: GraphCardPoint): string {
  const sourceY = source.y + source.height / 2;
  const targetY = target.y - target.height / 2;

  if (targetY <= sourceY + 12) {
    const direction = target.x >= source.x ? 1 : -1;
    const sourceX = source.x + direction * (source.width / 2);
    const targetX = target.x - direction * (target.width / 2);
    const midX = sourceX + (targetX - sourceX) / 2;

    return `M ${sourceX} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${targetX} ${target.y}`;
  }

  const midY = sourceY + Math.max(28, (targetY - sourceY) / 2);

  return `M ${source.x} ${sourceY} C ${source.x} ${midY}, ${target.x} ${midY}, ${target.x} ${targetY}`;
}

const graphCanvasWidth = 640;
const graphCardWidth = 230;
const graphCardHeight = 78;
const graphCenterX = graphCanvasWidth / 2;
const graphTopY = 70;
const graphRowGap = 122;
const graphBranchOffset = 150;
const graphBottomPadding = 60;

function graphNodeLines(label: string): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > 24 && current) {
      lines.push(current);
      current = word;

      if (lines.length === 2) {
        break;
      }
    } else {
      current = next;
    }
  }

  if (current && lines.length < 2) {
    lines.push(current);
  }

  if (lines.length === 0) {
    return ["Untitled"];
  }

  if (words.join(" ").length > lines.join(" ").length) {
    const lastIndex = lines.length - 1;
    const lastLine = lines[lastIndex] ?? "";
    lines[lastIndex] = `${lastLine.replace(/[.,;:]$/, "")}...`;
  }

  return lines;
}

function claimPositions(claims: BrainClaim[]): GraphPoint[] {
  if (claims.length === 0) {
    return [];
  }

  const centerX = 500;
  const centerY = 210;
  const radiusX = 330;
  const radiusY = 145;

  return claims.map((claim, index) => {
    if (index === 0) {
      return { id: claim.id, x: centerX, y: centerY };
    }

    const angle = ((index - 1) / Math.max(1, claims.length - 1)) * Math.PI * 2 - Math.PI / 2;

    return {
      id: claim.id,
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    };
  });
}

function memoryGraphPositions(nodes: BrainDocumentGraphNode[]): GraphPoint[] {
  const centerX = 500;
  const centerY = 165;
  const documentNodes = nodes.filter((node) => node.type === "document");
  const otherNodes = nodes.filter((node) => node.type !== "document");

  return [
    ...documentNodes.map((node, index) => {
      const angle = (index / Math.max(1, documentNodes.length)) * Math.PI * 2 - Math.PI / 2;

      return {
        id: node.id,
        x: centerX + Math.cos(angle) * 285,
        y: centerY + Math.sin(angle) * 102,
      };
    }),
    ...otherNodes.map((node, index) => {
      const angle = (index / Math.max(1, otherNodes.length)) * Math.PI * 2 - Math.PI / 2 + 0.35;

      return {
        id: node.id,
        x: centerX + Math.cos(angle) * 390,
        y: centerY + Math.sin(angle) * 138,
      };
    }),
  ];
}

function edgePath(source: GraphPoint, target: GraphPoint): string {
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2 - 20;

  return `M ${source.x} ${source.y} Q ${midX} ${midY} ${target.x} ${target.y}`;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date";
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
