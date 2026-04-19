import type {
  MarginFragmentContextSnapshot,
  MarginFragmentModel,
  MarginFragmentStatus,
} from "@/types/penny";

export const QUICK_CAPTURE_SOURCES = ["web_shortcut", "mobile", "email_forward", "clipboard"] as const;

export type QuickCaptureSource = (typeof QUICK_CAPTURE_SOURCES)[number];

export interface QuickCaptureContextSnapshot extends MarginFragmentContextSnapshot {
  captureSource?: QuickCaptureSource;
  processedAt?: string | null;
  processedIntoClaimId?: string | null;
  processedIntoMapId?: string | null;
  dismissed?: boolean;
  dismissedAt?: string | null;
  extractedStructureKind?: string | null;
  extractedDomain?: string | null;
  extractedConfidence?: number | null;
  extractionConfidence?: number | null;
}

export interface QuickCapture extends MarginFragmentModel {
  rawText: string;
  content: string;
  captureSource: QuickCaptureSource;
  processedAt: Date | null;
  processedIntoClaimId: string | null;
  processedIntoMapId: string | null;
  dismissed: boolean;
  dismissedAt: Date | null;
  extractedStructureKind: string | null;
  extractedDomain: string | null;
  extractedConfidence: number | null;
  extractionConfidence: number | null;
}

export type QuickCaptureCreateInput = {
  userId?: string;
  rawText: string;
  captureSource?: QuickCaptureSource;
  sphere?: string;
  sourceSessionId?: string | null;
  sourceMapId?: string | null;
  currentStage?: QuickCaptureContextSnapshot["currentStage"];
  currentFocus?: string;
  currentContext?: string;
  currentResponse?: string | null;
  recentSessionMinutes?: number | null;
  extractedStructureKind?: string | null;
  extractedDomain?: string | null;
  extractedConfidence?: number | null;
  extractionConfidence?: number | null;
};

export type QuickCaptureUpdateInput = {
  captureId: string;
  userId?: string;
  status?: MarginFragmentStatus;
  processedIntoClaimId?: string | null;
  processedIntoMapId?: string | null;
};

export function parseQuickCaptureContextSnapshot(value: string): QuickCaptureContextSnapshot {
  try {
    const parsed = JSON.parse(value) as Partial<QuickCaptureContextSnapshot> | null;

    return {
      currentStage:
        typeof parsed?.currentStage === "string"
          ? (parsed.currentStage as QuickCaptureContextSnapshot["currentStage"])
          : "dashboard",
      currentFocus: typeof parsed?.currentFocus === "string" ? parsed.currentFocus : "",
      currentSphere: typeof parsed?.currentSphere === "string" ? parsed.currentSphere : "work",
      currentContext: typeof parsed?.currentContext === "string" ? parsed.currentContext : "",
      currentResponse: typeof parsed?.currentResponse === "string" ? parsed.currentResponse : null,
      recentSessionMinutes:
        typeof parsed?.recentSessionMinutes === "number" && Number.isFinite(parsed.recentSessionMinutes)
          ? parsed.recentSessionMinutes
          : null,
      sourceSessionId: typeof parsed?.sourceSessionId === "string" ? parsed.sourceSessionId : null,
      sourceMapId: typeof parsed?.sourceMapId === "string" ? parsed.sourceMapId : null,
      captureSource: parsed?.captureSource,
      processedAt: typeof parsed?.processedAt === "string" ? parsed.processedAt : null,
      processedIntoClaimId: typeof parsed?.processedIntoClaimId === "string" ? parsed.processedIntoClaimId : null,
      processedIntoMapId: typeof parsed?.processedIntoMapId === "string" ? parsed.processedIntoMapId : null,
      dismissed: Boolean(parsed?.dismissed),
      dismissedAt: typeof parsed?.dismissedAt === "string" ? parsed.dismissedAt : null,
      extractedStructureKind:
        typeof parsed?.extractedStructureKind === "string" ? parsed.extractedStructureKind : null,
      extractedDomain: typeof parsed?.extractedDomain === "string" ? parsed.extractedDomain : null,
      extractedConfidence:
        typeof parsed?.extractedConfidence === "number" && Number.isFinite(parsed.extractedConfidence)
          ? parsed.extractedConfidence
          : null,
      extractionConfidence:
        typeof parsed?.extractionConfidence === "number" && Number.isFinite(parsed.extractionConfidence)
          ? parsed.extractionConfidence
          : null,
    };
  } catch {
    return {
      currentStage: "dashboard",
      currentFocus: "",
      currentSphere: "work",
      currentContext: "",
      currentResponse: null,
      recentSessionMinutes: null,
      sourceSessionId: null,
      sourceMapId: null,
      captureSource: "web_shortcut",
      processedAt: null,
      processedIntoClaimId: null,
      processedIntoMapId: null,
      dismissed: false,
      dismissedAt: null,
      extractedStructureKind: null,
      extractedDomain: null,
      extractedConfidence: null,
      extractionConfidence: null,
    };
  }
}
