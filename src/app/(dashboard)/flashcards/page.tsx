import Link from "next/link";
import { redirect } from "next/navigation";
import {
  LuArrowRight,
  LuChartColumn,
  LuSparkles,
} from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDeckSummaries, getFlashcardRecommendations } from "@/lib/flashcard-analytics";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { DeckList } from "@/components/flashcards/deck-list";
import { Recommendations } from "@/components/flashcards/recommendations";
import { GenerateDeckForm } from "@/components/flashcards/generate-deck-form";

export const dynamic = "force-dynamic";

export default async function FlashcardsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [decks, recommendations, completedLessons] = await Promise.all([
    getDeckSummaries(db, session.user.id),
    getFlashcardRecommendations(db, session.user.id),
    db.studentProgress.findMany({
      where: { studentId: session.user.id, status: "COMPLETED", lessonId: { not: null } },
      select: { lesson: { select: { id: true, title: true } } },
      orderBy: { lastAccessedAt: "desc" },
      take: 12,
    }),
  ]);

  const totalDue = decks.reduce((sum, d) => sum + d.due, 0);
  const totalFresh = decks.reduce((sum, d) => sum + d.fresh, 0);
  const bestDeck =
    decks.length > 0
      ? decks.reduce((a, b) => (b.due > a.due ? b : a))
      : null;

  const lessons = completedLessons
    .map((p) => p.lesson)
    .filter((l): l is { id: string; title: string } => l !== null)
    .map((l) => ({ lessonId: l.id, title: l.title }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Flashcards"
        description="Spaced repetition that adapts to your memory. Review a little every day and the curve stays flat."
        action={
          <Link href="/flashcards/stats" className={buttonClass("outline", "md")}>
            <LuChartColumn className="h-4 w-4" />
            Statistics
          </Link>
        }
      />

      {/* Due hero */}
      {decks.length > 0 ? (
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-blue-600 to-brand p-6 shadow-lift md:p-8">
          <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10" />
          <div className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-white/10" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-xl">
              <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">
                {totalDue > 0
                  ? `${totalDue} card${totalDue === 1 ? "" : "s"} due now`
                  : totalFresh > 0
                    ? `${totalFresh} new card${totalFresh === 1 ? "" : "s"} ready`
                    : "All caught up"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-blue-100">
                {totalDue > 0
                  ? "Your memory is at its weakest for these — a few minutes today re-cements them."
                  : totalFresh > 0
                    ? "Fresh cards are ready to learn. They start easy and stick fast."
                    : "Nothing due. Turn a finished lesson into cards to keep the momentum."}
              </p>
              {bestDeck && (totalDue > 0 || totalFresh > 0) && (
                <Link
                  href={`/flashcards/${bestDeck.id}`}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-primary shadow-soft transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <LuSparkles className="h-4 w-4" />
                  Start studying
                  <LuArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
            {totalDue > 0 && (
              <div className="rounded-2xl bg-white/10 px-6 py-4 text-center backdrop-blur">
                <p className="text-3xl font-bold text-white">{totalDue}</p>
                <p className="mt-0.5 text-xs font-medium text-blue-100">
                  due across {decks.filter((d) => d.due > 0).length} deck
                  {decks.filter((d) => d.due > 0).length === 1 ? "" : "s"}
                </p>
              </div>
            )}
          </div>
        </section>
      ) : (
        <EmptyState
          icon={<LuSparkles className="h-6 w-6" />}
          title="No decks yet"
          description="Build cards from a completed lesson below, or seed some decks to start reviewing."
        />
      )}

      {/* Recommendations */}
      <section>
        <h2 className="section-label mb-3">Recommended for you</h2>
        <Recommendations recommendations={recommendations} />
      </section>

      {/* Decks */}
      <section>
        <h2 className="section-label mb-3">Your decks</h2>
        {decks.length > 0 ? (
          <DeckList decks={decks} />
        ) : (
          <p className="text-sm text-muted">No decks yet.</p>
        )}
      </section>

      {/* Generate from lesson */}
      <section className="card p-5 md:p-6">
        <div className="mb-4">
          <h2 className="text-sm font-bold text-foreground">
            Build cards from a lesson
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Pick a lesson you finished and turn its concepts, examples and
            mistakes into a deck automatically.
          </p>
        </div>
        <GenerateDeckForm lessons={lessons} />
      </section>
    </div>
  );
}
