import Link from "next/link";
import { redirect } from "next/navigation";
import { LuArrowLeft } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFlashcardStats } from "@/lib/flashcard-analytics";
import { PageHeader } from "@/components/ui/page-header";
import { StatsDashboard } from "@/components/flashcards/stats-dashboard";

export const dynamic = "force-dynamic";

export default async function FlashcardsStatsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const stats = await getFlashcardStats(db, session.user.id);

  return (
    <div>
      <PageHeader
        title="Flashcard statistics"
        description="How your spaced-repetition engine is doing — retention, activity, and the cards that need a nudge."
        action={
          <Link
            href="/flashcards"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft"
          >
            <LuArrowLeft className="h-4 w-4" />
            Back to decks
          </Link>
        }
      />
      <StatsDashboard stats={stats} />
    </div>
  );
}
