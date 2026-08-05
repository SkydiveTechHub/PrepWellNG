// One-off: apply the perf index migration through the pooler, because
// DIRECT_URL currently points at pgbouncer and `prisma migrate` hangs on it.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();
const sql = readFileSync(
  "prisma/migrations/20260804120000_perf_indexes/migration.sql",
  "utf8",
);

const statements = sql
  .split("\n")
  .filter((line) => line.trim().startsWith("CREATE INDEX"))
  .map((line) => line.trim().replace(/;$/, ""));

for (const statement of statements) {
  const name = statement.match(/"([^"]+)"/)?.[1] ?? statement.slice(0, 40);
  const t0 = Date.now();
  await prisma.$executeRawUnsafe(statement);
  console.log(`ok  ${name}  (${Date.now() - t0}ms)`);
}

const rows = await prisma.$queryRaw<{ indexname: string }[]>`
  SELECT indexname FROM pg_indexes
  WHERE schemaname = 'public'
    AND (indexname LIKE 'Question_subjectId_questionType%'
      OR indexname LIKE 'AssessmentAttempt_studentId_status_completedAt%'
      OR indexname LIKE 'QuestionResponse_questionId%'
      OR indexname LIKE 'QuestionResponse_isCorrect%')
  ORDER BY indexname
`;
console.log("\nindexes now present:");
for (const r of rows) console.log(" -", r.indexname);
await prisma.$disconnect();
