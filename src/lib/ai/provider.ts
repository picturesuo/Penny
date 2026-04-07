import type {
  EvidenceScanResult,
  ExtractedStructure,
  NextQuestionResult,
  PressureTestResult,
  SessionState,
} from "@/types/penny";

export interface LlmProvider {
  extractStructure(session: SessionState): Promise<ExtractedStructure>;
  generateNextQuestion(session: SessionState): Promise<NextQuestionResult>;
  generatePressureTest(
    session: SessionState,
    evidence: EvidenceScanResult,
  ): Promise<PressureTestResult>;
  generateConceptBrief(
    session: SessionState,
    evidence: EvidenceScanResult,
  ): Promise<string>;
}
