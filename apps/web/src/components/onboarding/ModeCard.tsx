import Link from "next/link";

import styles from "./ModeCard.module.css";

export type OnboardingMode = "brain" | "challenge" | "learn";

type ModeCardProps = {
  body: string;
  mode: OnboardingMode;
  title: string;
};

export function ModeCard({ body, mode, title }: ModeCardProps) {
  return (
    <Link aria-label={`${title}. ${body}`} className={styles.card} data-mode={mode} href={`/app?mode=${mode}`}>
      <span className={styles.mark} aria-hidden="true">
        {title.slice(0, 1)}
      </span>
      <span className={styles.content}>
        <span className={styles.title}>{title}</span>
        <span className={styles.body}>{body}</span>
      </span>
      <span className={styles.arrow} aria-hidden="true">
        &rarr;
      </span>
    </Link>
  );
}
