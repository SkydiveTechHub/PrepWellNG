// Standalone type definitions mirroring the Prisma schema.
// These allow the project to compile without running `prisma generate`.
// Once `npx prisma generate` runs, you can optionally switch imports
// to "@prisma/client" — but these are compatible either way.

// ─── Enums ────────────────────────────────────────────────

export type Role = "STUDENT" | "TEACHER" | "ADMIN";
export type ClassLevel = "SS1" | "SS2" | "SS3";
export type Track = "SCIENCE" | "ARTS" | "COMMERCIAL";
export type Term = "FIRST" | "SECOND" | "THIRD";
export type ExamType = "WAEC" | "JAMB" | "NECO" | "CUSTOM";
export type QuestionType = "OBJECTIVE" | "THEORY" | "FILL_IN_BLANK";
export type Difficulty = "BASIC" | "INTERMEDIATE" | "ADVANCED";
export type AssessmentType =
  | "TOPIC_QUIZ"
  | "SUBJECT_TEST"
  | "PAST_PAPER"
  | "MOCK_EXAM"
  | "CBT_PRACTICE"
  | "CUSTOM";
export type ProgressStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export type AttemptStatus = "IN_PROGRESS" | "COMPLETED" | "ABANDONED" | "TIMED_OUT";
export type PlanItemActivity =
  | "LESSON"
  | "PRACTICE"
  | "REVISION"
  | "MOCK_EXAM"
  | "PAST_QUESTIONS";
export type PlanItemStatus = "PENDING" | "COMPLETED" | "SKIPPED";
export type TrackCategory = "CORE" | "SCIENCE" | "ARTS" | "COMMERCIAL" | "VOCATIONAL";
export type SchoolType = "PUBLIC" | "PRIVATE";
export type MasteryLevel = "WEAK" | "DEVELOPING" | "COMPETENT" | "STRONG";
export type EdgeKind = "PREREQUISITE" | "STRONG_RELATED" | "RELATED";
export type LearningEventKind =
  | "QUESTION_ANSWERED"
  | "QUIZ_ABANDONED"
  | "LESSON_BLOCK_COMPLETED"
  | "LESSON_COMPLETED"
  | "CARD_REVIEWED"
  | "PRETEST_PASSED";

// ─── Models ───────────────────────────────────────────────

export type Subject = {
  id: string;
  name: string;
  slug: string;
  code: string;
  description: string;
  iconUrl: string | null;
  isWaec: boolean;
  isJamb: boolean;
  isNeco: boolean;
  trackCategory: TrackCategory;
  createdAt: Date;
};

export type CurriculumLevel = {
  id: string;
  subjectId: string;
  classLevel: ClassLevel;
  term: Term;
  description: string | null;
};

export type Topic = {
  id: string;
  subjectId: string;
  curriculumLevelId: string;
  title: string;
  slug: string;
  description: string | null;
  orderIndex: number;
  estimatedMinutes: number;
  prerequisiteTopicId: string | null;
  waecWeight: number;
  jambWeight: number;
};

export type TopicEdge = {
  id: string;
  prereqTopicId: string;
  topicId: string;
  kind: EdgeKind;
  strength: number;
  rationale: string | null;
};

export type Subtopic = {
  id: string;
  topicId: string;
  title: string;
  description: string | null;
  orderIndex: number;
};

export type Lesson = {
  id: string;
  subtopicId: string;
  title: string;
  content: string;
  summary: string | null;
  keyPoints: unknown;
  workedExamples: unknown;
  difficulty: Difficulty;
  estimatedMinutes: number;
  createdBy: string | null;
  blocks: unknown;
  examTips: unknown;
  mnemonics: unknown;
  knowledgeChecks: unknown;
  prerequisites: unknown;
  passMarkPercent: number;
  practiceCount: number;
  revisionDays: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type Question = {
  id: string;
  subjectId: string;
  topicId: string | null;
  examType: ExamType;
  examYear: number | null;
  questionNumber: number | null;
  questionText: string;
  questionImageUrl: string | null;
  questionType: QuestionType;
  options: unknown;
  correctAnswer: string;
  explanation: string;
  explanationImageUrl: string | null;
  difficulty: Difficulty;
  marks: number;
  timeEstimateSeconds: number;
  createdAt: Date;
};

export type Assessment = {
  id: string;
  title: string;
  description: string | null;
  assessmentType: AssessmentType;
  subjectId: string | null;
  examType: ExamType | null;
  examYear: number | null;
  timeLimitMinutes: number | null;
  totalMarks: number;
  passMarkPercent: number;
  createdBy: string | null;
  createdAt: Date;
};

export type AssessmentAttempt = {
  id: string;
  studentId: string;
  assessmentId: string;
  startedAt: Date;
  completedAt: Date | null;
  timeSpentSeconds: number | null;
  score: number | null;
  totalMarks: number | null;
  percentage: number | null;
  grade: string | null;
  status: AttemptStatus;
};

export type StudentProgress = {
  id: string;
  studentId: string;
  subjectId: string;
  topicId: string | null;
  lessonId: string | null;
  status: ProgressStatus;
  completionPercent: number;
  timeSpentMinutes: number;
  lastAccessedAt: Date | null;
  checkpointData: unknown;
  masteryScore: number | null;
  revisionDueAt: Date | null;
};

export type PerformanceMetric = {
  id: string;
  studentId: string;
  subjectId: string;
  topicId: string | null;
  masteryLevel: MasteryLevel;
  lastUpdated: Date;
};

export type LearningEvent = {
  seq: bigint;
  studentId: string;
  subjectId: string;
  topicId: string | null;
  kind: LearningEventKind;
  correct: boolean | null;
  score: number | null;
  difficulty: Difficulty | null;
  seconds: number | null;
  sourceId: string | null;
  occurredAt: Date;
};

export type TopicMastery = {
  studentId: string;
  subjectId: string;
  topicId: string;
  accWeightedOutcome: number;
  accWeightedMass: number;
  lessonWeightedOutcome: number;
  lessonWeightedMass: number;
  srsWeightedOutcome: number;
  srsWeightedMass: number;
  accObservations: number;
  lessonObservations: number;
  srsObservations: number;
  decayAnchor: Date;
  cursorSeq: bigint;
  lastEffortAt: Date | null;
  scoringVersion: number;
  updatedAt: Date;
};
