import Link from "next/link";
import { buildMetadata } from "@/lib/seo/metadata";
import { loadPublishableSubjects } from "@/lib/seo/learn-data";

export const revalidate = 86400;

export const metadata = buildMetadata({
  title: "Subjects — WAEC, JAMB & NECO syllabus topics",
  description:
    "Every subject PrepWell covers, from Mathematics to Economics, with the topics each WAEC, JAMB and NECO syllabus expects you to know.",
  path: "/learn",
});

export default async function LearnIndexPage() {
  const subjects = await loadPublishableSubjects();

  return (
    <div className="landing-container py-16">
      <h1 className="text-3xl font-bold ink sm:text-4xl">Subjects</h1>
      <p className="mt-3 max-w-2xl ink-muted">
        Topic-by-topic coverage of the Nigerian secondary curriculum, with past
        questions and worked answers for WAEC, JAMB and NECO.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.map((subject) => (
          <li key={subject.slug}>
            <Link
              href={`/learn/${subject.slug}`}
              className="surface block h-full rounded-2xl border border-black/5 p-5 transition hover:border-black/15"
            >
              <h2 className="font-semibold ink">{subject.name}</h2>
              <p className="mt-2 line-clamp-3 text-sm ink-muted">
                {subject.description}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-widest ink-muted">
                {[
                  subject.isWaec && "WAEC",
                  subject.isJamb && "JAMB",
                  subject.isNeco && "NECO",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
