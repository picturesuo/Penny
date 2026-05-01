import type { AutopilotSuggestion, AutopilotTickData, SessionCockpitData } from "./types/brain";

export type PennyMode = "Learn" | "Brain" | "Check";

export type AutopilotStartIntent =
  | {
      ok: true;
      sessionId: string;
      candidateId: string;
      targetClaimId: string | null;
      nextMode: PennyMode;
      action: string;
    }
  | {
      ok: false;
      status: string;
    };

type GoThereCockpit = Pick<SessionCockpitData, "autopilot">;

export type AutopilotGoThereResult<Cockpit extends GoThereCockpit = GoThereCockpit> = {
  cockpit: Cockpit;
  focusedClaimId: string | null;
  nextMode: PennyMode;
};

export function buildAutopilotStartIntent(
  sessionId: string | null | undefined,
  autopilot: AutopilotTickData | null,
  candidateIdOverride?: string,
): AutopilotStartIntent {
  if (!sessionId) {
    return { ok: false, status: "Autopilot needs a session first" };
  }

  const candidate = selectedAutopilotCandidate(autopilot, candidateIdOverride);

  if (!candidate?.candidateId) {
    return { ok: false, status: "Autopilot has no candidate to start" };
  }

  return {
    ok: true,
    sessionId,
    candidateId: candidate.candidateId,
    targetClaimId: candidate.targetClaimId,
    nextMode: modeForAutopilotCandidate(candidate),
    action: candidate.action,
  };
}

export async function runAutopilotGoThere<Cockpit extends GoThereCockpit>(
  intent: Extract<AutopilotStartIntent, { ok: true }>,
  deps: {
    startCandidate: (sessionId: string, candidateId: string) => Promise<unknown>;
    refreshCockpit: (sessionId: string) => Promise<Cockpit>;
  },
): Promise<AutopilotGoThereResult<Cockpit>> {
  await deps.startCandidate(intent.sessionId, intent.candidateId);

  const cockpit = await deps.refreshCockpit(intent.sessionId);

  return {
    cockpit,
    focusedClaimId: cockpit.autopilot.focusState?.focusedClaimId ?? intent.targetClaimId,
    nextMode: intent.nextMode,
  };
}

export function selectedAutopilotCandidate(
  autopilot: AutopilotTickData | null,
  candidateIdOverride?: string,
): AutopilotSuggestion | null {
  if (candidateIdOverride) {
    return (
      autopilotCandidates(autopilot).find(
        (candidate) => candidate.candidateId === candidateIdOverride || candidate.id === candidateIdOverride,
      ) ?? null
    );
  }

  return autopilot?.suggestion ?? autopilot?.selectedCandidate ?? null;
}

function autopilotCandidates(autopilot: AutopilotTickData | null): AutopilotSuggestion[] {
  const seen = new Set<string>();
  const candidates: AutopilotSuggestion[] = [];

  for (const candidate of [autopilot?.suggestion, autopilot?.selectedCandidate, ...(autopilot?.candidates ?? [])]) {
    if (!candidate || seen.has(candidate.candidateId)) {
      continue;
    }

    seen.add(candidate.candidateId);
    candidates.push(candidate);
  }

  return candidates;
}

export function modeForAutopilotCandidate(candidate: AutopilotSuggestion): PennyMode {
  if (candidate.action === "save_to_brain" || candidate.mode === "artifact" || candidate.mode === "brain") {
    return "Brain";
  }

  if (
    candidate.action === "challenge" ||
    candidate.action === "resume_open_challenge" ||
    candidate.action === "verify" ||
    candidate.mode === "challenge" ||
    candidate.mode === "verify"
  ) {
    return "Check";
  }

  if (candidate.action === "learn" || candidate.action === "clarify" || candidate.mode === "learn") {
    return "Learn";
  }

  return "Check";
}
