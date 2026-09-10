import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo/metadata";
import {
  loadEligibleTopicParams,
  loadEligibleTopicSlugs,
  loadPublicSubject,
  loadPublishableSubjects,
} from "@/lib/seo/learn-data";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

export const revalidate = 86400;
export const dynamicParams = true;

type Props = { params: Promise<{ subjectSlug: string }> };

export async function generateStaticParams() {
  const subjects = await loadPublishableSubjects();
  return subjects.map((subject) => ({ subjectSlug: subject.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { subjectSlug } = await params;
  const subject = await loadPublicSubject(subjectSlug);
  if (!subject) return {};

  return buildMetadata({
    title: `${subject.name} — WAEC, JAMB & NECO topics`,
    description: subject.description,
    path: `/learn/${subject.slug}`,
  });
}

export default async function SubjectPage({ params }: Props) {
  const { subjectSlug } = await params;
  const subject = await loadPublicSubject(subjectSlug);
  if (!subject) notFound();

  // Only publish a hub for subjects with at least one eligible topic — a
  // subject with none would otherwise render a page that links nowhere.
  const eligibleTopics = await loadEligibleTopicParams();
  const hasEligibleTopic = eligibleTopics.some(
    (topic) => topic.subjectSlug === subjectSlug,
  );
  if (!hasEligibleTopic) notFound();

  const eligible = await loadEligibleTopicSlugs(subjectSlug);
  const topics = subject.topics.filter((topic) => eligible.has(topic.slug));

  return (
    <div className="landing-container py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Subjects", path: "/learn" },
          { name: subject.name, path: `/learn/${subject.slug}` },
        ])}
      />
      <nav className="text-sm ink-muted">
        <Link href="/learn" className="hover:underline">
          Subjects
        </Link>
        <span className="mx-2">/</span>
        <span>{subject.name}</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold ink sm:text-4xl">{subject.name}</h1>
      <p className="mt-3 max-w-2xl ink-muted">{subject.description}</p>

      {topics.length > 0 ? (
        <>
          <h2 className="mt-12 text-xl font-semibold ink">Topics</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {topics.map((topic) => (
              <li key={topic.slug}>
                <Link
                  href={`/learn/${subject.slug}/${topic.slug}`}
                  className="surface block rounded-xl border border-black/5 p-4 transition hover:border-black/15"
                >
                  <span className="font-medium ink">{topic.title}</span>
                  {topic.description ? (
                    <span className="mt-1 block line-clamp-2 text-sm ink-muted">
                      {topic.description}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Link href="/past-questions" className="mt-8 inline-block font-medium ink hover:underline">
          Browse {subject.name} past questions →
        </Link>
      )}
    </div>
  );
}
