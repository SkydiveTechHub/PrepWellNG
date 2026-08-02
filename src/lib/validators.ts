import { z } from "zod";

// ─── Auth ─────────────────────────────────────────

export const registerSchema = z.object({
  firstName: z.string().min(2, "First name is required"),
  lastName: z.string().min(2, "Last name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  classLevel: z.enum(["SS1", "SS2", "SS3"]),
  track: z.enum(["SCIENCE", "ARTS", "COMMERCIAL"]),
  state: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const phoneOtpSchema = z.object({
  phone: z.string().regex(/^(\+234|0)[789]\d{9}$/, "Invalid Nigerian phone number"),
});

export const verifyOtpSchema = z.object({
  phone: z.string(),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

// ─── Account settings ─────────────────────────────

// Every field is optional: the profile and academic sections save separately and
// each sends only the fields it owns. An absent key means "leave unchanged";
// an empty string means "clear this".
//
// Email is deliberately absent — it is the identity the credentials provider
// authenticates against, so changing it needs a re-verification flow.
export const updateProfileSchema = z.object({
  firstName: z.string().min(2, "First name is required").optional(),
  lastName: z.string().min(2, "Last name is required").optional(),
  phone: z
    .union([
      z.string().regex(/^(\+234|0)[789]\d{9}$/, "Invalid Nigerian phone number"),
      z.literal(""),
    ])
    .optional(),
  state: z.string().optional(),
  classLevel: z.enum(["SS1", "SS2", "SS3"]).optional(),
  track: z.enum(["SCIENCE", "ARTS", "COMMERCIAL"]).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

// ─── Assessment ───────────────────────────────────

export const generateQuizSchema = z.object({
  subjectId: z.string(),
  topicIds: z.array(z.string()).optional(),
  count: z.number().int().min(5).max(60).default(10),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "ADVANCED"]).optional(),
  examType: z.enum(["WAEC", "JAMB", "NECO", "CUSTOM"]).optional(),
  title: z.string().min(1).optional(),
});

export const submitAssessmentSchema = z.object({
  attemptId: z.string(),
  answers: z.array(
    z.object({
      questionId: z.string(),
      selectedAnswer: z.string().nullable(),
      timeSpentSeconds: z.number().int().min(0),
      flaggedForReview: z.boolean().optional(),
    })
  ),
});

export const mockExamSchema = z.object({
  examType: z.enum(["WAEC", "JAMB", "NECO"]),
  subjectId: z.string().optional(), // For WAEC/NECO single subject
  jambSubjectIds: z.array(z.string()).length(3).optional(), // For JAMB (3 + English)
});

// ─── Questions (Admin) ────────────────────────────

export const createQuestionSchema = z.object({
  subjectId: z.string(),
  topicId: z.string().optional(),
  examType: z.enum(["WAEC", "JAMB", "NECO", "CUSTOM"]),
  examYear: z.number().int().min(1990).max(2030).optional(),
  questionNumber: z.number().int().optional(),
  questionText: z.string().min(10),
  questionImageUrl: z.string().url().optional(),
  questionType: z.enum(["OBJECTIVE", "THEORY", "FILL_IN_BLANK"]).default("OBJECTIVE"),
  options: z
    .record(z.string(), z.string())
    .refine((opts) => Object.keys(opts).length >= 4, "At least 4 options required")
    .optional(),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(10),
  explanationImageUrl: z.string().url().optional(),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "ADVANCED"]).default("INTERMEDIATE"),
  marks: z.number().int().min(1).default(1),
  timeEstimateSeconds: z.number().int().min(10).default(90),
});

// ─── Bulk Import (Admin) ─────────────────────────

export const bulkImportQuestionSchema = z.object({
  subjectCode: z.string().min(2),
  topicSlug: z.string().optional(),
  examType: z.enum(["WAEC", "JAMB", "NECO", "CUSTOM"]),
  examYear: z.number().int().min(1990).max(2030).optional(),
  questionNumber: z.number().int().optional(),
  questionText: z.string().min(5),
  questionImageUrl: z.string().url().optional(),
  questionType: z.enum(["OBJECTIVE", "THEORY", "FILL_IN_BLANK"]).default("OBJECTIVE"),
  options: z
    .record(z.string(), z.string())
    .refine((opts) => Object.keys(opts).length >= 4, "At least 4 options required")
    .optional(),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(5),
  explanationImageUrl: z.string().url().optional(),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "ADVANCED"]).default("INTERMEDIATE"),
  marks: z.number().int().min(1).default(1),
  timeEstimateSeconds: z.number().int().min(10).default(90),
});

export const bulkImportSchema = z.object({
  questions: z.array(bulkImportQuestionSchema).min(1).max(500),
  skipDuplicates: z.boolean().default(true),
});

// ─── Study Plan ───────────────────────────────────

export const generateStudyPlanSchema = z.object({
  targetExam: z.enum(["WAEC", "JAMB", "NECO"]),
  targetDate: z.string().datetime(),
  subjectIds: z.array(z.string()).min(1),
  dailyStudyHours: z.number().min(0.5).max(12).default(2),
});

// ─── Progress ─────────────────────────────────────

export const updateProgressSchema = z.object({
  subjectId: z.string(),
  topicId: z.string().optional(),
  lessonId: z.string().optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]),
  timeSpentMinutes: z.number().int().min(0).optional(),
});

