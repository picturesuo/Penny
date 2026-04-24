"use client";

import { useMemo, useState } from "react";

import { buildLearnExperienceViewModel, type LearnProjectionView } from "../../lib/viewmodels/learn/learn-experience";
import styles from "./learn-experience.module.css";

export function LearnExperience({ view }: { view: LearnProjectionView }) {
  const model = useMemo(() => buildLearnExperienceViewModel(view), [view]);
  const [teachBack, setTeachBack] = useState("");

  return (
    <div className={styles.learnLayout}>
      <section className={`penny-panel ${styles.heroPanel}`}>
        <p className={styles.kicker}>Learn</p>
        <h1>{model.heroTitle}</h1>
        <p>{model.heroDetail}</p>
      </section>

      <section className={`penny-panel ${styles.conceptCard}`}>
        <p className={styles.kicker}>Concept title</p>
        <h2>{model.concept.title}</h2>
        {model.selectedClaim ? <span>{model.selectedClaim.confidenceLabel}</span> : null}
      </section>

      <section className={`penny-panel ${styles.explanationCard}`}>
        <p className={styles.kicker}>Concept explanation</p>
        <p>{model.concept.explanation}</p>
      </section>

      <section className={`penny-panel ${styles.teachBackCard}`}>
        <p className={styles.kicker}>Teach-back</p>
        <p>{model.teachBackPrompt}</p>
        <label htmlFor="learn-teach-back">Your explanation</label>
        <textarea
          id="learn-teach-back"
          value={teachBack}
          onChange={(event) => setTeachBack(event.target.value)}
          placeholder="Explain the claim, give an example, then name an edge case."
          rows={7}
        />
      </section>

      <section className={`penny-panel ${styles.feedbackCard}`}>
        <p className={styles.kicker}>Penny feedback</p>
        <h2>{model.feedback.title}</h2>
        <p>{feedbackForDraft(model.feedback.body, teachBack)}</p>
      </section>

      <section className={`penny-panel ${styles.relatedCard}`}>
        <p className={styles.kicker}>Related ideas</p>
        <div className={styles.relatedList}>
          {model.relatedIdeas.map((idea) => (
            <article key={idea.title} className={styles.relatedItem}>
              <h2>{idea.title}</h2>
              <p>{idea.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`penny-panel ${styles.miniMapCard}`}>
        <p className={styles.kicker}>Where this lives in your brain</p>
        <div className={styles.miniMap}>
          <div className={styles.mapNode} data-current="true">
            {model.brainMiniMap.current}
          </div>
          {model.brainMiniMap.neighbors.map((neighbor) => (
            <div key={neighbor} className={styles.mapNode}>
              {neighbor}
            </div>
          ))}
        </div>
      </section>

      <section className={`penny-panel ${styles.stepsCard}`}>
        <p className={styles.kicker}>Practice path</p>
        <div className={styles.stepList}>
          {model.practiceSteps.map((step) => (
            <article key={step.title} className={styles.stepItem}>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`penny-panel ${styles.retrievalCard}`}>
        <p className={styles.kicker}>Retrieval checks</p>
        <div className={styles.retrievalGrid}>
          {model.retrievalCards.map((card) => (
            <article key={card.title} className={styles.retrievalItem}>
              <h2>{card.title}</h2>
              <p>{card.prompt}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`penny-panel ${styles.stateCard}`}>
        <p className={styles.kicker}>Learning state</p>
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

function feedbackForDraft(baseFeedback: string, teachBack: string): string {
  const trimmed = teachBack.trim();

  if (!trimmed) {
    return baseFeedback;
  }

  if (trimmed.length < 80) {
    return "Good start. Add a concrete example and the edge case that would make the concept break.";
  }

  return "This teach-back has enough shape for review. Check that it includes the concept, one example, and one edge case.";
}
