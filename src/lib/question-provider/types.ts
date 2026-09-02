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
export type ProviderFailureKind = "terminal" | "retryable";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderFailureKind,
    readonly httpStatus: number | null = null,
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
