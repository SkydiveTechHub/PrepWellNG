-- Records how often a student left an exam, for context on the result.
--
-- Hand-applied through the Supabase SQL Editor, not `prisma migrate` —
-- DIRECT_URL does not resolve from the dev machine. IF NOT EXISTS so a retry
-- after a partial failure is safe.
ALTER TABLE "AssessmentAttempt"
  ADD COLUMN IF NOT EXISTS "awayEvents" INTEGER NOT NULL DEFAULT 0;
