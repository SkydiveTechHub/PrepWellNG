import { z } from "zod";

import { checkQuestionInvariants } from "@/lib/admin-question";

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

// The client may address a subject/topic by slug, so starting a quiz is one
// request instead of "list all subjects, find the slug, then generate".
export const generateQuizSchema = z
  .object({
    subjectId: z.string().optional(),
    subjectSlug: z.string().optional(),
    topicIds: z.array(z.string()).optional(),
    topicSlug: z.string().optional(),
    count: z.number().int().min(5).max(60).default(10),
    difficulty: z.enum(["BASIC", "INTERMEDIATE", "ADVANCED"]).optional(),
    examType: z.enum(["WAEC", "JAMB", "NECO", "CUSTOM"]).optional(),
    title: z.string().min(1).optional(),
    /** Short low-stakes checks, e.g. the classroom topic quiz — no deadline is set. */
    untimed: z.boolean().optional(),
  })
  .refine((data) => Boolean(data.subjectId || data.subjectSlug), {
    message: "Provide either subjectId or subjectSlug",
    path: ["subjectId"],
  });

export const submitAssessmentSchema = z.object({
  attemptId: z.string(),
  answers: z
    .array(
      z.object({
        questionId: z.string(),
        selectedAnswer: z.string().nullable(),
        timeSpentSeconds: z.number().int().min(0).max(86_400),
        flaggedForReview: z.boolean().optional(),
      })
    )
    .max(200)
    // A repeated questionId would inflate totalMarks and collide with the
    // (attemptId, questionId) unique index as a 500 instead of a 400.
    .refine(
      (answers) =>
        new Set(answers.map((a) => a.questionId)).size === answers.length,
      { message: "Duplicate questionId in answers" }
    ),
});

// JAMB CBT: English is added by the system, so only the other three are sent.
export const jambCbtSchema = z.object({
  subjectIds: z.array(z.string()).length(3),
  examYear: z.number().int().min(1978).max(2100),
});

// Syllabus-scoped mock exam: one subject, one board, and a contiguous run of
// class/term slots. A single term is the range where `from` equals `to`.
const scopePointSchema = z.object({
  classLevel: z.enum(["SS1", "SS2", "SS3"]),
  term: z.enum(["FIRST", "SECOND", "THIRD"]),
});

export const scopedMockExamSchema = z.object({
  examType: z.enum(["WAEC", "JAMB", "NECO"]),
  subjectId: z.string().min(1),
  from: scopePointSchema,
  to: scopePointSchema,
  count: z.number().int().min(5).max(80).default(40),
});

export const mockExamSchema = z.object({
  examType: z.enum(["WAEC", "JAMB", "NECO"]),
  subjectId: z.string().optional(), // For WAEC/NECO single subject
  jambSubjectIds: z.array(z.string()).length(3).optional(), // For JAMB (3 + English)
});

// ─── Questions (Admin) ────────────────────────────

