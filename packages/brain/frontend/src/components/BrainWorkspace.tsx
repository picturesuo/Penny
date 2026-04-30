import { useEffect, useMemo, useState } from "react";
import { BookOpen, FileText, Folder, Lightbulb, Plus, Search, TriangleAlert } from "lucide-react";
import type {
  AutopilotTickData,
  BrainClaim,
  BrainData,
  BrainDocumentGraphEdge,
  BrainDocumentGraphNode,
  BrainDocumentsData,
  BrainDocumentSummary,
  BrainEdge,
  BrainResearchItem,
  BrainSidebarData,
  BrainMove,
  ChallengeBriefPayload,
  ClaimDetailConnection,
  ClaimDetailData,
  ClaimDetailMove,
  SessionCockpitData,
  WorkStructure,
} from "../types/brain";
import { fetchClaimDetail } from "../api/brainClient";
import { formatLabel, shortId } from "../lib/format";
import { truncateWords } from "../lib/text";
import { Composer } from "./Composer";

type ClaimDetailStatus = "idle" | "loading" | "ready" | "error";

interface BrainWorkspaceProps {
  documentsData: BrainDocumentsData | null;
  selectedDocument: BrainDocumentSummary | null;
  data: BrainData | null;
  moves: BrainMove[];
  autopilot: AutopilotTickData | null;
  latestArtifact: SessionCockpitData["latestArtifact"] | null;
  focusedClaimId: string | null;
  status: string;
  isThinking: boolean;
  onSelectDocument: (sessionId: string) => void;
  onBackToLibrary: () => void;
  onNewThought: () => void;
  onSeed: (rawIdea: string) => Promise<void>;
  onClaimSelect: (claimId: string) => void;
  onReworkDocument: () => Promise<void>;
}

interface GraphPoint {
  id: string;
  x: number;
  y: number;
}

interface BrainHierarchySidebarProps {
  sidebar: BrainSidebarData | null;
  selectedSessionId: string | null;
  onSelectDocument: (sessionId: string) => void;
  onNewThought: () => void;
}

