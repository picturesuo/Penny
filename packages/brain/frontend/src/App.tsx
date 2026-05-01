import { useEffect, useState } from "react";
import {
  createChallengeBrief,
  fetchBrainHybridSearch,
  fetchBrainDocuments,
  fetchBrainRecents,
  fetchSessionCockpit,
  keepBrainRecentIdea,
  issueChallengeFromCandidate,
  respondToChallenge,
  saveBrainObject,
  seedBrain,
  selectAutopilotNode,
  startAutopilotCandidate,
  tickAutopilot,
  verifyClaim,
} from "./api/brainClient";
import { buildAutopilotStartIntent, runAutopilotGoThere, type PennyMode } from "./autopilotUx";
import { BrainWorkspace } from "./components/BrainWorkspace";
import { CheckWorkspace } from "./components/CheckWorkspace";
import { Header } from "./components/Header";
import { LandingPage } from "./components/LandingPage";
import { LearnWorkspace } from "./components/LearnWorkspace";
import { formatLabel, shortId } from "./lib/format";
import type {
  AutopilotTickData,
  BrainData,
  BrainDocumentsData,
  BrainHybridSearchResponse,
  BrainMove,
  BrainRecentIdea,
  CanvasNode,
  CanvasNodeAction,
  ChallengeResponseKind,
  RespondToChallengeResponse,
  SessionCockpitData,
  WorkStructureStep,
} from "./types/brain";

type ChallengeResponseDraft =
  | {
      response: "defend";
      reasoning: string;
    }
  | {
      response: "revise";
      revisedText: string;
      reasoning?: string;
    }
  | {
      response: "absorb";
      reasoning?: string;
    };

type BrainRelatedSearchState = BrainHybridSearchResponse["data"];

const ACTIVE_SESSION_KEY = "penny.activeSessionId";
const SESSION_QUERY_PARAM = "sessionId";

