import { useMemo, useState } from "react";
import { fetchSessionMoves, seedBrain, selectAutopilotNode, tickAutopilot } from "./api/brainClient";
import { Composer } from "./components/Composer";
import { CurrentExploration } from "./components/CurrentExploration";
import { Header } from "./components/Header";
import { InsightRail } from "./components/InsightRail";
import { LeftRail } from "./components/LeftRail";
import { formatLabel, shortId } from "./lib/format";
import type { AutopilotTickData, BrainData, BrainMove } from "./types/brain";

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
        const autopilotPayload = await tickAutopilot(payload.data.session.id);
        setAutopilot(autopilotPayload.data);
        setFocusedClaimId(
          autopilotPayload.data.suggestion?.targetClaimId ??
            payload.data.firstChallenge?.targetClaimId ??
            payload.data.ideaMap?.claims?.[0]?.id ??
            null,
        );
        const movePayload = await fetchSessionMoves(payload.data.session.id);
        setMoves(movePayload.data.moves);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsThinking(false);
    }
  }

  function handleGoThere() {
    const targetClaimId = autopilot?.suggestion?.goThere?.targetClaimId ?? autopilot?.suggestion?.targetClaimId ?? null;

    if (targetClaimId) {
      setFocusedClaimId(targetClaimId);
      setStatus("Autopilot focus selected");
      return;
    }

    setStatus("Autopilot has no claim target");
  }

  async function handleManualClaimSelect(claimId: string) {
    setFocusedClaimId(claimId);

    if (!data?.session?.id) {
      return;
    }

    try {
      const selection = await selectAutopilotNode({
        sessionId: data.session.id,
        claimId,
        previousSuggestionMoveId: autopilot?.move?.id ?? null,
      });
      setAutopilot({
        status: selection.data.status,
        sessionId: selection.data.sessionId,
        suggestion: null,
        candidates: [],
        move: selection.data.move,
        pause: selection.data.pause,
      });
      setStatus("Manual selection saved");

      const movePayload = await fetchSessionMoves(data.session.id);
      setMoves(movePayload.data.moves);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
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