export function BrainWorkspace({
  documentsData,
  selectedDocument,
  data,
  moves,
  autopilot,
  latestArtifact,
  focusedClaimId,
  status,
  isThinking,
  onSelectDocument,
  onBackToLibrary,
  onNewThought,
  onSeed,
  onClaimSelect,
  onReworkDocument,
}: BrainWorkspaceProps) {
  const claims = selectedDocument ? data?.ideaMap?.claims ?? [] : [];
  const edges = selectedDocument ? data?.ideaMap?.edges ?? [] : [];
  const focusedClaim = claims.find((claim) => claim.id === focusedClaimId) ?? null;
  const [claimDetail, setClaimDetail] = useState<ClaimDetailData | null>(null);
  const [claimDetailStatus, setClaimDetailStatus] = useState<ClaimDetailStatus>("idle");
  const [claimDetailError, setClaimDetailError] = useState<string | null>(null);

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

  return (
    <main className="brain-workspace-shell">
      <BrainHierarchySidebar
        sidebar={documentsData?.sidebar ?? null}
        selectedSessionId={selectedDocument?.sessionId ?? null}
        onSelectDocument={onSelectDocument}
        onNewThought={onNewThought}
      />
      {selectedDocument ? (
        <>
          <section className="brain-document-main" aria-label="Brain document">
            <div className="brain-doc-toolbar">
              <button type="button" className="text-command" onClick={onBackToLibrary}>
                All docs
              </button>
              <div className="brain-doc-actions">
                <button type="button" className="text-command" disabled={isThinking} onClick={onReworkDocument}>
                  Rework in Check
                </button>
                <button type="button" className="primary-command" onClick={onNewThought}>
                  New Thought
                </button>
              </div>
            </div>
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
            <DocumentRundown document={selectedDocument} moves={moves} latestArtifact={latestArtifact} />
            <WorkingNotes sessionId={selectedDocument.sessionId} title={selectedDocument.title} />
          </section>
          <aside className="brain-graph-quarter" aria-label="Brain graph and context">
            <ConnectedGraphBoard
              title="Graph Path"
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
        <>
          <BrainRecordLog
            documentsData={documentsData}
            status={status}
            isThinking={isThinking}
            onSelectDocument={onSelectDocument}
            onSeed={onSeed}
          />
          <aside className="brain-graph-quarter" aria-label="Brain graph preview">
            <DocumentMemoryGraph graph={documentsData?.graph ?? null} />
          </aside>
        </>
      )}
    </main>
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
        {typeof claim.confidence === "number" ? <span>{claim.confidence}% confidence</span> : null}
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

function BrainHierarchySidebar({ sidebar, selectedSessionId, onSelectDocument, onNewThought }: BrainHierarchySidebarProps) {
  const folders = sidebar?.folders ?? [];
  const quickNotes = sidebar?.quickNotes ?? [];
  const research = sidebar?.research ?? [];
  const selectedFolderId =
    folders.find((folder) => folder.documents.some((document) => document.sessionId === selectedSessionId))?.id ??
    folders[0]?.id ??
    null;
  const [openFolderId, setOpenFolderId] = useState<string | null>(selectedFolderId);

  useEffect(() => {
    setOpenFolderId(selectedFolderId);
  }, [selectedFolderId]);

  return (
    <aside className="brain-hierarchy-sidebar" aria-label="Brain sidebar">
      <div className="brain-sidebar-head">
        <div>
          <span>Brain</span>
          <strong>Brain</strong>
        </div>
        <button type="button" className="brain-sidebar-new" onClick={onNewThought} aria-label="New thought">
          <Plus size={15} aria-hidden="true" />
        </button>
      </div>
      <section className="brain-sidebar-section" aria-label="Quick notes">
        <div className="brain-sidebar-section-head">
          <Lightbulb size={15} aria-hidden="true" />
          <strong>Quick Notes</strong>
        </div>
        {quickNotes.length > 0 ? (
          <div className="brain-quick-list">
            {quickNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                className="brain-quick-note"
                onClick={() => onSelectDocument(note.sessionId)}
              >
                <span title={note.text}>{truncateWords(note.text, 9)}</span>
                <small>{note.meta}</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="brain-sidebar-muted">No quick notes yet.</p>
        )}
      </section>
      <section className="brain-sidebar-section" aria-label="Folders">
        <div className="brain-sidebar-section-head">
          <Folder size={15} aria-hidden="true" />
          <strong>Folders</strong>
        </div>
        {folders.length > 0 ? (
          <div className="brain-tree" role="tree" aria-label="Folders and documents">
            {folders.map((folder) => {
              const open = folder.id === openFolderId;

              return (
                <div key={folder.id} className="brain-tree-folder" role="treeitem" aria-expanded={open}>
                  <button
                    type="button"
                    className="brain-tree-row is-folder"
                    onClick={() => setOpenFolderId((current) => (current === folder.id ? null : folder.id))}
                  >
                    <Folder size={15} aria-hidden="true" />
                    <span title={folder.label}>{folder.label}</span>
                    <small>{folder.documentCount}</small>
                  </button>
                  {open ? (
                    <div className="brain-tree-children">
                      {folder.documents.map((document) => {
                        const active = document.sessionId === selectedSessionId;

                        return (
                          <div key={document.id} className="brain-tree-document" role="treeitem" aria-expanded={active}>
                            <button
                              type="button"
                              className={`brain-tree-row is-doc${active ? " is-active" : ""}`}
                              onClick={() => onSelectDocument(document.sessionId)}
                              aria-current={active ? "page" : undefined}
                            >
                              <BookOpen size={14} aria-hidden="true" />
                              <span title={document.title}>{truncateWords(document.title, 7)}</span>
                              <small>{document.fileCount}</small>
                            </button>
                            {active ? (
                              <div className="brain-file-list" role="group" aria-label={`${document.title} files`}>
                                {document.files.slice(0, 5).map((file) => (
                                  <button
                                    key={file.id}
                                    type="button"
                                    className="brain-tree-row is-file is-parent-active"
                                    onClick={() => onSelectDocument(file.sessionId)}
                                  >
                                    <FileText size={13} aria-hidden="true" />
                                    <span title={file.subtitle ?? file.title}>{truncateWords(file.title, 4)}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
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
      <section className="brain-sidebar-section" aria-label="Research and examples">
        <div className="brain-sidebar-section-head">
          <Search size={15} aria-hidden="true" />
          <strong>Research</strong>
        </div>
        {research.length > 0 ? (
          <div className="brain-research-list">
            {research.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`brain-research-item is-${item.kind}`}
                onClick={() => onSelectDocument(item.sessionId)}
              >
                {researchIcon(item)}
                <span>
                  <strong title={item.title}>{truncateWords(item.title, 5)}</strong>
                  <small title={item.subtitle ?? item.title}>{truncateWords(item.subtitle ?? item.title, 9)}</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="brain-sidebar-muted">No sources or examples yet.</p>
        )}
      </section>
    </aside>
  );
}

function researchIcon(item: BrainResearchItem) {
  if (item.kind === "failure_example") {
    return <TriangleAlert size={14} aria-hidden="true" />;
  }

  if (item.kind === "research_lead" || item.kind === "source") {
    return <Search size={14} aria-hidden="true" />;
  }

  return <FileText size={14} aria-hidden="true" />;
}

function BrainRecordLog({
  documentsData,
  status,
  isThinking,
  onSelectDocument,
  onSeed,
}: {
  documentsData: BrainDocumentsData | null;
  status: string;
  isThinking: boolean;
  onSelectDocument: (sessionId: string) => void;
  onSeed: (rawIdea: string) => Promise<void>;
}) {
  const documents = documentsData?.documents ?? [];

  return (
    <section className="brain-library-panel" aria-label="Brain document library">
      <div className="brain-library-head">
        <div>
          <span>Brain</span>
          <h1>Documents</h1>
        </div>
        <div className="brain-library-stats" aria-label="Brain document totals">
          <span>{documentsData?.meta.documentCount ?? 0} docs</span>
          <span>{documentsData?.meta.claimCount ?? 0} claims</span>
          <span>{documentsData?.meta.edgeCount ?? 0} links</span>
        </div>
      </div>
      <section className="brain-new-thought" aria-label="New thought">
        <Composer disabled={isThinking} status={status} onSubmit={onSeed} />
      </section>
      <div className="document-log-table" aria-label="Document log">
        {documents.length > 0 ? (
          documents.map((document) => (
            <DocumentLogRow key={document.id} document={document} onSelectDocument={onSelectDocument} />
          ))
        ) : (
          <article className="document-empty-state">
            <strong>No docs yet</strong>
            <span>Start with a thought and Penny will create the first record.</span>
          </article>
        )}
      </div>
    </section>
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
    <button type="button" className="document-log-row" onClick={() => onSelectDocument(document.sessionId)}>
      <span className="doc-kind">Doc</span>
      <span>
        <strong title={document.title}>{truncateWords(document.title, 14)}</strong>
        <small title={document.mainClaim?.text ?? document.originalIdea ?? ""}>
          {truncateWords(document.mainClaim?.text ?? document.originalIdea ?? "No main claim yet", 16)}
        </small>
      </span>
      <span className="doc-log-meta">
        <strong>{document.counts.claims} claims</strong>
        <small>{formatLabel(document.status)}</small>
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
      <p title={document.originalIdea ?? document.mainClaim?.text ?? ""}>
        {truncateWords(document.originalIdea ?? document.mainClaim?.text ?? "No original idea recorded.", 26)}
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
  claims,
  edges,
  focusedClaimId,
  suggestedClaimId,
  onClaimSelect,
}: {
  title: string;
  claims: BrainClaim[];
  edges: BrainEdge[];
  focusedClaimId: string | null;
  suggestedClaimId: string | null;
  onClaimSelect: (claimId: string) => void;
}) {
  const positions = useMemo(() => claimPositions(claims), [claims]);
  const positionMap = new Map(positions.map((point) => [point.id, point]));

  return (
    <section className="graph-board" aria-label={title}>
      <div className="graph-board-head">
        <h2>{title}</h2>
      </div>
      {claims.length > 0 ? (
        <svg viewBox="0 0 1000 420" role="img" aria-label="Connected thought graph">
          <g className="graph-edge-layer">
            {edges.map((edge) => {
              const source = positionMap.get(edge.fromClaimId);
              const target = positionMap.get(edge.toClaimId);

              if (!source || !target) {
                return null;
              }

              return <path key={edge.id} className={`graph-edge graph-edge-${edge.kind}`} d={edgePath(source, target)} />;
            })}
          </g>
          <g className="graph-node-layer">
            {claims.map((claim) => {
              const point = positionMap.get(claim.id);

              if (!point) {
                return null;
              }

              const isFocused = claim.id === focusedClaimId;
              const isSuggested = claim.id === suggestedClaimId;

              return (
                <g key={claim.id} className={`graph-node is-${claim.kind}${isFocused ? " is-focused" : ""}${isSuggested ? " is-suggested" : ""}`}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isFocused ? 24 : 18}
                    role="button"
                    tabIndex={0}
                    aria-label={`Focus ${claim.text}`}
                    onClick={() => onClaimSelect(claim.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onClaimSelect(claim.id);
                      }
                    }}
                  />
                  <text x={point.x + 31} y={point.y - 4}>
                    {truncateWords(claim.text, 5)}
                  </text>
                  <text className="graph-node-meta" x={point.x + 31} y={point.y + 16}>
                    {formatLabel(claim.kind)}
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

function DocumentRundown({
  document,
  moves,
  latestArtifact,
}: {
  document: BrainDocumentSummary;
  moves: BrainMove[];
  latestArtifact: SessionCockpitData["latestArtifact"] | null;
}) {
  const brief = challengeBriefPayload(latestArtifact?.payload);

  return (
    <section className="document-rundown" aria-label="Doc rundown">
      <RundownSection title="Original Idea" values={[document.originalIdea ?? "No original idea recorded."]} />
      <RundownSection title="Main Claim" values={[document.mainClaim?.text ?? "No main claim yet."]} />
      <RundownSection title="Strongest Options" values={document.strongestOptions.map((claim) => claim.text)} />
      <RundownSection title="Rejected Options" values={document.rejectedOptions.map((claim) => claim.text)} />
      <RundownSection title="To-Do-Later Ideas" values={document.todoLaterIdeas} />
      <RundownSection title="Final Recommendations" values={document.finalRecommendations} />
      <RundownSection title="Next Actions" values={document.nextActions} />
      {brief ? <ChallengeBriefRundown payload={brief} /> : null}
      <RundownSection
        title="History"
        values={moves.slice(0, 10).map((move) => `${formatLabel(move.kind ?? move.type)}: ${move.summary}`)}
      />
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

function ChallengeBriefRundown({ payload }: { payload: ChallengeBriefPayload }) {
  const sections = payload.sections;

  return (
    <article className="rundown-section is-brief">
      <h2>Generated Doc</h2>
      <p>{payload.title}</p>
      <ol>
        <li>{sections.challengeIssued.text}</li>
        <li>{sections.userResponse.text}</li>
        <li>{sections.recommendedNextMove.why}</li>
      </ol>
    </article>
  );
}

function WorkingNotes({ sessionId, title }: { sessionId: string; title: string }) {
  const storageKey = `penny.docNotes.${sessionId}`;
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setNotes(window.localStorage.getItem(storageKey) ?? "");
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(storageKey, notes);
  }, [notes, storageKey]);

  return (
    <section className="working-notes" aria-label="Working notes">
      <h2>Notes</h2>
      <textarea
        value={notes}
        aria-label={`Notes for ${title}`}
        placeholder="Capture a thought, note an unresolved issue, or write what should change next."
        onChange={(event) => setNotes(event.target.value)}
      />
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

function challengeBriefPayload(payload: unknown): ChallengeBriefPayload | null {
  return isChallengeBriefPayload(payload) ? payload : null;
}

function isChallengeBriefPayload(payload: unknown): payload is ChallengeBriefPayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "kind" in payload &&
      payload.kind === "challenge_brief" &&
      "sections" in payload &&
      payload.sections &&
      typeof payload.sections === "object",
  );
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
