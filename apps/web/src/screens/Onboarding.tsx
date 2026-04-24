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
    body: "Open your workspace, inspect the first claim, and capture the next thought.",
  },
  {
    mode: "challenge",
    title: "Then Challenge",
    body: "Put the selected claim under pressure when Brain has enough context.",
  },
  {
    mode: "learn",
    title: "Then Learn",
    body: "Turn the critique into a blocker, concept, or next explanation.",
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
          <h1 id="entry-title">Begin with one thought Penny can trace.</h1>
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
