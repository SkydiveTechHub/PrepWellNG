import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { LuArrowLeft, LuLayers } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { getDeckPageData } from "@/lib/flashcards";
import { Badge } from "@/components/ui/badge";
import { StudySession } from "@/components/flashcards/study-session";
import { DeckCards } from "@/components/flashcards/deck-cards";
import { DeleteDeckButton } from "@/components/flashcards/delete-deck-button";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function DeckPage({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { deckId } = await params;

  const data = await getDeckPageData(session.user.id, deckId);
  if (!data) notFound();

  const { deck, cards, queue } = data;
  const fromLesson = deck.lessonId !== null;

  return (
    <div className="space-y-6">
      <Link
        href="/flashcards"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-foreground"
      >
        <LuArrowLeft className="h-4 w-4" />
        All decks
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            {deck.title}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            {deck.subjectName && <span>{deck.subjectName}</span>}
            {deck.topicTitle && (
              <>
                <span>·</span>
                <span>{deck.topicTitle}</span>
              </>
            )}
            <Badge variant="neutral">
              <LuLayers className="h-3 w-3" />
              {queue.length} in queue
            </Badge>
          </div>
        </div>
        <Link href="/flashcards/stats" className={buttonClass("ghost", "sm")}>
          View statistics
        </Link>
      </div>

      {deck.description && (
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          {deck.description}
        </p>
      )}

      {queue.length > 0 ? (
        <StudySession
          deckId={deck.id}
          deckTitle={deck.title}
          initialQueue={queue}
        />
      ) : (
        <EmptyState
          icon={<LuLayers className="h-6 w-6" />}
          title="Nothing to study in this deck"
          description="There are no cards in this deck yet, or you've already reviewed everything due today. Come back tomorrow, or study another deck."
          action={
            <Link href="/flashcards" className={buttonClass("primary", "md")}>
              Back to decks
            </Link>
          }
        />
      )}

      {/* Every card, not just today's queue — the only place a deck can be pruned. */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-label">
            All cards
            <span className="ml-2 font-normal text-muted">({cards.length})</span>
          </h2>
        </div>
        <DeckCards cards={cards} isOwner={deck.isOwner} fromLesson={fromLesson} />
      </section>

      {deck.isOwner && (
        <section className="border-t border-border pt-5">
          <DeleteDeckButton
            deckId={deck.id}
            deckTitle={deck.title}
            followerCount={deck.followerCount}
            fromLesson={fromLesson}
          />
        </section>
      )}
    </div>
  );
}
