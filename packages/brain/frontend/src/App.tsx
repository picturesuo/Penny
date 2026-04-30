import { useEffect, useMemo, useState } from "react";
import {
  createChallengeBrief,
  fetchSessionCockpit,
  issueChallengeFromCandidate,
  respondToChallenge,
  seedBrain,
  selectAutopilotNode,
  startAutopilotCandidate,
  tickAutopilot,
} from "./api/brainClient";
import { Composer } from "./components/Composer";
import { CurrentExploration } from "./components/CurrentExploration";
import { Header } from "./components/Header";
import { InsightRail } from "./components/InsightRail";
import { LeftRail } from "./components/LeftRail";
import { formatLabel, shortId } from "./lib/format";
import type {
  AutopilotTickData,
  BrainData,
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

export function App() {
  const [data, setData] = useState<BrainData | null>(null);
  const [moves, setMoves] = useState<BrainMove[]>([]);
  const [autopilot, setAutopilot] = useState<AutopilotTickData | null>(null);
  const [challengeResponse, setChallengeResponse] = useState<RespondToChallengeResponse["data"] | null>(null);
  const [latestArtifact, setLatestArtifact] = useState<SessionCockpitData["latestArtifact"]>(null);
  const [focusedClaimId, setFocusedClaimId] = useState<string | null>(null);
  const [focusedWorkStructureStepId, setFocusedWorkStructureStepId] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [isThinking, setIsThinking] = useState(false);

  const claims = useMemo(() => data?.ideaMap?.claims ?? [], [data]);
  const workStructure = data?.workStructure ?? null;
  const activeWorkStructureStep =
    workStructure?.steps.find((step) => step.id === focusedWorkStructureStepId) ??
    workStructure?.steps.find((step) => step.id === workStructure.activeStepId) ??
    null;
  const seedClaim = claims.find((claim) => claim.seedId === "claim.seed") ?? claims[0];
  const suggestedClaimId = autopilot?.suggestion?.targetClaimId ?? null;
  const focusedClaim =
    claims.find((claim) => claim.id === focusedClaimId) ??
    claims.find((claim) => claim.id === suggestedClaimId) ??
    seedClaim ??
    null;
  const currentTitle = seedClaim?.text ?? "problem folder";
  const currentSubtitle = data?.ideaMap?.keyInsight ?? data?.source?.rawText ?? "Idea";
  const sessionLabel = data?.session
    ? `Session ${shortId(data.session.id)} ${formatLabel(data.session.status)}`
    : "No session";

  useEffect(() => {
    const sessionId = activeSessionId();

    if (!sessionId) {
      return;
    }

    const restoreSessionId = sessionId;
    let cancelled = false;

    async function restoreSession() {
      setIsThinking(true);
      setStatus("Restoring session");

      try {
        const cockpit = await fetchSessionCockpit(restoreSessionId);

        if (cancelled) {
          return;
        }

        const cockpitData = cockpit.data;
        setData(mergeCockpitData(cockpitData, null));
        setAutopilot(cockpitData.autopilot);
        setMoves(cockpitData.moves);
        setLatestArtifact(cockpitData.latestArtifact ?? null);
        setFocusedWorkStructureStepId(cockpitData.workStructure?.activeStepId ?? null);
        setFocusedClaimId(
          cockpitData.autopilot.focusState?.focusedClaimId ??
            cockpitData.autopilot.suggestion?.targetClaimId ??
            cockpitData.ideaMap.claims[0]?.id ??
            null,
        );
        rememberActiveSession(cockpitData.session.id);
        setStatus("Cockpit refreshed");
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

    void restoreSession();

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
        rememberActiveSession(payload.data.session.id);
        await tickAutopilot(payload.data.session.id);
        const cockpit = await refreshCockpit(payload.data.session.id, payload.data);
        setFocusedClaimId(
          cockpit.autopilot.focusState?.focusedClaimId ??
            cockpit.autopilot.suggestion?.targetClaimId ??
            payload.data.firstChallenge?.targetClaimId ??
            payload.data.ideaMap?.claims?.[0]?.id ??
            null,
        );
        setStatus("Cockpit refreshed");
      }
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
      setStatus("Challenge needs a session first");
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
      setStatus("Challenge response needs a session first");
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
      setStatus("Challenge Brief needs a session first");
      return;
    }

    setIsThinking(true);
    setStatus("Creating Challenge Brief");

    try {
      const brief = await createChallengeBrief(data.session.id);
      setLatestArtifact(brief.data.artifact);
      await refreshCockpit(data.session.id);
      setStatus("Challenge Brief created");
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

  return (
    <div className="min-h-screen bg-white text-[#111]">
      <div className="mx-auto min-h-[calc(100vh-5px)] max-w-[1440px] border-t-[5px] border-black bg-white">
        <Header sessionLabel={sessionLabel} thinkingLabel={isThinking ? "Thinking" : status} />
        <main className="cockpit-grid">
          <LeftRail
            claims={claims}
            workStructure={workStructure}
            savedPaths={(data?.explorationPaths ?? []).map((path) => path.title)}
            focusedClaimId={focusedClaimId}
            focusedWorkStructureStepId={focusedWorkStructureStepId}
            suggestedClaimId={suggestedClaimId}
            onClaimSelect={handleManualClaimSelect}
            onWorkStructureSelect={handleWorkStructureSelect}
          />
          <div className="center-stage">
            <CurrentExploration
              title={currentTitle}
              subtitle={currentSubtitle}
              claims={claims}
              paths={data?.explorationPaths ?? []}
              autopilotSuggestion={autopilot?.suggestion ?? null}
              focusedClaim={focusedClaim}
              activeWorkStructureStep={activeWorkStructureStep}
              onGoThere={handleGoThere}
            />
            <Composer disabled={isThinking} status={status} onSubmit={handleSeed} />
          </div>
          <InsightRail
            challenge={data?.firstChallenge}
            autopilotSuggestion={autopilot?.suggestion ?? null}
            claims={claims}
            learnCandidates={data?.learnCandidates ?? []}
            moves={moves}
            latestArtifact={latestArtifact ?? null}
            challengeResponse={challengeResponse}
            disabled={isThinking}
            onIssueChallenge={handleIssueChallenge}
            onRespondChallenge={handleChallengeResponse}
            onCreateChallengeBrief={handleCreateChallengeBrief}
          />
        </main>
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
    explorationPaths: [],
    learnCandidates: [],
    ...(firstChallenge ? { firstChallenge } : {}),
  };
}

function responseLabel(response: ChallengeResponseKind): string {
  return response.charAt(0).toUpperCase() + response.slice(1);
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
}
