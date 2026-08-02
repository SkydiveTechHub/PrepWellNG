-- Lesson Engine Phase 1
-- Adds structured lesson blocks + student checkpoint state.
-- See docs/superpowers/specs/2026-08-01-lesson-engine-design.md

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "blocks" JSONB,
ADD COLUMN     "examTips" JSONB,
ADD COLUMN     "knowledgeChecks" JSONB,
ADD COLUMN     "mnemonics" JSONB,
ADD COLUMN     "passMarkPercent" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "practiceCount" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "prerequisites" JSONB,
ADD COLUMN     "revisionDays" JSONB;

-- AlterTable
ALTER TABLE "StudentProgress" ADD COLUMN     "checkpointData" JSONB,
ADD COLUMN     "masteryScore" DOUBLE PRECISION,
ADD COLUMN     "revisionDueAt" TIMESTAMP(3);
