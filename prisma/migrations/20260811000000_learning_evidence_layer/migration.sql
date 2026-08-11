-- CreateEnum
CREATE TYPE "LearningEventKind" AS ENUM ('QUESTION_ANSWERED', 'QUIZ_ABANDONED', 'LESSON_BLOCK_COMPLETED', 'LESSON_COMPLETED', 'CARD_REVIEWED', 'PRETEST_PASSED');

-- AlterTable
ALTER TABLE "PerformanceMetric" DROP COLUMN "lastStudiedAt",
DROP COLUMN "masteryScore",
DROP COLUMN "revisionDueAt";

-- CreateTable
CREATE TABLE "LearningEvent" (
    "seq" BIGSERIAL NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "topicId" TEXT,
    "kind" "LearningEventKind" NOT NULL,
    "correct" BOOLEAN,
    "score" DOUBLE PRECISION,
    "difficulty" "Difficulty",
    "seconds" INTEGER,
    "sourceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningEvent_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "TopicMastery" (
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "accWeightedOutcome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accWeightedMass" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lessonWeightedOutcome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lessonWeightedMass" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "srsWeightedOutcome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "srsWeightedMass" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "decayAnchor" TIMESTAMP(3) NOT NULL,
    "cursorSeq" BIGINT NOT NULL DEFAULT 0,
    "lastEffortAt" TIMESTAMP(3),
    "scoringVersion" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicMastery_pkey" PRIMARY KEY ("studentId","topicId")
);

-- CreateIndex
CREATE INDEX "LearningEvent_studentId_topicId_seq_idx" ON "LearningEvent"("studentId", "topicId", "seq");

-- CreateIndex
CREATE INDEX "LearningEvent_studentId_seq_idx" ON "LearningEvent"("studentId", "seq");

-- CreateIndex
CREATE INDEX "TopicMastery_studentId_subjectId_idx" ON "TopicMastery"("studentId", "subjectId");

-- AddForeignKey
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicMastery" ADD CONSTRAINT "TopicMastery_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicMastery" ADD CONSTRAINT "TopicMastery_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

