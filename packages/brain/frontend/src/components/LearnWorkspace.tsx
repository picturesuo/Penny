import { useEffect, useMemo, useState } from "react";
import type {
  AutopilotSuggestion,
  AutopilotTickData,
  BrainClaim,
  BrainData,
  BrainDocumentSummary,
  BrainDocumentsData,
  BrainHybridSearchResponse,
  BrainRecentIdea,
  CanvasNode,
  LearnSessionOutput,
} from "../types/brain";
import { formatLabel, shortId } from "../lib/format";
import { truncateWords } from "../lib/text";
import { VerifyPanel } from "./VerifyPanel";

interface LearnWorkspaceProps {
  documentsData: BrainDocumentsData | null;
  selectedDocument: BrainDocumentSummary | null;
  data: BrainData | null;
  autopilot: AutopilotTickData | null;
  recents: BrainRecentIdea[];
  focusedClaimId: string | null;
  focusNode: CanvasNode | null;
  relatedBrainSearch: BrainHybridSearchResponse["data"] | null;
  status: string;
  isThinking: boolean;
  onSeed: (rawIdea: string) => Promise<void>;
  onKeepRecent: (rawIdea: string) => Promise<void>;
  onSelectDocument: (sessionId: string) => void;
  onOpenBrain: () => void;
  onOpenCanvas: () => void;
  onOpenCheck: () => void;
  onOpenVerify: () => void;
  onSearchBrainRelated: (query: string, claimId?: string | null) => Promise<BrainHybridSearchResponse["data"]>;
  onVerifyChanged?: () => Promise<void>;
}

