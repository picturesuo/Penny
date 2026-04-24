import type { EvidenceScanResult, SessionState } from "@/types/penny";

export interface ContextProvider {
  getEvidence(session: SessionState): Promise<EvidenceScanResult>;
}
