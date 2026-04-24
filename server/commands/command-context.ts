import { randomUUID } from "node:crypto";

export type CommandContext = {
  actorUserId: string;
  requestId: string;
  now: Date;
};

export type CommandContextSource = {
  actorUserId: string;
  requestId?: string | null;
  now?: Date | (() => Date);
  createId?: () => string;
};

export function resolveCommandContext(source: CommandContextSource): CommandContext {
  const createId = source.createId ?? randomUUID;
  const requestId = source.requestId?.trim() || createId();
  const now = source.now instanceof Date ? source.now : (source.now ?? (() => new Date()))();

  return {
    actorUserId: source.actorUserId,
    requestId,
    now,
  };
}
