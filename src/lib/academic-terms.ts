import { db } from "./db";
import { dateToDayKey, dayKeyToDate } from "@/engines/planner/days";
import { validateTermRanges, type TermRange } from "@/engines/planner/term-context";
import type { AcademicTermInput } from "./validators";

export type AcademicTermRow = TermRange & { id: string };

export async function listAcademicTerms(): Promise<AcademicTermRow[]> {
  const rows = await db.academicTerm.findMany({ orderBy: { startsOn: "asc" } });
  return rows.map((row) => ({
    id: row.id,
    session: row.session,
    term: row.term,
    startsOn: dateToDayKey(row.startsOn),
    endsOn: dateToDayKey(row.endsOn),
  }));
}

/**
 * Creates (no id) or updates a term. Checked against every other term, so
 * overlaps are reported as a message rather than surfacing as a DB error.
 */
export async function saveAcademicTerm(
  input: AcademicTermInput,
  id?: string,
): Promise<
  | { ok: true; term: AcademicTermRow }
  | { ok: false; status: 400 | 404; errors: string[] }
> {
  const existing = await listAcademicTerms();
  if (id && !existing.some((t) => t.id === id)) {
    return { ok: false, status: 404, errors: ["Term not found."] };
  }
  const others = existing.filter((t) => t.id !== id);
  const errors = validateTermRanges([...others, input]);
  if (errors.length > 0) return { ok: false, status: 400, errors };

  const data = {
    session: input.session,
    term: input.term,
    startsOn: dayKeyToDate(input.startsOn),
    endsOn: dayKeyToDate(input.endsOn),
  };
  const row = id
    ? await db.academicTerm.update({ where: { id }, data })
    : await db.academicTerm.create({ data });
  return {
    ok: true,
    term: { id: row.id, session: row.session, term: row.term, startsOn: input.startsOn, endsOn: input.endsOn },
  };
}

export async function deleteAcademicTerm(id: string): Promise<boolean> {
  const { count } = await db.academicTerm.deleteMany({ where: { id } });
  return count > 0;
}
