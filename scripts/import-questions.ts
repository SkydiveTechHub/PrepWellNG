/**
 * PrepWell NG — Bulk Question Import Script
 *
 * Question files live at data/questions/<department>/<subject>/<examType>-<year>.json,
 * where <department> is the subject's trackCategory from the seed
 * (core | science | arts | commercial | vocational).
 *
 * Usage:
 *   npx tsx scripts/import-questions.ts <file.json | folder>
 *   npx tsx scripts/import-questions.ts data/questions/science/physics/waec-2023.json
 *   npx tsx scripts/import-questions.ts data/questions/science   (one department)
 *   npx tsx scripts/import-questions.ts data/questions           (everything, recursive)
 *
 * The JSON file should contain an array of questions matching this format:
 * [
 *   {
 *     "subjectCode": "PHY",           // Required — subject code from seed
 *     "topicSlug": "measurement",     // Optional — links to a topic
 *     "examType": "WAEC",             // WAEC | JAMB | NECO | CUSTOM
 *     "examYear": 2023,               // Optional
 *     "questionNumber": 1,            // Optional
 *     "questionText": "What is ...?", // Required
 *     "questionType": "OBJECTIVE",    // OBJECTIVE | THEORY | FILL_IN_BLANK
 *     "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
 *     "correctAnswer": "B",           // Required
 *     "explanation": "Because ...",    // Required
 *     "difficulty": "INTERMEDIATE",   // BASIC | INTERMEDIATE | ADVANCED
 *     "marks": 1,                     // Default: 1
 *     "timeEstimateSeconds": 90       // Default: 90
 *   }
 * ]
 */

import { PrismaClient, Prisma } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

interface QuestionInput {
  subjectCode: string;
  topicSlug?: string;
  examType: "WAEC" | "JAMB" | "NECO" | "CUSTOM";
  examYear?: number;
  questionNumber?: number;
  questionText: string;
  questionImageUrl?: string;
  questionType?: "OBJECTIVE" | "THEORY" | "FILL_IN_BLANK";
  options?: Record<string, string>;
  correctAnswer: string;
  explanation: string;
  explanationImageUrl?: string;
  difficulty?: "BASIC" | "INTERMEDIATE" | "ADVANCED";
  marks?: number;
  timeEstimateSeconds?: number;
}

async function importFile(filePath: string) {
  const absolutePath = path.resolve(filePath);
  console.log(`\n📄 Importing: ${absolutePath}`);

  const raw = fs.readFileSync(absolutePath, "utf-8");
  let questions: QuestionInput[];

  try {
    questions = JSON.parse(raw);
    if (!Array.isArray(questions)) {
      console.error("   ❌ File must contain a JSON array of questions");
      return { imported: 0, skipped: 0, errors: 0 };
    }
  } catch {
    console.error(`   ❌ Invalid JSON in ${filePath}`);
    return { imported: 0, skipped: 0, errors: 0 };
  }

  console.log(`   Found ${questions.length} questions`);

  // Build lookup maps
  const subjectCodes = [...new Set(questions.map((q) => q.subjectCode.toUpperCase()))];
  const subjects = await prisma.subject.findMany({
    where: { code: { in: subjectCodes } },
    select: { id: true, code: true, name: true },
  });
  const subjectMap = new Map(subjects.map((s) => [s.code.toUpperCase(), s]));

  const topicSlugs = [...new Set(questions.filter((q) => q.topicSlug).map((q) => q.topicSlug!))];
  const topics = topicSlugs.length > 0
    ? await prisma.topic.findMany({
        where: { slug: { in: topicSlugs } },
        select: { id: true, slug: true, subjectId: true },
      })
    : [];
  const topicMap = new Map(topics.map((t) => [t.slug, t]));

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    // Resolve subject
    const subject = subjectMap.get(q.subjectCode.toUpperCase());
    if (!subject) {
      console.error(`   ❌ [${i + 1}] Unknown subject code: "${q.subjectCode}"`);
      errors++;
      continue;
    }

    // Resolve topic
    let topicId: string | null = null;
    if (q.topicSlug) {
      const topic = topicMap.get(q.topicSlug);
      if (!topic) {
        console.warn(`   ⚠️  [${i + 1}] Unknown topic slug: "${q.topicSlug}" — importing without topic link`);
      } else if (topic.subjectId !== subject.id) {
        console.warn(`   ⚠️  [${i + 1}] Topic "${q.topicSlug}" doesn't belong to ${subject.name} — importing without topic link`);
      } else {
        topicId = topic.id;
      }
    }

    // Check duplicate
    const existing = await prisma.question.findFirst({
      where: {
        subjectId: subject.id,
        examType: q.examType,
        examYear: q.examYear || null,
        questionText: q.questionText,
      },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    // Insert
    try {
      await prisma.question.create({
        data: {
          subjectId: subject.id,
          topicId,
          examType: q.examType,
          examYear: q.examYear || null,
          questionNumber: q.questionNumber || null,
          questionText: q.questionText,
          questionImageUrl: q.questionImageUrl || null,
          questionType: q.questionType || "OBJECTIVE",
          options: q.options ?? Prisma.JsonNull,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          explanationImageUrl: q.explanationImageUrl || null,
          difficulty: q.difficulty || "INTERMEDIATE",
          marks: q.marks || 1,
          timeEstimateSeconds: q.timeEstimateSeconds || 90,
        },
      });
      imported++;
    } catch (err) {
      console.error(`   ❌ [${i + 1}] DB error: ${err instanceof Error ? err.message : err}`);
      errors++;
    }
  }

  console.log(`   ✅ ${imported} imported, ${skipped} duplicates skipped, ${errors} errors`);
  return { imported, skipped, errors };
}

/** Every .json file under `dir`, at any depth, in stable alphabetical order. */
function findJsonFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findJsonFiles(full));
    else if (entry.name.endsWith(".json")) found.push(full);
  }

  return found;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Usage: npx tsx scripts/import-questions.ts <file.json | folder>");
    console.log("");
    console.log("Examples:");
    console.log("  npx tsx scripts/import-questions.ts data/questions/waec-physics-2023.json");
    console.log("  npx tsx scripts/import-questions.ts data/questions/");
    process.exit(1);
  }

  const target = path.resolve(args[0]);
  const stats = fs.statSync(target);
  const files: string[] = [];

  if (stats.isDirectory()) {
    // Recursive: questions are filed under data/questions/<department>/<subject>/,
    // so a flat readdir of the root would find nothing.
    files.push(...findJsonFiles(target));
    if (files.length === 0) {
      console.log("No .json files found in", target);
      process.exit(1);
    }
    console.log(`Found ${files.length} JSON files under ${target}`);
  } else {
    files.push(target);
  }

  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const file of files) {
    const result = await importFile(file);
    totalImported += result.imported;
    totalSkipped += result.skipped;
    totalErrors += result.errors;
  }

  console.log("\n════════════════════════════════════════");
  console.log(`Total: ${totalImported} imported, ${totalSkipped} skipped, ${totalErrors} errors`);
  console.log("════════════════════════════════════════\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
