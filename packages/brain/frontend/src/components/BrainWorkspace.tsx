import React, { useEffect, useMemo, useState } from "react";
import { Archive, BookOpen, FilePlus, Folder, FolderPlus } from "lucide-react";
import type {
  AutopilotTickData,
  BrainClaim,
  BrainData,
  BrainDocumentGraphEdge,
  BrainDocumentGraphNode,
  BrainDocumentsData,
  BrainDocumentSummary,
  BrainEdge,
  BrainGraphPath,
  BrainGraphPathNode,
  BrainHierarchyFolder,
  BrainRecentIdea,
  BrainSidebarData,
  CanvasNode,
  CanvasNodeAction,
  BrainMove,
  ClaimDetailConnection,
  ClaimDetailData,
  ClaimDetailMove,
  SessionCanvasData,
  SessionCockpitData,
  WorkStructure,
} from "../types/brain";
import { fetchClaimDetail, fetchSessionNote, saveSessionNote } from "../api/brainClient";
import { formatLabel, shortId } from "../lib/format";
import { truncateWords } from "../lib/text";
import { CanvasWorkspace } from "./CanvasWorkspace";

type ClaimDetailStatus = "idle" | "loading" | "ready" | "error";

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

interface BrainHierarchySidebarProps {
  sidebar: BrainSidebarData | null;
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
  onQuickNoteCreate,
  onQuickNoteAction,
  onClaimSelect,
  onReworkDocument,
  onCanvasOpenChange,
  onCanvasNodeAction,
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
  const quickNotes = useMemo(() => [...recents, ...archivedRecents], [recents, archivedRecents]);
  const selectedQuickNote = quickNotes.find((recent) => recent.id === selectedQuickNoteId) ?? null;
  const selectedQuickNoteArchived = archivedRecents.some((recent) => recent.id === selectedQuickNoteId);

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

  async function handleQuickNoteAction(
    recent: BrainRecentIdea,
    action: "build" | "brain" | "check" | "learn" | "archive" | "restore",
  ) {
    await onQuickNoteAction?.(recent, action);

    if (action === "archive" && recent.id === selectedQuickNoteId) {
      setSelectedQuickNoteId(null);
    }
  }

  return (
    <main className={`brain-workspace-shell${selectedQuickNote ? " is-quick-note-doc" : ""}`}>
      <BrainHierarchySidebar
        sidebar={documentsData?.sidebar ?? null}
        selectedSessionId={selectedDocument?.sessionId ?? null}
        selectedQuickNoteId={selectedQuickNoteId}
        recents={recents}
        archivedRecents={archivedRecents}
        onSelectDocument={handleSelectDocument}
        onSelectQuickNote={(recent) => setSelectedQuickNoteId(recent.id)}
        onNewDocument={onNewThought}
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
        <>
          <section className="brain-document-main" aria-label="Brain document">
            <div className="brain-doc-toolbar">
              <button type="button" className="text-command" onClick={handleBackToLibrary}>
                All docs
              </button>
              <div className="brain-doc-actions">
                <button type="button" className="text-command" disabled={isThinking} onClick={onReworkDocument}>
                  Rework in Check
                </button>
                <button
                  type="button"
                  className={canvasOpen ? "primary-command" : "text-command"}
                  disabled={isThinking}
                  onClick={() => onCanvasOpenChange(!canvasOpen)}
                >
                  Canvas
                </button>
                <button type="button" className="primary-command" onClick={onNewThought}>
                  New Thought
                </button>
              </div>
            </div>
            {canvasOpen ? (
              <CanvasWorkspace
                sessionId={selectedDocument.sessionId}
                focusedClaimId={focusedClaimId}
                {...(initialCanvasData ? { initialCanvasData } : {})}
                disabled={isThinking}
                onNodeAction={onCanvasNodeAction}
              />
            ) : (
              <>
                <DocumentHeader document={selectedDocument} workStructure={data?.workStructure ?? null} />
                <FocusedGraphDetail
                  focusedClaim={focusedClaim}
                  detail={claimDetail}
                  detailStatus={claimDetailStatus}
                  detailError={claimDetailError}
                  localClaims={claims}
                  localEdges={edges}
                  moves={moves}
                />
                <DocumentRundown document={selectedDocument} />
                <WorkingNotes sessionId={selectedDocument.sessionId} title={selectedDocument.title} />
              </>
            )}
          </section>
          <aside className="brain-graph-quarter" aria-label="Brain graph and context">
            <ConnectedGraphBoard
              title="Graph Path"
              graphPath={graphPath}
              claims={claims}
              edges={edges}
              focusedClaimId={focusedClaimId}
              suggestedClaimId={autopilot?.suggestion?.targetClaimId ?? null}
              onClaimSelect={onClaimSelect}
            />
            <BrainDocumentAside
              document={selectedDocument}
              focusedClaim={focusedClaim}
              claims={claims}
              moves={moves}
              latestArtifact={latestArtifact}
            />
          </aside>
        </>
      ) : (
        <BrainRecordLog
          documentsData={documentsData}
          onSelectDocument={handleSelectDocument}
        />
      )}
    </main>
  );
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
                Check
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

