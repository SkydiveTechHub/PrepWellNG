import type { PrismaClient } from "@prisma/client";
import type { Difficulty, LearningEventKind } from "@/types/prisma";

// Learning Evidence Layer — writing to the ledger.
// See docs/superpowers/specs/2026-08-11-learning-evidence-layer-design.md

export type NewLearningEvent = {
  studentId: string;
  subjectId: string;
  topicId: string | null;
  kind: LearningEventKind;
  correct?: boolean | null;
  score?: number | null;
  difficulty?: Difficulty | null;
  seconds?: number | null;
  sourceId?: string | null;
  occurredAt?: Date;
};

/** Accepts either the client or a transaction handle. */
export type LearningEventWriter = Pick<PrismaClient, "learningEvent">;

/**
 * Appends to the ledger.
 *
 * Call this inside the transaction that writes the domain row the event
 * describes, so the two commit together. For events with no domain row of
 * their own, use `emitLearningEventsSafely` instead.
 */
export async function emitLearningEvents(
  client: LearningEventWriter,
  events: readonly NewLearningEvent[],
): Promise<void> {
  if (events.length === 0) return;
  await client.learningEvent.createMany({ data: [...events] });
}

/**
 * Best-effort append for signals with no domain row — an abandoned quiz, a
 * dwell measurement. Losing one is a rounding error in the aggregate; failing
 * the student's request over it is not acceptable.
 */
export async function emitLearningEventsSafely(
  client: LearningEventWriter,
  events: readonly NewLearningEvent[],
): Promise<void> {
  try {
    await emitLearningEvents(client, events);
  } catch (error) {
    console.error("Learning event emit failed:", error);
  }
}
