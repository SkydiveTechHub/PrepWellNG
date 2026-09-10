import Link from "next/link";
import { buildMetadata } from "@/lib/seo/metadata";
import { loadEligiblePaperParams } from "@/lib/seo/paper-data";

export const revalidate = 86400;

export const metadata = buildMetadata({
  title: "Past Questions — WAEC, JAMB and NECO",
  description:
    "Real WAEC, JAMB UTME and NECO past questions with the correct answers and worked explanations, organised by subject and year.",
  path: "/past-questions",
});

const EXAMS = [
  { segment: "waec", label: "WAEC", blurb: "The West African Senior School Certificate Examination, sat in SS3." },
  { segment: "jamb", label: "JAMB", blurb: "The UTME, taken under CBT conditions for university admission." },
  { segment: "neco", label: "NECO", blurb: "The National Examinations Council's senior certificate examination." },
] as const;

export default async function PastQuestionsIndexPage() {
  // Only link to an exam that actually has at least one publishable paper —
  // loadEligiblePaperParams is the same source the [exam] and paper pages
  // are gated by, so this list can never point at a page that 404s.
  const params = await loadEligiblePaperParams();
  const availableSegments = new Set(params.map((p) => p.examSegment));

  return (
    <div className="landing-container py-16">
      <h1 className="text-3xl font-bold ink sm:text-4xl">Past Questions</h1>
      <p className="mt-3 max-w-2xl ink-muted">
        Past papers by exam, subject and year — each question with its correct
        answer and a worked explanation.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {EXAMS.map((exam) => {
          const available = availableSegments.has(exam.segment);
          return (
            <li key={exam.segment}>
              {available ? (
                <Link
                  href={`/past-questions/${exam.segment}`}
                  className="surface block h-full rounded-2xl border border-black/5 p-6 transition hover:border-black/15"
                >
                  <h2 className="text-lg font-bold ink">{exam.label}</h2>
                  <p className="mt-2 text-sm ink-muted">{exam.blurb}</p>
                </Link>
              ) : (
                <div className="surface block h-full rounded-2xl border border-black/5 p-6 opacity-60">
                  <h2 className="text-lg font-bold ink">{exam.label}</h2>
                  <p className="mt-2 text-sm ink-muted">{exam.blurb}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide ink-muted">
                    Coming soon
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
