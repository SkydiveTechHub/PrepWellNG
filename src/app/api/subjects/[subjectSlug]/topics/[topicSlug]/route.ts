import { NextRequest, NextResponse } from "next/server";
import { resolveTopicRef } from "@/lib/lesson-progress";

export const dynamic = "force-dynamic";

// GET /api/subjects/[subjectSlug]/topics/[topicSlug]
// Resolves a topic (and its subject) so client components can generate quizzes.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ subjectSlug: string; topicSlug: string }> }
) {
  try {
    const { subjectSlug, topicSlug } = await params;

    const ref = await resolveTopicRef(subjectSlug, topicSlug);
    if (ref === "subject-not-found") {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }
    if (ref === "topic-not-found") {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    return NextResponse.json(ref);
  } catch (error) {
    console.error("Error fetching topic:", error);
    return NextResponse.json(
      { error: "Failed to fetch topic" },
      { status: 500 }
    );
  }
}
