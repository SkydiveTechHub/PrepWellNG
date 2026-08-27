import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { previewFlashcardDeckSchema } from "@/lib/validators";
import { previewDeckFromLesson } from "@/lib/flashcards";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET /api/flashcards/preview?lessonId=…
// What building this lesson's deck would do: type breakdown, the diff against
// any existing deck, and a few sample prompts. Writes nothing.
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parses a lesson's blocks and reads its whole card set on every call, and
    // it is trivially loopable from the client.
    const limit = rateLimit({
      key: `flashcard-preview:${session.user.id}`,
      limit: 40,
      windowSeconds: 60,
    });
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

    const parsed = previewFlashcardDeckSchema.safeParse({
      lessonId: req.nextUrl.searchParams.get("lessonId") ?? "",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const preview = await previewDeckFromLesson(parsed.data.lessonId);
    if (preview === "lesson-not-found") {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    return NextResponse.json(preview);
  } catch (error) {
    console.error("Error previewing flashcard deck:", error);
    return NextResponse.json(
      { error: "Failed to preview deck" },
      { status: 500 },
    );
  }
}
