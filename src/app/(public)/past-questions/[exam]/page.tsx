import Link from "next/link";
import { notFound } from "next/navigation";
import { PUBLIC_EXAM_SEGMENTS, parseExamSegment } from "@/lib/seo/exam-segment";
import { buildMetadata } from "@/lib/seo/metadata";
import { loadEligiblePaperParams, loadExamSubjects } from "@/lib/seo/paper-data";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

export const revalidate = 86400;
export const dynamicParams = false;

type Props = { params: Promise<{ exam: string }> };

export function generateStaticParams() {
  return PUBLIC_EXAM_SEGMENTS.map((exam) => ({ exam }));
}

export async function generateMetadata({ params }: Props) {
  const { exam } = await params;
  const parsed = parseExamSegment(exam);
  if (!parsed) return {};

  return buildMetadata({
    title: `${parsed.label} Past Questions by Subject`,
    description: `Every subject with ${parsed.label} past questions on PrepWell, with correct answers and worked explanations for each paper.`,
    path: `/past-questions/${parsed.segment}`,
  });
}

export default async function ExamPage({ params }: Props) {
  const { exam } = await params;
  const parsed = parseExamSegment(exam);
  if (!parsed) notFound();

  // loadExamSubjects counts a subject's total questions for this exam across
  // all years, which is not the same gate a paper page passes (>=10
  // renderable questions in one specific year). A subject can clear the
  // first and fail the second, so the list is filtered against
  // loadEligiblePaperParams — the same source the paper page and its
  // sitemap/generateStaticParams derive from — rather than a new rule here.
  const [subjects, eligibleParams] = await Promise.all([
    loadExamSubjects(parsed.examType),
    loadEligiblePaperParams(),
  ]);
  const eligibleSlugs = new Set(
    eligibleParams
      .filter((p) => p.examSegment === parsed.segment)
      .map((p) => p.subjectSlug),
  );
  const publishableSubjects = subjects.filter((subject) =>
    eligibleSlugs.has(subject.slug),
  );

  // NECO currently has zero eligible papers. An exam page with nothing to
  // list is a thin, dead-end page — exactly what the eligibility gate exists
  // to prevent — so it 404s instead of rendering an empty grid, and the
  // index page above only links to an exam that has at least one subject.
  if (publishableSubjects.length === 0) notFound();

  return (
    <div className="landing-container py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Past Questions", path: "/past-questions" },
          { name: parsed.label, path: `/past-questions/${parsed.segment}` },
        ])}
      />
      <nav className="text-sm ink-muted">
        <Link href="/past-questions" className="hover:underline">Past Questions</Link>
        <span className="mx-2">/</span>
        <span>{parsed.label}</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold ink sm:text-4xl">
        {parsed.label} Past Questions
      </h1>

      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {publishableSubjects.map((subject) => (
          <li key={subject.slug}>
            <Link
              href={`/past-questions/${parsed.segment}/${subject.slug}`}
              className="surface flex items-center justify-between rounded-xl border border-black/5 p-4 transition hover:border-black/15"
            >
              <span className="font-medium ink">{subject.name}</span>
              <span className="text-sm ink-muted">{subject.questionCount}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
