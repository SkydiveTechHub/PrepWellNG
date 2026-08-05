import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  JAMB_SPEC,
  assessCoverage,
  questionsForSubject,
  type CoverageReport,
  type SubjectRequirement,
} from "@/lib/jamb-cbt";

// Which JAMB papers the question bank can actually assemble.
//
// A sitting is one year across all four subjects, so a year only qualifies when
// every chosen subject has its full complement for that exact year.

export type JambSubjectOption = {
  id: string;
  code: string;
  name: string;
  /** Years where this subject alone has enough questions. */
  eligibleYears: number[];
};

/** Per-subject, per-year counts of usable JAMB objective questions. */
async function loadCounts(subjectIds: readonly string[]) {
  if (subjectIds.length === 0) {
    return [] as { subjectId: string; examYear: number; n: number }[];
  }
  return db.$queryRaw<{ subjectId: string; examYear: number; n: number }[]>`
    SELECT q."subjectId" AS "subjectId",
           q."examYear"  AS "examYear",
           COUNT(*)::int AS n
    FROM "Question" q
    WHERE q."examType" = 'JAMB'::"ExamType"
      AND q."questionType" = 'OBJECTIVE'::"QuestionType"
      AND q."examYear" IS NOT NULL
      AND q."subjectId" IN (${Prisma.join([...subjectIds])})
    GROUP BY q."subjectId", q."examYear"
  `;
}

/**
 * The subjects offerable in the picker, each with the years it can cover.
 *
 * English is excluded — it is added by the system, not chosen — but its own
 * coverage is what usually decides whether any year is sittable at all.
 */
export async function getJambSubjectOptions(): Promise<{
  english: { id: string; code: string; name: string } | null;
  englishYears: number[];
  subjects: JambSubjectOption[];
}> {
  const subjects = await db.subject.findMany({
    where: { isJamb: true },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  const counts = await loadCounts(subjects.map((s) => s.id));
  const bySubject = new Map<string, Map<number, number>>();
  for (const row of counts) {
    const years = bySubject.get(row.subjectId) ?? new Map<number, number>();
    years.set(row.examYear, row.n);
    bySubject.set(row.subjectId, years);
  }

  const english = subjects.find((s) => s.code === JAMB_SPEC.englishCode) ?? null;

  function eligibleYearsFor(subjectId: string, required: number): number[] {
    const years = bySubject.get(subjectId);
    if (!years) return [];
    return [...years.entries()]
      .filter(([, n]) => n >= required)
      .map(([year]) => year)
      .sort((a, b) => b - a);
  }

  return {
    english,
    englishYears: english
      ? eligibleYearsFor(english.id, JAMB_SPEC.englishQuestions)
      : [],
    subjects: subjects
      .filter((s) => s.code !== JAMB_SPEC.englishCode)
      .map((s) => ({
        ...s,
        eligibleYears: eligibleYearsFor(s.id, JAMB_SPEC.otherQuestions),
      })),
  };
}

/**
 * Years where English plus all three chosen subjects are fully covered.
 * Empty means no sittable paper exists for that combination.
 */
export async function eligibleYearsFor(
  englishId: string,
  chosenSubjectIds: readonly string[],
): Promise<number[]> {
  const ids = [englishId, ...chosenSubjectIds];
  const counts = await loadCounts(ids);

  const required = new Map<string, number>();
  required.set(englishId, JAMB_SPEC.englishQuestions);
  for (const id of chosenSubjectIds) required.set(id, JAMB_SPEC.otherQuestions);

  const coveredByYear = new Map<number, Set<string>>();
  for (const row of counts) {
    if (row.n < (required.get(row.subjectId) ?? Infinity)) continue;
    const set = coveredByYear.get(row.examYear) ?? new Set<string>();
    set.add(row.subjectId);
    coveredByYear.set(row.examYear, set);
  }

  return [...coveredByYear.entries()]
    .filter(([, covered]) => ids.every((id) => covered.has(id)))
    .map(([year]) => year)
    .sort((a, b) => b - a);
}

/** Exactly what the bank holds for one year, for the coverage report. */
export async function coverageForYear(
  subjects: readonly { id: string; code: string; name: string }[],
  year: number,
): Promise<CoverageReport> {
  const counts = await db.$queryRaw<{ subjectId: string; n: number }[]>`
    SELECT q."subjectId" AS "subjectId", COUNT(*)::int AS n
    FROM "Question" q
    WHERE q."examType" = 'JAMB'::"ExamType"
      AND q."questionType" = 'OBJECTIVE'::"QuestionType"
      AND q."examYear" = ${year}
      AND q."subjectId" IN (${Prisma.join(subjects.map((s) => s.id))})
    GROUP BY q."subjectId"
  `;

  const available = new Map(counts.map((row) => [row.subjectId, row.n]));

  const requirements: SubjectRequirement[] = subjects.map((subject) => ({
    subjectId: subject.id,
    subjectCode: subject.code,
    subjectName: subject.name,
    required: questionsForSubject(subject.code),
    available: available.get(subject.id) ?? 0,
  }));

  return assessCoverage(requirements);
}
