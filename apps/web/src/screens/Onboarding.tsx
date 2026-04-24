import { PennyLogo } from "../../components/layout/PennyLogo";
import { ModeCard, type OnboardingMode } from "../components/onboarding/ModeCard";
import styles from "./Onboarding.module.css";

const entryCards: Array<{
  body: string;
  mode: OnboardingMode;
  title: string;
}> = [
  {
    mode: "brain",
    title: "Start in Brain",
    body: "Capture one thought. See the claim Penny can trace.",
  },
  {
    mode: "challenge",
    title: "Put it under pressure",
    body: "Show the tension before the idea becomes a plan.",
  },
  {
    mode: "learn",
    title: "Find what it depends on",
    body: "Turn the blocker into a clearer explanation.",
  },
];

export function Onboarding() {
  return (
    <main className={styles.entry}>
      <div className={styles.ambient} aria-hidden="true" />

      <section className={styles.shell} aria-labelledby="entry-title">
        <div className={styles.brand}>
          <PennyLogo />
        </div>

        <div className={styles.hero}>
          <p className={styles.eyebrow}>Start in Brain</p>
          <h1 id="entry-title">Start with one idea Penny can trace.</h1>
        </div>

        <div className={styles.cards} aria-label="Workspace modes">
          {entryCards.map((card) => (
            <ModeCard key={card.mode} body={card.body} mode={card.mode} title={card.title} />
          ))}
        </div>
      </section>
    </main>
  );
}

export default Onboarding;
