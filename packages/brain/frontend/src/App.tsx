import { useEffect, useState } from "react";
import {
  createChallengeBrief,
  fetchBrainDocuments,
  fetchSessionCockpit,
  issueChallengeFromCandidate,
  respondToChallenge,
  seedBrain,
  selectAutopilotNode,
  startAutopilotCandidate,
  tickAutopilot,
} from "./api/brainClient";
import { BrainWorkspace } from "./components/BrainWorkspace";
import { CheckWorkspace } from "./components/CheckWorkspace";
import { Composer } from "./components/Composer";
import { Header } from "./components/Header";
import { formatLabel, shortId } from "./lib/format";
import type {
  AutopilotTickData,
  BrainData,
  BrainDocumentsData,
  BrainMove,
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

const ACTIVE_SESSION_KEY = "penny.activeSessionId";
const SESSION_QUERY_PARAM = "sessionId";
type PennyMode = "Learn" | "Brain" | "Check";

export function App() {
  const [documentsData, setDocumentsData] = useState<BrainDocumentsData | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [data, setData] = useState<BrainData | null>(null);
  const [moves, setMoves] = useState<BrainMove[]>([]);
  const [autopilot, setAutopilot] = useState<AutopilotTickData | null>(null);
  const [challengeResponse, setChallengeResponse] = useState<RespondToChallengeResponse["data"] | null>(null);
  const [latestArtifact, setLatestArtifact] = useState<SessionCockpitData["latestArtifact"]>(null);
  const [focusedClaimId, setFocusedClaimId] = useState<string | null>(null);
  const [focusedWorkStructureStepId, setFocusedWorkStructureStepId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<PennyMode>("Learn");
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

        if (!sessionId) {
          setStatus("Docs loaded");
          return;
        }

        await loadSession(sessionId, null);
      } catch (error) {
        if (!cancelled) {
          forgetActiveSession();
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

  async function handleSelectDocument(sessionId: string) {
    setIsThinking(true);
    setStatus("Opening doc");

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
    forgetActiveSession();
    setStatus("Ready");
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

  async function handleGoThere() {
    if (!data?.session?.id) {
      setStatus("Autopilot needs a session first");
      return;
    }

    const candidateId = autopilot?.suggestion?.candidateId ?? autopilot?.selectedCandidate?.candidateId ?? null;
    const targetClaimId = autopilot?.suggestion?.targetClaimId ?? null;

    if (!candidateId) {
      setStatus("Autopilot has no candidate to start");
      return;
    }

    setIsThinking(true);
    setStatus("Starting Autopilot focus");

    try {
      await startAutopilotCandidate(data.session.id, candidateId);
      const cockpit = await refreshCockpit(data.session.id);
      setFocusedClaimId(cockpit.autopilot.focusState?.focusedClaimId ?? targetClaimId);
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

  return (
    <div className="min-h-screen bg-white text-[#111]">
      <div className="mx-auto min-h-[calc(100vh-5px)] max-w-[1440px] border-t-[5px] border-black bg-white">
        <Header
          sessionLabel={sessionLabel}
          thinkingLabel={isThinking ? "Thinking" : status}
          activeItem={activeMode}
          onNavItemSelect={(item) => setActiveMode(item as PennyMode)}
        />
        {activeMode === "Learn" ? (
          <LearnWorkspace
            documentsData={documentsData}
            selectedDocument={selectedDocument}
            data={data}
            autopilot={autopilot}
            status={status}
            isThinking={isThinking}
            onSeed={handleSeed}
            onSelectDocument={handleSelectDocument}
            onOpenBrain={() => setActiveMode("Brain")}
            onOpenCheck={() => setActiveMode("Check")}
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
            status={status}
            isThinking={isThinking}
            onSelectDocument={handleSelectDocument}
            onBackToLibrary={handleBackToLibrary}
            onNewThought={handleNewThought}
            onSeed={handleSeed}
            onClaimSelect={handleManualClaimSelect}
            onReworkDocument={handleReworkDocument}
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
            onClaimSelect={handleManualClaimSelect}
            onWorkStructureSelect={handleWorkStructureSelect}
            onIssueChallenge={handleIssueChallenge}
            onRespondChallenge={handleChallengeResponse}
            onCreateChallengeBrief={handleCreateChallengeBrief}
          />
        ) : null}
      </div>
    </div>
  );
}

function LearnWorkspace({
  documentsData,
  selectedDocument,
  data,
  autopilot,
  status,
  isThinking,
  onSeed,
  onSelectDocument,
  onOpenBrain,
  onOpenCheck,
}: {
  documentsData: BrainDocumentsData | null;
  selectedDocument: BrainDocumentsData["documents"][number] | null;
  data: BrainData | null;
  autopilot: AutopilotTickData | null;
  status: string;
  isThinking: boolean;
  onSeed: (rawIdea: string) => Promise<void>;
  onSelectDocument: (sessionId: string) => void;
  onOpenBrain: () => void;
  onOpenCheck: () => void;
}) {
  const recentDocuments = documentsData?.documents.slice(0, 3) ?? [];
  const activeClaim = data?.ideaMap?.claims?.[0]?.text ?? selectedDocument?.mainClaim?.text ?? null;
  const suggestedNextStep = autopilot?.suggestion ?? null;

  return (
    <main className="mode-placeholder" aria-label="Learn">
      <section>
        <span className="section-label">LEARN</span>
        <h1>Drop an idea</h1>
        <p>
          Start with one raw thought. Penny will turn it into saved Brain structure, then Autopilot can point Check at the
          next weak spot.
        </p>
        <Composer disabled={isThinking} status={status} onSubmit={onSeed} storageKey="penny.learnIdeaDraft" />
        {activeClaim ? (
          <div className="challenge-action-row">
            <span>
              <strong>Saved to Brain</strong>
              {activeClaim}
            </span>
            <button type="button" onClick={onOpenBrain}>
              Open Brain
            </button>
          </div>
        ) : null}
        {suggestedNextStep ? (
          <div className="challenge-action-row">
            <span>
              <strong>{suggestedNextStep.primaryActionLabel}</strong>
              {suggestedNextStep.why}
            </span>
            <button type="button" onClick={onOpenCheck}>
              Open Check
            </button>
          </div>
        ) : null}
        {recentDocuments.length > 0 ? (
          <div className="document-log-table" aria-label="Recent Brain documents">
            {recentDocuments.map((document) => (
              <button
                key={document.id}
                type="button"
                className="document-log-row"
                onClick={() => onSelectDocument(document.sessionId)}
              >
                <span className="doc-kind">Brain</span>
                <span>
                  <strong>{document.title}</strong>
                  <small>{document.mainClaim?.text ?? document.originalIdea ?? "No main claim yet"}</small>
                </span>
                <span className="doc-log-meta">
                  <strong>{document.counts.claims} claims</strong>
                  <small>{formatLabel(document.status)}</small>
                </span>
                <time>{shortId(document.sessionId)}</time>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </main>
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

function responseLabel(response: ChallengeResponseKind): string {
  return response.charAt(0).toUpperCase() + response.slice(1);
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
