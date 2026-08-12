# Learning Evidence Layer — Phase 2: Widen Capture, Surface Confidence

Date: 2026-08-12
Status: Draft
Role: Senior Learning Experience Designer

Follows `docs/superpowers/specs/2026-08-11-learning-evidence-layer-design.md`
(the three-phase design) and its Phase 1 implementation, planned in
`docs/superpowers/plans/2026-08-11-learning-evidence-layer-phase-1.md`.

Read the parent spec's **"Phase 1 as shipped"** section first. It records what
that phase did and did not deliver; this document closes three of those gaps and
one live bug.

## Problem

Phase 1 replaced the evidence layer: mastery is now folded from an append-only
`LearningEvent` ledger into a decayed `TopicMastery` aggregate, with recency
weighting, Bayesian shrinkage, difficulty adjustment and rapid-guess
down-weighting. Four things it left undone are worth doing together, because
they share the same machinery.

1. **`CONFIDENCE_FLOOR` has zero call sites.** It is declared in
   `src/engines/learning/evidence.ts` and read nowhere. `classifyTopic`
   (`src/engines/learning/gaps.ts`) still gates on "any evidence at all", so a
   single wrong answer still diagnoses a topic `WEAK` — at mastery 39 rather
   than 0, but still `WEAK`. The parent spec claims "one wrong answer no longer
   diagnoses a weakness". That claim is currently false.

2. **Nothing surfaces confidence.** A topic scored from one answer and a topic
   scored from forty are displayed identically — a bare `N% mastery` on the gap
   list (`src/components/path/gap-list.tsx:73`), the "Keep learning" rail
   (`next-topics.tsx:64`) and the classroom graph view (`graph-view.tsx:232`).

3. **The Performance page renders zeros.**
   `src/app/(dashboard)/performance/page.tsx` shows per-subject cards reading
   `{metric.totalAttempted} questions · {metric.totalCorrect} correct`, an
   accuracy percentage, a progress bar, and an average across subjects. Every
   one reads a `PerformanceMetric` column that no code path has ever written.
   A student with real history sees a grid of "0 questions · 0 correct, 0%".

4. **`QUIZ_ABANDONED` is a dead enum value.** It exists in the schema and in the
   fold's `default` branch, with no emitter and no consumer.

## Goal

- Diagnosis waits for evidence: below `CONFIDENCE_FLOOR`, the gap queue
  withholds judgement instead of guessing.
- A student can see *why* a topic has no score yet, expressed as the thing that
  resolves it.
- The Performance page shows real numbers.
- Abandonment becomes a visible signal rather than an unused enum value.

Out of scope, deferred to Phase 3: snapshots, velocity, the exam-readiness
forecast, difficulty-targeted question selection, and the automatic
cursor-reset reconciliation pass.

## Constraints

- **No background worker.** Plain Next.js route handlers and server actions over
  Prisma. Anything persisted is written inline on a request or lazily on read.
- **Pre-launch.** No live student data; schema is free to change and no backfill
  is required.
- **The engine stays pure-function tested.** `scripts/test-learning-path-*.mts`
  run `node:test` with no database, and are now type-checked by
  `npm run typecheck:tests` (`tsconfig.scripts.json`).
- **No bigint literals under `src/`** — `tsconfig.json` targets ES2017 and
  rejects them (TS2737). Use `BigInt(0)`.
- **The database may still be unreachable.** Phase 1's verification list
  (parent spec, "Verification still outstanding") is not yet run. Phase 2 adds
  to that list rather than assuming it has been cleared.

## Design

### 1. Observations — a raw count beside the decayed mass

`ChannelStats` gains `observations: number`.

`decayTo` must **not** scale it. Mass decays because an old answer is weaker
evidence of current ability; "you answered three questions" is a historical fact
that does not fade. This asymmetry is the single most important detail in this
document.

`foldEvents` increments the counter for events that contribute to a channel —
including rapid guesses, which are down-weighted to 0.3 mass but were still
answered — and not for `PRETEST_PASSED` or `QUIZ_ABANDONED`, which contribute no
channel evidence.

```prisma
model TopicMastery {
  // ...existing fields
  accObservations    Int @default(0)
  lessonObservations Int @default(0)
  srsObservations    Int @default(0)
}
```

`TopicState` exposes all three as `accObservations`, `lessonObservations` and
`srsObservations` — the same names, so there is one vocabulary from the ledger
fold through to the component that renders them.

**Rollout.** Existing rows have no counts, and no write can backfill them.
None is needed: bumping `SCORING_VERSION` from 1 to 2 forces a full per-topic
replay from the ledger on the next read, which recomputes observations from
source. The new columns default to 0 and are correct after one read. This is the
lever Phase 1 documented for drift repair, used here as the migration strategy.

### 2. Confidence gating

