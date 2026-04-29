export type BrainScope = {
  userId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  sphereId: string | null;
};

export type BrainScopeInput = Partial<BrainScope>;

export type OptionalBrainScope<T> = Omit<T, keyof BrainScope> & Partial<BrainScope>;

export function scopeValues(scope: BrainScopeInput | null | undefined): BrainScope {
  return {
    userId: scope?.userId ?? null,
    workspaceId: scope?.workspaceId ?? null,
    projectId: scope?.projectId ?? null,
    sphereId: scope?.sphereId ?? null,
  };
}
