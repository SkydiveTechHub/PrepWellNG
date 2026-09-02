import crypto from "crypto";
import {
  checkQuestionInvariants,
  normalizeOptions,
  type InvariantIssue,
} from "@/lib/admin-question";
import { toExamType, type SupportedExamType } from "./alias";

/**
 * Bump when the mapping rules change. Rows rejected under an older version are
 * re-run offline against the stored payload — no new API calls — so improving
 * this function retroactively grows the bank.
 */
export const MAPPER_VERSION = 1;

export type MappedQuestion = {
  questionText: string;
  options: Record<string, string>;
  correctAnswer: string;
  explanation: string;
  examType: SupportedExamType;
  examYear: number;
  /** Their URL. Mirrored to our own Cloudinary at promotion time, never stored. */
  providerImageUrl: string | null;
};

export type MapResult =
  | {
      ok: true;
      question: MappedQuestion;
      providerQuestionId: string | null;
      fingerprint: string;
    }
  | {
      ok: false;
      reasons: InvariantIssue[];
      providerQuestionId: string | null;
      fingerprint: string;
    };

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Their option values, trimmed, with blanks dropped and keys upper-cased. */
function readOptions(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {};
  const usable: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const text = str(value);
    if (text) usable[key] = text;
  }
  return normalizeOptions(usable).options ?? {};
}

/**
 * Identity hash over question text and options only.
 *
 * Their `id` is stable and is the primary dedupe key; this is the fallback,
 * and it also catches the same question re-issued under a new id. Deliberately
 * excludes `solution`, `id` and `image` so an edited explanation does not read
 * as a different question.
 */
export function fingerprintPayload(payload: unknown): string {
  const source = isRecord(payload) ? payload : {};
  const options = readOptions(source.option);
  const canonical = JSON.stringify({
    question: str(source.question).toLowerCase().replace(/\s+/g, " "),
    options: Object.keys(options)
      .sort()
      .map((key) => [key, options[key].toLowerCase().replace(/\s+/g, " ")]),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function mapProviderQuestion(payload: unknown): MapResult {
  const fingerprint = fingerprintPayload(payload);
  const source = isRecord(payload) ? payload : {};
  const providerQuestionId =
    typeof source.id === "number" || typeof source.id === "string"
      ? String(source.id)
      : null;

  const reject = (reasons: InvariantIssue[]): MapResult => ({
    ok: false,
    reasons,
    providerQuestionId,
    fingerprint,
  });

  if (!isRecord(payload)) {
    return reject([{ field: "payload", message: "Payload is not an object." }]);
  }

  const reasons: InvariantIssue[] = [];

  const questionText = str(source.question);
  if (!questionText) {
    reasons.push({ field: "questionText", message: "Question text is empty." });
  }

  // Question.explanation is required and stays that way, so a question with no
  // solution cannot be served. It is still captured, and promotes later once
  // an explanation exists.
  const explanation = str(source.solution);
  if (!explanation) {
    reasons.push({
      field: "explanation",
      message: "The provider supplied no solution for this question.",
    });
  }

  const examType = toExamType(str(source.examtype));
  if (!examType) {
    reasons.push({
      field: "examType",
      message: `Unsupported exam type: "${str(source.examtype) || "(missing)"}".`,
    });
  }

  const examYear = parseInt(str(source.examyear), 10);
  if (!Number.isInteger(examYear)) {
    reasons.push({
      field: "examYear",
      message: `Unparseable exam year: "${str(source.examyear) || "(missing)"}".`,
    });
  }

  const options = readOptions(source.option);
  const correctAnswer = str(source.answer).toUpperCase();

  // The same gate the admin bulk import passes through: it is what stops a
  // question whose answer is not one of its options reaching a student.
  reasons.push(
    ...checkQuestionInvariants({
      questionType: "OBJECTIVE",
      options,
      correctAnswer,
    }),
  );

  if (reasons.length > 0 || !examType || !Number.isInteger(examYear)) {
    return reject(reasons);
  }

  return {
    ok: true,
    providerQuestionId,
    fingerprint,
    question: {
      questionText,
      options,
      correctAnswer,
      explanation,
      examType,
      examYear,
      providerImageUrl: str(source.image) || null,
    },
  };
}
