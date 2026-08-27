import { db } from "@/lib/db";
import { getGrade } from "@/lib/utils";
import { jambBand, scoreJambPaper } from "@/lib/jamb-cbt";

// The results payload has one shape, built one way. Submitting an attempt and
// re-opening it later previously ran two hand-maintained copies of this mapping.

export type TopicBreakdownRow = {
  topicId: string;
  topicTitle: string;
  correct: number;
  total: number;
  accuracy: number;
  status: "strong" | "competent" | "developing" | "weak";
};

/**
 * `Question.options` is a Json column, so Prisma types it as `JsonValue`. Every
 * row the importer writes is a `{ "A": "…", "B": "…" }` map; anything else is
 * treated as an unrenderable question rather than trusted.
 */
function asOptions(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => typeof v === "string",
  ) as [string, string][];
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function statusFor(accuracy: number): TopicBreakdownRow["status"] {
  if (accuracy >= 80) return "strong";
  if (accuracy >= 60) return "competent";
  if (accuracy >= 40) return "developing";
  return "weak";
}

/**
 * Full result payload for a completed attempt, or `null` when the attempt does
 * not exist or belongs to someone else.
 */
export async function buildAttemptResult(attemptId: string, studentId: string) {
  const attempt = await db.assessmentAttempt.findFirst({
    where: { id: attemptId, studentId },
    select: {
      id: true,
      score: true,
      totalMarks: true,
      percentage: true,
      timeSpentSeconds: true,
      awayEvents: true,
      assessment: {
        select: { title: true, assessmentType: true, examYear: true },
      },
      responses: {
        select: {
          questionId: true,
          selectedAnswer: true,
          isCorrect: true,
          timeSpentSeconds: true,
          question: {
            select: {
              subjectId: true,
              subject: { select: { code: true, name: true } },
              questionText: true,
              questionImageUrl: true,
              options: true,
              correctAnswer: true,
              explanation: true,
              explanationImageUrl: true,
              difficulty: true,
              topic: { select: { id: true, title: true } },
            },
          },
        },
      },
    },
  });

  if (!attempt) return null;

  const results = attempt.responses.map((r) => ({
    questionId: r.questionId,
    questionText: r.question.questionText,
    questionImageUrl: r.question.questionImageUrl,
    options: asOptions(r.question.options),
    selectedAnswer: r.selectedAnswer,
    correctAnswer: r.question.correctAnswer,
    isCorrect: r.isCorrect ?? false,
    explanation: r.question.explanation,
    explanationImageUrl: r.question.explanationImageUrl,
    topic: r.question.topic?.id ?? null,
    difficulty: r.question.difficulty,
    timeSpentSeconds: r.timeSpentSeconds ?? 0,
  }));

  const topicScores = new Map<
    string,
    { correct: number; total: number; title: string }
  >();
  for (const r of attempt.responses) {
    const topic = r.question.topic;
    if (!topic) continue;
    const entry = topicScores.get(topic.id) ?? {
      correct: 0,
      total: 0,
      title: topic.title,
    };
    entry.total += 1;
    if (r.isCorrect) entry.correct += 1;
    topicScores.set(topic.id, entry);
  }

  const topicBreakdown: TopicBreakdownRow[] = [...topicScores.entries()].map(
    ([topicId, data]) => {
      const accuracy = data.total > 0 ? (data.correct / data.total) * 100 : 0;
      return {
        topicId,
        topicTitle: data.title,
        correct: data.correct,
        total: data.total,
        accuracy,
        status: statusFor(accuracy),
      };
    },
  );

  const percentage = attempt.percentage ?? 0;
  const gradeInfo = getGrade(percentage);

  // A JAMB CBT paper is reported per subject out of 100, summing to 400 —
  // that is the number a candidate actually recognises, not a percentage.
  const isJambCbt = attempt.assessment.assessmentType === "CBT_PRACTICE";
  const jamb = isJambCbt
    ? scoreJambPaper(
        attempt.responses.map((r) => ({
          subjectId: r.question.subjectId,
          subjectCode: r.question.subject?.code ?? "",
          subjectName: r.question.subject?.name ?? "Unknown",
          isCorrect: r.isCorrect ?? false,
        })),
      )
    : null;

  return {
    attemptId: attempt.id,
    assessmentTitle: attempt.assessment.title,
    assessmentType: attempt.assessment.assessmentType,
    examYear: attempt.assessment.examYear,
    /** Present only for JAMB CBT papers. */
    jamb: jamb
      ? { ...jamb, band: jambBand(jamb.score) }
      : null,
    score: attempt.score ?? 0,
    totalMarks: attempt.totalMarks ?? 0,
    percentage: Math.round(percentage * 10) / 10,
    grade: gradeInfo.grade,
    gradeRemark: gradeInfo.remark,
    isCredit: gradeInfo.isCredit,
    timeSpentSeconds: attempt.timeSpentSeconds ?? 0,
    awayEvents: attempt.awayEvents,
    totalQuestions: results.length,
    correctCount: results.filter((r) => r.isCorrect).length,
    results,
    topicBreakdown,
  };
}
