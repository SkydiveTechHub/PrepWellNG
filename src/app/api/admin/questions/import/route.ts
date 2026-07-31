import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { bulkImportSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

// POST /api/admin/questions/import — bulk import questions
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subjectMap = new Map<string, SubjectRef>(
      subjects.map((s: any) => [s.code.toUpperCase(), s as SubjectRef])
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      topicMap = new Map<string, TopicRef>(
        topics.map((t: any) => [t.slug, { id: t.id, subjectId: t.subjectId }])
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
        if (topic.subjectId !== subject.id) {
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
