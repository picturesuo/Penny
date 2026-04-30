import { useMemo } from "react";
import type {
  AutopilotTickData,
  BrainData,
  BrainDocumentsData,
  BrainDocumentSummary,
  ChallengeResponseKind,
  RespondToChallengeResponse,
  SessionCockpitData,
  WorkStructureStep,
} from "../types/brain";
import { formatLabel, shortId } from "../lib/format";
import { truncateWords } from "../lib/text";
import { Composer } from "./Composer";
import { CurrentExploration } from "./CurrentExploration";
import { InsightRail } from "./InsightRail";
import { LeftRail } from "./LeftRail";

interface CheckWorkspaceProps {
  documentsData: BrainDocumentsData | null;
  data: BrainData | null;
  autopilot: AutopilotTickData | null;
  challengeResponse: RespondToChallengeResponse["data"] | null;
  latestArtifact: SessionCockpitData["latestArtifact"] | null;
  focusedClaimId: string | null;
  focusedWorkStructureStepId: string | null;
  status: string;
  isThinking: boolean;
  onSeed: (rawIdea: string) => Promise<void>;
  onSelectDocument: (sessionId: string) => void;
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
  documentsData,
  data,
  autopilot,
  challengeResponse,
  latestArtifact,
  focusedClaimId,
  focusedWorkStructureStepId,
  status,
  isThinking,
  onSeed,
  onSelectDocument,
  onGoThere,
  onClaimSelect,
  onWorkStructureSelect,
  onIssueChallenge,
  onRespondChallenge,
  onCreateChallengeBrief,
}: CheckWorkspaceProps) {
  const claims = useMemo(() => data?.ideaMap?.claims ?? [], [data]);
  const documents = documentsData?.documents ?? [];
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
  const hasGraphState = claims.length > 0;

  return (
    <main className="cockpit-grid">
      <LeftRail
        claims={claims}
        workStructure={workStructure}
        focusedClaimId={focusedClaimId}
        focusedWorkStructureStepId={focusedWorkStructureStepId}
        suggestedClaimId={suggestedClaimId}
        onClaimSelect={onClaimSelect}
        onWorkStructureSelect={onWorkStructureSelect}
      />
      <div className="center-stage">
        {hasGraphState ? (
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
        ) : (
          <CheckBrainMemory documents={documents} onSelectDocument={onSelectDocument} />
        )}
        <Composer disabled={isThinking} status={status} storageKey="penny.checkComposerDraft" onSubmit={onSeed} />
      </div>
      <InsightRail
        sessionId={data?.session?.id ?? null}
        challenge={data?.firstChallenge}
        autopilotSuggestion={autopilot?.suggestion ?? null}
        claims={claims}
        learnCandidates={data?.learnCandidates ?? []}
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

function CheckBrainMemory({
  documents,
  onSelectDocument,
}: {
  documents: BrainDocumentSummary[];
  onSelectDocument: (sessionId: string) => void;
}) {
  const recentDocuments = documents.slice(0, 6);

  return (
    <section className="check-brain-memory" aria-label="Saved Brain documents">
      <div className="check-brain-memory-head">
        <span>Brain</span>
        <h1>Saved ideas</h1>
      </div>
      <div className="check-brain-doc-list">
        {recentDocuments.length > 0 ? (
          recentDocuments.map((document) => (
            <CheckBrainDocumentRow key={document.id} document={document} onSelectDocument={onSelectDocument} />
          ))
        ) : (
          <article className="check-brain-empty">
            <strong>No saved ideas yet</strong>
            <span>Submit a thought to create the first Brain document.</span>
          </article>
        )}
      </div>
    </section>
  );
}

function CheckBrainDocumentRow({
  document,
  onSelectDocument,
}: {
  document: BrainDocumentSummary;
  onSelectDocument: (sessionId: string) => void;
}) {
  return (
    <button type="button" className="check-brain-doc-row" onClick={() => onSelectDocument(document.sessionId)}>
      <span className="check-brain-doc-kind">Doc {shortId(document.sessionId)}</span>
      <span>
        <strong title={document.title}>{truncateWords(document.title, 12)}</strong>
        <small title={document.mainClaim?.text ?? document.originalIdea ?? ""}>
          {truncateWords(document.mainClaim?.text ?? document.originalIdea ?? "No main claim yet", 16)}
        </small>
      </span>
      <span className="check-brain-doc-meta">
        <strong>{document.counts.claims} claims</strong>
        <small>{formatLabel(document.status)}</small>
      </span>
    </button>
  );
}
