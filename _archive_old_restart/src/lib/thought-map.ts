import { cleanSentence, DEMO_USER_ID } from "@/lib/penny";

const TITLE_MAX_LENGTH = 56;

export function createThoughtMapTitle(rawThought: string) {
  const trimmed = cleanSentence(rawThought);
  const base = trimmed.split(/[.!?]/)[0] ?? trimmed;
  return base.length > TITLE_MAX_LENGTH ? `${base.slice(0, TITLE_MAX_LENGTH - 3).trim()}...` : base;
}

export function createRootNodeContent(rawThought: string) {
  return cleanSentence(rawThought);
}

export function getDemoThoughtUserId() {
  return DEMO_USER_ID;
}
