import { db } from "./db";
import { lagosDayKey } from "./streak";
import { addDays, dateToDayKey, dayKeyToDate } from "@/engines/planner/days";
import {
  pickItemToComplete,
  signalForAssessment,
  type CompletionSignal,
} from "@/engines/planner/completion";
import { CARRY_OVER_DAYS } from "@/engines/planner/replan";

// Marks study plan sessions done from real learning activity. Best-effort: a
// failure here is logged and never fails the lesson, quiz or review itself.

export async function completePlanItemFor(studentId: string, signal: CompletionSignal): Promise<void> {
  try {
    const today = lagosDayKey(new Date());
    const items = await db.studyPlanItem.findMany({
      where: {
        status: "PENDING",
        studyPlan: { studentId, isActive: true },
        scheduledDate: { gte: dayKeyToDate(addDays(today, -CARRY_OVER_DAYS)), lte: dayKeyToDate(today) },
      },
      select: { id: true, scheduledDate: true, subjectId: true, topicId: true, activityType: true, status: true },
    });
    const id = pickItemToComplete(
      items.map((row) => ({ ...row, date: dateToDayKey(row.scheduledDate) })),
      signal,
      today,
    );
    if (!id) return;
    // Compare-and-set on PENDING so a manual tick racing this is never overwritten.
    await db.studyPlanItem.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "COMPLETED", completionSource: "AUTO", completedAt: new Date() },
    });
  } catch (error) {
    console.error("Study plan auto-completion failed:", error);
  }
}

export async function markPlanFromAttempt(
  studentId: string,
  attemptId: string,
  practiceExit: boolean,
): Promise<void> {
  try {
    const attempt = await db.assessmentAttempt.findFirst({
      where: { id: attemptId, studentId, status: "COMPLETED" },
      select: {
        assessment: {
          select: {
            assessmentType: true,
            subjectId: true,
            questions: { select: { question: { select: { topicId: true } } } },
          },
        },
      },
    });
    if (!attempt) return;
    const topicIds = [
      ...new Set(
        attempt.assessment.questions
          .map((q) => q.question.topicId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const signal = signalForAssessment({
      assessmentType: attempt.assessment.assessmentType,
      subjectId: attempt.assessment.subjectId,
      topicIds,
      practiceExit,
    });
    if (signal) await completePlanItemFor(studentId, signal);
  } catch (error) {
    console.error("Study plan attempt completion failed:", error);
  }
}

export async function markPlanFromLesson(
  studentId: string,
  subjectSlug: string,
  topicSlug: string,
): Promise<void> {
  try {
    const topic = await db.topic.findFirst({
      where: { slug: topicSlug, subject: { slug: subjectSlug } },
      select: { id: true },
    });
    if (topic) await completePlanItemFor(studentId, { kind: "LESSON_COMPLETED", topicId: topic.id });
  } catch (error) {
    console.error("Study plan lesson completion failed:", error);
  }
}

export async function markPlanFromCardReview(studentId: string, flashcardId: string): Promise<void> {
  try {
    const card = await db.flashcard.findUnique({
      where: { id: flashcardId },
      select: {
        deck: {
          select: {
            topicId: true,
            lesson: { select: { subtopic: { select: { topicId: true } } } },
          },
        },
      },
    });
    const topicId = card?.deck.topicId ?? card?.deck.lesson?.subtopic?.topicId ?? null;
    if (topicId) await completePlanItemFor(studentId, { kind: "CARD_REVIEWED", topicId });
  } catch (error) {
    console.error("Study plan card completion failed:", error);
  }
}
