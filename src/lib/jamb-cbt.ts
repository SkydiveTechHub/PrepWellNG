// JAMB UTME CBT simulation — the official paper structure.
//
// A candidate sits four subjects in one 2-hour session: English Language is
// compulsory, plus three of their choosing. English carries 60 questions and
// each other subject 40, for 180 in total. Every subject is scored out of 100
// regardless of how many questions it has, giving a mark out of 400.
//
// That last part is why this cannot reuse the generic "sum the question marks"
// grading: an English question is worth 100/60 marks while a Biology question
// in the same paper is worth 100/40.

export const JAMB_SPEC = {
  /** Subject code of the compulsory paper. */
  englishCode: "ENG",
  englishQuestions: 60,
  otherQuestions: 40,
  /** English + three chosen subjects. */
  subjectCount: 4,
  otherSubjectCount: 3,
  totalQuestions: 180,
  durationMinutes: 120,
  marksPerSubject: 100,
  totalMarks: 400,
} as const;

/** How many questions a subject contributes to the paper. */
export function questionsForSubject(subjectCode: string): number {
  return subjectCode === JAMB_SPEC.englishCode
    ? JAMB_SPEC.englishQuestions
    : JAMB_SPEC.otherQuestions;
}

// ─── Subject selection ─────────────────────────────────────

export type SelectionError =
  | "WRONG_COUNT"
  | "DUPLICATE"
  | "ENGLISH_NOT_CHOOSABLE";

/**
 * Validates the three subjects a candidate picks alongside English.
 *
 * English is added by the system, never chosen, so offering it in the picker
 * would let a candidate sit a paper with only three distinct subjects.
 */
export function validateSubjectChoice(
  chosenSubjectIds: readonly string[],
  englishSubjectId: string,
): SelectionError | null {
  if (chosenSubjectIds.length !== JAMB_SPEC.otherSubjectCount) {
    return "WRONG_COUNT";
  }
  if (new Set(chosenSubjectIds).size !== chosenSubjectIds.length) {
    return "DUPLICATE";
  }
  if (chosenSubjectIds.includes(englishSubjectId)) {
    return "ENGLISH_NOT_CHOOSABLE";
  }
  return null;
}

export function selectionErrorMessage(error: SelectionError): string {
  switch (error) {
    case "WRONG_COUNT":
      return `Pick exactly ${JAMB_SPEC.otherSubjectCount} subjects to sit alongside English Language.`;
    case "DUPLICATE":
      return "Each subject can only be chosen once.";
    case "ENGLISH_NOT_CHOOSABLE":
      return "English Language is compulsory and already included.";
  }
}

// ─── Coverage ──────────────────────────────────────────────

export type SubjectRequirement = {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  /** How many the official paper needs. */
  required: number;
  /** How many the bank actually holds for the chosen year. */
  available: number;
};

export type CoverageReport = {
  ok: boolean;
  requirements: SubjectRequirement[];
  /** Only the subjects that fall short — what the UI tells the student. */
  shortfalls: SubjectRequirement[];
};

/**
 * Whether the bank can build a full-length paper.
 *
 * Deliberately all-or-nothing: a short paper still scored over 400 would not be
 * a JAMB simulation, and its result would not be comparable with a real one.
 */
export function assessCoverage(
  requirements: readonly SubjectRequirement[],
): CoverageReport {
  const shortfalls = requirements.filter((r) => r.available < r.required);
  return {
    ok: shortfalls.length === 0,
    requirements: [...requirements],
    shortfalls,
  };
}

export function coverageMessage(report: CoverageReport, year: number): string {
  if (report.ok) return "";
  const parts = report.shortfalls.map(
    (s) => `${s.subjectName} (${s.available} of ${s.required})`,
  );
  return `The ${year} paper can't be assembled yet — not enough questions for ${parts.join(", ")}.`;
}

// ─── Scoring ───────────────────────────────────────────────

export type SubjectScore = {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  correct: number;
  total: number;
  /** Out of {@link JAMB_SPEC.marksPerSubject}. */
  marks: number;
};

export type JambScore = {
  perSubject: SubjectScore[];
  /** Out of {@link JAMB_SPEC.totalMarks}. */
  score: number;
  totalMarks: number;
  percentage: number;
};

type GradedResponse = {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  isCorrect: boolean;
};

/**
 * Scores a sat paper the way JAMB does: each subject out of 100, summed to 400.
 *
 * Marks are weighted by how many questions the subject actually contributed, so
 * English's 60 questions and Biology's 40 are each still worth 100.
 */
export function scoreJambPaper(responses: readonly GradedResponse[]): JambScore {
  const bySubject = new Map<string, SubjectScore>();

  for (const response of responses) {
    const entry = bySubject.get(response.subjectId) ?? {
      subjectId: response.subjectId,
      subjectCode: response.subjectCode,
      subjectName: response.subjectName,
      correct: 0,
      total: 0,
      marks: 0,
    };
    entry.total += 1;
    if (response.isCorrect) entry.correct += 1;
    bySubject.set(response.subjectId, entry);
  }

  const perSubject = [...bySubject.values()].map((entry) => ({
    ...entry,
    marks:
      entry.total > 0
        ? (entry.correct / entry.total) * JAMB_SPEC.marksPerSubject
        : 0,
  }));

  // Rounded once at the end; rounding per subject would drift the total.
  const rawScore = perSubject.reduce((sum, s) => sum + s.marks, 0);
  const score = Math.round(rawScore * 10) / 10;

  return {
    perSubject: perSubject.map((s) => ({
      ...s,
      marks: Math.round(s.marks * 10) / 10,
    })),
    score,
    totalMarks: JAMB_SPEC.totalMarks,
    percentage:
      Math.round((rawScore / JAMB_SPEC.totalMarks) * 100 * 10) / 10,
  };
}

/**
 * JAMB reports a mark out of 400, not a grade. Rough bands used for the
 * results screen's encouragement copy — these are guidance, not cut-offs, since
 * real cut-offs are set per institution and course each year.
 */
export function jambBand(score: number): {
  label: string;
  remark: string;
} {
  if (score >= 300) {
    return { label: "Excellent", remark: "Competitive for any course nationwide." };
  }
  if (score >= 250) {
    return { label: "Strong", remark: "Above the cut-off for most competitive courses." };
  }
  if (score >= 200) {
    return { label: "Good", remark: "Meets the general benchmark for university admission." };
  }
  if (score >= 160) {
    return { label: "Fair", remark: "Around the national minimum — worth pushing higher." };
  }
  return { label: "Needs work", remark: "Below the usual benchmark. Focus on your weakest subject." };
}