// Id-based, unlike bulkImportQuestionSchema below, which is code/slug-based:
// the admin form works from populated selects, an import file from human-typed
// subject codes.
//
// The field list is declared once, as a plain shape object, and both the
// create and update schemas are built from it. zod 4 does not expose
// `.innerType()` on the value returned by `.superRefine(...)` (verified
// empirically — calling it throws "innerType is not a function"), so the
// create schema cannot be unwrapped back into an object schema for `.partial()`
// the way zod 3 code sometimes does. Sharing `adminQuestionShape` avoids that
// entirely and keeps the field list single-sourced.
//
// The four fields below carry a `.default(...)` on the CREATE side only —
// deliberately not baked into the shared shape. Empirically, zod 4's
// `.partial()` still applies a field's `.default()` when the key is absent
// (unlike the zod 3 behaviour the brief assumed), so an update schema built
// from a shape with defaults baked in would silently populate `{}` into a
// 4-key object and the "at least one field" refine below would never fire.
// Keeping the base constraint declared once in the shape and layering
// `.default(...)` on top only when assembling the create schema keeps the
// field list single-sourced while giving create and update the semantics
// each actually needs.
const adminQuestionShape = {
  subjectId: z.string().min(1, "Choose a subject."),
  topicId: z.string().min(1).nullish(),
  examType: z.enum(["WAEC", "JAMB", "NECO", "CUSTOM"]),
  examYear: z.number().int().min(1990).max(2030).nullish(),
  questionNumber: z.number().int().min(1).nullish(),
  questionText: z.string().min(5, "The question text is too short."),
  questionImageUrl: z.string().url().nullish(),
  questionType: z.enum(["OBJECTIVE", "THEORY", "FILL_IN_BLANK"]),
  options: z.record(z.string(), z.string()).nullish(),
  correctAnswer: z.string().min(1, "A correct answer is required."),
  explanation: z.string().min(5, "An explanation is required."),
  explanationImageUrl: z.string().url().nullish(),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "ADVANCED"]),
  marks: z.number().int().min(1),
  timeEstimateSeconds: z.number().int().min(10),
};

export const adminQuestionCreateSchema = z
  .object({
    ...adminQuestionShape,
    questionType: adminQuestionShape.questionType.default("OBJECTIVE"),
    difficulty: adminQuestionShape.difficulty.default("INTERMEDIATE"),
    marks: adminQuestionShape.marks.default(1),
    timeEstimateSeconds: adminQuestionShape.timeEstimateSeconds.default(90),
  })
  .superRefine((value, ctx) => {
    for (const issue of checkQuestionInvariants({
      questionType: value.questionType,
      options: value.options ?? null,
      correctAnswer: value.correctAnswer,
    })) {
      ctx.addIssue({
        code: "custom",
        path: [issue.field],
        message: issue.message,
      });
    }
  });

// The update path re-checks invariants inside the route rather than in the
// schema, because a partial update may change `options` without resending
// `correctAnswer`; the route merges the stored row with the patch before
// checking (Task 6).
export const adminQuestionUpdateSchema = z
  .object(adminQuestionShape)
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one field to update.",
  );

export const adminQuestionDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export type AdminQuestionCreateInput = z.infer<typeof adminQuestionCreateSchema>;
export type AdminQuestionUpdateInput = z.infer<typeof adminQuestionUpdateSchema>;

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

// ─── Lesson Import (Admin) ───────────────────────

export const MAX_LESSON_MARKDOWN_BYTES = 200_000;

export const adminLessonImportSchema = z.object({
  topicId: z.string().min(1, "A topic is required"),
  markdown: z
    .string()
    .min(1, "The file is empty")
    .max(MAX_LESSON_MARKDOWN_BYTES, "That file is too large to import"),
  confirm: z.literal(true),
});

export type AdminLessonImportInput = z.infer<typeof adminLessonImportSchema>;

// ─── Study Plan ───────────────────────────────────

export const generateStudyPlanSchema = z.object({
  targetExam: z.enum(["WAEC", "JAMB", "NECO"]),
  targetDate: z.string().datetime(),
  subjectIds: z.array(z.string()).min(1),
  dailyStudyHours: z.number().min(0.5).max(12).default(2),
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
export type GenerateStudyPlanInput = z.infer<typeof generateStudyPlanSchema>;
export type BulkImportQuestionInput = z.infer<typeof bulkImportQuestionSchema>;
export type BulkImportInput = z.infer<typeof bulkImportSchema>;
export type SubmitFlashcardReviewInput = z.infer<typeof submitFlashcardReviewSchema>;
export type GenerateFlashcardDeckInput = z.infer<typeof generateFlashcardDeckSchema>;
export type ToggleEnrollmentInput = z.infer<typeof toggleEnrollmentSchema>;
export type CreateFlashcardDeckInput = z.infer<typeof createFlashcardDeckSchema>;
