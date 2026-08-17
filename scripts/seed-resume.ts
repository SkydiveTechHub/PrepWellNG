import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { SUBJECT_TOPICS, buildCurriculum, seedCurriculum } from "../prisma/seed";
import { seedLessons } from "../src/lib/lessons";

// Resumable seed for flaky connections.
//
// `prisma db seed` opens one connection and replays the whole seed from the
// top. Against a pooled/unstable database it can drop mid-run, and because the
// work is always replayed in the same order the tail (later subjects, then
// lessons) may never be reached no matter how often it is re-run.
//
// This runner does the same work in small units, each on its own short-lived
// connection, and skips whatever is already present. Safe to run repeatedly.
//
//   npx tsx scripts/seed-resume.ts
//   npx tsx scripts/seed-resume.ts --lessons-only

for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const LESSON_BATCH = 25;
const MAX_ATTEMPTS = 8;

/**
 * True for "the database went away" errors. These arrive in two shapes:
 * PrismaClientKnownRequestError with code P1001/P1017, and
 * PrismaClientInitializationError, which carries `errorCode: undefined` and so
 * has to be matched on its name/message instead.
 */
function isConnectionError(error: unknown): boolean {
  const e = error as { code?: string; errorCode?: string; name?: string; message?: string };
  if (e.code === "P1001" || e.code === "P1017") return true;
  if (e.errorCode === "P1001" || e.errorCode === "P1017") return true;
  if (e.name === "PrismaClientInitializationError") return true;
  const message = e.message ?? "";
  return (
    message.includes("Can't reach database server") ||
    message.includes("Server has closed the connection")
  );
}

/** Run `fn` against a fresh client, retrying with backoff on connection loss. */
async function withClient<T>(label: string, fn: (p: PrismaClient) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const prisma = new PrismaClient();
    try {
      return await fn(prisma);
    } catch (error) {
      lastError = error;
      if (!isConnectionError(error)) throw error;
      const backoff = 5000 * attempt;
      const reason = (error as { code?: string }).code ?? "unreachable";
      console.warn(`  ⟳ ${label}: ${reason} on attempt ${attempt}/${MAX_ATTEMPTS}, retrying in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  }
  throw lastError;
}

async function seedMissingSubjects() {
  const pending = await withClient("scan", async (p) => {
    const subjects = await p.subject.findMany({
      select: { code: true, _count: { select: { topics: true } } },
    });
    const empty = new Set(subjects.filter((s) => s._count.topics === 0).map((s) => s.code));
    return Object.keys(SUBJECT_TOPICS).filter((code) => empty.has(code));
  });

  if (pending.length === 0) {
    console.log("All subjects already have topics — nothing to seed.");
    return;
  }
  console.log(`${pending.length} subject(s) without topics: ${pending.join(" ")}\n`);

  for (const code of pending) {
    await withClient(code, (p) =>
      seedCurriculum(p, code, buildCurriculum(code, SUBJECT_TOPICS[code])),
    );
  }
}

async function seedMissingLessons() {
  const pending = await withClient("scan-topics", (p) =>
    p.topic.findMany({ where: { subtopics: { none: {} } }, select: { id: true } }),
  );

  if (pending.length === 0) {
    console.log("\nEvery topic already has a lesson — nothing to seed.");
    return;
  }
  console.log(`\n${pending.length} topic(s) without a lesson.`);

  for (let i = 0; i < pending.length; i += LESSON_BATCH) {
    const batch = pending.slice(i, i + LESSON_BATCH).map((t) => t.id);
    const upTo = Math.min(i + LESSON_BATCH, pending.length);
    console.log(`  lessons ${i + 1}–${upTo} of ${pending.length}`);
    await withClient(`lessons ${i + 1}-${upTo}`, (p) => seedLessons(p, { topicIds: batch }));
  }
}

async function main() {
  const lessonsOnly = process.argv.includes("--lessons-only");
  if (!lessonsOnly) await seedMissingSubjects();
  await seedMissingLessons();
  console.log("\n✅ Resume seed complete.");
}

main().catch((e) => {
  console.error("Resume seed failed:", e);
  process.exit(1);
});
