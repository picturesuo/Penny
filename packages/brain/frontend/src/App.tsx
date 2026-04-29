import { useMemo, useState } from "react";
import { fetchSessionMoves, seedBrain } from "./api/brainClient";
import { Composer } from "./components/Composer";
import { CurrentExploration } from "./components/CurrentExploration";
import { Header } from "./components/Header";
import { InsightRail } from "./components/InsightRail";
import { LeftRail } from "./components/LeftRail";
import { formatLabel, shortId } from "./lib/format";
import type { BrainData, BrainMove } from "./types/brain";

export function App() {
  const [data, setData] = useState<BrainData | null>(null);
  const [moves, setMoves] = useState<BrainMove[]>([]);
  const [status, setStatus] = useState("Ready");
  const [isThinking, setIsThinking] = useState(false);

  const claims = useMemo(() => data?.ideaMap?.claims ?? [], [data]);
  const seedClaim = claims.find((claim) => claim.seedId === "claim.seed") ?? claims[0];
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
      setStatus("Graph slice persisted");

      if (payload.data.session?.id) {
        const movePayload = await fetchSessionMoves(payload.data.session.id);
        setMoves(movePayload.data.moves);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsThinking(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-[#111]">
      <div className="mx-auto min-h-[calc(100vh-5px)] max-w-[1440px] border-t-[5px] border-black bg-white">
        <Header sessionLabel={sessionLabel} thinkingLabel={isThinking ? "Thinking" : status} />
        <main className="cockpit-grid">
          <LeftRail claims={claims} savedPaths={(data?.explorationPaths ?? []).map((path) => path.title)} />
          <div className="center-stage">
            <CurrentExploration
              title={currentTitle}
              subtitle={currentSubtitle}
              claims={claims}
              paths={data?.explorationPaths ?? []}
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
