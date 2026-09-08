import type { SupportedExamType } from "./alias";

/** The unit of coverage: one subject's paper for one exam in one year. */
export type ProviderFilter = {
  /** Our Subject.slug, not theirs — the adapter translates. */
  subjectSlug: string;
  examType: SupportedExamType;
  examYear: number;
};

/**
 * How a failed call should be treated.
 *
 * "empty" is deliberately absent: a filter the provider has nothing for
 * returns an empty array, not an error, so the ledger saturates it with
 * rawCount 0 and never asks again.
 */
export type ProviderFailureKind = "terminal" | "retryable" | "exhausted";

/**
 * How far a failure reaches.
 *
 * "provider" is the default because that is the safe reading of an unknown
 * failure: a revoked token or an unentitled plan says nothing about the filter
 * that happened to be asked for, and pausing everything is the correct,
 * recoverable response.
 *
 * "filter" is the narrower claim, and the one the breaker must never act on: a
 * subject sdashapi does not carry and an exam type we cannot request are
 * permanent facts about *that filter alone*. Marking the filter FAILED is
 * right; arming the provider-wide breaker over it would let one student
 * choosing Further Mathematics silently stop ingest for every subject — with no
 * way back, since BLOCKED has no cooldown.
 *
 * Carried on the error rather than inferred from its message, so the
 * distinction survives rewording and is checked by the compiler.
 */
export type ProviderErrorScope = "provider" | "filter";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderFailureKind,
    readonly httpStatus: number | null = null,
    readonly scope: ProviderErrorScope = "provider",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface QuestionProviderAdapter {
  readonly name: "SDASH";
  /**
   * One draw. Returns the raw, unvalidated payloads — validation belongs to
   * the mapper, which runs against what we stored rather than what came off
   * the wire. An empty array means the provider holds nothing for the filter.
   */
  draw(filter: ProviderFilter, limit: number): Promise<unknown[]>;
  listSubjects(): Promise<{ id: number; name: string; slug: string }[]>;
  listYears(): Promise<number[]>;
}