export function App() {
  const [documentsData, setDocumentsData] = useState<BrainDocumentsData | null>(null);
  const [recents, setRecents] = useState<BrainRecentIdea[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [data, setData] = useState<BrainData | null>(null);
  const [moves, setMoves] = useState<BrainMove[]>([]);
  const [autopilot, setAutopilot] = useState<AutopilotTickData | null>(null);
  const [challengeResponse, setChallengeResponse] = useState<RespondToChallengeResponse["data"] | null>(null);
  const [latestArtifact, setLatestArtifact] = useState<SessionCockpitData["latestArtifact"]>(null);
  const [focusedClaimId, setFocusedClaimId] = useState<string | null>(null);
  const [focusedWorkStructureStepId, setFocusedWorkStructureStepId] = useState<string | null>(null);
  const [brainCanvasOpen, setBrainCanvasOpen] = useState(false);
  const [learnFocusNode, setLearnFocusNode] = useState<CanvasNode | null>(null);
  const [relatedBrainSearch, setRelatedBrainSearch] = useState<BrainRelatedSearchState | null>(null);
  const [activeMode, setActiveMode] = useState<PennyMode>("Learn");
  const [landingVisible, setLandingVisible] = useState(() => activeSessionId() === null);
  const [status, setStatus] = useState("Ready");
  const [isThinking, setIsThinking] = useState(false);

  const selectedDocument = documentsData?.documents.find((document) => document.sessionId === selectedDocumentId) ?? null;
  const workStructure = data?.workStructure ?? null;
  const sessionLabel = selectedDocument
    ? `Doc ${shortId(selectedDocument.sessionId)} ${formatLabel(selectedDocument.status)}`
    : `${documentsData?.meta.documentCount ?? 0} docs`;

  useEffect(() => {
    const sessionId = activeSessionId();
    let cancelled = false;

    async function restoreBrain() {
      setIsThinking(true);
      setStatus(sessionId ? "Restoring session" : "Loading docs");

      try {
        const documents = await fetchBrainDocuments();

        if (cancelled) {
          return;
        }

        setDocumentsData(documents.data);
        await refreshRecents();

        if (!sessionId) {
          setLandingVisible(true);
          setStatus("Docs loaded");
          return;
        }

        setLandingVisible(false);
        await loadSession(sessionId, null);
      } catch (error) {
        if (!cancelled) {
          forgetActiveSession();
          setLandingVisible(true);
          setStatus(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setIsThinking(false);
        }
      }
    }

    void restoreBrain();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSeed(rawIdea: string) {
    setIsThinking(true);
    setStatus("Thinking");

    try {
      const payload = await seedBrain(rawIdea);
      setData(payload.data);
      setChallengeResponse(null);
      setLatestArtifact(null);
      setBrainCanvasOpen(false);
      setLandingVisible(false);
      setFocusedWorkStructureStepId(payload.data.workStructure?.activeStepId ?? null);
      setFocusedClaimId(payload.data.firstChallenge?.targetClaimId ?? payload.data.ideaMap?.claims?.[0]?.id ?? null);
      setStatus("Graph slice persisted");

      if (payload.data.session?.id) {
        const sessionId = payload.data.session.id;
        rememberActiveSession(sessionId);
        setSelectedDocumentId(sessionId);
        await refreshDocuments(sessionId);
        setStatus("Doc created");

        try {
          await tickAutopilot(sessionId);
          const cockpit = await refreshCockpit(sessionId, payload.data);
          setFocusedClaimId(
            cockpit.autopilot.focusState?.focusedClaimId ??
              cockpit.autopilot.suggestion?.targetClaimId ??
              payload.data.firstChallenge?.targetClaimId ??
              payload.data.ideaMap?.claims?.[0]?.id ??
              null,
          );
          await refreshDocuments(sessionId);
        } catch (followUpError) {
          setStatus(`Doc saved; ${formatErrorMessage(followUpError)}`);
        }
      }
    } catch (error) {
      await refreshDocumentsAfterSeedFailure();
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleKeepRecentIdea(rawIdea: string) {
    setIsThinking(true);
    setStatus("Keeping recent");

    try {
      const payload = await keepBrainRecentIdea(rawIdea);
      setRecents(payload.data.recents ?? mergeRecentIdeas(payload.data.recent, recents));
      setStatus("Kept in Recents");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleSelectDocument(sessionId: string) {
    setIsThinking(true);
    setStatus("Opening doc");
    setLandingVisible(false);

    try {
      await loadSession(sessionId, data);
      setStatus("Doc opened");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsThinking(false);
    }
  }

  function handleBackToLibrary() {
    setSelectedDocumentId(null);
    forgetActiveSession();
    setStatus("Docs loaded");
  }

  function handleNewThought() {
    setSelectedDocumentId(null);
    setData(null);
    setMoves([]);
    setAutopilot(null);
    setChallengeResponse(null);
    setLatestArtifact(null);
    setFocusedClaimId(null);
    setBrainCanvasOpen(false);
    setLearnFocusNode(null);
    setRelatedBrainSearch(null);
    setLandingVisible(true);
    forgetActiveSession();
    setStatus("Ready");
  }

  async function handleLandingSeed(rawIdea: string) {
    setLandingVisible(false);
    setActiveMode("Brain");
    await handleSeed(rawIdea);
  }

  function handleLandingModeSelect(mode: PennyMode) {
    setLandingVisible(false);
    setActiveMode(mode);
  }

  async function handleLandingPromptSubmit(mode: Extract<PennyMode, "Learn" | "Check">, rawIdea: string) {
    setLandingVisible(false);
    setActiveMode("Learn");
    await handleSeed(rawIdea);
    setActiveMode(mode);
  }

  async function handleLandingQuickNote(rawIdea: string) {
    setLandingVisible(false);
    setActiveMode("Learn");

    if (rawIdea.trim()) {
      await handleKeepRecentIdea(rawIdea);
    }
  }

  async function handleReworkDocument() {
    if (!data?.session?.id) {
      setStatus("Open a doc before reworking it");
      return;
    }

    setIsThinking(true);
    setStatus("Preparing Check");

    try {
      await tickAutopilot(data.session.id, true);
      const cockpit = await refreshCockpit(data.session.id);
      setFocusedClaimId(cockpit.autopilot.suggestion?.targetClaimId ?? cockpit.ideaMap.claims[0]?.id ?? null);
      await refreshDocuments(data.session.id);
      setActiveMode("Check");
      setStatus("Check ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleGoThere(candidateIdOverride?: string) {
    const intent = buildAutopilotStartIntent(data?.session?.id, autopilot, candidateIdOverride);

    if (!intent.ok) {
      setStatus(intent.status);
      return;
    }

    setIsThinking(true);
    setStatus("Starting Autopilot focus");

    try {
      const result = await runAutopilotGoThere(intent, {
        startCandidate: startAutopilotCandidate,
        refreshCockpit,
      });
      setFocusedClaimId(result.focusedClaimId);
      setActiveMode(result.nextMode);
      setStatus("Autopilot focus started");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleIssueChallenge() {
    if (!data?.session?.id) {
      setStatus("Challenge needs a doc first");
      return;
    }

    const candidate = autopilot?.suggestion ?? autopilot?.selectedCandidate ?? null;
    const candidateId = candidate?.candidateId ?? null;

    if (!candidateId) {
      setStatus("No selected candidate to challenge");
      return;
    }

    if (candidate?.action !== "challenge") {
      setStatus(`${candidate?.label ?? "Selected action"} is not a challenge candidate`);
      return;
    }

    setIsThinking(true);
    setStatus("Issuing challenge");

    try {
      const issued = await issueChallengeFromCandidate(data.session.id, candidateId);
      const cockpit = await refreshCockpit(data.session.id);
      await refreshDocuments(data.session.id);
      setChallengeResponse(null);
      setFocusedClaimId(issued.data.targetClaim.id ?? cockpit.activeChallenge?.targetClaimId ?? null);
      setStatus("Challenge issued");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleChallengeResponse(challengeId: string, draft: ChallengeResponseDraft) {
    if (!data?.session?.id) {
      setStatus("Challenge response needs a doc first");
      return;
    }

    setIsThinking(true);
    setStatus(`${responseLabel(draft.response)} response`);

    try {
      const response = await respondToChallenge({ challengeId, ...draft });
      setChallengeResponse(response.data);

      if (response.data.nextMove.status === "client_tick_required") {
        await tickAutopilot(data.session.id, response.data.nextMove.body.resume);
      }

      const cockpit = await refreshCockpit(data.session.id);
      await refreshDocuments(data.session.id);
      setFocusedClaimId(response.data.receipt.targetClaimId ?? cockpit.autopilot.suggestion?.targetClaimId ?? null);
      setStatus(`${responseLabel(draft.response)} saved`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleCreateChallengeBrief() {
    if (!data?.session?.id) {
      setStatus("Doc generation needs a session first");
      return;
    }

    setIsThinking(true);
    setStatus("Creating doc");

    try {
      const brief = await createChallengeBrief(data.session.id);
      setLatestArtifact(brief.data.artifact);
      await refreshCockpit(data.session.id);
      await refreshDocuments(data.session.id);
      setStatus("Doc created");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleVerifyChanged() {
    if (!data?.session?.id) {
      return;
    }

    const cockpit = await refreshCockpit(data.session.id);
    await refreshDocuments(cockpit.session.id);
    setFocusedClaimId(
      cockpit.autopilot.focusState?.focusedClaimId ??
        cockpit.autopilot.suggestion?.targetClaimId ??
        cockpit.ideaMap.claims[0]?.id ??
        null,
    );
  }

  async function handleManualClaimSelect(claimId: string) {
    setFocusedWorkStructureStepId(workStructure?.steps.find((step) => step.claimIds.includes(claimId))?.id ?? null);

    if (!data?.session?.id) {
      setFocusedClaimId(claimId);
      return;
    }

    setIsThinking(true);
    setStatus("Saving manual focus");

    try {
      await selectAutopilotNode({
        sessionId: data.session.id,
        claimId,
        previousSuggestionMoveId: autopilot?.move?.id ?? null,
      });
      const cockpit = await refreshCockpit(data.session.id);
      setFocusedClaimId(cockpit.autopilot.focusState?.focusedClaimId ?? claimId);
      setStatus("Manual selection saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleWorkStructureSelect(step: WorkStructureStep) {
    setFocusedWorkStructureStepId(step.id);

    const claimId = step.claimIds[0] ?? null;

    if (!claimId) {
      setStatus(`${step.title} selected`);
      return;
    }

    await handleManualClaimSelect(claimId);
      setFocusedWorkStructureStepId(step.id);
  }

  function handleOpenCanvas() {
    const sessionId = data?.session?.id ?? selectedDocument?.sessionId ?? null;

    if (!sessionId) {
      setStatus("Save an idea to Brain before opening Canvas");
      return;
    }

    setBrainCanvasOpen(true);
    setActiveMode("Brain");
    setStatus("Canvas ready");
  }

  async function handleBrainRelatedSearch(query: string, claimId?: string | null): Promise<BrainHybridSearchResponse["data"]> {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      const emptySearch = { available: false, results: [], meta: { query: "", resultCount: 0 } };
      setRelatedBrainSearch(emptySearch);
      return emptySearch;
    }

    setIsThinking(true);
    setStatus("Checking Brain memory");

    try {
      const response = await fetchBrainHybridSearch({
        query: trimmedQuery,
        sessionId: data?.session?.id ?? selectedDocument?.sessionId ?? null,
        claimId: claimId ?? null,
        mode: "learn",
        limit: 5,
      });
      setRelatedBrainSearch(response.data);
      setStatus(response.data.available ? "Brain memory checked" : "Brain related search unavailable");
      return response.data;
    } catch (error) {
      const failedSearch = { available: false, results: [], meta: { query: trimmedQuery, resultCount: 0 } };
      setRelatedBrainSearch(failedSearch);
      setStatus(error instanceof Error ? error.message : String(error));
      return failedSearch;
    } finally {
      setIsThinking(false);
    }
  }

  async function handleCanvasNodeAction(action: CanvasNodeAction, node: CanvasNode) {
    const claimId = claimIdFromCanvasNode(node);
    const claim = claimId ? data?.ideaMap?.claims?.find((item) => item.id === claimId) ?? null : null;
    const nodeText = node.summary?.trim() || claim?.text || node.title;

    if (claimId) {
      setFocusedClaimId(claimId);
    }

    switch (action) {
      case "learn":
        setLearnFocusNode(node);
        setActiveMode("Learn");
        setStatus("Learn focused on canvas node");
        return;
      case "check":
        setActiveMode("Check");
        if (claimId) {
          await handleManualClaimSelect(claimId);
        } else {
          setStatus("Check opened for canvas node");
        }
        return;
      case "verify":
        await handleCanvasVerify(node, claimId, nodeText);
        return;
      case "save":
        await handleCanvasSave(node, nodeText);
        return;
      case "related":
        setLearnFocusNode(node);
        await handleBrainRelatedSearch(nodeText, claimId);
        setActiveMode("Learn");
        return;
    }
  }

  async function handleCanvasVerify(node: CanvasNode, claimId: string | null, currentClaimText: string) {
    if (!data?.session?.id || !claimId) {
      setActiveMode("Check");
      setStatus("Open a saved claim before running Verify");
      return;
    }

    setIsThinking(true);
    setStatus("Verifying canvas claim");

    try {
      await verifyClaim({ sessionId: data.session.id, claimId, currentClaimText });
      const cockpit = await refreshCockpit(data.session.id);
      await refreshDocuments(data.session.id);
      setFocusedClaimId(claimId ?? cockpit.autopilot.suggestion?.targetClaimId ?? null);
      setLearnFocusNode(node);
      setActiveMode("Check");
      setStatus("Verify completed");
    } catch (error) {
      setActiveMode("Check");
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleCanvasSave(node: CanvasNode, content: string) {
    if (node.id.startsWith("brain_object:")) {
      setStatus("Canvas object is already saved in Brain");
      return;
    }

    if (!content.trim()) {
      setStatus("Canvas node has no content to save");
      return;
    }

    setIsThinking(true);
    setStatus("Saving canvas node");

    try {
      await saveBrainObject({
        sessionId: data?.session?.id ?? selectedDocument?.sessionId ?? null,
        objectType: node.kind,
        title: node.title,
        summary: node.summary ?? null,
        content,
        payload: {
          source: "canvas_node",
          canvasNodeId: node.id,
          refs: node.refs ?? {},
        },
      });
      await refreshDocuments(data?.session?.id ?? selectedDocument?.sessionId ?? null);
      setStatus("Canvas node saved to Brain");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function loadSession(sessionId: string, fallbackData: BrainData | null): Promise<SessionCockpitData> {
    setSelectedDocumentId(sessionId);
    rememberActiveSession(sessionId);
    const cockpit = await refreshCockpit(sessionId, fallbackData);
    setFocusedWorkStructureStepId(cockpit.workStructure?.activeStepId ?? null);
    setFocusedClaimId(
      cockpit.autopilot.focusState?.focusedClaimId ??
        cockpit.autopilot.suggestion?.targetClaimId ??
        cockpit.ideaMap.claims[0]?.id ??
        null,
    );

    return cockpit;
  }

  async function refreshCockpit(sessionId: string, fallbackData: BrainData | null = data): Promise<SessionCockpitData> {
    const cockpit = await fetchSessionCockpit(sessionId);
    const cockpitData = cockpit.data;

    setData(mergeCockpitData(cockpitData, fallbackData));
    setAutopilot(cockpitData.autopilot);
    setMoves(cockpitData.moves);
    setLatestArtifact(cockpitData.latestArtifact ?? null);
    setFocusedWorkStructureStepId(cockpitData.workStructure?.activeStepId ?? null);
    rememberActiveSession(cockpitData.session.id);

    return cockpitData;
  }

  async function refreshDocuments(preferredSessionId: string | null = selectedDocumentId): Promise<void> {
    const documents = await fetchBrainDocuments();
    setDocumentsData(documents.data);

    if (preferredSessionId) {
      setSelectedDocumentId(preferredSessionId);
    }
  }

  async function refreshDocumentsAfterSeedFailure(): Promise<void> {
    try {
      await refreshDocuments(null);
    } catch {
      // Keep the seed error visible when the fallback document refresh also fails.
    }
  }

  async function refreshRecents(): Promise<void> {
    try {
      const payload = await fetchBrainRecents();
      setRecents(payload.data.recents);
    } catch {
      setRecents([]);
    }
  }

  return (
    <div className="min-h-screen bg-white text-[#111]">
      <div className="mx-auto min-h-[calc(100vh-5px)] max-w-[1440px] border-t-[5px] border-black bg-white">
        {landingVisible ? (
          <LandingPage
            disabled={isThinking}
            status={status}
            onSeed={handleLandingSeed}
            onModeSelect={handleLandingModeSelect}
            onPromptSubmit={handleLandingPromptSubmit}
            onQuickNote={handleLandingQuickNote}
          />
        ) : (
          <>
            <Header
              sessionLabel={sessionLabel}
              thinkingLabel={isThinking ? "Thinking" : status}
              activeItem={activeMode}
              onNavItemSelect={(item) => setActiveMode(item as PennyMode)}
              onLogoSelect={handleNewThought}
            />
            {activeMode === "Learn" ? (
          <LearnWorkspace
            documentsData={documentsData}
            selectedDocument={selectedDocument}
            data={data}
            autopilot={autopilot}
            recents={recents}
            focusedClaimId={focusedClaimId}
            focusNode={learnFocusNode}
            relatedBrainSearch={relatedBrainSearch}
            status={status}
            isThinking={isThinking}
            onSeed={handleSeed}
            onKeepRecent={handleKeepRecentIdea}
            onSelectDocument={handleSelectDocument}
            onOpenBrain={() => setActiveMode("Brain")}
            onOpenCanvas={handleOpenCanvas}
            onOpenCheck={() => setActiveMode("Check")}
            onOpenVerify={() => setActiveMode("Check")}
            onSearchBrainRelated={handleBrainRelatedSearch}
            onVerifyChanged={handleVerifyChanged}
          />
        ) : activeMode === "Brain" ? (
          <BrainWorkspace
            documentsData={documentsData}
            selectedDocument={selectedDocument}
            data={data}
            moves={moves}
            autopilot={autopilot}
            latestArtifact={latestArtifact ?? null}
            focusedClaimId={focusedClaimId}
            canvasOpen={brainCanvasOpen}
            status={status}
            isThinking={isThinking}
            recents={recents}
            onSelectDocument={handleSelectDocument}
            onBackToLibrary={handleBackToLibrary}
            onNewThought={handleNewThought}
            onSeed={handleSeed}
            onClaimSelect={handleManualClaimSelect}
            onReworkDocument={handleReworkDocument}
            onCanvasOpenChange={setBrainCanvasOpen}
            onCanvasNodeAction={handleCanvasNodeAction}
          />
        ) : activeMode === "Check" ? (
          <CheckWorkspace
            documentsData={documentsData}
            data={data}
            autopilot={autopilot}
            challengeResponse={challengeResponse}
            latestArtifact={latestArtifact ?? null}
            focusedClaimId={focusedClaimId}
            focusedWorkStructureStepId={focusedWorkStructureStepId}
            status={status}
            isThinking={isThinking}
            onSeed={handleSeed}
            onSelectDocument={handleSelectDocument}
            onGoThere={handleGoThere}
            onOpenLearn={() => setActiveMode("Learn")}
            onOpenBrain={() => setActiveMode("Brain")}
            onOpenVerify={() => setActiveMode("Check")}
            onVerifyChanged={handleVerifyChanged}
            onClaimSelect={handleManualClaimSelect}
            onWorkStructureSelect={handleWorkStructureSelect}
            onIssueChallenge={handleIssueChallenge}
            onRespondChallenge={handleChallengeResponse}
            onCreateChallengeBrief={handleCreateChallengeBrief}
          />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function mergeCockpitData(cockpit: SessionCockpitData, current: BrainData | null): BrainData {
  const keyInsight = cockpit.ideaMap.keyInsight ?? current?.ideaMap?.keyInsight ?? null;
  const fallbackChallenge = current?.firstChallenge && !current.firstChallenge.id ? current.firstChallenge : null;
  const firstChallenge = cockpit.activeChallenge ?? fallbackChallenge;
  const workStructure = cockpit.workStructure ?? current?.workStructure ?? null;

  return {
    ...(current?.source ? { source: current.source } : {}),
    ...(current?.brainRun ? { brainRun: current.brainRun } : {}),
    session: cockpit.session,
    ...(workStructure ? { workStructure } : {}),
    ideaMap: {
      claims: cockpit.ideaMap.claims,
      edges: cockpit.ideaMap.edges,
      ...(typeof keyInsight === "string" && keyInsight ? { keyInsight } : {}),
    },
    graphPath: cockpit.graphPath,
    explorationPaths: current?.explorationPaths ?? [],
    learnCandidates: current?.learnCandidates ?? [],
    ...(firstChallenge ? { firstChallenge } : {}),
  };
}

function mergeRecentIdeas(recent: BrainRecentIdea, existing: BrainRecentIdea[]): BrainRecentIdea[] {
  return [recent, ...existing.filter((item) => item.id !== recent.id)].slice(0, 8);
}

function responseLabel(response: ChallengeResponseKind): string {
  return response.charAt(0).toUpperCase() + response.slice(1);
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function claimIdFromCanvasNode(node: CanvasNode): string | null {
  if (node.refs?.claimId) {
    return node.refs.claimId;
  }

  return node.id.startsWith("claim:") ? node.id.slice("claim:".length) : null;
}

function activeSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const urlSessionId = new URLSearchParams(window.location.search).get(SESSION_QUERY_PARAM);

  if (urlSessionId) {
    return urlSessionId;
  }

  return window.localStorage.getItem(ACTIVE_SESSION_KEY);
}

function rememberActiveSession(sessionId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);

  const url = new URL(window.location.href);
  url.searchParams.set(SESSION_QUERY_PARAM, sessionId);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function forgetActiveSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACTIVE_SESSION_KEY);

  const url = new URL(window.location.href);
  url.searchParams.delete(SESSION_QUERY_PARAM);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
