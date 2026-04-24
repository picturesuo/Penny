import type { MarginFragmentModel, SessionCardModel } from "@/types/penny";
import type { ThoughtMapModel } from "@/types/thought-map";

export type UserMaturity = "new" | "early" | "established" | "mature";

export type DashboardPanelType =
  | "onboarding_checklist"
  | "revisit_queue"
  | "blind_spot_alert"
  | "resolution_due"
  | "compounding_value"
  | "recent_maps"
  | "velocity_snapshot"
  | "lesson_surfaced"
  | "biography_chapter_ready"
  | "unlock_progress";

export interface DashboardPanel {
  id: string;
  panelType: DashboardPanelType;
  priority: number;
  isVisible: boolean;
  data: Record<string, unknown>;
}

export type PrimaryActionType =
  | "start_session"
  | "continue_map"
  | "resolve_prediction"
  | "run_critique"
  | "create_first_claim"
  | "search"
  | "quick_capture";

export interface PrimaryAction {
  label: string;
  description: string;
  actionType: PrimaryActionType;
  targetId: string | null;
}

export interface SessionSuggestion {
  suggestedIntentionType: string;
  reason: string;
  estimatedMinutes: number;
  claimsToFocus: string[];
}

export interface DashboardAlert {
  id: string;
  alertType: "resolution_overdue" | "claim_very_stale" | "artifact_load_bearing_drift" | "shape_newly_confirmed" | "feature_unlocked" | "calibration_milestone";
  message: string;
  actionLabel: string;
  targetId: string;
  urgency: "low" | "medium" | "high";
  createdAt: Date;
}

export interface HomeDashboardState {
  userId: string;
  userMaturity: UserMaturity;
  panels: DashboardPanel[];
  primaryAction: PrimaryAction;
  sessionSuggestion: SessionSuggestion | null;
  alerts: DashboardAlert[];
}

export interface UserState {
  userId: string;
  maps: ThoughtMapModel[];
  sessions: SessionCardModel[];
  fragments: MarginFragmentModel[];
}
