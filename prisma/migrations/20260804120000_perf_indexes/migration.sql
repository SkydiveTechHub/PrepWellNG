-- Indexes matched to the query shapes introduced by the performance pass.
--
-- CONCURRENTLY is deliberately not used: Prisma runs migrations inside a
-- transaction, which forbids it. These tables are small enough today that the
-- brief lock is acceptable; revisit if the question bank grows past a few
-- million rows.

-- Quiz generation always filters subjectId + questionType together.
CREATE INDEX IF NOT EXISTS "Question_subjectId_questionType_idx" ON "Question"("subjectId", "questionType");
CREATE INDEX IF NOT EXISTS "Question_subjectId_questionType_examType_idx" ON "Question"("subjectId", "questionType", "examType");

-- Dashboard, performance and streaks read completed attempts newest-first.
CREATE INDEX IF NOT EXISTS "AssessmentAttempt_studentId_status_completedAt_idx" ON "AssessmentAttempt"("studentId", "status", "completedAt");

-- The "already seen" subquery probes by questionId before joining the attempt.
CREATE INDEX IF NOT EXISTS "QuestionResponse_questionId_idx" ON "QuestionResponse"("questionId");

-- The performance page groups wrong answers by subject and topic.
CREATE INDEX IF NOT EXISTS "QuestionResponse_isCorrect_idx" ON "QuestionResponse"("isCorrect");
