import { cache } from "react";
import { db } from "./db";
import { lagosDayKey } from "./streak";
import { examBannerFor, type ExamBanner } from "@/engines/planner/exam-banner";

export type { ExamBanner };

/**
 * The student's live exam countdown, or null when no active plan is counting
 * down to a sitting.
 *
 * Request-cached: the sidebar and the mobile drawer both ask for this, and a
 * second round trip to the pooler for an answer we already have is the one
 * thing the dashboard layout cannot afford.
 */
export const activeExamBanner = cache(async function activeExamBanner({
  userId,
  classLevel,
  now = new Date(),
}: {
  userId: string;
  classLevel?: string | null;
  now?: Date;
}): Promise<ExamBanner | null> {
  const plan = await db.studyPlan.findFirst({
    where: { studentId: userId, isActive: true },
    select: { targetExam: true, targetDate: true },
  });

  return examBannerFor({ plan, classLevel, today: lagosDayKey(now) });
});
