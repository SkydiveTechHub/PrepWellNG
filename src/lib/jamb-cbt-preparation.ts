import { after } from "next/server";
import { db } from "./db";
import { coverageForYear } from "./jamb-availability";
import {
  ensureQuestionsCached,
  saturate,
  readLedger,
  isProviderPaused,
} from "./question-provider/ingest";
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
 * How the prepare flow reaches the outside world.
 *
 * Injected rather than imported so a test can watch what was scheduled and put
 * the breaker in either state, neither of which is observable through `after`
 * (which throws outside a request scope) or a shared provider-state row.
 */
export type JambPreparationDeps = {
  /** Defers work behind the response. Throws outside a request scope. */
  schedule: (task: () => Promise<void>) => void;
  /** Whether the provider breaker is open, read without claiming a probe. */
  providerPaused: () => Promise<boolean>;
};

const defaultPreparationDeps: JambPreparationDeps = {
  schedule: after,
  providerPaused: () => isProviderPaused(),
};

/**
 * Schedules fetches for whatever of a year's four papers we do not already hold.
 *
 * The past-paper flow fetches one subject on demand; a sitting needs all four,
 * so this runs the same draw across each of them. Every subject gets exactly
 * one draw per call — enough to prove whether the provider carries the year at
 * all — and the rest of each paper warms up off the response path. A year that
 * is still short after this is worth asking for again; each ask advances it.
 *
 * Returns how many subjects actually had a fetch handed to `after` — a promise
 * the caller may repeat to the student. Zero means no more questions are coming
 * on this call, for any of four reasons: the provider is switched off, the
 * breaker is open, every paper is SATURATED or FAILED, or the outbound budget
 * is spent. A nonzero count is only a promise that the deferred work was
 * queued; the draw behind it may still find the year empty.
 *
 * Never throws: a provider that is down or out of budget degrades to whatever
 * the bank already holds, and the caller's coverage check reports the gap.
 */
export async function ensureJambYearCached(
  subjects: readonly JambPaperSubject[],
  examYear: number,
  deps: JambPreparationDeps = defaultPreparationDeps,
): Promise<number> {
  if (process.env.QUESTION_PROVIDER_ENABLED !== "true") return 0;

  // The breaker is provider-wide, so one read settles all four papers. Asking
  // here rather than only inside the deferred fetch is the difference between
  // telling the student "we're fetching it" and meaning it: with the breaker
  // open every callback below would no-op on arrival, and the promise would be
  // a lie repeated on every prepare call until the cooldown lapses.
  if (await deps.providerPaused()) return 0;

  const scheduled: boolean[] = [];

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
      if (ledger?.status === "SATURATED" || ledger?.status === "FAILED") {
        scheduled.push(false);
        return;
      }

      // Shares the one outbound budget with the past-paper flow, and is spent
      // per paper rather than per request so a saturated subject costs nothing.
      const outbound = rateLimit({
        key: "provider:outbound",
        limit: 30,
        windowSeconds: 60,
      });
      if (!outbound.ok) {
        scheduled.push(false);
        return;
      }

      // Same reasoning as the past-paper generator: the prepare call reports
      // what the bank holds now, and schedules the fill behind the response.
      // Awaiting four subjects' draws here made "pick a year" a multi-second
      // wait against a five-connection pool.
      try {
        deps.schedule(async () => {
          try {
            await ensureQuestionsCached(filter, questionsForSubject(subject.code));
            await saturate(filter);
          } catch (error) {
            // One unreachable paper must not sink the other three.
            console.error(
              `JAMB ${examYear} ${subject.code}: provider fetch failed`,
              error,
            );
          }
        });
        // Counted only now: a subject whose scheduling threw has nothing
        // coming, and must not be reported to the student as being fetched.
        scheduled.push(true);
      } catch (error) {
        // Scheduling background work is best-effort; a failure to schedule
        // (e.g., no request scope in tests) must not sink the prepare response.
        scheduled.push(false);
        console.error(
          `JAMB ${examYear} ${subject.code}: failed to schedule fetch`,
          error,
        );
      }
    }),
  );

  return scheduled.filter(Boolean).length;
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
 * Everything the picker needs to decide whether a year can be sat: schedule
 * fetches for what is missing, then report the bank's coverage paper by paper.
 *
 * Called when a student picks a year. Returns instantly whether the year is ready,
 * and if not ready, why: either a fetch is in progress (message says we're preparing),
 * or nothing further is coming and the bank's shortfall is all there is (message
 * lists it). The coverage report is computed from the bank's current state, so a
 * cold year starts "not ready" even though a fetch has just been scheduled.
 */
export async function prepareJambYear(
  input: {
    subjectIds: string[];
    examYear: number;
  },
  deps: JambPreparationDeps = defaultPreparationDeps,
): Promise<JambPreparation> {
  const resolved = await resolveJambPaperSubjects(input.subjectIds);
  if (resolved.outcome !== "ok") return resolved;

  const scheduledCount = await ensureJambYearCached(
    resolved.subjects,
    input.examYear,
    deps,
  );

  const coverage = await coverageForYear(resolved.subjects, input.examYear);
  const ready = coverage.ok;
  const message = ready
    ? null
    : scheduledCount > 0
      ? `We're fetching the ${input.examYear} papers. Check back in a moment.`
      : coverageMessage(coverage, input.examYear);

  return {
    outcome: "ok",
    examYear: input.examYear,
    ready,
    message,
    coverage: coverage.requirements,
    shortfalls: coverage.shortfalls,
  };
}
