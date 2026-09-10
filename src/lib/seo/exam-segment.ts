/**
 * URL spelling of the exam boards. Lowercase only, and CUSTOM is absent: it is
 * an internal assessment type with nothing public behind it.
 *
 * Case-insensitive matching is deliberately not offered — two spellings of the
 * same page is two URLs competing for one ranking.
 */
const SEGMENT_TO_EXAM = {
  waec: "WAEC",
  jamb: "JAMB",
  neco: "NECO",
} as const;

export const PUBLIC_EXAM_SEGMENTS = Object.keys(
  SEGMENT_TO_EXAM,
) as readonly PublicExamSegment[];

export type PublicExamSegment = keyof typeof SEGMENT_TO_EXAM;
export type PublicExamType = (typeof SEGMENT_TO_EXAM)[PublicExamSegment];

export function parseExamSegment(
  segment: string,
): { segment: PublicExamSegment; examType: PublicExamType; label: string } | null {
  if (!Object.hasOwn(SEGMENT_TO_EXAM, segment)) return null;

  const key = segment as PublicExamSegment;
  const examType = SEGMENT_TO_EXAM[key];
  return { segment: key, examType, label: examType };
}

export function examSegmentFor(examType: string): PublicExamSegment | null {
  const found = PUBLIC_EXAM_SEGMENTS.find(
    (segment) => SEGMENT_TO_EXAM[segment] === examType,
  );
  return found ?? null;
}

/** Exactly four digits. Number() rather than parseInt so "2019abc" fails. */
export function parseYearSegment(segment: string): number | null {
  if (!/^\d{4}$/.test(segment)) return null;
  return Number(segment);
}
