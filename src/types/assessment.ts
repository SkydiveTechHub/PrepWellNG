import type { Question } from "./prisma";

// Question with options parsed
export type QuestionDisplay = Omit<Question, "options"> & {
  options: Record<string, string>; // { "A": "...", "B": "...", "C": "...", "D": "..." }
};

// Student's answer for a single question
export type AnswerSubmission = {
  questionId: string;
  selectedAnswer: string | null;
  timeSpentSeconds: number;
  flaggedForReview?: boolean;
};

// Full assessment submission
export type AssessmentSubmission = {
  attemptId: string;
  answers: AnswerSubmission[];
};

// Result for a single question after grading
export type QuestionResult = {
  questionId: string;
  questionText: string;
  selectedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
  timeSpentSeconds: number;
  topic?: string;
};

// Full assessment result after grading
export type AssessmentResult = {
  attemptId: string;
  assessmentTitle: string;
  assessmentType: string;
  score: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  gradeRemark: string;
  timeSpentSeconds: number;
  results: QuestionResult[];
  topicBreakdown: TopicBreakdown[];
};

// Performance breakdown by topic within an assessment
export type TopicBreakdown = {
  topicId: string;
  topicTitle: string;
  correct: number;
  total: number;
  accuracy: number;
  status: "strong" | "competent" | "developing" | "weak";
};

// Past paper metadata
export type PastPaper = {
  examType: "WAEC" | "JAMB" | "NECO";
  examYear: number;
  subjectName: string;
  subjectSlug: string;
  questionCount: number;
};

// CBT session state (for JAMB simulator)
export type CBTState = {
  attemptId: string;
  subjects: {
    subjectId: string;
    subjectName: string;
    questions: QuestionDisplay[];
    answeredCount: number;
    flaggedCount: number;
  }[];
  currentSubjectIndex: number;
  currentQuestionIndex: number;
  answers: Map<string, string>;
  flagged: Set<string>;
  startedAt: Date;
  timeRemainingSeconds: number;
};
