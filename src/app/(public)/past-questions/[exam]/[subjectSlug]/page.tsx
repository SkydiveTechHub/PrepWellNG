import Link from "next/link";
import { notFound } from "next/navigation";
import { parseExamSegment } from "@/lib/seo/exam-segment";
import { buildMetadata } from "@/lib/seo/metadata";
import { loadEligiblePaperParams, loadPaperYears } from "@/lib/seo/paper-data";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

export const revalidate = 86400;
export const dynamicParams = true;

type Props = { params: Promise<{ exam: string; subjectSlug: string }> };

/**
 * Derived from loadEligiblePaperParams(), like its /learn and paper-page
 * siblings — this page is sitemapped but was not enumerated, so it built at
 * request time on first crawl instead of at build time.
 */
export async function generateStaticParams() {
  const params = await loadEligiblePaperParams();
  const seen = new Set<string>();
  const result: { exam: string; subjectSlug: string }[] = [];
  for (const p of params) {
    const key = `${p.examSegment}/${p.subjectSlug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ exam: p.examSegment, subjectSlug: p.subjectSlug });
  }
  return result;
}

export async function generateMetadata({ params }: Props) {
  const { exam, subjectSlug } = await params;
  const parsed = parseExamSegment(exam);
  if (!parsed) return {};
  const data = await loadPaperYears(parsed.examType, subjectSlug);
  if (!data) return {};

  return buildMetadata({
    title: `${parsed.label} ${data.subject.name} Past Questions by Year`,
    description: `Every ${parsed.label} ${data.subject.name} paper on ScholarsCrib, year by year, with correct answers and worked explanations.`,
    path: `/past-questions/${parsed.segment}/${subjectSlug}`,
  });
}

export default async function SubjectYearsPage({ params }: Props) {
  const { exam, subjectSlug } = await params;
  const parsed = parseExamSegment(exam);
  if (!parsed) notFound();

  const data = await loadPaperYears(parsed.examType, subjectSlug);
  if (!data || data.years.length === 0) notFound();

  return (
    <div className="landing-container py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Past Questions", path: "/past-questions" },
          { name: parsed.label, path: `/past-questions/${parsed.segment}` },
          {
            name: data.subject.name,
            path: `/past-questions/${parsed.segment}/${subjectSlug}`,
          },
        ])}
      />
      <nav className="text-sm ink-muted">
        <Link href="/past-questions" className="hover:underline">Past Questions</Link>
        <span className="mx-2">/</span>
        <Link href={`/past-questions/${parsed.segment}`} className="hover:underline">
          {parsed.label}
        </Link>
        <span className="mx-2">/</span>
        <span>{data.subject.name}</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold ink sm:text-4xl">
        {parsed.label} {data.subject.name} Past Questions
      </h1>

      <ul className="mt-10 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.years.map((entry) => (
          <li key={entry.year}>
            <Link
              href={`/past-questions/${parsed.segment}/${subjectSlug}/${entry.year}`}
              className="surface block rounded-xl border border-black/5 p-4 text-center transition hover:border-black/15"
            >
              <span className="block text-lg font-bold ink">{entry.year}</span>
              <span className="text-xs ink-muted">
                {entry.questionCount} questions
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
