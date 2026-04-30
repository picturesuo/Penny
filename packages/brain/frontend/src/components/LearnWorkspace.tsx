import { useMemo, useState } from "react";
import type {
  AutopilotSuggestion,
  AutopilotTickData,
  BrainClaim,
  BrainData,
  BrainDocumentSummary,
  BrainDocumentsData,
  BrainRecentIdea,
  LearnSessionOutput,
} from "../types/brain";
import { formatLabel, shortId } from "../lib/format";
import { truncateWords } from "../lib/text";

interface LearnWorkspaceProps {
  documentsData: BrainDocumentsData | null;
  selectedDocument: BrainDocumentSummary | null;
  data: BrainData | null;
  autopilot: AutopilotTickData | null;
  recents: BrainRecentIdea[];
  status: string;
  isThinking: boolean;
  onSeed: (rawIdea: string) => Promise<void>;
  onKeepRecent: (rawIdea: string) => Promise<void>;
  onSelectDocument: (sessionId: string) => void;
  onOpenBrain: () => void;
  onOpenCheck: () => void;
  onOpenVerify: () => void;
}

export function LearnWorkspace({
  documentsData,
  selectedDocument,
  data,
  autopilot,
  recents,
  status,
  isThinking,
  onSeed,
  onKeepRecent,
  onSelectDocument,
  onOpenBrain,
  onOpenCheck,
  onOpenVerify,
}: LearnWorkspaceProps) {
  const output = useMemo(() => buildLearnSessionOutput(data, selectedDocument, autopilot), [
    data,
    selectedDocument,
    autopilot,
  ]);
  const recentDocuments = documentsData?.documents.slice(0, 4) ?? [];
  const currentSessionId = data?.session?.id ?? selectedDocument?.sessionId ?? null;

  return (
    <main className="learn-workspace" aria-label="Learn">
      <section className="learn-main">
        {output ? (
          <LearnSessionView
            output={output}
            currentSessionId={currentSessionId}
            disabled={isThinking}
            onOpenBrain={onOpenBrain}
            onOpenCheck={onOpenCheck}
            onOpenVerify={onOpenVerify}
            onSaveToBrain={onSeed}
            onKeepRecent={onKeepRecent}
          />
        ) : (
          <section className="learn-entry" aria-label="Drop an idea">
            <span className="section-label">LEARN</span>
            <h1>Drop an idea</h1>
            <LearnIdeaDrop
              disabled={isThinking}
              status={status}
              recents={recents}
              onSave={onSeed}
              onKeep={onKeepRecent}
            />
          </section>
        )}
      </section>

      <aside className="learn-sidebar" aria-label="Learn sidebar">
        <LearnRecents recents={recents} disabled={isThinking} onSeed={onSeed} onKeep={onKeepRecent} />
        <LearnRecentDocuments documents={recentDocuments} onSelectDocument={onSelectDocument} onOpenBrain={onOpenBrain} />
      </aside>
    </main>
  );
}

function LearnSessionView({
  output,
  currentSessionId,
  disabled,
  onOpenBrain,
  onOpenCheck,
  onOpenVerify,
  onSaveToBrain,
  onKeepRecent,
}: {
  output: LearnSessionOutput;
  currentSessionId: string | null;
  disabled: boolean;
  onOpenBrain: () => void;
  onOpenCheck: () => void;
  onOpenVerify: () => void;
  onSaveToBrain: (rawIdea: string) => Promise<void>;
  onKeepRecent: (rawIdea: string) => Promise<void>;
}) {
  const isSavedToBrain = Boolean(currentSessionId);
  const hasCoreIdea = Boolean(output.coreIdea.trim());

  return (
    <section className="learn-session-output" aria-label="Learn session output">
      <div className="learn-emotional-moment">
        <span className="section-label">LEARN</span>
        <h1>Penny found structure in your idea</h1>
        <p>{truncateWords(output.coreIdea, 28)}</p>
      </div>

      <div className="learn-output-actions" aria-label="Learn next actions">
        <button type="button" className="primary-command" disabled={disabled} onClick={onOpenCheck}>
          Check
        </button>
        <button type="button" className="text-command" disabled={disabled} onClick={onOpenVerify}>
          Verify
        </button>
        <button
          type="button"
          className="text-command"
          disabled={disabled || !hasCoreIdea || isSavedToBrain}
          title={isSavedToBrain ? "This idea is already saved in Brain." : undefined}
          onClick={() => {
            void onSaveToBrain(output.coreIdea);
          }}
        >
          Save to Brain
        </button>
        <button
          type="button"
          className="text-command"
          disabled={disabled || !hasCoreIdea}
          onClick={() => {
            void onKeepRecent(output.coreIdea);
          }}
        >
          Keep in Recents
        </button>
      </div>

      <div className="learn-output-grid">
        <article className="learn-output-card learn-core-idea">
          <span>Core idea</span>
          <p>{output.coreIdea}</p>
          {currentSessionId ? (
            <button type="button" className="text-command" onClick={onOpenBrain}>
              Open Brain doc {shortId(currentSessionId)}
            </button>
          ) : null}
        </article>

        <LearnClaimList title="Structured claims" claims={output.claims} emptyText="No claims have been shaped yet." />
        <LearnClaimList
          title="Assumptions"
          claims={output.assumptions}
          emptyText="No explicit assumptions were returned in this graph slice."
        />
        <LearnClaimList
          title="Questions"
          claims={output.questions}
          emptyText="No open questions were returned in this graph slice."
        />
        <CreativePotential items={output.creativePotential} />
        <AutopilotNextMove suggestion={output.autopilotNextMove} claims={output.claims} />
      </div>
    </section>
  );
}

