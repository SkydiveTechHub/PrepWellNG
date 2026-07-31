// Analytics and performance tracking types

export type MasteryStatus = "weak" | "developing" | "competent" | "strong";

// Per-subject performance overview
export type SubjectPerformance = {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  accuracy: number;
  questionsAttempted: number;
  topicsCovered: number;
  totalTopics: number;
  coveragePercent: number;
  predictedGrade: string;
  predictedGradeRemark: string;
  isAtRisk: boolean;
  masteryLevel: MasteryStatus;
  trend: "improving" | "stable" | "declining";
};

// Per-topic performance
export type TopicPerformance = {
  topicId: string;
  topicTitle: string;
  subjectName: string;
  accuracy: number;
  questionsAttempted: number;
  averageTimePerQuestion: number;
  masteryLevel: MasteryStatus;
  examWeight: number;
  urgencyScore: number;
  recommendation: string;
};

// Student dashboard overview
export type DashboardStats = {
  totalQuestionsAttempted: number;
  overallAccuracy: number;
  studyStreak: number;
  subjectsRegistered: number;
  subjectPerformances: SubjectPerformance[];
  weakTopics: TopicPerformance[];
  recentActivity: RecentActivity[];
  examReadiness: ExamReadiness[];
};

// Recent student activity
export type RecentActivity = {
  type: "quiz" | "past_paper" | "mock_exam" | "lesson";
  title: string;
  subjectName: string;
  score?: number;
  percentage?: number;
  grade?: string;
  timestamp: Date;
};

// Exam readiness per target exam
export type ExamReadiness = {
  examType: "WAEC" | "JAMB" | "NECO";
  readinessPercent: number;
  topicsAtCompetent: number;
  totalTopics: number;
  predictedScore?: number; // For JAMB: predicted 0-400
  daysUntilExam: number | null;
  status: "not_ready" | "preparing" | "almost_ready" | "ready";
};

// Grade prediction result
export type GradePrediction = {
  grade: string;
  remark: string;
  predictedPercentage: number;
  confidence: number; // 0-100
  isCredit: boolean;
  risk: string | null;
};

// Performance trend data point (for charts)
export type TrendDataPoint = {
  date: string;
  accuracy: number;
  questionsAttempted: number;
  subjectId?: string;
};
