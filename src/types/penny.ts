export const SESSION_STAGES = [
  "intake",
  "clarify",
  "assumptions",
  "pressure-test",
  "evidence",
  "prioritize",
  "brief",
] as const;

export type SessionStage = (typeof SESSION_STAGES)[number];

export type ConversationRole = "assistant" | "user" | "system";

export type ConversationKind =
  | "question"
  | "challenge"
  | "answer"
  | "brief"
  | "system";

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  kind: ConversationKind;
  content: string;
  createdAt: string;
}

export interface StructuredPoint {
  point: string;
  whyItMatters?: string;
}

export interface ConfidenceMap {
  targetUser: number;
  problem: number;
  solution: number;
}

export interface ExtractedStructure {
  ideaSummary: string;
  targetUser: string;
  problem: string;
  solution: string;
  assumptions: string[];
  risks: string[];
  unknowns: string[];
  confidence: ConfidenceMap;
}

export interface NextQuestionResult {
  question: string;
  reason: string;
  stage: SessionStage;
}

export interface PressureTestResult {
  weakestAssumption: string;
  challenge: string;
  followUpType: "defend" | "narrow" | "test";
  followUp: string;
}

export interface EvidenceScanResult {
  supports: StructuredPoint[];
  contradictions: StructuredPoint[];
  marketPatterns: StructuredPoint[];
  confidenceNote: string;
}

export interface SessionState {
  id: string;
  userId: string;
  title: string;
  rawIdea: string;
  category?: string | null;
  status: string;
  currentStage: SessionStage;
  questionBudget: number;
  clarityScore: number;
  extractedProblem?: string | null;
  extractedCustomer?: string | null;
  extractedSolution?: string | null;
  ideaSummary?: string | null;
  targetUser?: string | null;
  problem?: string | null;
  solution?: string | null;
  assumptions: string[];
  resolvedAssumptions: string[];
  risks: string[];
  unknowns: string[];
  evidenceFor: StructuredPoint[];
  evidenceAgainst: StructuredPoint[];
  marketPatterns: StructuredPoint[];
  questionsAsked: string[];
  answers: string[];
  conversation: ConversationMessage[];
  conceptBrief?: string | null;
  logicOnlyMode: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionCardModel {
  id: string;
  title: string;
  currentStage: SessionStage;
  status: string;
  clarityScore: number;
  createdAt: Date;
  updatedAt: Date;
  rawIdea: string;
  targetUser?: string | null;
  problem?: string | null;
}
