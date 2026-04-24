import type { DashboardPanel } from "@/types/home-dashboard";
import { OnboardingChecklistPanel } from "@/components/penny/dashboard-panels/onboarding-checklist";
import { RevisitQueuePanel } from "@/components/penny/dashboard-panels/revisit-queue";
import { BlindSpotAlertPanel } from "@/components/penny/dashboard-panels/blind-spot-alert";
import { ResolutionDuePanel } from "@/components/penny/dashboard-panels/resolution-due";
import { CompoundingValuePanel } from "@/components/penny/dashboard-panels/compounding-value";
import { RecentMapsPanel } from "@/components/penny/dashboard-panels/recent-maps";
import { VelocitySnapshotPanel } from "@/components/penny/dashboard-panels/velocity-snapshot";
import { LessonSurfacedPanel } from "@/components/penny/dashboard-panels/lesson-surfaced";
import { BiographyChapterReadyPanel } from "@/components/penny/dashboard-panels/biography-chapter-ready";
import { UnlockProgressPanel } from "@/components/penny/dashboard-panels/unlock-progress";

export function renderDashboardPanel(panel: DashboardPanel) {
  switch (panel.panelType) {
    case "onboarding_checklist":
      return <OnboardingChecklistPanel panel={panel} />;
    case "revisit_queue":
      return <RevisitQueuePanel panel={panel} />;
    case "blind_spot_alert":
      return <BlindSpotAlertPanel panel={panel} />;
    case "resolution_due":
      return <ResolutionDuePanel panel={panel} />;
    case "compounding_value":
      return <CompoundingValuePanel panel={panel} />;
    case "recent_maps":
      return <RecentMapsPanel panel={panel} />;
    case "velocity_snapshot":
      return <VelocitySnapshotPanel panel={panel} />;
    case "lesson_surfaced":
      return <LessonSurfacedPanel panel={panel} />;
    case "biography_chapter_ready":
      return <BiographyChapterReadyPanel panel={panel} />;
    case "unlock_progress":
      return <UnlockProgressPanel panel={panel} />;
    default:
      return null;
  }
}