In `classifyTopic` (`src/engines/learning/gaps.ts`), the existing `hasEvidence`
check becomes an *enough*-evidence check:

- no evidence at all → `UNTOUCHED` if available, else `null` (unchanged)
- evidence but `confidence < CONFIDENCE_FLOOR` → **`null`**
- otherwise → `WEAK` / `DECAYED` / `BOTTLENECK` as today

Below the floor the result is `null`, not `UNTOUCHED`: a topic with one answer
has been started, so calling it untouched would be wrong. `gapQueue` already
filters to WEAK/DECAYED/BOTTLENECK, so nothing downstream changes shape.

This is the only change in this phase that alters existing engine behaviour.

### 3. The evidence-count display

Below the floor, the three surfaces replace `N% mastery` with a count, chosen by
dominant channel:

| Condition | Display |
|---|---|
| `accObservations > 0` | `3 questions answered` |
| else `lessonObservations > 0` | `Lesson in progress` |
| else `srsObservations > 0` | `2 card reviews` |

Singular and plural forms are both required (`1 question answered`).

At or above the floor, the display is unchanged.

Surfaces: `src/components/path/gap-list.tsx`, `next-topics.tsx`,
`src/components/path/graph-view.tsx`. `revision-queue.tsx` shows predicted
recall rather than mastery and is not affected.

### 4. Abandonment

**Emission.** `reapStaleAttempts` (`src/lib/attempt-lifecycle.ts:39`) marks
expired `IN_PROGRESS` attempts `TIMED_OUT` with a bare `updateMany`. It gains a
select of each paper's question `topicId`s and emits one `QUIZ_ABANDONED` per
**distinct** topic, in the same transaction as the status update — the attempt
row is the domain row the event describes, so Phase 1's atomicity rule applies.

A 40-question mock covering 12 topics emits 12 events, not 40. Without the
dedup, "started 3 times" would read as 120.

`occurredAt` is the attempt's `startedAt`, not the reap time. `reapStaleAttempts`
runs opportunistically — only when the student next generates a quiz
(`assessment-generation.ts:93`, `jamb-cbt-generation.ts:132`) — so an attempt
abandoned on Monday may not be marked until Thursday. Timestamping the event
when the engagement happened keeps the ledger honest.

**Known limitation:** a student who abandons a quiz and never returns is never
reaped, so their abandonment is never recorded. Accepted; the alternative is a
background job, which this stack does not have.

**Consumption.** The dashboard loads counts with one `groupBy` over
`LearningEvent` and passes them to `gapQueue` as a parameter, exactly as
`pretestPassed` is passed today. `TopicGap` gains `abandonedCount`. The gap list
renders a reason line — "Started 3 times without finishing".

**Ranking is unchanged.** `gapQueue` still orders by bottleneck score
descending, then mastery ascending. Abandonment explains a gap; it does not move
it. Adding a second weight to a ranking rule that currently has a clean
rationale would need calibration data nobody has yet.

### 5. The Performance page — a deletion, not an addition

A service function in `src/lib/performance.ts` derives per-subject counts from
the ledger on read:

```
groupBy(subjectId) over LearningEvent
  where studentId = ?, kind = QUESTION_ANSWERED
  attempted = count(*)
  correct   = count(correct = true)
  accuracy  = correct / attempted
```

`totalAttempted`, `totalCorrect`, `accuracy` and `averageTimePerQuestion` are
then **dropped** from `PerformanceMetric`. No projection to keep in sync, no
staleness, no trigger — consistent with the rest of the design: derive, do not
duplicate.

`masteryLevel` and `pretestPassedAt` stay. Verified consumers:
`src/lib/achievements.ts:178` counts `masteryLevel: "STRONG"` rows,
`src/lib/flashcard-analytics.ts:414` selects topics at `WEAK`/`DEVELOPING`, and
`src/lib/learning-path.ts:196` reads `pretestPassedAt`. None reads the four
columns being dropped.

Before dropping, re-verify that `performance.ts:133` is still the only consumer
of the four columns. A stale grep is how the `pretestPassedAt` mirror drift in
`src/types/prisma.ts` survived unnoticed.

### 6. Known divergence: `masteryLevel` is stale (not fixed in this phase)

`PerformanceMetric.masteryLevel` is written in exactly two places —
`src/lib/topic-practice-result.ts` on lesson completion and `src/lib/pretest.ts`
on a pretest pass. **Answering quiz questions never updates it.**

So the two consumers above read a mastery level that no longer reflects what the
engine computes:

- `achievements.ts` awards a "subject mastery" achievement by counting topics at
  `STRONG`, so a student who reaches strong mastery purely through practice
  never earns it.
- `flashcard-analytics.ts` recommends decks for topics at `WEAK`/`DEVELOPING`,
  so its recommendations ignore practice performance entirely.

