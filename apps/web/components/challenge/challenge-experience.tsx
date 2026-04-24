"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildChallengeExperienceViewModel,
  type ChallengeProjectionView,
  type ChallengeResponseAction,
} from "../../lib/viewmodels/challenge/challenge-experience";
import { ConfidenceChip } from "../confidence/ConfidenceChip";
import { Skeleton } from "../ui";
import styles from "./challenge-experience.module.css";

type ActionState = {
  status: "idle" | "pending" | "success" | "error";
  message: string | null;
};

export type ChallengeResponsePath = ChallengeResponseAction["id"];

export function ChallengeExperience({
  actionState,
  onRecordResponse,
  onRequestCritique,
  onStartChallenge,
  view,
}: {
  actionState: ActionState;
  onRecordResponse: (roundId: string, response: string, responsePath: ChallengeResponsePath) => Promise<void>;
  onRequestCritique: (roundId: string) => Promise<void>;
  onStartChallenge: (claimId: string) => Promise<void>;
  view: ChallengeProjectionView;
}) {
  const model = useMemo(() => buildChallengeExperienceViewModel(view), [view]);
  const responseFormRef = useRef<HTMLFormElement>(null);
  const responseTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectedAction, setSelectedAction] = useState<ChallengeResponsePath>("defend");
  const [response, setResponse] = useState("");
  const roundId = model.round?.id ?? null;
  const isBusy = actionState.status === "pending";
  const isAiResponseLoading =
    model.challengeState.id === "critique_pending" ||
    (actionState.status === "pending" && /critique/i.test(actionState.message ?? ""));
  const selectedActionModel = model.responseActions.find((action) => action.id === selectedAction) ?? model.responseActions[0];

  useEffect(() => {
    if (model.canRecordResponse && !isBusy) {
      responseTextareaRef.current?.focus();
    }
  }, [isBusy, model.canRecordResponse, roundId]);

  useEffect(() => {
    function handleChallengeShortcut(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target) || isBusy) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "s" && model.canStartChallenge && view.activeClaim) {
        event.preventDefault();
        void onStartChallenge(view.activeClaim.id);
        return;
      }

      if (key === "r" && model.canRequestCritique && roundId) {
        event.preventDefault();
        void onRequestCritique(roundId);
        return;
      }

      const action = model.responseActions.find((candidate) => candidate.id.startsWith(key));

      if (action && model.canRecordResponse) {
        event.preventDefault();
        chooseAction(action);
      }
    }

    window.addEventListener("keydown", handleChallengeShortcut);

    return () => {
      window.removeEventListener("keydown", handleChallengeShortcut);
    };
  });

  async function submitResponse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = response.trim();

    if (!roundId || !trimmed || isBusy) {
      return;
    }

    await onRecordResponse(roundId, trimmed, selectedAction);
    setResponse("");
  }

  function chooseAction(action: ChallengeResponseAction) {
    setSelectedAction(action.id);
    setResponse((current) => (current.trim() ? current : action.prompt));
  }

  return (
    <div className={styles.challengeLayout}>
      <section className={`penny-panel ${styles.heroPanel}`}>
        <p className={styles.kicker}>Challenge</p>
        <h1>{model.selectedClaim?.body ?? "No active claim"}</h1>
        <p>{model.strongestCounterargument}</p>
      </section>

      <section className={`penny-panel ${styles.stateCard}`} data-state={model.challengeState.id}>
        <p className={styles.kicker}>Challenge state</p>
        <h2>{model.challengeState.title}</h2>
        <p>{model.challengeState.body}</p>
      </section>

      <section className={`penny-panel ${styles.selectedClaim}`}>
        <p className={styles.kicker}>Selected claim</p>
        {model.selectedClaim ? (
          <>
            <p className={styles.claimText}>{model.selectedClaim.body}</p>
            <ConfidenceChip scale="basis-points" value={model.selectedClaim.confidenceBps} />
          </>
        ) : (
          <p>No claim selected.</p>
        )}
      </section>

      <section className={`penny-panel ${styles.counterCard}`}>
        <p className={styles.kicker}>Strongest counterargument</p>
        {isAiResponseLoading ? <AiResponseSkeleton /> : <p>{model.strongestCounterargument}</p>}
      </section>

      <section className={`penny-panel ${styles.weaknessCard}`}>
        <p className={styles.kicker}>Key weakness</p>
        {isAiResponseLoading ? (
          <span className={styles.aiSkeletonBlock}>
            <Skeleton height={16} width="86%" label="Loading AI weakness summary" />
            <Skeleton height={16} width="58%" label="Loading AI weakness detail" />
          </span>
        ) : (
          <p>{model.keyWeaknessSummary}</p>
        )}
      </section>

      <section className={`penny-panel ${styles.stakesCard}`}>
        <p className={styles.kicker}>What is at stake</p>
        <p>{model.whatsAtStake.summary}</p>
        <ul className={styles.signalList}>
          {model.whatsAtStake.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className={`penny-panel ${styles.transparencyCard}`}>
        <p className={styles.kicker}>Critique transparency</p>
        <dl className={styles.facts}>
          <div>
            <dt>Round</dt>
            <dd>{model.round?.id ?? "No round"}</dd>
          </div>
          <div>
            <dt>Round status</dt>
            <dd>{model.round?.status ?? "not_started"}</dd>
          </div>
          <div>
            <dt>Critique status</dt>
            <dd>{model.critiqueTransparency.status}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{model.critiqueTransparency.provider}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{model.critiqueTransparency.model}</dd>
          </div>
          <div>
            <dt>Prompt</dt>
            <dd>{model.critiqueTransparency.promptVersion}</dd>
          </div>
          <div>
            <dt>Response</dt>
            <dd>{model.critiqueTransparency.responseStatus}</dd>
          </div>
        </dl>
      </section>

      <section className={`penny-panel ${styles.cascadeCard}`}>
        <p className={styles.kicker}>Dependency cascade</p>
        <p>{model.dependencyCascade.summary}</p>
        <CascadeGroup title="Assumptions" items={model.dependencyCascade.assumptions} />
        <CascadeGroup title="Likely failure modes" items={model.dependencyCascade.likelyFailureModes} />
        <CascadeGroup title="Follow-up questions" items={model.dependencyCascade.followUpQuestions} />
      </section>

      <section className={`penny-panel ${styles.actionsCard}`}>
        <p className={styles.kicker}>Response actions</p>
        {actionState.message ? (
          <p className={styles.actionMessage} data-status={actionState.status}>
            {actionState.message}
          </p>
        ) : null}
        <div className={styles.commandRow}>
          <button
            type="button"
            disabled={!model.canStartChallenge || isBusy}
            aria-keyshortcuts="s"
            onClick={() => (view.activeClaim ? onStartChallenge(view.activeClaim.id) : undefined)}
          >
            Start Challenge
          </button>
          <button
            type="button"
            disabled={!model.canRequestCritique || isBusy}
            aria-keyshortcuts="r"
            onClick={() => (roundId ? onRequestCritique(roundId) : undefined)}
          >
            Request Critique
          </button>
        </div>

        <div className={styles.responseChoices} role="group" aria-label="Response path">
          {model.responseActions.map((action) => (
            <button
              key={action.id}
              type="button"
              data-active={selectedAction === action.id}
              disabled={!model.canRecordResponse || isBusy}
              aria-keyshortcuts={action.id.slice(0, 1)}
              onClick={() => chooseAction(action)}
            >
              {action.label}
            </button>
          ))}
        </div>

        <form ref={responseFormRef} className={styles.responseForm} onSubmit={submitResponse}>
          <label htmlFor="challenge-response">{selectedActionModel.label} response</label>
          <textarea
            ref={responseTextareaRef}
            id="challenge-response"
            value={response}
            onChange={(event) => setResponse(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                responseFormRef.current?.requestSubmit();
              }
            }}
            disabled={!model.canRecordResponse || isBusy}
            placeholder={selectedActionModel.prompt}
            autoFocus={model.canRecordResponse}
            rows={6}
          />
          <button type="submit" disabled={!model.canRecordResponse || isBusy || !response.trim()} aria-keyshortcuts="Meta+Enter Control+Enter">
            Record {selectedActionModel.label}
          </button>
        </form>
      </section>
    </div>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function CascadeGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className={styles.cascadeGroup}>
      <h2>{title}</h2>
      {items.length > 0 ? (
        <ul className={styles.signalList}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>None returned yet.</p>
      )}
    </div>
  );
}

function AiResponseSkeleton() {
  return (
    <div className={styles.aiSkeletonBlock} role="status" aria-label="Loading AI response">
      <Skeleton height={16} width="92%" label="Loading AI response line" />
      <Skeleton height={16} width="76%" label="Loading AI response line" />
      <Skeleton height={16} width="64%" label="Loading AI response line" />
    </div>
  );
}