function LearnIdeaDrop({
  disabled,
  status,
  recents,
  onSave,
  onKeep,
}: {
  disabled: boolean;
  status: string;
  recents: BrainRecentIdea[];
  onSave: (rawIdea: string) => Promise<void>;
  onKeep: (rawIdea: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const trimmedDraft = draft.trim();

  async function handleSave() {
    if (!trimmedDraft) {
      return;
    }

    await onSave(trimmedDraft);
    setDraft("");
  }

  async function handleKeep() {
    if (!trimmedDraft) {
      return;
    }

    await onKeep(trimmedDraft);
    setDraft("");
  }

  return (
    <section className="idea-drop" aria-label="Drop an idea entry">
      <label htmlFor="learnIdeaDrop">Idea</label>
      <textarea
        id="learnIdeaDrop"
        value={draft}
        disabled={disabled}
        placeholder="Write the raw thought Penny should preserve or revisit..."
        aria-describedby="learnIdeaDropStatus"
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="idea-drop-actions">
        <button type="button" className="primary-command" disabled={disabled || !trimmedDraft} onClick={handleSave}>
          Save to Brain
        </button>
        <button type="button" className="text-command" disabled={disabled || !trimmedDraft} onClick={handleKeep}>
          Keep in Recents
        </button>
        <button type="button" className="text-command" disabled={disabled || !draft} onClick={() => setDraft("")}>
          Discard
        </button>
      </div>
      <p id="learnIdeaDropStatus" className="sr-only">
        {status}
      </p>
      {recents.length > 0 ? (
        <div className="recents-pile" aria-label="Recents pile">
          <strong>Recents pile</strong>
          <div>
            {recents.slice(0, 4).map((recent) => (
              <button key={recent.id} type="button" disabled={disabled} onClick={() => setDraft(recent.rawIdea)}>
                {recent.rawIdea}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LearnClaimList({
  title,
  claims,
  emptyText,
}: {
  title: string;
  claims: BrainClaim[];
  emptyText: string;
}) {
  return (
    <article className="learn-output-card">
      <span>{title}</span>
      {claims.length > 0 ? (
        <ul className="learn-claim-list">
          {claims.slice(0, 5).map((claim) => (
            <li key={claim.id}>
              <strong>{formatLabel(claim.kind)}</strong>
              <p>{claim.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="learn-empty-note">{emptyText}</p>
      )}
    </article>
  );
}

function CreativePotential({ items }: { items: string[] }) {
  return (
    <article className="learn-output-card">
      <span>Creative potential</span>
      <ul className="learn-plain-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function AutopilotNextMove({
  suggestion,
  claims,
}: {
  suggestion: AutopilotSuggestion | null;
  claims: BrainClaim[];
}) {
  const targetClaim = suggestion?.targetClaimId ? claims.find((claim) => claim.id === suggestion.targetClaimId) : null;

  return (
    <article className="learn-output-card learn-next-move">
      <span>Autopilot next move</span>
      {suggestion ? (
        <>
          <strong>{suggestion.primaryActionLabel}</strong>
          <p>{suggestion.why}</p>
          {targetClaim ? <small>Target: {truncateWords(targetClaim.text, 18)}</small> : null}
          <small>{suggestion.exitCriteria.label}</small>
        </>
      ) : (
        <>
          <strong>Open Check</strong>
          <p>Autopilot will choose the next weak spot after this idea has a saved graph slice.</p>
        </>
      )}
    </article>
  );
}

function LearnRecents({
  recents,
  disabled,
  onSeed,
  onKeep,
}: {
  recents: BrainRecentIdea[];
  disabled: boolean;
  onSeed: (rawIdea: string) => Promise<void>;
  onKeep: (rawIdea: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const trimmedDraft = draft.trim();

  return (
    <section className="learn-side-panel" aria-label="Keep in Recents">
      <span>Recents</span>
      <textarea
        value={draft}
        disabled={disabled}
        placeholder="Park an idea without building it yet..."
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="learn-side-actions">
        <button
          type="button"
          className="text-command"
          disabled={disabled || !trimmedDraft}
          onClick={() => {
            void onKeep(trimmedDraft).then(() => setDraft(""));
          }}
        >
          Keep
        </button>
        <button
          type="button"
          className="text-command"
          disabled={disabled || !trimmedDraft}
          onClick={() => setDraft("")}
        >
          Discard
        </button>
      </div>
      {recents.length > 0 ? (
        <div className="learn-recents-list">
          {recents.slice(0, 5).map((recent) => (
            <button
              key={recent.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                void onSeed(recent.rawIdea);
              }}
            >
              <strong>{truncateWords(recent.rawIdea, 10)}</strong>
              <small>Save to Brain</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="learn-empty-note">Nothing parked yet.</p>
      )}
    </section>
  );
}

function LearnRecentDocuments({
  documents,
  onSelectDocument,
  onOpenBrain,
}: {
  documents: BrainDocumentSummary[];
  onSelectDocument: (sessionId: string) => void;
  onOpenBrain: () => void;
}) {
  return (
    <section className="learn-side-panel" aria-label="Recent Brain documents">
      <div className="learn-side-head">
        <span>Brain</span>
        <button type="button" className="text-command" onClick={onOpenBrain}>
          Open
        </button>
      </div>
      {documents.length > 0 ? (
        <div className="learn-document-list">
          {documents.map((document) => (
            <button key={document.id} type="button" onClick={() => onSelectDocument(document.sessionId)}>
              <strong>{truncateWords(document.title, 9)}</strong>
              <small>
                {document.counts.claims} claims / {formatLabel(document.status)} / {shortId(document.sessionId)}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <p className="learn-empty-note">Brain docs will appear here after the first saved idea.</p>
      )}
    </section>
  );
}

function buildLearnSessionOutput(
  data: BrainData | null,
  selectedDocument: BrainDocumentSummary | null,
  autopilot: AutopilotTickData | null,
): LearnSessionOutput | null {
  if (!data && !selectedDocument) {
    return null;
  }

  const graphClaims = data?.ideaMap?.claims ?? [];
  const claims: BrainClaim[] =
    graphClaims.length > 0 ? graphClaims : selectedDocument?.mainClaim ? [selectedDocument.mainClaim] : [];
  const assumptions = claims.filter((claim) => isKind(claim, "assumption"));
  const questions = claims.filter((claim) => isKind(claim, "question"));
  const structuredClaims = claims.filter((claim) => !isKind(claim, "assumption") && !isKind(claim, "question"));
  const coreIdea = firstText(
    data?.source?.rawText,
    selectedDocument?.originalIdea,
    claims.find((claim) => claim.seedId === "claim.seed")?.text,
    selectedDocument?.mainClaim?.text,
    claims[0]?.text,
  );

  return {
    coreIdea,
    claims: structuredClaims,
    assumptions,
    questions,
    creativePotential: creativePotentialFrom(data, selectedDocument),
    autopilotNextMove: autopilot?.suggestion ?? autopilot?.selectedCandidate ?? null,
  };
}

function creativePotentialFrom(data: BrainData | null, selectedDocument: BrainDocumentSummary | null): string[] {
  const exploration = (data?.explorationPaths ?? []).map((path) =>
    firstText([path.title, path.expectedValue].filter(Boolean).join(": "), path.title),
  );
  const concepts = (data?.learnCandidates ?? []).map((candidate) =>
    `${candidate.term}: ${candidate.whyItMatters || candidate.unblockExplanation}`,
  );
  const documentActions = selectedDocument?.nextActions ?? [];
  const keyInsight = data?.ideaMap?.keyInsight ? [`Key insight: ${data.ideaMap.keyInsight}`] : [];
  const uniqueItems = uniqueNonEmpty([...exploration, ...concepts, ...documentActions, ...keyInsight]);

  return uniqueItems.length > 0 ? uniqueItems.slice(0, 4) : ["Use Check to test the first weak spot before expanding."];
}

function isKind(claim: BrainClaim, expected: string): boolean {
  return claim.kind.toLowerCase().includes(expected);
}

function firstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();

    if (trimmed) {
      return trimmed;
    }
  }

  return "Untitled idea";
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();

    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    output.push(trimmed);
  }

  return output;
}