export function LearnWorkspace({
  documentsData,
  selectedDocument,
  data,
  autopilot,
  recents,
  focusedClaimId,
  focusNode,
  relatedBrainSearch,
  status,
  isThinking,
  onSeed,
  onKeepRecent,
  onSelectDocument,
  onOpenBrain,
  onOpenCanvas,
  onOpenCheck,
  onOpenVerify,
  onSearchBrainRelated,
  onVerifyChanged,
}: LearnWorkspaceProps) {
  const output = useMemo(() => buildLearnSessionOutput(data, selectedDocument, autopilot), [
    data,
    selectedDocument,
    autopilot,
  ]);
  const recentDocuments = documentsData?.documents.slice(0, 4) ?? [];
  const currentSessionId = data?.session?.id ?? selectedDocument?.sessionId ?? null;
  const [searchWebRequested, setSearchWebRequested] = useState(false);
  const sourceText = data?.source?.rawText ?? selectedDocument?.originalIdea ?? output?.coreIdea ?? "";

  async function handleSeedFromDrop(rawIdea: string, options: { searchWeb: boolean }) {
    setSearchWebRequested(options.searchWeb);
    await onSeed(rawIdea);
  }

  return (
    <main className="learn-workspace" aria-label="Learn">
      <section className="learn-main">
        {output ? (
          <LearnSessionView
            output={output}
            currentSessionId={currentSessionId}
            sourceText={sourceText}
            focusedClaimId={focusedClaimId}
            focusNode={focusNode}
            relatedBrainSearch={relatedBrainSearch}
            searchWebRequested={searchWebRequested}
            disabled={isThinking}
            onOpenBrain={onOpenBrain}
            onOpenCanvas={onOpenCanvas}
            onOpenCheck={onOpenCheck}
            onOpenVerify={onOpenVerify}
            onSearchBrainRelated={onSearchBrainRelated}
            onSaveToBrain={onSeed}
            onKeepRecent={onKeepRecent}
            {...(onVerifyChanged ? { onVerifyChanged } : {})}
          />
        ) : (
          <section className="learn-entry" aria-label="Drop an idea">
            <span className="section-label">LEARN</span>
            <h1>Drop an idea</h1>
            <LearnIdeaDrop
              disabled={isThinking}
              status={status}
              recents={recents}
              searchWeb={searchWebRequested}
              onSearchWebChange={setSearchWebRequested}
              onSave={handleSeedFromDrop}
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
  sourceText,
  focusedClaimId,
  focusNode,
  relatedBrainSearch,
  searchWebRequested,
  disabled,
  onOpenBrain,
  onOpenCanvas,
  onOpenCheck,
  onOpenVerify,
  onSearchBrainRelated,
  onSaveToBrain,
  onKeepRecent,
  onVerifyChanged,
}: {
  output: LearnSessionOutput;
  currentSessionId: string | null;
  sourceText: string;
  focusedClaimId: string | null;
  focusNode: CanvasNode | null;
  relatedBrainSearch: BrainHybridSearchResponse["data"] | null;
  searchWebRequested: boolean;
  disabled: boolean;
  onOpenBrain: () => void;
  onOpenCanvas: () => void;
  onOpenCheck: () => void;
  onOpenVerify: () => void;
  onSearchBrainRelated: (query: string, claimId?: string | null) => Promise<BrainHybridSearchResponse["data"]>;
  onSaveToBrain: (rawIdea: string) => Promise<void>;
  onKeepRecent: (rawIdea: string) => Promise<void>;
  onVerifyChanged?: () => Promise<void>;
}) {
  const isSavedToBrain = Boolean(currentSessionId);
  const hasCoreIdea = Boolean(output.coreIdea.trim());
  const focusedClaim = focusedClaimId
    ? [...output.claims, ...output.assumptions, ...output.questions].find((claim) => claim.id === focusedClaimId) ?? null
    : null;
  const relatedQuery = focusNode?.summary?.trim() || focusedClaim?.text || output.coreIdea;
  const [selectedVerifyClaim, setSelectedVerifyClaim] = useState<BrainClaim | null>(
    focusedClaim ?? output.assumptions[0] ?? output.claims[0] ?? null,
  );

  useEffect(() => {
    if (focusedClaim) {
      setSelectedVerifyClaim(focusedClaim);
    }
  }, [focusedClaim]);

  return (
    <section className="learn-session-output" aria-label="Learn session output">
      <div className="learn-emotional-moment">
        <span className="section-label">LEARN</span>
        <h1>Penny found structure in your idea</h1>
        <p>{truncateWords(output.coreIdea, 28)}</p>
        <LearnSourceIndicator behavior={learnSourceBehavior(sourceText, searchWebRequested)} />
      </div>

      <div className="learn-output-actions" aria-label="Learn next actions">
        <button type="button" className="primary-command" disabled={disabled} onClick={onOpenCheck}>
          Check
        </button>
        <button type="button" className="text-command" disabled={disabled || !currentSessionId} onClick={onOpenCanvas}>
          Canvas
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
        <button
          type="button"
          className="text-command"
          disabled={disabled || !relatedQuery.trim()}
          onClick={() => {
            void onSearchBrainRelated(relatedQuery, focusedClaim?.id ?? focusNode?.refs?.claimId ?? null);
          }}
        >
          Have I thought about this before?
        </button>
      </div>

      <div className="learn-output-grid">
        {focusNode || focusedClaim ? <LearnFocusCard node={focusNode} claim={focusedClaim} /> : null}
        <article className="learn-output-card learn-core-idea">
          <span>Core idea</span>
          <p>{output.coreIdea}</p>
          {currentSessionId ? (
            <button type="button" className="text-command" onClick={onOpenBrain}>
              Open Brain doc {shortId(currentSessionId)}
            </button>
          ) : null}
        </article>

        <LearnClaimList
          title="Structured claims"
          claims={output.claims}
          emptyText="No claims have been shaped yet."
          selectedClaimId={selectedVerifyClaim?.id ?? null}
          disabled={disabled || !currentSessionId}
          onVerify={setSelectedVerifyClaim}
        />
        <LearnClaimList
          title="Assumptions"
          claims={output.assumptions}
          emptyText="No explicit assumptions were returned in this graph slice."
          selectedClaimId={selectedVerifyClaim?.id ?? null}
          disabled={disabled || !currentSessionId}
          onVerify={setSelectedVerifyClaim}
        />
        <LearnClaimList
          title="Questions"
          claims={output.questions}
          emptyText="No open questions were returned in this graph slice."
        />
        <CreativePotential items={output.creativePotential} />
        <AutopilotNextMove suggestion={output.autopilotNextMove} claims={output.claims} />
        <RelatedFromBrain search={relatedBrainSearch} onSelectDocument={onOpenBrain} />
        <div className="learn-verify-slot">
          <VerifyPanel
            sessionId={currentSessionId}
            claim={selectedVerifyClaim}
            disabled={disabled || !currentSessionId}
            title="Verify evidence"
            compact
            {...(onVerifyChanged ? { onVerifyChanged } : {})}
          />
        </div>
      </div>
    </section>
  );
}

function LearnFocusCard({ node, claim }: { node: CanvasNode | null; claim: BrainClaim | null }) {
  return (
    <article className="learn-output-card learn-focus-card">
      <span>Selected context</span>
      <strong>{node?.title ?? claim?.kind ?? "Canvas node"}</strong>
      <p>{node?.summary ?? claim?.text ?? "Learn is focused on the selected graph node."}</p>
    </article>
  );
}

function RelatedFromBrain({
  search,
  onSelectDocument,
}: {
  search: BrainHybridSearchResponse["data"] | null;
  onSelectDocument: () => void;
}) {
  if (!search?.available) {
    return null;
  }

  return (
    <article className="learn-output-card learn-related-brain">
      <span>Related from your Brain</span>
      {search.results.length > 0 ? (
        <div className="learn-related-list">
          {search.results.slice(0, 5).map((result) => (
            <button key={result.id} type="button" onClick={onSelectDocument}>
              <strong>{truncateWords(result.title, 10)}</strong>
              <small>{truncateWords(result.summary ?? result.kind, 16)}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="learn-empty-note">No related Brain matches for this prompt yet.</p>
      )}
      {search.strategy ? <small>{formatLabel(search.strategy)}</small> : null}
    </article>
  );
}

function LearnIdeaDrop({
  disabled,
  status,
  recents,
  searchWeb,
  onSearchWebChange,
  onSave,
  onKeep,
}: {
  disabled: boolean;
  status: string;
  recents: BrainRecentIdea[];
  searchWeb: boolean;
  onSearchWebChange: (searchWeb: boolean) => void;
  onSave: (rawIdea: string, options: { searchWeb: boolean }) => Promise<void>;
  onKeep: (rawIdea: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const trimmedDraft = draft.trim();

  async function handleSave() {
    if (!trimmedDraft) {
      return;
    }

    await onSave(trimmedDraft, { searchWeb });
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
      <div className="learn-search-row">
        <label className="learn-search-toggle">
          <input
            type="checkbox"
            checked={searchWeb}
            disabled={disabled}
            onChange={(event) => onSearchWebChange(event.target.checked)}
          />
          <span>Search web</span>
        </label>
        <LearnSourceIndicator behavior={learnSourceBehavior(trimmedDraft, searchWeb)} />
      </div>
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

interface LearnSourceBehavior {
  usedWeb: boolean;
  label: "Used your Brain" | "Used web because";
  detail: string;
}

function LearnSourceIndicator({ behavior }: { behavior: LearnSourceBehavior }) {
  return (
    <div className={`learn-source-indicator${behavior.usedWeb ? " used-web" : ""}`} aria-label="Learn source behavior">
      <span>{behavior.label}</span>
      <p>{behavior.detail}</p>
    </div>
  );
}

function learnSourceBehavior(text: string, searchWebRequested: boolean): LearnSourceBehavior {
  if (searchWebRequested) {
    return {
      usedWeb: true,
      label: "Used web because",
      detail: "you turned Search web on for this idea.",
    };
  }

  const webReason = learnWebReason(text);

  if (webReason) {
    return {
      usedWeb: true,
      label: "Used web because",
      detail: webReason,
    };
  }

  return {
    usedWeb: false,
    label: "Used your Brain",
    detail: "Penny started from the saved graph context and this idea.",
  };
}

function learnWebReason(text: string): string | null {
  if (/\b(search|web|browse|look up|lookup|source|sources|citation|citations|verify|fact[- ]check|find evidence)\b/i.test(text)) {
    return "the idea asks for external sources.";
  }

  if (/\b(current|latest|today|recent|news|pricing|version|release|law|regulation|202[4-9])\b/i.test(text)) {
    return "the idea may need current information.";
  }

  return null;
}

function LearnClaimList({
  title,
  claims,
  emptyText,
  selectedClaimId,
  disabled = false,
  onVerify,
}: {
  title: string;
  claims: BrainClaim[];
  emptyText: string;
  selectedClaimId?: string | null;
  disabled?: boolean;
  onVerify?: (claim: BrainClaim) => void;
}) {
  return (
    <article className="learn-output-card">
      <span>{title}</span>
      {claims.length > 0 ? (
        <ul className="learn-claim-list">
          {claims.slice(0, 5).map((claim) => (
            <li key={claim.id}>
              <div className="learn-claim-row-head">
                <strong>{formatLabel(claim.kind)}</strong>
                {onVerify ? (
                  <button
                    type="button"
                    className={claim.id === selectedClaimId ? "is-selected" : ""}
                    disabled={disabled}
                    onClick={() => onVerify(claim)}
                  >
                    Verify
                  </button>
                ) : null}
              </div>
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
