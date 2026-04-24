export type PennyMode = "brain" | "challenge" | "learn";

export const modeAccents: Record<
  PennyMode,
  {
    label: string;
    accent: string;
    accentSoft: string;
    ink: string;
  }
> = {
  brain: {
    label: "Brain",
    accent: "var(--color-mode-brain)",
    accentSoft: "var(--color-mode-brain-soft)",
    ink: "var(--color-mode-brain-ink)",
  },
  challenge: {
    label: "Challenge",
    accent: "var(--color-mode-challenge)",
    accentSoft: "var(--color-mode-challenge-soft)",
    ink: "var(--color-mode-challenge-ink)",
  },
  learn: {
    label: "Learn",
    accent: "var(--color-mode-learn)",
    accentSoft: "var(--color-mode-learn-soft)",
    ink: "var(--color-mode-learn-ink)",
  },
};

export const designTokens = {
  spacing: {
    xs: "var(--space-1)",
    sm: "var(--space-2)",
    md: "var(--space-4)",
    lg: "var(--space-6)",
    xl: "var(--space-8)",
  },
  radius: {
    sm: "var(--radius-sm)",
    md: "var(--radius-md)",
    lg: "var(--radius-lg)",
  },
  shadow: {
    sm: "var(--shadow-sm)",
    md: "var(--shadow-md)",
    lg: "var(--shadow-lg)",
  },
} as const;
