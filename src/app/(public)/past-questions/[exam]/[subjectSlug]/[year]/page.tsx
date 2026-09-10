import Link from "next/link";
import { notFound } from "next/navigation";
import { SampleQuestion } from "@/components/seo/sample-question";
import { paperPageDescription, paperPageTitle } from "@/lib/seo/copy";
import { parseExamSegment, parseYearSegment } from "@/lib/seo/exam-segment";
import { buildMetadata } from "@/lib/seo/metadata";
import { loadEligiblePaperParams, loadPaper } from "@/lib/seo/paper-data";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, quizJsonLd } from "@/lib/seo/jsonld";

export const revalidate = 86400;
export const dynamicParams = true;

type Props = {
  params: Promise<{ exam: string; subjectSlug: string; year: string }>;
};

export async function generateStaticParams() {
  const params = await loadEligiblePaperParams();
  return params.map((param) => ({
    exam: param.examSegment,
    subjectSlug: param.subjectSlug,
    year: String(param.year),
  }));
}

/** Resolve the three segments, or null if any of them is not a real page. */
async function resolve(props: Props) {
  const { exam, subjectSlug, year } = await props.params;
  const parsed = parseExamSegment(exam);
  const parsedYear = parseYearSegment(year);
  if (!parsed || parsedYear === null) return null;

  const paper = await loadPaper(parsed.examType, subjectSlug, parsedYear);
  if (!paper) return null;

  return { parsed, paper };
}

export async function generateMetadata(props: Props) {
  const resolved = await resolve(props);
  if (!resolved) return {};
  const { parsed, paper } = resolved;

  return buildMetadata({
    title: paperPageTitle({
      exam: parsed.label,
      year: paper.year,
      subjectName: paper.subject.name,
    }),
    description: paperPageDescription({
      exam: parsed.label,
      year: paper.year,
      subjectName: paper.subject.name,
      questionCount: paper.questionCount,
      topicCount: paper.topics.length,
    }),
    path: `/past-questions/${parsed.segment}/${paper.subject.slug}/${paper.year}`,
  });
}

export default async function PaperPage(props: Props) {
  const resolved = await resolve(props);
  if (!resolved) notFound();
  const { parsed, paper } = resolved;

  const remaining = paper.questionCount - paper.samples.length;

  return (
    <div className="landing-container py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Past Questions", path: "/past-questions" },
          { name: parsed.label, path: `/past-questions/${parsed.segment}` },
          {
            name: paper.subject.name,
            path: `/past-questions/${parsed.segment}/${paper.subject.slug}`,
          },
          {
            name: String(paper.year),
            path: `/past-questions/${parsed.segment}/${paper.subject.slug}/${paper.year}`,
          },
        ])}
      />
      <JsonLd
        data={quizJsonLd({
          name: `${parsed.label} ${paper.year} ${paper.subject.name}`,
          path: `/past-questions/${parsed.segment}/${paper.subject.slug}/${paper.year}`,
          about: paper.subject.name,
          // Only the samples: marking up the gated questions would claim
          // content the page does not show.
          questions: paper.samples,
        })}
      />
      <nav className="text-sm ink-muted">
        <Link href="/past-questions" className="hover:underline">Past Questions</Link>
        <span className="mx-2">/</span>
        <Link href={`/past-questions/${parsed.segment}`} className="hover:underline">
          {parsed.label}
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/past-questions/${parsed.segment}/${paper.subject.slug}`}
          className="hover:underline"
        >
          {paper.subject.name}
        </Link>
        <span className="mx-2">/</span>
        <span>{paper.year}</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold ink sm:text-4xl">
        {parsed.label} {paper.year} {paper.subject.name} Past Questions and Answers
      </h1>

      <p className="mt-4 max-w-2xl leading-relaxed ink-muted">
        {paperPageDescription({
          exam: parsed.label,
          year: paper.year,
          subjectName: paper.subject.name,
          questionCount: paper.questionCount,
          topicCount: paper.topics.length,
        })}
      </p>

      <section className="mt-12">
        <h2 className="text-xl font-semibold ink">Sample questions</h2>
        <div className="mt-4 space-y-4">
          {paper.samples.map((question, i) => (
            <SampleQuestion key={question.id} question={question} index={i + 1} />
          ))}
        </div>

        {remaining > 0 ? (
          <div className="surface-2 mt-6 rounded-2xl p-6 text-center">
            <p className="font-semibold ink">
              {remaining} more question{remaining === 1 ? "" : "s"} from this
              paper, sittable under real CBT conditions.
            </p>
            <Link
              href="/register"
              className="mt-4 inline-block rounded-xl bg-primary px-6 py-3 font-semibold text-white"
            >
              Practise the full paper free
            </Link>
          </div>
        ) : null}
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold ink">What this paper covers</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="ink-muted">
                <th className="py-2 font-semibold">Topic</th>
                <th className="py-2 font-semibold">Questions</th>
              </tr>
            </thead>
            <tbody>
              {paper.topics.map((topic) => (
                <tr key={topic.title} className="border-t border-black/5">
                  <td className="py-2">
                    {topic.slug && topic.subjectSlug ? (
                      <Link
                        href={`/learn/${topic.subjectSlug}/${topic.slug}`}
                        className="ink hover:underline"
                      >
                        {topic.title}
                      </Link>
                    ) : (
                      <span className="ink">{topic.title}</span>
                    )}
                  </td>
                  <td className="py-2 ink-muted">{topic.questionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {paper.adjacentYears.previous || paper.adjacentYears.next ? (
        <nav className="mt-12 flex justify-between text-sm">
          {paper.adjacentYears.previous ? (
            <Link
              href={`/past-questions/${parsed.segment}/${paper.subject.slug}/${paper.adjacentYears.previous}`}
              className="ink hover:underline"
            >
              ← {parsed.label} {paper.adjacentYears.previous} {paper.subject.name}
            </Link>
          ) : (
            <span />
          )}
          {paper.adjacentYears.next ? (
            <Link
              href={`/past-questions/${parsed.segment}/${paper.subject.slug}/${paper.adjacentYears.next}`}
              className="ink hover:underline"
            >
              {parsed.label} {paper.adjacentYears.next} {paper.subject.name} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
