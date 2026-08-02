-- Learning Path Engine — Phase 1
-- Adds the knowledge-graph edge table, the edge-kind enum, and the composite
-- mastery/retention fields on PerformanceMetric.
-- See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md

-- CreateEnum
CREATE TYPE "EdgeKind" AS ENUM ('PREREQUISITE', 'STRONG_RELATED', 'RELATED');

-- CreateTable
CREATE TABLE "TopicEdge" (
    "id" TEXT NOT NULL,
    "prereqTopicId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "kind" "EdgeKind" NOT NULL DEFAULT 'PREREQUISITE',
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rationale" TEXT,

    CONSTRAINT "TopicEdge_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "PerformanceMetric" ADD COLUMN     "masteryScore" DOUBLE PRECISION,
ADD COLUMN     "lastStudiedAt" TIMESTAMP(3),
ADD COLUMN     "revisionDueAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "TopicEdge_prereqTopicId_topicId_key" ON "TopicEdge"("prereqTopicId", "topicId");

-- CreateIndex
CREATE INDEX "TopicEdge_topicId_idx" ON "TopicEdge"("topicId");

-- AddForeignKey
ALTER TABLE "TopicEdge" ADD CONSTRAINT "TopicEdge_prereqTopicId_fkey" FOREIGN KEY ("prereqTopicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicEdge" ADD CONSTRAINT "TopicEdge_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
