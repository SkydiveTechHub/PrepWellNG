import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { LuArrowLeft, LuBookOpen, LuTarget, LuClock, LuChevronRight } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ subjectSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { subjectSlug } = await params;

  const subject = await db.subject.findUnique({
    where: { slug: subjectSlug },
    include: {
      _count: { select: { questions: true, topics: true } },
      topics: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          estimatedMinutes: true,
          _count: { select: { questions: true } },
        },
      },
    },
  });

  if (!subject) notFound();

  const examLabels: string[] = [];
  if (subject.isWaec) examLabels.push("WAEC");
  if (subject.isJamb) examLabels.push("JAMB");
  if (subject.isNeco) examLabels.push("NECO");

  return (
    <div>
      {/* Back link */}
      <Link
        href="/subjects"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground mb-6 transition-colors"
      >
        <LuArrowLeft className="w-4 h-4" />
        All Subjects
      </Link>

      {/* Subject header */}
      <div className="bg-card border border-border rounded-xl p-6 mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                {subject.code}
              </span>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{subject.name}</h1>
                <p className="text-sm text-muted">{subject.description}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {examLabels.map((exam) => (
                <span
                  key={exam}
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    exam === "WAEC"
                      ? "bg-blue-100 text-blue-700"
                      : exam === "JAMB"
                        ? "bg-green-100 text-green-700"
                        : "bg-purple-100 text-purple-700"
                  }`}
                >
                  {exam}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-border">
          <div className="text-center">
            <p className="text-xl font-bold text-foreground">{subject._count.questions}</p>
            <p className="text-xs text-muted">Questions</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-foreground">{subject._count.topics}</p>
            <p className="text-xs text-muted">Topics</p>
          </div>
          <div className="text-center">
            <Link
              href={`/practice/past-questions?subject=${subject.slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Practice <LuChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Topics */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Topics</h2>
        {subject.topics.length > 0 ? (
          <div className="space-y-2">
            {subject.topics.map((topic) => (
              <Link
                key={topic.id}
                href={`/subjects/${subjectSlug}/${topic.slug}`}
                className="flex items-center justify-between bg-card border border-border rounded-lg p-4 hover:shadow-md hover:border-primary/30 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <LuBookOpen className="w-4 h-4 text-muted group-hover:text-primary transition-colors" />
                  <span className="text-sm font-medium text-foreground">{topic.title}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <LuTarget className="w-3.5 h-3.5" />
                    {topic._count.questions} questions
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <LuClock className="w-3.5 h-3.5" />
                    {topic.estimatedMinutes} min
                  </span>
                  <LuChevronRight className="w-4 h-4 text-muted group-hover:text-primary transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <LuBookOpen className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-sm text-muted">
              No topics available yet for this subject.
            </p>
          </div>
        )}
      </div>

      {/* Quick practice */}
      <div className="mt-8 bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Quick Practice</h3>
        <div className="flex flex-wrap gap-3">
          {examLabels.map((exam) => (
            <Link
              key={exam}
              href={`/practice/past-questions/${subjectSlug}?exam=${exam}`}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                exam === "WAEC"
                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  : exam === "JAMB"
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "bg-purple-100 text-purple-700 hover:bg-purple-200"
              }`}
            >
              Practice {exam} Questions
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
