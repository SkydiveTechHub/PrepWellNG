import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMockExamBoardCoverage } from "@/lib/mock-exam-availability";
import { assessBoards, type BoardStatus } from "@/lib/board-availability";

export const dynamic = "force-dynamic";

const BOARDS = ["WAEC", "JAMB", "NECO"] as const;

// GET /api/assessments/mock-exam/boards
// Which boards can be sat, and why not for the ones that can't. The picker
// needs this before a board is chosen, so it cannot come from the per-board
// options route.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const coverage = await getMockExamBoardCoverage();

    // Every board is named in the response, including ones the query returned
    // nothing for — a board absent from the payload would render as missing
    // rather than as not ready yet.
    const boards: Record<string, BoardStatus> = assessBoards(
      "MOCK_EXAM",
      Object.fromEntries(BOARDS.map((b) => [b, coverage[b] ?? []])),
    );

    return NextResponse.json({ boards });
  } catch (error) {
    console.error("Error loading mock exam boards:", error);
    return NextResponse.json(
      {
        error: "Failed to load exams",
        ...(process.env.NODE_ENV === "development" && {
          detail: error instanceof Error ? error.message : String(error),
          code: (error as { code?: string }).code ?? null,
        }),
      },
      { status: 500 },
    );
  }
}
