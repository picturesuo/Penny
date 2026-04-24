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
    title: "Brain",
    body: "Capture and organize what you think.",
  },
  {
    mode: "challenge",
    title: "Challenge",
    body: "Put an idea under pressure.",
  },
  {
    mode: "learn",
    title: "Learn",
    body: "Understand what is blocking you.",
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
          <p className={styles.eyebrow}>Choose a lens</p>
          <h1 id="entry-title">What do you want to do today?</h1>
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
