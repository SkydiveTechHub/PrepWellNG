import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { recordAudit } from "@/lib/admin-audit";
import { bulkImportSchema } from "@/lib/validators";
import { checkTopicOwnership } from "@/lib/admin-question";
import { revalidateTag } from "next/cache";
import { CATALOGUE_TAG } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

// POST /api/admin/questions/import — bulk import questions
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const body = await req.json();
    const parsed = bulkImportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { questions, skipDuplicates } = parsed.data;

    // Resolve subject codes to IDs (batch lookup)
    type SubjectRef = { id: string; code: string; name: string };
    type TopicRef = { id: string; subjectId: string };

    const subjectCodes = [...new Set(questions.map((q) => q.subjectCode.toUpperCase()))];
    const subjects = await db.subject.findMany({
      where: { code: { in: subjectCodes } },
      select: { id: true, code: true, name: true },
    });
    const subjectMap = new Map<string, SubjectRef>(
      subjects.map((s) => [s.code.toUpperCase(), s])
    );
    // Resolve topic slugs to IDs (batch lookup)
    const topicSlugs = [
      ...new Set(questions.filter((q) => q.topicSlug).map((q) => q.topicSlug!)),
    ];
    let topicMap = new Map<string, TopicRef>();
    if (topicSlugs.length > 0) {
      const topics = await db.topic.findMany({
        where: { slug: { in: topicSlugs } },
        select: { id: true, slug: true, subjectId: true },
      });
      topicMap = new Map<string, TopicRef>(
        topics.map((t) => [t.slug, { id: t.id, subjectId: t.subjectId }])
      );
    }

    // Process questions
    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as Array<{ index: number; reason: string }>,
    };

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      // Resolve subject
      const subject = subjectMap.get(q.subjectCode.toUpperCase());
      if (!subject) {
        results.errors.push({
          index: i,
          reason: `Unknown subject code: "${q.subjectCode}". Valid codes: ${subjectCodes.join(", ")}`,
        });
        continue;
      }

      // Resolve topic (optional)
      let topicId: string | null = null;
      if (q.topicSlug) {
        const topic = topicMap.get(q.topicSlug);
        if (!topic) {
          results.errors.push({
            index: i,
            reason: `Unknown topic slug: "${q.topicSlug}" for subject "${subject.name}"`,
          });
          continue;
        }
        const ownership = checkTopicOwnership({
          topicRef: q.topicSlug,
          topicSubjectId: topic.subjectId,
          subjectId: subject.id,
        });
        if (ownership) {
          results.errors.push({
            index: i,
            reason: `Topic "${q.topicSlug}" does not belong to subject "${subject.name}"`,
          });
          continue;
        }
        topicId = topic.id;
      }

      // Check for duplicates (same subject + examType + examYear + questionText)
      if (skipDuplicates) {
        const existing = await db.question.findFirst({
          where: {
            subjectId: subject.id,
            examType: q.examType,
            examYear: q.examYear || null,
            questionText: q.questionText,
          },
          select: { id: true },
        });
        if (existing) {
          results.skipped++;
          continue;
        }
      }

      // Insert
      try {
        await db.question.create({
          data: {
            subjectId: subject.id,
            topicId,
            examType: q.examType,
            examYear: q.examYear || null,
            questionNumber: q.questionNumber || null,
            questionText: q.questionText,
            questionImageUrl: q.questionImageUrl || null,
            questionType: q.questionType,
            // `options` is a nullable Json column, and Prisma requires the
            // DbNull sentinel to write SQL NULL there — a bare `null` is a
            // type error.
            options: q.options || Prisma.DbNull,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            explanationImageUrl: q.explanationImageUrl || null,
            difficulty: q.difficulty,
            marks: q.marks,
            timeEstimateSeconds: q.timeEstimateSeconds,
          },
        });
        results.imported++;
      } catch (err) {
        results.errors.push({
          index: i,
          reason: `Database error: ${err instanceof Error ? err.message : "Unknown"}`,
        });
      }
    }

    await recordAudit({
      actorId: guard.actor.id,
      action: "question.import",
      entity: "Question",
      summary: `Imported ${results.imported}, skipped ${results.skipped}, ${results.errors.length} errors`,
    });

    // The subject catalogue caches per-subject question counts.
    if (results.imported > 0) revalidateTag(CATALOGUE_TAG, "max");

    return NextResponse.json({
      message: `Import complete: ${results.imported} imported, ${results.skipped} duplicates skipped, ${results.errors.length} errors`,
      ...results,
    });
  } catch (error) {
    console.error("Error importing questions:", error);
    return NextResponse.json(
      { error: "Failed to import questions" },
      { status: 500 }
    );
  }
}
