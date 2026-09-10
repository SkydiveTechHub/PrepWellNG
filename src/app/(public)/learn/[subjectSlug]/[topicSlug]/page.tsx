import Link from "next/link";
import { notFound } from "next/navigation";
import { SampleQuestion } from "@/components/seo/sample-question";
import { topicPageDescription, topicPageTitle } from "@/lib/seo/copy";
import { loadEligibleTopicParams, loadPublicTopic } from "@/lib/seo/learn-data";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, courseJsonLd } from "@/lib/seo/jsonld";

export const revalidate = 86400;
export const dynamicParams = true;

type Props = { params: Promise<{ subjectSlug: string; topicSlug: string }> };

export async function generateStaticParams() {
  const params = await loadEligibleTopicParams();
  return params.map(({ subjectSlug, topicSlug }) => ({ subjectSlug, topicSlug }));
}

export async function generateMetadata({ params }: Props) {
  const { subjectSlug, topicSlug } = await params;
  const topic = await loadPublicTopic(subjectSlug, topicSlug);
  if (!topic) return {};

  return buildMetadata({
    title: topicPageTitle({
      topicTitle: topic.title,
      subjectName: topic.subject.name,
    }),
    description: topicPageDescription({
      topicTitle: topic.title,
      subjectName: topic.subject.name,
      description: topic.description,
      subtopicTitles: topic.subtopics.map((s) => s.title),
    }),
    path: `/learn/${subjectSlug}/${topicSlug}`,
  });
}

export default async function TopicPage({ params }: Props) {
  const { subjectSlug, topicSlug } = await params;
  const topic = await loadPublicTopic(subjectSlug, topicSlug);
  // Null covers both "no such topic" and "too thin to publish".
  if (!topic) notFound();

  const remaining = topic.questionCount - topic.samples.length;

  return (
    <div className="landing-container py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Subjects", path: "/learn" },
          { name: topic.subject.name, path: `/learn/${topic.subject.slug}` },
          { name: topic.title, path: `/learn/${topic.subject.slug}/${topic.slug}` },
        ])}
      />
      <JsonLd
        data={courseJsonLd({
          name: `${topic.title} — ${topic.subject.name}`,
          description: topicPageDescription({
            topicTitle: topic.title,
            subjectName: topic.subject.name,
            description: topic.description,
            subtopicTitles: topic.subtopics.map((s) => s.title),
          }),
          path: `/learn/${topic.subject.slug}/${topic.slug}`,
          estimatedMinutes: topic.estimatedMinutes,
        })}
      />
      <nav className="text-sm ink-muted">
        <Link href="/learn" className="hover:underline">Subjects</Link>
        <span className="mx-2">/</span>
        <Link href={`/learn/${topic.subject.slug}`} className="hover:underline">
          {topic.subject.name}
        </Link>
        <span className="mx-2">/</span>
        <span>{topic.title}</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold ink sm:text-4xl">
        {topic.title} — {topic.subject.name}
      </h1>

      <p className="mt-4 max-w-2xl leading-relaxed ink-muted">
        {topicPageDescription({
          topicTitle: topic.title,
          subjectName: topic.subject.name,
          description: topic.description,
          subtopicTitles: topic.subtopics.map((s) => s.title),
        })}
      </p>

      {topic.waecWeight > 0 || topic.jambWeight > 0 ? (
        <dl className="mt-6 flex flex-wrap gap-4 text-sm">
          {topic.waecWeight > 0 ? (
            <div className="surface rounded-xl px-4 py-3">
              <dt className="text-xs font-bold uppercase tracking-widest ink-muted">
                WAEC weighting
              </dt>
              <dd className="mt-1 font-semibold ink">
                {Math.round(topic.waecWeight * 100)}%
              </dd>
            </div>
          ) : null}
          {topic.jambWeight > 0 ? (
            <div className="surface rounded-xl px-4 py-3">
              <dt className="text-xs font-bold uppercase tracking-widest ink-muted">
                JAMB weighting
              </dt>
              <dd className="mt-1 font-semibold ink">
                {Math.round(topic.jambWeight * 100)}%
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {topic.subtopics.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-xl font-semibold ink">What you&apos;ll learn</h2>
          <ul className="mt-4 space-y-3">
            {topic.subtopics.map((subtopic) => (
              <li key={subtopic.title} className="surface rounded-xl p-4">
                <p className="font-medium ink">{subtopic.title}</p>
                {subtopic.description ? (
                  <p className="mt-1 text-sm ink-muted">{subtopic.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {topic.prerequisites.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-xl font-semibold ink">Study these first</h2>
          <ul className="mt-4 space-y-2">
            {topic.prerequisites.map((prereq) => (
              <li key={prereq.slug}>
                <Link
                  href={`/learn/${prereq.subjectSlug}/${prereq.slug}`}
                  className="font-medium ink hover:underline"
                >
                  {prereq.title}
                </Link>
                {prereq.rationale ? (
                  <span className="ink-muted"> — {prereq.rationale}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12">
        <h2 className="text-xl font-semibold ink">
          {topic.title} past questions and answers
        </h2>
        <div className="mt-4 space-y-4">
          {topic.samples.map((question, i) => (
            <SampleQuestion key={question.id} question={question} index={i + 1} />
          ))}
        </div>

        {remaining > 0 ? (
          <div className="surface-2 mt-6 rounded-2xl p-6 text-center">
            <p className="font-semibold ink">
              {remaining} more {topic.title} question{remaining === 1 ? "" : "s"},
              with timed practice and instant marking.
            </p>
            <Link
              href="/register"
              className="mt-4 inline-block rounded-xl bg-primary px-6 py-3 font-semibold text-white"
            >
              Create a free account
            </Link>
          </div>
        ) : null}
      </section>

      {topic.siblings.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-xl font-semibold ink">
            More {topic.subject.name} topics
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {topic.siblings.map((sibling) => (
              <li key={sibling.slug}>
                <Link
                  href={`/learn/${topic.subject.slug}/${sibling.slug}`}
                  className="surface inline-block rounded-full px-4 py-2 text-sm ink hover:underline"
                >
                  {sibling.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