// ─── Lesson Engine progress ───────────────────────────

export const updateLessonProgressSchema = z.object({
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).optional(),
  completionPercent: z.number().min(0).max(100).optional(),
  checkpointData: z
    .object({
      visited: z.array(z.string()).optional(),
      checks: z
        .record(
          z.string(),
          z.object({
            attempts: z.number().int().min(1),
            correct: z.boolean(),
          }),
        )
        .optional(),
      practice: z
        .array(
          z.object({
            attemptId: z.string().min(1),
            percentage: z.number().min(0).max(100),
            passed: z.boolean(),
            at: z.string().datetime(),
          }),
        )
        .optional(),
    })
    .optional(),
  masteryScore: z.number().min(0).max(100).optional(),
  timeSpentMinutes: z.number().int().min(0).optional(),
});

// ─── Flashcards ────────────────────────────────────

export const submitFlashcardReviewSchema = z.object({
  flashcardId: z.string(),
  rating: z.enum(["AGAIN", "HARD", "GOOD", "EASY"]),
  responseTimeMs: z.number().int().min(0).max(600_000).optional(),
  /** Objective outcome for graded card types (fill-in-the-blank / true-false). */
  objectiveCorrect: z.boolean().nullable().optional(),
});

export const generateFlashcardDeckSchema = z.object({
  lessonId: z.string(),
});

export const toggleEnrollmentSchema = z.object({
  enrolled: z.boolean(),
});

export const createFlashcardDeckSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  subjectId: z.string().optional(),
  topicId: z.string().optional(),
});

// Type exports
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GenerateQuizInput = z.infer<typeof generateQuizSchema>;
export type SubmitAssessmentInput = z.infer<typeof submitAssessmentSchema>;
export type MockExamInput = z.infer<typeof mockExamSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type GenerateStudyPlanInput = z.infer<typeof generateStudyPlanSchema>;
export type BulkImportQuestionInput = z.infer<typeof bulkImportQuestionSchema>;
export type BulkImportInput = z.infer<typeof bulkImportSchema>;
export type SubmitFlashcardReviewInput = z.infer<typeof submitFlashcardReviewSchema>;
export type GenerateFlashcardDeckInput = z.infer<typeof generateFlashcardDeckSchema>;
export type ToggleEnrollmentInput = z.infer<typeof toggleEnrollmentSchema>;
export type CreateFlashcardDeckInput = z.infer<typeof createFlashcardDeckSchema>;
