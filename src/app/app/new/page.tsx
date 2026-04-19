import { OnboardingFlow } from "@/components/penny/onboarding-flow";
import { getDemoThoughtUserId } from "@/lib/thought-map";
import { getOnboardingWorkspace } from "@/server/onboarding";

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams?: Promise<{ prefill?: string }> | { prefill?: string };
}) {
  const params = await Promise.resolve(searchParams ?? {});
  const prefill = typeof params.prefill === "string" ? params.prefill : "";
  const userId = getDemoThoughtUserId();
  const workspace = await getOnboardingWorkspace(userId);

  return <OnboardingFlow userId={userId} workspace={workspace} initialPrefill={prefill} />;
}
