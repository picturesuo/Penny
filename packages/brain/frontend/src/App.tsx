import { useMemo, useState } from "react";
import {
  fetchSessionCockpit,
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
import type { AutopilotTickData, BrainData, BrainMove, SessionCockpitData } from "./types/brain";

export function App() {
  const [data, setData] = useState<BrainData | null>(null);
  const [moves, setMoves] = useState<BrainMove[]>([]);
  const [autopilot, setAutopilot] = useState<AutopilotTickData | null>(null);
  const [focusedClaimId, setFocusedClaimId] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [isThinking, setIsThinking] = useState(false);

  const claims = useMemo(() => data?.ideaMap?.claims ?? [], [data]);
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

  async function handleSeed(rawIdea: string) {
    setIsThinking(true);
    setStatus("Thinking");

    try {
      const payload = await seedBrain(rawIdea);
      setData(payload.data);
      setFocusedClaimId(payload.data.firstChallenge?.targetClaimId ?? payload.data.ideaMap?.claims?.[0]?.id ?? null);
      setStatus("Graph slice persisted");

      if (payload.data.session?.id) {
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
    const targetClaimId = autopilot?.suggestion?.goThere?.targetClaimId ?? autopilot?.suggestion?.targetClaimId ?? null;

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

  async function handleManualClaimSelect(claimId: string) {
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

  async function refreshCockpit(sessionId: string, fallbackData: BrainData | null = data): Promise<SessionCockpitData> {
    const cockpit = await fetchSessionCockpit(sessionId);
    const cockpitData = cockpit.data;

    setData(mergeCockpitData(cockpitData, fallbackData));
    setAutopilot(cockpitData.autopilot);
    setMoves(cockpitData.moves);

    return cockpitData;
  }

  return (
    <div className="min-h-screen bg-white text-[#111]">
      <div className="mx-auto min-h-[calc(100vh-5px)] max-w-[1440px] border-t-[5px] border-black bg-white">
        <Header sessionLabel={sessionLabel} thinkingLabel={isThinking ? "Thinking" : status} />
        <main className="cockpit-grid">
          <LeftRail
            claims={claims}
            savedPaths={(data?.explorationPaths ?? []).map((path) => path.title)}
            focusedClaimId={focusedClaimId}
            suggestedClaimId={suggestedClaimId}
            onClaimSelect={handleManualClaimSelect}
          />
          <div className="center-stage">
            <CurrentExploration
              title={currentTitle}
              subtitle={currentSubtitle}
              claims={claims}
              paths={data?.explorationPaths ?? []}
              autopilotSuggestion={autopilot?.suggestion ?? null}
              focusedClaim={focusedClaim}
              onGoThere={handleGoThere}
            />
            <Composer disabled={isThinking} status={status} onSubmit={handleSeed} />
          </div>
          <InsightRail
            challenge={data?.firstChallenge}
            claims={claims}
            learnCandidates={data?.learnCandidates ?? []}
            moves={moves}
          />
        </main>
      </div>
    </div>
  );
}

function mergeCockpitData(cockpit: SessionCockpitData, current: BrainData | null): BrainData {
  const keyInsight = cockpit.ideaMap.keyInsight ?? current?.ideaMap?.keyInsight ?? null;
  const firstChallenge = cockpit.activeChallenge ?? current?.firstChallenge ?? null;

  return {
    ...(current ?? {}),
    session: cockpit.session,
    ideaMap: {
      ...(current?.ideaMap ?? {}),
      claims: cockpit.ideaMap.claims,
      edges: cockpit.ideaMap.edges,
      ...(typeof keyInsight === "string" && keyInsight ? { keyInsight } : {}),
    },
    ...(firstChallenge ? { firstChallenge } : {}),
  };
}
