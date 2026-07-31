import Link from "next/link";
import { redirect } from "next/navigation";
import { LuLayoutGrid, LuFilter } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  TRACK_CATEGORIES,
  TRACK_COLORS,
  TRACK_LABELS,
  type TrackCategory,
  relevantTrackCategories,
} from "@/lib/subjects";

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
  // When no track is recorded, "relevant" is already everything — so there's
  // nothing for the toggle to reveal and it stays hidden.
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
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Subjects</h1>
          <p className="text-muted mt-1">
            {showAll || !hasNarrowing
              ? "Every WAEC, JAMB, and NECO subject."
              : `Your ${TRACK_LABELS[track as TrackCategory] ?? ""} subjects, plus the core subjects everyone sits.`}
          </p>
        </div>

        {hasNarrowing && (
          <Link
            href={showAll ? "/subjects" : "/subjects?all=1"}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:border-primary/30 transition-colors"
          >
            {showAll ? (
              <>
                <LuFilter className="w-4 h-4 text-muted" />
                Show my subjects
              </>
            ) : (
              <>
                <LuLayoutGrid className="w-4 h-4 text-muted" />
                Show all subjects
              </>
            )}
          </Link>
        )}
      </div>

      {TRACK_CATEGORIES.map((category) => {
        const list = grouped.get(category);
        if (!list?.length) return null;

        return (
          <div key={category} className="mb-10">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
              {TRACK_LABELS[category]} Subjects
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map((subject) => (
                <Link
                  key={subject.code}
                  href={`/subjects/${subject.slug}`}
                  className="flex items-center gap-4 bg-card rounded-xl border border-border p-4 hover:shadow-md hover:border-primary/30 transition-all"
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold border ${TRACK_COLORS[category]}`}
                  >
                    {subject.code}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground text-sm truncate">
                      {subject.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      {subject.isWaec && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                          WAEC
                        </span>
                      )}
                      {subject.isJamb && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                          JAMB
                        </span>
                      )}
                      {subject.isNeco && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                          NECO
                        </span>
                      )}
                    </div>
                  </div>
                  {subject._count.questions > 0 && (
                    <span className="text-[11px] text-muted whitespace-nowrap">
                      {subject._count.questions} qs
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
