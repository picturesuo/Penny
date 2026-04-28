export class BrainRunGuardError extends Error {
  constructor(operation: string) {
    super(`${operation} generation requires a recorded BrainRun id.`);
    this.name = "BrainRunGuardError";
  }
}

export type BrainRunGuardOptions = {
  brainRunId?: string | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireRecordedBrainRun(operation: string, options: BrainRunGuardOptions): string {
  const brainRunId = options.brainRunId?.trim();

  if (!brainRunId || !uuidPattern.test(brainRunId)) {
    throw new BrainRunGuardError(operation);
  }

  return brainRunId;
}
