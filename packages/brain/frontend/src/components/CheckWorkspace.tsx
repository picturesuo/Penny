import { useMemo } from "react";
import type {
  AutopilotTickData,
  BrainData,
  BrainMove,
  ChallengeResponseKind,
  RespondToChallengeResponse,
  SessionCockpitData,
  WorkStructureStep,
} from "../types/brain";
import { Composer } from "./Composer";
import { CurrentExploration } from "./CurrentExploration";
import { InsightRail } from "./InsightRail";
import { LeftRail } from "./LeftRail";

interface CheckWorkspaceProps {
  data: BrainData | null;
  moves: BrainMove[];
  autopilot: AutopilotTickData | null;
  challengeResponse: RespondToChallengeResponse["data"] | null;
  latestArtifact: SessionCockpitData["latestArtifact"] | null;
  focusedClaimId: string | null;
  focusedWorkStructureStepId: string | null;
  status: string;
  isThinking: boolean;
  onSeed: (rawIdea: string) => Promise<void>;
  onGoThere: () => Promise<void>;
  onClaimSelect: (claimId: string) => void;
  onWorkStructureSelect: (step: WorkStructureStep) => void;
  onIssueChallenge: () => Promise<void>;
  onRespondChallenge: (
    challengeId: string,
    draft:
      | { response: "defend"; reasoning: string }
      | { response: "revise"; revisedText: string; reasoning?: string }
      | { response: "absorb"; reasoning?: string },
  ) => Promise<void>;
  onCreateChallengeBrief: () => Promise<void>;
}

export function CheckWorkspace({
  data,
  moves,
  autopilot,
  challengeResponse,
  latestArtifact,
  focusedClaimId,
  focusedWorkStructureStepId,
  status,
  isThinking,
  onSeed,
  onGoThere,
  onClaimSelect,
  onWorkStructureSelect,
  onIssueChallenge,
  onRespondChallenge,
  onCreateChallengeBrief,
}: CheckWorkspaceProps) {
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

  return (
    <main className="cockpit-grid">
      <LeftRail
        claims={claims}
        workStructure={workStructure}
        savedPaths={(data?.explorationPaths ?? []).map((path) => path.title)}
        focusedClaimId={focusedClaimId}
        focusedWorkStructureStepId={focusedWorkStructureStepId}
        suggestedClaimId={suggestedClaimId}
        onClaimSelect={onClaimSelect}
        onWorkStructureSelect={onWorkStructureSelect}
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
          onGoThere={onGoThere}
        />
        <Composer disabled={isThinking} status={status} onSubmit={onSeed} />
      </div>
      <InsightRail
        challenge={data?.firstChallenge}
        autopilotSuggestion={autopilot?.suggestion ?? null}
        claims={claims}
        learnCandidates={data?.learnCandidates ?? []}
        moves={moves}
        latestArtifact={latestArtifact}
        challengeResponse={challengeResponse}
        disabled={isThinking}
        onIssueChallenge={onIssueChallenge}
        onRespondChallenge={onRespondChallenge}
        onCreateChallengeBrief={onCreateChallengeBrief}
      />
    </main>
  );
}
