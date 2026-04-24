"use client";

import { useMemo, useState } from "react";

import {
  buildChallengeExperienceViewModel,
  type ChallengeProjectionView,
  type ChallengeResponseAction,
} from "../../lib/viewmodels/challenge/challenge-experience";
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
  const [selectedAction, setSelectedAction] = useState<ChallengeResponsePath>("defend");
  const [response, setResponse] = useState("");
  const roundId = model.round?.id ?? null;
  const isBusy = actionState.status === "pending";
  const selectedActionModel = model.responseActions.find((action) => action.id === selectedAction) ?? model.responseActions[0];

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
            <span>{model.selectedClaim.confidenceLabel}</span>
          </>
        ) : (
          <p>No claim selected.</p>
        )}
      </section>

      <section className={`penny-panel ${styles.counterCard}`}>
        <p className={styles.kicker}>Strongest counterargument</p>
        <p>{model.strongestCounterargument}</p>
      </section>

      <section className={`penny-panel ${styles.weaknessCard}`}>
        <p className={styles.kicker}>Key weakness</p>
        <p>{model.keyWeaknessSummary}</p>
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
            onClick={() => (view.activeClaim ? onStartChallenge(view.activeClaim.id) : undefined)}
          >
            Start Challenge
          </button>
          <button
            type="button"
            disabled={!model.canRequestCritique || isBusy}
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
              onClick={() => chooseAction(action)}
            >
              {action.label}
            </button>
          ))}
        </div>

        <form className={styles.responseForm} onSubmit={submitResponse}>
          <label htmlFor="challenge-response">{selectedActionModel.label} response</label>
          <textarea
            id="challenge-response"
            value={response}
            onChange={(event) => setResponse(event.target.value)}
            disabled={!model.canRecordResponse || isBusy}
            placeholder={selectedActionModel.prompt}
            rows={6}
          />
          <button type="submit" disabled={!model.canRecordResponse || isBusy || !response.trim()}>
            Record {selectedActionModel.label}
          </button>
        </form>
      </section>
    </div>
  );
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
