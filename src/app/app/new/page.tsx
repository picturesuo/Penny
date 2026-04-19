import { OnboardingFlow } from "@/components/penny/onboarding-flow";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import { getOnboardingWorkspace } from "@/server/onboarding";

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams?: Promise<{ prefill?: string }> | { prefill?: string };
  }) {
  const params = await Promise.resolve(searchParams ?? {});
  const prefill = typeof params.prefill === "string" ? params.prefill : "";
  const userId = await getCurrentAuthenticatedUserId();
  const workspace = await getOnboardingWorkspace(userId);

  return <OnboardingFlow userId={userId} workspace={workspace} initialPrefill={prefill} />;
}
