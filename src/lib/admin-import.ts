import { z } from "zod";
import { bulkImportQuestionSchema } from "@/lib/validators";
import { checkQuestionInvariants } from "@/lib/admin-question";

export type BulkImportQuestion = z.infer<typeof bulkImportQuestionSchema>;

// Mirrors the server cap in bulkImportSchema (src/lib/validators.ts:126). The
// browser enforces it so an oversized paste is explained, not 400'd.
export const MAX_IMPORT_ROWS = 500;

export type ImportRowError = { index: number; field: string; message: string };

export type ImportParseResult =
  | {
      ok: true;
      rows: BulkImportQuestion[];
      errors: ImportRowError[];
      total: number;
    }
  | { ok: false; fatal: string };

function readRoot(raw: string): unknown[] | { fatal: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { fatal: "That is not valid JSON. Check for a trailing comma or a missing bracket." };
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { questions?: unknown }).questions)
      ? ((parsed as { questions: unknown[] }).questions)
      : null;

  if (!rows) {
    return {
      fatal: 'Expected either an array of questions or an object shaped { "questions": [ ... ] }.',
    };
  }

  if (rows.length === 0) return { fatal: "The file contains no questions." };

  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      fatal: `${rows.length} rows exceeds the ${MAX_IMPORT_ROWS}-row limit. Split the file and import it in batches.`,
    };
  }

  return rows;
}

/**
 * Validates a pasted or uploaded batch row by row, so a single bad row is
 * reported against its index instead of rejecting the whole file.
 */
export function parseImportPayload(raw: string): ImportParseResult {
  const root = readRoot(raw);
  if (!Array.isArray(root)) return { ok: false, fatal: root.fatal };

  const rows: BulkImportQuestion[] = [];
  const errors: ImportRowError[] = [];

  root.forEach((row, index) => {
    const parsed = bulkImportQuestionSchema.safeParse(row);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          index,
          field: issue.path.join(".") || "row",
          message: issue.message,
        });
      }
      return;
    }

    const invariants = checkQuestionInvariants({
      questionType: parsed.data.questionType,
      options: parsed.data.options ?? null,
      correctAnswer: parsed.data.correctAnswer,
    });
    if (invariants.length > 0) {
      for (const issue of invariants) {
        errors.push({ index, field: issue.field, message: issue.message });
      }
      return;
    }

    rows.push(parsed.data);
  });

  return { ok: true, rows, errors, total: root.length };
}
