"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildLearnExperienceViewModel,
  getVisibleLearnState,
  type LearnProjectionView,
} from "../../lib/viewmodels/learn/learn-experience";
import { ConfidenceChip } from "../confidence/ConfidenceChip";
import styles from "./learn-experience.module.css";

export function LearnExperience({ view }: { view: LearnProjectionView }) {
  const model = useMemo(() => buildLearnExperienceViewModel(view), [view]);
  const teachBackRef = useRef<HTMLTextAreaElement>(null);
  const [teachBack, setTeachBack] = useState("");
  const visibleState = getVisibleLearnState(model.experienceState, teachBack);

  useEffect(() => {
    teachBackRef.current?.focus();
  }, [model.selectedClaim?.body]);

  useEffect(() => {
    function handleLearnShortcut(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return;
      }

      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        teachBackRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleLearnShortcut);

    return () => {
      window.removeEventListener("keydown", handleLearnShortcut);
    };
  }, []);

  return (
    <div className={styles.learnLayout}>
      <section className={`penny-panel ${styles.heroPanel}`}>
        <p className={styles.kicker}>Learn</p>
        <h1>{model.heroTitle}</h1>
        <p>{model.heroDetail}</p>
      </section>

      <section className={`penny-panel ${styles.stateCard}`} data-state={visibleState.id}>
        <p className={styles.kicker}>Learn state</p>
        <h2>{visibleState.title}</h2>
        <p>{visibleState.body}</p>
      </section>

      <section className={`penny-panel ${styles.conceptCard}`}>
        <p className={styles.kicker}>Claim to explain</p>
        <h2>{model.concept.title}</h2>
        {model.selectedClaim ? <ConfidenceChip scale="basis-points" value={model.selectedClaim.confidenceBps} /> : null}
      </section>

      <section className={`penny-panel ${styles.explanationCard}`}>
        <p className={styles.kicker}>Plain version</p>
        <p>{model.concept.explanation}</p>
      </section>

      <section className={`penny-panel ${styles.teachBackCard}`}>
        <p className={styles.kicker}>Teach-back</p>
        <p>{model.teachBackPrompt}</p>
        <label htmlFor="learn-teach-back">Your version</label>
        <textarea
          ref={teachBackRef}
          id="learn-teach-back"
          value={teachBack}
          onChange={(event) => setTeachBack(event.target.value)}
          placeholder="State the claim. Give one example. Name the edge case."
          aria-keyshortcuts="t"
          autoFocus
          rows={7}
        />
      </section>

      <section className={`penny-panel ${styles.feedbackCard}`}>
        <p className={styles.kicker}>Review</p>
        <h2>{model.feedback.title}</h2>
        <p>{feedbackForDraft(model.feedback.body, teachBack)}</p>
      </section>

      <section className={`penny-panel ${styles.relatedCard}`}>
        <p className={styles.kicker}>Related ideas</p>
        <div className={styles.relatedList}>
          {model.relatedIdeas.map((idea, index) => (
            <article key={`${idea.title}:${index}`} className={styles.relatedItem}>
              <h2>{idea.title}</h2>
              <p>{idea.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`penny-panel ${styles.miniMapCard}`}>
        <p className={styles.kicker}>Where this lives</p>
        <div className={styles.miniMap}>
          <div className={styles.mapNode} data-current="true">
            {model.brainMiniMap.current}
          </div>
          {model.brainMiniMap.neighbors.map((neighbor, index) => (
            <div key={`${neighbor}:${index}`} className={styles.mapNode}>
              {neighbor}
            </div>
          ))}
        </div>
      </section>

      <section className={`penny-panel ${styles.stepsCard}`}>
        <p className={styles.kicker}>Practice path</p>
        <div className={styles.stepList}>
          {model.practiceSteps.map((step, index) => (
            <article key={`${step.title}:${index}`} className={styles.stepItem}>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`penny-panel ${styles.retrievalCard}`}>
        <p className={styles.kicker}>Retrieval checks</p>
        <div className={styles.retrievalGrid}>
          {model.retrievalCards.map((card, index) => (
            <article key={`${card.title}:${index}`} className={styles.retrievalItem}>
              <h2>{card.title}</h2>
              <p>{card.prompt}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`penny-panel ${styles.stateDetailsCard}`}>
        <p className={styles.kicker}>Details</p>
        <dl className={styles.facts}>
          <div>
            <dt>Status</dt>
            <dd>{model.reviewState.status}</dd>
          </div>
          <div>
            <dt>Map</dt>
            <dd>{model.reviewState.mapLabel}</dd>
          </div>
          <div>
            <dt>Claim</dt>
            <dd>{model.reviewState.claimLabel}</dd>
          </div>
          <div>
            <dt>Draft length</dt>
            <dd>{teachBack.trim().length} characters</dd>
          </div>
        </dl>
        <button type="button" disabled={model.switchConcept.disabled} className={styles.switchButton}>
          {model.switchConcept.label}
        </button>
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

function feedbackForDraft(baseFeedback: string, teachBack: string): string {
  const trimmed = teachBack.trim();

  if (!trimmed) {
    return baseFeedback;
  }

  if (trimmed.length < 80) {
    return "Good start. Add one concrete example and the edge case that would break it.";
  }

  return "This has enough shape to review. Check the idea, the example, and the edge case.";
}
