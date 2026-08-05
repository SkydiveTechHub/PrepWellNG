import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { buildAttemptResult } from "@/lib/attempt-results";
import { ResultsView } from "@/components/assessment/results-view";

// Rendered on the server. This used to be a client component that mounted a
// spinner and then fetched its own results, so a student who had just finished
// an exam waited on a second round-trip to see their score.
export default async function ResultsPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { attemptId } = await params;
  // Scoped to the signed-in student, so this doubles as the ownership check.
  const result = await buildAttemptResult(attemptId, session.user.id);
  if (!result) notFound();

  return <ResultsView result={result} />;
}
