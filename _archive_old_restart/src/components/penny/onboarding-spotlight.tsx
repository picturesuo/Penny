import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ONBOARDING_EXAMPLE_CLAIMS, type OnboardingPrompt } from "@/types/onboarding";

export function OnboardingSpotlight({
  prompt,
  role = "default",
  onStart,
  onSkip,
}: {
  prompt: OnboardingPrompt;
  role?: keyof typeof ONBOARDING_EXAMPLE_CLAIMS;
  onStart?: () => void;
  onSkip?: () => void;
}) {
  const example = prompt.exampleContent ?? ONBOARDING_EXAMPLE_CLAIMS[role] ?? ONBOARDING_EXAMPLE_CLAIMS.default;

  return (
    <Card className="p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Onboarding prompt</p>
      <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">{prompt.headline}</h3>
      <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">{prompt.body}</p>
      {example ? (
        <div className="mt-4 rounded-[24px] border border-dashed border-black/10 bg-[var(--panel)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Example claim</p>
          <p className="mt-2 text-sm leading-7 text-[var(--ink)]">{example}</p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={onStart}>{prompt.actionLabel}</Button>
        {prompt.skipLabel ? (
          <Button variant="secondary" onClick={onSkip}>
            {prompt.skipLabel}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
