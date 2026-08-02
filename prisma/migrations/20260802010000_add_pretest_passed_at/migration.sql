-- Learning Path Engine — Phase 6
-- Readiness pretest self-certification: marks a topic pretest-passed (≥80% on
-- 5 questions) so a student can skip lessons they demonstrably know.
-- See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md

-- AlterTable
ALTER TABLE "PerformanceMetric" ADD COLUMN     "pretestPassedAt" TIMESTAMP(3);
