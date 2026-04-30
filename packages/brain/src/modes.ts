import { z } from "zod";

export const mvpModeValues = ["Learn", "Check", "Brain"] as const;
export type MvpMode = (typeof mvpModeValues)[number];

export const thinkingModeValues = ["brain", "challenge", "verify", "learn", "artifact"] as const;
export type ThinkingMode = (typeof thinkingModeValues)[number];

export const MvpModeSchema = z.enum(mvpModeValues);
export const ThinkingModeSchema = z.enum(thinkingModeValues);

export function isMvpMode(value: unknown): value is MvpMode {
  return typeof value === "string" && mvpModeValues.includes(value as MvpMode);
}

export function mvpModeForThinkingMode(mode: ThinkingMode): MvpMode {
  switch (mode) {
    case "learn":
      return "Learn";
    case "challenge":
    case "verify":
    case "artifact":
      return "Check";
    case "brain":
      return "Brain";
  }
}

export function thinkingModeForMvpMode(mode: MvpMode): ThinkingMode {
  switch (mode) {
    case "Learn":
      return "learn";
    case "Check":
      return "challenge";
    case "Brain":
      return "brain";
  }
}
