/**
 * PrepWell NG — Learning Ledger Backfill
 *
 * The Learning Evidence Layer (see
 * docs/superpowers/specs/2026-08-11-learning-evidence-layer-design.md) reads
 * per-subject counts and topic mastery from the `LearningEvent` ledger, but
 * the ledger only started being written the day that layer shipped —
 * `assessment-submit.ts` emits a `QUESTION_ANSWERED` event per graded answer
 * going forward, but every `QuestionResponse` row that predates that change
 * has no corresponding ledger row. This script replays that history in.
 *
 * IMPORTANT — occurredAt:
 * `QuestionResponse` carries no timestamp of its own (no createdAt column on
 * that model). The closest fact we have is the attempt it belongs to, so
 * every response's `occurredAt` is stamped with `attempt.completedAt` (or
 * `attempt.startedAt` as a fallback for the rare row where `completedAt` is
 * somehow null on a COMPLETED attempt). This is coarser than a per-response
 * timestamp — all of one attempt's answers land on the same instant — but it
 * is real history, not `now()`. The scoring layer applies a 45-day half-life
 * decay (see src/engines/learning/fold.ts), so stamping backfilled rows with
 * the current time would make years-old answers outweigh recent ones and
 * badly corrupt every mastery figure downstream. Do not "fix" this by
 * defaulting to `now()`.
 *
 * Idempotency & resumability:
 * The script walks students in id-ordered batches (a cursor, not an offset,
 * so concurrent inserts elsewhere can't shift the window). For each student
 * it first checks whether *any* `QUESTION_ANSWERED` LearningEvent already
 * exists for them; if so, the whole student is skipped — this is what makes
 * a second run over the same database a no-op, including a run that was
 * interrupted partway through the previous one. Because the check is
 * per-student and students are processed one at a time, a crash mid-run
 * loses at most the in-flight student's batch, and re-running the script
 * picks up exactly where it left off without re-reading or re-checking
 * anyone already done.
 *
 * After writing a student's events, `TopicMastery.cursorSeq` is reset to 0
 * for every topic row that student already has a TopicMastery cache for, so
 * the next read replays the full ledger (including the newly-inserted
 * historical events) instead of trusting a cache that predates them.
 *
 * Usage:
 *   npx tsx scripts/backfill-learning-events.ts                  # dry run (default)
 *   npx tsx scripts/backfill-learning-events.ts --write           # actually write
 *   npx tsx scripts/backfill-learning-events.ts --write --batch-size=25
 *   npx tsx scripts/backfill-learning-events.ts --student=<id>    # limit to one student
 *
 * DO NOT RUN THIS SCRIPT (dry-run or otherwise) without confirming the
 * database is reachable and it is safe to do so — see the fix plan, Task 7.
 */

import { PrismaClient } from "@prisma/client";
import type { Difficulty } from "@/types/prisma";

const prisma = new PrismaClient();

const DEFAULT_BATCH_SIZE = 50;

type Args = {
  write: boolean;
  batchSize: number;
  studentId: string | null;
};

