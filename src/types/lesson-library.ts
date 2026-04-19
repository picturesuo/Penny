export type LessonType =
  | "calibration"
  | "reasoning_pattern"
  | "evidence_evaluation"
  | "decision_making"
  | "bias_recognition"
  | "timing"
  | "domain_specific";

export type LessonSourceType = "post_mortem" | "concession" | "resolution" | "counterfactual" | "manual";

export type LessonApplicationEvent = {
  lessonId: string;
  appliedInContext: string;
  appliedAt: Date;
  wasUseful: boolean | null;
  userNote: string | null;
};

export type Lesson = {
  id: string;
  userId: string;
  lessonText: string;
  lessonType: LessonType;
  domain: string | null;
  claimType: string | null;
  sourceType: LessonSourceType;
  sourceId: string;
  tags: string[];
  confidenceInLesson: number;
  hasBeenApplied: boolean;
  applicationCount: number;
  applicationEvents: LessonApplicationEvent[];
  createdAt: Date;
  lastSurfacedAt: Date | null;
  userEditedText: string | null;
};

export type LessonSearchIndex = {
  tokenizedLessons: Map<string, string[]>;
  domainIndex: Map<string, string[]>;
  typeIndex: Map<string, string[]>;
};

export type LessonLibrary = {
  userId: string;
  totalLessons: number;
  appliedLessons: number;
  mostAppliedLesson: Lesson | null;
  mostRecentLesson: Lesson | null;
  lessonsByType: Map<string, Lesson[]>;
  lessonsByDomain: Map<string, Lesson[]>;
  lessons: Lesson[];
  searchIndex: LessonSearchIndex;
  generatedAt: Date;
};
