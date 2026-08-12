import type { PrismaClient } from "@prisma/client";
import { SCORING_VERSION } from "@/engines/learning/evidence";
import {
  emptyAggregate,
  foldEvents,
  type FoldEvent,
  type TopicAggregate,
} from "@/engines/learning/fold";

// Learning Evidence Layer — reading and persisting the aggregate.
// See docs/superpowers/specs/2026-08-11-learning-evidence-layer-design.md

export type MasteryStoreClient = Pick<PrismaClient, "topicMastery" | "learningEvent">;

/**
 * Current aggregates for `topics` (topicId → subjectId), each carried forward
 * to `now` and caught up with any ledger events past its cursor.
 *
 * A missing row is not a special case: it becomes an empty aggregate at
 * cursor 0, so the fold replays that topic's whole ledger. The same path
 * handles a stale `scoringVersion` — the cursor is forced back to 0 and the
 * topic replays under the new constants.
 */
export async function loadFoldedAggregates(
  client: MasteryStoreClient,
  studentId: string,
  topics: ReadonlyMap<string, string>,
  now: Date,
): Promise<{ aggregates: Map<string, TopicAggregate>; changed: Set<string> }> {
  const topicIds = [...topics.keys()];
  if (topicIds.length === 0) return { aggregates: new Map(), changed: new Set() };

  const rows = await client.topicMastery.findMany({
    where: { studentId, topicId: { in: topicIds } },
  });

  const aggregates = new Map<string, TopicAggregate>();
  for (const topicId of topicIds) {
    const subjectId = topics.get(topicId) as string;
    const row = rows.find((candidate) => candidate.topicId === topicId);
    if (!row || row.scoringVersion !== SCORING_VERSION) {
      aggregates.set(topicId, emptyAggregate(topicId, subjectId, now));
      continue;
    }
    aggregates.set(topicId, {
      topicId,
      subjectId,
      // observations is not yet a column on TopicMastery — Task 3 adds it and
      // replaces these zeros with row.accObservations / lessonObservations /
      // srsObservations. Zero is safe in the meantime: a stale scoringVersion
      // forces a full replay from the ledger, which recomputes the real counts.
      acc: {
        outcome: row.accWeightedOutcome,
        mass: row.accWeightedMass,
        observations: 0,
      },
      lesson: {
        outcome: row.lessonWeightedOutcome,
        mass: row.lessonWeightedMass,
        observations: 0,
      },
      srs: {
        outcome: row.srsWeightedOutcome,
        mass: row.srsWeightedMass,
        observations: 0,
      },
      decayAnchor: row.decayAnchor,
      cursorSeq: row.cursorSeq,
      lastEffortAt: row.lastEffortAt,
    });
  }

  // One clause per topic, each bounded by THAT topic's own cursor.
  //
  // The obvious shortcut — take the lowest cursor across all topics and fetch
  // everything above it — collapses to a full history scan in practice. A topic
  // the student has never touched has no TopicMastery row, so it enters the map
  // with cursor 0, and every student has untouched topics in their subjects.
  // The bound would therefore be 0 on essentially every request, re-reading the
  // entire ledger each time and defeating the point of keeping an aggregate.
  //
  // Each clause is an index range scan on (studentId, topicId, seq), which the
  // schema declares, and a topic that is fully caught up matches no rows at all.
  // BigInt(0), not 0n: tsconfig targets ES2017, which rejects bigint literals
  // (TS2737). The call form is equivalent and portable.
  const cursorClauses = topicIds.map((topicId) => ({
    topicId,
    seq: { gt: aggregates.get(topicId)?.cursorSeq ?? BigInt(0) },
  }));

  const events = await client.learningEvent.findMany({
    where: {
      studentId,
      OR: cursorClauses,
    },
    orderBy: { seq: "asc" },
    select: {
      seq: true,
      topicId: true,
      kind: true,
      correct: true,
      score: true,
      difficulty: true,
      seconds: true,
      occurredAt: true,
    },
  });

  const byTopic = new Map<string, FoldEvent[]>();
  for (const event of events) {
    if (!event.topicId) continue;
    const bucket = byTopic.get(event.topicId);
    const folded = { ...event, topicId: event.topicId } as FoldEvent;
    if (bucket) bucket.push(folded);
    else byTopic.set(event.topicId, [folded]);
  }

  // `changed` carries the topics that actually folded a new event. Everything
  // else is byte-identical to what is already stored apart from its decay
  // anchor, and re-anchoring buys nothing: decayTo is exact from ANY anchor, so
  // a stale one produces the same numbers on the next read. Without this the
  // read path would issue N upserts on every dashboard render, classroom page
  // and lesson access check — writes that carry no new information, awaited in
  // front of the user.
  const folded = new Map<string, TopicAggregate>();
  const changed = new Set<string>();
  for (const [topicId, aggregate] of aggregates) {
    const next = foldEvents(aggregate, byTopic.get(topicId) ?? [], now);
    folded.set(topicId, next);
    if (next.cursorSeq !== aggregate.cursorSeq) changed.add(topicId);
  }
  return { aggregates: folded, changed };
}

/**
 * Writes the folded aggregates back. Best-effort by design: the aggregate is a
 * cache of the ledger, so a failed write costs one recomputation on the next
 * read, never correctness. It must not fail the page that triggered it.
 */
export async function persistAggregates(
  client: MasteryStoreClient,
  studentId: string,
  aggregates: Iterable<TopicAggregate>,
): Promise<void> {
  const writes = [...aggregates]
    // Nothing folded and nothing stored — no row worth creating.
    .filter((a) => a.cursorSeq > BigInt(0))
    .map((a) =>
      client.topicMastery.upsert({
        where: { studentId_topicId: { studentId, topicId: a.topicId } },
        create: {
          studentId,
          subjectId: a.subjectId,
          topicId: a.topicId,
          accWeightedOutcome: a.acc.outcome,
          accWeightedMass: a.acc.mass,
          lessonWeightedOutcome: a.lesson.outcome,
          lessonWeightedMass: a.lesson.mass,
          srsWeightedOutcome: a.srs.outcome,
          srsWeightedMass: a.srs.mass,
          decayAnchor: a.decayAnchor,
          cursorSeq: a.cursorSeq,
          lastEffortAt: a.lastEffortAt,
          scoringVersion: SCORING_VERSION,
        },
        update: {
          accWeightedOutcome: a.acc.outcome,
          accWeightedMass: a.acc.mass,
          lessonWeightedOutcome: a.lesson.outcome,
          lessonWeightedMass: a.lesson.mass,
          srsWeightedOutcome: a.srs.outcome,
          srsWeightedMass: a.srs.mass,
          decayAnchor: a.decayAnchor,
          cursorSeq: a.cursorSeq,
          lastEffortAt: a.lastEffortAt,
          scoringVersion: SCORING_VERSION,
        },
      }),
    );

  if (writes.length === 0) return;
  try {
    await Promise.all(writes);
  } catch (error) {
    console.error("Topic mastery persist failed:", error);
  }
}
