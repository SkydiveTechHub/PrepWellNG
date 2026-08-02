import Link from "next/link";
import { redirect } from "next/navigation";
import { LuLayoutGrid, LuFilter, LuArrowRight } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  TRACK_CATEGORIES,
  TRACK_COLORS,
  TRACK_LABELS,
  type TrackCategory,
  relevantTrackCategories,
} from "@/lib/subjects";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { all } = await searchParams;
  const showAll = all === "1";

  const track = (session.user as { track?: string | null }).track ?? null;
  const relevant = relevantTrackCategories(track);
  const hasNarrowing = relevant.length < TRACK_CATEGORIES.length;

  const subjects = await db.subject.findMany({
    where: showAll || !hasNarrowing ? {} : { trackCategory: { in: [...relevant] } },
    orderBy: [{ trackCategory: "asc" }, { name: "asc" }],
    select: {
      code: true,
      name: true,
      slug: true,
      trackCategory: true,
      isWaec: true,
      isJamb: true,
      isNeco: true,
      _count: { select: { topics: true, questions: true } },
    },
  });

  const grouped = new Map<string, typeof subjects>();
  for (const subject of subjects) {
    const list = grouped.get(subject.trackCategory) ?? [];
    list.push(subject);
    grouped.set(subject.trackCategory, list);
  }

  return (
    <div>
      <PageHeader
        title="Subjects"
        description={
          showAll || !hasNarrowing
            ? "Every WAEC, JAMB, and NECO subject."
            : `Your ${TRACK_LABELS[track as TrackCategory] ?? ""} subjects, plus the core subjects everyone sits.`
        }
        action={
          hasNarrowing ? (
            <Link
              href={showAll ? "/subjects" : "/subjects?all=1"}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground shadow-soft transition-colors hover:border-primary/40 hover:bg-primary-soft"
            >
              {showAll ? (
                <>
                  <LuFilter className="h-4 w-4 text-muted" />
                  Show my subjects
                </>
              ) : (
                <>
                  <LuLayoutGrid className="h-4 w-4 text-muted" />
                  Show all subjects
                </>
              )}
            </Link>
          ) : undefined
        }
      />

      {TRACK_CATEGORIES.map((category) => {
        const list = grouped.get(category);
        if (!list?.length) return null;

        return (
          <div key={category} className="mb-10">
            <h2 className="section-label mb-4">
              {TRACK_LABELS[category]} Subjects
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((subject) => (
                <Link
                  key={subject.code}
                  href={`/subjects/${subject.slug}`}
                  className="card card-interactive group flex items-center gap-4 p-4"
                >
                  <div
                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${TRACK_COLORS[category]}`}
                  >
                    {subject.code}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold text-foreground">
                      {subject.name}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {subject.isWaec && <Badge variant="blue">WAEC</Badge>}
                      {subject.isJamb && <Badge variant="green">JAMB</Badge>}
                      {subject.isNeco && <Badge variant="orange">NECO</Badge>}
                      {subject._count.questions > 0 && (
                        <span className="text-[11px] font-semibold text-muted">
                          {subject._count.questions} questions
                        </span>
                      )}
                    </div>
                  </div>
                  <LuArrowRight className="h-4 w-4 flex-shrink-0 text-muted transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