function parseArgs(argv: readonly string[]): Args {
  let write = false;
  let batchSize = DEFAULT_BATCH_SIZE;
  let studentId: string | null = null;

  for (const arg of argv) {
    if (arg === "--write") {
      write = true;
    } else if (arg.startsWith("--batch-size=")) {
      const value = Number(arg.slice("--batch-size=".length));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid --batch-size: ${arg}`);
      }
      batchSize = value;
    } else if (arg.startsWith("--student=")) {
      studentId = arg.slice("--student=".length);
    } else if (arg === "--dry-run") {
      // Explicit no-op: dry-run is already the default. Accepted so callers
      // can be explicit without the script complaining about an unknown flag.
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { write, batchSize, studentId };
}

type StudentTotals = {
  studentId: string;
  events: number;
  bySubject: Map<string, number>;
};

function printStudentTotals(totals: StudentTotals): void {
  console.log(`  student ${totals.studentId}: ${totals.events} event(s)`);
  for (const [subjectId, count] of totals.bySubject) {
    console.log(`    subject ${subjectId}: ${count}`);
  }
}

/**
 * Replays one student's answered-question history into the ledger.
 * Returns null if the student already has QUESTION_ANSWERED events (already
 * backfilled, or has been answering questions since the ledger went live —
 * either way there is nothing to do).
 */
async function backfillStudent(
  studentId: string,
  write: boolean,
): Promise<StudentTotals | null> {
  const alreadyLedgered = await prisma.learningEvent.findFirst({
    where: { studentId, kind: "QUESTION_ANSWERED" },
    select: { seq: true },
  });
  if (alreadyLedgered) return null;

  const responses = await prisma.questionResponse.findMany({
    where: {
      attempt: { studentId, status: "COMPLETED" },
    },
    select: {
      questionId: true,
      isCorrect: true,
      timeSpentSeconds: true,
      attempt: {
        select: {
          startedAt: true,
          completedAt: true,
        },
      },
      question: {
        select: {
          subjectId: true,
          topicId: true,
          difficulty: true,
        },
      },
    },
  });

  if (responses.length === 0) return null;

  const totals: StudentTotals = { studentId, events: 0, bySubject: new Map() };

  const eventsData = responses.map((response) => {
    const occurredAt = response.attempt.completedAt ?? response.attempt.startedAt;

    totals.events += 1;
    totals.bySubject.set(
      response.question.subjectId,
      (totals.bySubject.get(response.question.subjectId) ?? 0) + 1,
    );

    return {
      studentId,
      subjectId: response.question.subjectId,
      topicId: response.question.topicId,
      kind: "QUESTION_ANSWERED" as const,
      correct: response.isCorrect,
      difficulty: response.question.difficulty as Difficulty,
      seconds: response.timeSpentSeconds,
      sourceId: response.questionId,
      occurredAt,
    };
  });

  if (write) {
    await prisma.$transaction(async (tx) => {
      await tx.learningEvent.createMany({ data: eventsData });
      await tx.topicMastery.updateMany({
        where: { studentId },
        data: { cursorSeq: BigInt(0) },
      });
    });
  }

  return totals;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log(
    args.write
      ? "Running LIVE — this will write LearningEvent rows and reset TopicMastery.cursorSeq."
      : "Running in DRY-RUN mode — no writes. Pass --write to apply.",
  );
  console.log(`Batch size: ${args.batchSize}`);
  if (args.studentId) console.log(`Limited to student: ${args.studentId}`);
  console.log("");

  let studentsScanned = 0;
  let studentsBackfilled = 0;
  let studentsSkipped = 0;
  let totalEvents = 0;
  const totalsBySubject = new Map<string, number>();

  let cursor: string | null = null;

  for (;;) {
    const students: { id: string }[] = await prisma.user.findMany({
      where: {
        role: "STUDENT",
        ...(args.studentId ? { id: args.studentId } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: args.batchSize,
      select: { id: true },
    });

    if (students.length === 0) break;

    for (const student of students) {
      studentsScanned += 1;
      const result = await backfillStudent(student.id, args.write);
      if (result === null) {
        studentsSkipped += 1;
        continue;
      }

      studentsBackfilled += 1;
      totalEvents += result.events;
      for (const [subjectId, count] of result.bySubject) {
        totalsBySubject.set(subjectId, (totalsBySubject.get(subjectId) ?? 0) + count);
      }
      printStudentTotals(result);
    }

    cursor = students[students.length - 1].id;
    if (args.studentId) break; // single-student mode never paginates further
  }

  console.log("");
  console.log("════════════════════════════════════════");
  console.log(`Students scanned:     ${studentsScanned}`);
  console.log(`Students backfilled:  ${studentsBackfilled}`);
  console.log(`Students skipped:     ${studentsSkipped} (already ledgered or no completed responses)`);
  console.log(`Events ${args.write ? "written" : "that would be written"}: ${totalEvents}`);
  console.log("By subject:");
  for (const [subjectId, count] of totalsBySubject) {
    console.log(`  ${subjectId}: ${count}`);
  }
  console.log("════════════════════════════════════════");
  if (!args.write) {
    console.log("\nDry run only — no rows were written. Re-run with --write to apply.");
  }
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
