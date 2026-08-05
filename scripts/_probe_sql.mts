import { PrismaClient } from "@prisma/client";
import {
  pickRandomQuestionIds,
  pickQuestionsPreferringUnseen,
} from "../src/lib/question-pool";

const prisma = new PrismaClient();

const seed = await prisma.question.findFirst({
  where: { questionType: "OBJECTIVE" },
  select: { subjectId: true, examType: true, topicId: true },
});
if (!seed) {
  console.log("NO QUESTIONS IN DB — cannot probe");
  process.exit(0);
}
const { subjectId, examType, topicId } = seed;
console.log("probing subject", subjectId, "examType", examType);

const cases: [string, Parameters<typeof pickRandomQuestionIds>[1]][] = [
  ["subject only", { subjectId }],
  ["examType", { subjectId, examType }],
  ["difficulty", { subjectId, difficulty: "INTERMEDIATE" }],
  ["seen-exclusion", { subjectId, excludeSeenByStudentId: "no-such-student" }],
];
if (topicId) cases.push(["topicIds", { subjectId, topicIds: [topicId] }]);

for (const [label, filter] of cases) {
  const t0 = Date.now();
  const ids = await pickRandomQuestionIds(prisma, filter, 10);
  console.log(`ok  ${label.padEnd(16)} -> ${ids.length} ids (${Date.now() - t0}ms)`);
}

const a = await pickRandomQuestionIds(prisma, { subjectId }, 10);
const b = await pickRandomQuestionIds(prisma, { subjectId }, 10);
console.log("randomised across calls:", JSON.stringify(a) !== JSON.stringify(b));

const student = await prisma.user.findFirst({ select: { id: true } });
if (student) {
  const picked = await pickQuestionsPreferringUnseen(
    prisma,
    { subjectId },
    10,
    student.id,
  );
  console.log(
    `preferring-unseen -> ${picked.length} ids, unique: ${new Set(picked).size === picked.length}`,
  );
}

// The performance page's grouped weak-topic query.
if (student) {
  const t0 = Date.now();
  const rows = await prisma.$queryRaw<{ wrongCount: number }[]>`
    SELECT s.id AS "subjectId", s.name AS "subjectName", s.slug AS "subjectSlug",
           s.code AS "subjectCode", t.title AS "topicTitle", t.slug AS "topicSlug",
           COUNT(*)::int AS "wrongCount"
    FROM "QuestionResponse" qr
    JOIN "AssessmentAttempt" aa ON aa.id = qr."attemptId"
    JOIN "Question" q ON q.id = qr."questionId"
    JOIN "Subject" s ON s.id = q."subjectId"
    JOIN "Topic" t ON t.id = q."topicId"
    WHERE aa."studentId" = ${student.id} AND qr."isCorrect" = false
    GROUP BY s.id, s.name, s.slug, s.code, t.id, t.title, t.slug
    ORDER BY "wrongCount" DESC
  `;
  console.log(`weak-topics query ok -> ${rows.length} rows (${Date.now() - t0}ms)`);
}

console.log("\nALL SQL VERIFIED AGAINST LIVE DB");
await prisma.$disconnect();
