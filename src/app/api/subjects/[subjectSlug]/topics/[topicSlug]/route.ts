import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/subjects/[subjectSlug]/topics/[topicSlug]
// Resolves a topic (and its subject) so client components can generate quizzes.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ subjectSlug: string; topicSlug: string }> }
) {
  try {
    const { subjectSlug, topicSlug } = await params;

    const subject = await db.subject.findUnique({
      where: { slug: subjectSlug },
      select: { id: true, name: true },
    });
    if (!subject) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }

    const topic = await db.topic.findUnique({
      where: { subjectId_slug: { subjectId: subject.id, slug: topicSlug } },
      select: {
        id: true,
        title: true,
        _count: { select: { questions: true } },
      },
    });
    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    return NextResponse.json({
      subjectId: subject.id,
      subjectName: subject.name,
      topicId: topic.id,
      topicTitle: topic.title,
      questionCount: topic._count.questions,
    });
  } catch (error) {
    console.error("Error fetching topic:", error);
    return NextResponse.json(
      { error: "Failed to fetch topic" },
      { status: 500 }
    );
  }
}