function BrainHierarchySidebar({
  sidebar,
  selectedSessionId,
  selectedQuickNoteId,
  recents = [],
  archivedRecents = [],
  onSelectDocument,
  onSelectQuickNote,
  onNewDocument,
  onQuickNoteCreate,
  onQuickNoteAction,
}: BrainHierarchySidebarProps) {
  const folders = sidebar?.folders ?? [];
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
      <section className="brain-sidebar-section" aria-label="Quick notes">
        <div className="brain-sidebar-section-head is-quiet">Capture a quick note</div>
        <div className="brain-tree" role="tree" aria-label="Quick notes folder">
          <div className="brain-tree-folder" role="treeitem" aria-expanded="true">
            <div className="brain-tree-row is-folder">
              <Folder size={15} aria-hidden="true" />
              <span>Quick Notes</span>
              <small>{recents.length}</small>
            </div>
            <div className="brain-tree-children">
              <div className="quick-note-capture">
                <textarea
                  value={quickNoteDraft}
                  onChange={(event) => setQuickNoteDraft(event.target.value)}
                  placeholder="Capture a quick note."
                  rows={2}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      void handleQuickNoteCreate();
                    }
                  }}
                />
              </div>
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
                <p className="brain-sidebar-muted">No quick notes yet.</p>
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
      <section className="brain-sidebar-section" aria-label="Document folders">
        <div className="brain-sidebar-section-head">
          <Folder size={15} aria-hidden="true" />
          <strong>Folders</strong>
          <button type="button" className="brain-sidebar-add-doc" onClick={handleAddFolder}>
            <FolderPlus size={14} aria-hidden="true" />
            <span>Add Folder</span>
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
                      {folder.documents.slice(0, 3).map((document) => {
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

function BrainRecordLog({
  documentsData,
  onSelectDocument,
}: {
  documentsData: BrainDocumentsData | null;
  onSelectDocument: (sessionId: string) => void;
}) {
  const documents = documentsData?.documents ?? [];
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const recentDocuments = useMemo(() => recentDocumentRows(documents), [documents]);
  const searchResults = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return searchDocumentRows(documents, normalizedQuery);
  }, [documents, normalizedQuery]);

  return (
    <section className="brain-library-panel" aria-label="Brain document library">
      <div className="brain-library-head">
        <div>
          <h1>Documents</h1>
        </div>
      </div>
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
              <strong>No docs yet</strong>
              <span>Start with a thought and Penny will create the first record.</span>
            </article>
          )}
        </section>
      )}
    </section>
  );
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
    <button type="button" className="document-log-row" onClick={() => onSelectDocument(result.sessionId)}>
      <span className="doc-kind">{result.type}</span>
      <span>
        <strong title={result.title}>{truncateWords(result.title, 18)}</strong>
        <small title={result.body}>{truncateWords(result.body, 18)}</small>
      </span>
      <span className="doc-log-meta">
        <strong>Open</strong>
        <small>{formatLabel(result.type)}</small>
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
          <strong>No graph state yet</strong>
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
          <strong>No documents yet</strong>
          <span>The graph appears after the first thought is saved.</span>
        </div>
      )}
    </section>
  );
}

function DocumentRundown({ document }: { document: BrainDocumentSummary }) {
  return (
    <section className="document-rundown" aria-label="Doc rundown">
      <RundownSection title="Original Idea" values={[document.originalIdea ?? "No original idea recorded."]} />
      <RundownSection title="Main Claim" values={[document.mainClaim?.text ?? "No main claim yet."]} />
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
        <p>{focusedClaim?.text ?? document.mainClaim?.text ?? "No selected claim yet."}</p>
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
          <p>No related concepts recorded yet.</p>
        )}
      </section>
      <section>
        <h2 className="section-label">DOCUMENT SUMMARY</h2>
        <p>{latestArtifact?.summary ?? document.finalRecommendations[0] ?? document.originalIdea ?? "No summary yet."}</p>
      </section>
      <section>
        <h2 className="section-label">LAST SESSION</h2>
        <p>{document.lastMove ? `${formatDate(document.lastMove.createdAt)}: ${document.lastMove.summary}` : "No moves recorded."}</p>
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
