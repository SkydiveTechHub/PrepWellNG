import { after } from "next/server";
import { db } from "./db";
import { coverageForYear } from "./jamb-availability";
import { ensureQuestionsCached, saturate, readLedger } from "./question-provider/ingest";
import { rateLimit } from "./rate-limit";
import {
  JAMB_SPEC,
  coverageMessage,
  questionsForSubject,
  selectionErrorMessage,
  validateSubjectChoice,
} from "./jamb-cbt";

/** The four papers of a sitting, English first, as in the real CBT. */
export type JambPaperSubject = {
  id: string;
  code: string;
  name: string;
  slug: string;
};

export type JambSubjectResolution =
  | { outcome: "english-missing" }
  | { outcome: "bad-selection"; message: string }
  | { outcome: "subjects-unavailable" }
  | { outcome: "ok"; subjects: JambPaperSubject[] };

/**
 * Turns three chosen subject ids into the four papers of a sitting.
 *
 * Shared by the generator and the prepare endpoint so both reject the same
 * selections with the same wording, and both get the slugs the provider
 * fetch needs.
 */
export async function resolveJambPaperSubjects(
  chosenIds: readonly string[],
): Promise<JambSubjectResolution> {
  const english = await db.subject.findUnique({
    where: { code: JAMB_SPEC.englishCode },
    select: { id: true, code: true, name: true, slug: true },
  });
  if (!english) return { outcome: "english-missing" };

  const selectionError = validateSubjectChoice(chosenIds, english.id);
  if (selectionError) {
    return {
      outcome: "bad-selection",
      message: selectionErrorMessage(selectionError),
    };
  }

  const chosen = await db.subject.findMany({
    where: { id: { in: [...chosenIds] }, isJamb: true },
    select: { id: true, code: true, name: true, slug: true },
  });
  if (chosen.length !== chosenIds.length) return { outcome: "subjects-unavailable" };

  return { outcome: "ok", subjects: [english, ...chosen] };
}

/**
 * Pulls whatever of a year's four papers we do not already hold.
 *
 * The past-paper flow fetches one subject on demand; a sitting needs all four,
 * so this runs the same draw across each of them. Every subject gets exactly
 * one draw per call — enough to prove whether the provider carries the year at
 * all — and the rest of each paper warms up off the response path. A year that
 * is still short after this is worth asking for again; each ask advances it.
 *
 * Never throws: a provider that is down or out of budget degrades to whatever
 * the bank already holds, and the caller's coverage check reports the gap.
 */
export async function ensureJambYearCached(
  subjects: readonly JambPaperSubject[],
  examYear: number,
): Promise<void> {
  if (process.env.QUESTION_PROVIDER_ENABLED !== "true") return;

  await Promise.all(
    subjects.map(async (subject) => {
      const filter = {
        subjectSlug: subject.slug,
        examType: "JAMB" as const,
        examYear,
      };

      // SATURATED means there is nothing left to draw for this paper and
      // FAILED is terminal, so neither is worth spending budget on.
      const ledger = await readLedger(filter);
      if (ledger?.status === "SATURATED" || ledger?.status === "FAILED") return;

      // Shares the one outbound budget with the past-paper flow, and is spent
      // per paper rather than per request so a saturated subject costs nothing.
      const outbound = rateLimit({
        key: "provider:outbound",
        limit: 30,
        windowSeconds: 60,
      });
      if (!outbound.ok) return;

      try {
        await ensureQuestionsCached(filter, questionsForSubject(subject.code));
        after(() => saturate(filter));
      } catch (error) {
        // One unreachable paper must not sink the other three.
        console.error(
          `JAMB ${examYear} ${subject.code}: provider fetch failed`,
          error,
        );
      }
    }),
  );
}

export type JambPreparation =
  | { outcome: "english-missing" }
  | { outcome: "bad-selection"; message: string }
  | { outcome: "subjects-unavailable" }
  | {
      outcome: "ok";
      examYear: number;
      ready: boolean;
      /** Absent when ready — there is nothing to explain. */
      message: string | null;
      coverage: Awaited<ReturnType<typeof coverageForYear>>["requirements"];
      shortfalls: Awaited<ReturnType<typeof coverageForYear>>["shortfalls"];
    };

/**
 * Everything the picker needs to decide whether a year can be sat: fetch what
 * is missing, then report the bank's coverage paper by paper.
 *
 * Called when a student picks a year, so the wait happens while they are still
 * looking at the picker rather than behind a "Start exam" button, and so the
 * shortfall — if any — is shown before they commit.
 */
export async function prepareJambYear(input: {
  subjectIds: string[];
  examYear: number;
}): Promise<JambPreparation> {
  const resolved = await resolveJambPaperSubjects(input.subjectIds);
  if (resolved.outcome !== "ok") return resolved;

  await ensureJambYearCached(resolved.subjects, input.examYear);

  const coverage = await coverageForYear(resolved.subjects, input.examYear);
  return {
    outcome: "ok",
    examYear: input.examYear,
    ready: coverage.ok,
    message: coverage.ok ? null : coverageMessage(coverage, input.examYear),
    coverage: coverage.requirements,
    shortfalls: coverage.shortfalls,
  };
}
