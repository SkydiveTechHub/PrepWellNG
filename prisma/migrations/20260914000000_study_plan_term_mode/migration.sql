-- AlterEnum
ALTER TYPE "PlanItemStatus" ADD VALUE 'MISSED';

-- CreateEnum
CREATE TYPE "PlanCompletionSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "AcademicTerm" (
    "id" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "term" "Term" NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicTerm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicTerm_session_term_key" ON "AcademicTerm"("session", "term");

-- CreateTable
CREATE TABLE "StudyPlanPosition" (
    "id" TEXT NOT NULL,
    "studyPlanId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyPlanPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudyPlanPosition_studyPlanId_subjectId_key" ON "StudyPlanPosition"("studyPlanId", "subjectId");

-- AddForeignKey
ALTER TABLE "StudyPlanPosition" ADD CONSTRAINT "StudyPlanPosition_studyPlanId_fkey" FOREIGN KEY ("studyPlanId") REFERENCES "StudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlanPosition" ADD CONSTRAINT "StudyPlanPosition_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlanPosition" ADD CONSTRAINT "StudyPlanPosition_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "StudyPlan" ALTER COLUMN "targetExam" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StudyPlan" ALTER COLUMN "targetDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StudyPlan" ADD COLUMN "forceExamMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "studyDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7]::INTEGER[],
ADD COLUMN "weekdayMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN "weekendMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN "plannedThrough" DATE,
ADD COLUMN "lastReplannedAt" TIMESTAMP(3),
ADD COLUMN "outline" JSONB,
ADD COLUMN "overload" JSONB;

-- Data migration: carry the old daily hours over as both budgets.
UPDATE "StudyPlan" SET "weekdayMinutes" = LEAST(480, ROUND("dailyStudyHours" * 60)::INTEGER), "weekendMinutes" = LEAST(600, ROUND("dailyStudyHours" * 60)::INTEGER);

-- AlterTable
ALTER TABLE "StudyPlan" DROP COLUMN "dailyStudyHours";

-- AlterTable
ALTER TABLE "StudyPlanItem" ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "completionSource" "PlanCompletionSource",
ADD COLUMN "carriedFromDate" DATE;

-- CreateIndex
CREATE INDEX "StudyPlanItem_studyPlanId_scheduledDate_status_idx" ON "StudyPlanItem"("studyPlanId", "scheduledDate", "status");
