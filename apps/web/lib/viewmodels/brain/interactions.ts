export type BrainWorkspaceMode = "brain" | "challenge" | "learn";

export function createBrainInteractionUrl(input: {
  currentHref: string;
  mode: BrainWorkspaceMode;
  selectedClaimId: string | null;
}) {
  const url = new URL(input.currentHref);
  url.searchParams.set("mode", input.mode);

  if (input.selectedClaimId) {
    url.searchParams.set("claimId", input.selectedClaimId);
  } else {
    url.searchParams.delete("claimId");
  }

  return url.toString();
}