This is the same disease as the Performance page zeros — a column that features
read and the new evidence layer does not maintain — and it predates this branch.
It is **documented but not fixed here**, because fixing it properly means
deriving `masteryLevel` from `computeTopicState` at those two call sites, which
pulls achievements and flashcard analytics into a phase scoped to the evidence
layer and its own surfaces. It belongs in its own change.

Anyone touching achievements or flashcard recommendations should read this
section first.

## Error handling

**The abandonment emit is in-transaction** with the status update, but
`reapStaleAttempts` is called before quiz generation and must not be able to
block it. The transaction wraps status and events together; a throw is logged
and generation proceeds. Losing an abandonment record is a rounding error;
blocking a student from starting a quiz is not.

**Questions with no `topicId`** contribute no abandonment event, consistent with
their handling everywhere else in the evidence layer.

**The abandonment `groupBy`** runs on the dashboard only and is decoration, not
diagnosis. If it fails, the gap list renders without reason lines rather than
failing the page.

**Observation counts cannot go backwards.** They are incremented in the fold
and never decayed, so a replay under a bumped `SCORING_VERSION` recomputes the
same values from the same ledger. A partially-folded aggregate is self-healing
in the same way its sums are.

## Testing

Pure-function tests remain the centre of gravity, and `npm run typecheck:tests`
now guards their shape against the drift Phase 1 accumulated silently.

**Observations** (`scripts/test-learning-path-evidence.mts`):
- `decayTo` halves mass over one half-life and leaves `observations` untouched —
  the property most likely to be got wrong, and the reason the field exists.
- A rapid guess adds one observation while adding 0.3 mass.
- `PRETEST_PASSED` and `QUIZ_ABANDONED` add no observations.
- Observations survive a fold/replay split at the same randomised split points
  the existing invariant test uses.

**Confidence gating** — `gaps.ts` has no test suite today; this phase adds
`scripts/test-learning-path-gaps.mts`:
- One wrong answer → mastery 39, confidence 0.20, `classifyTopic` returns
  `null`, `gapQueue` excludes the topic. This is the claim the parent spec makes
  and Phase 1 did not deliver.
- Ten wrong answers → mastery 24, confidence 0.71, `classifyTopic` returns
  `WEAK`, `gapQueue` includes it. The gate must withhold judgement without
  disabling diagnosis.
- A topic with no evidence at all still classifies `UNTOUCHED` when available.
- `DECAYED` and `BOTTLENECK` are gated the same way.

**Abandonment** — the attempt-to-distinct-topics mapping is extracted as a pure
function so the dedup is testable without a database: a 40-question paper over
12 topics yields 12 ids; questions with a null `topicId` are dropped.

**Performance counts** — the aggregation is a database `groupBy` and is **not**
unit-testable here. It joins the runtime verification list rather than being
covered by a test that only proves a mock works.

The new `scripts/test-learning-path-gaps.mts` must be registered in both the
`test` and `test:path` scripts in `package.json`. It is picked up by
`tsconfig.scripts.json` automatically, which globs `scripts/test-*.mts`.

**Regression gate.** `recommendNext`, `revisionQueue`, availability and the
study plan must pass unedited. `gaps.ts` is the only behaviour change this
phase, so only its coverage should move.

## Verification still outstanding

Phase 1's list (parent spec) is not yet run — the development database has been
unreachable throughout. Phase 2 adds:

1. Abandon a quiz, then generate another to trigger the reaper. Confirm one
   `QUIZ_ABANDONED` per distinct topic in the abandoned paper, timestamped at
   the attempt's `startedAt`, and that the gap list shows the reason line.
2. Answer one question correctly. Confirm the rail shows "1 question answered"
   rather than a percentage, and that the topic does **not** appear under
   "Tighten your gaps".
3. Answer ten incorrectly. Confirm the topic now appears as a gap with a
   mastery figure.
4. Load the Performance page as a student with history. Confirm real per-subject
   counts rather than zeros.

## Decisions taken

- **Observations live in the aggregate; abandonment counts are queried
  separately.** Observations are read on every render of both rails and the
  graph view — exactly what the aggregate exists to make cheap. Abandonment is
  rare, display-only, and fits the existing parameter pattern `pretestPassed`
  already uses. Putting each where its access pattern points keeps the aggregate
  about scoring evidence and nothing else.
- **The Performance page fix is a deletion.** Deriving on read removes four
  columns and the possibility of drift, rather than adding a projection that
  could go stale the way these columns already did.
- **Abandonment explains, it does not rank.** The ranking rule stays
  bottleneck score then mastery.
- **A count, not a hedge, below the floor.** "3 questions answered" tells the
  student what resolves the uncertainty; "~56%, low confidence" invites them to
  anchor on the 56 anyway.
