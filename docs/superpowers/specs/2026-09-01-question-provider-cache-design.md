# Question Provider Cache — Read-Through Ingestion from sdashapi

Date: 2026-09-01
Status: Designed, not implemented
Role: Backend / Data Engineering

## Problem

Our question bank is seeded and hand-authored. `src/lib/questions.ts` and
`src/lib/question-pool.ts` read it, and every practice flow in the app is
limited by how much of it exists. A third-party API (sdashapi) sells access to
a past-question bank covering 2001–2026 across UTME, WASSCE, NECO, post-UTME
and university papers.

We want that content, but we do not want a permanent runtime dependency on
them. Calling their endpoint on every student request would mean their outage
is our outage, their rate limit is our ceiling, and their pricing is our
pricing — forever.

## Goal

Every successful provider call is captured, permanently, into our own database
on the way past. A filter is fetched **once**, ever. Every subsequent student
asking for the same subject/exam/year is served entirely from Postgres.

The end state is that the provider becomes unnecessary: once every paper we
care about has been drawn once, we hold a complete offline copy and all further
quality work happens against our own data.

### Non-goals

- Topic-tagging imported questions. They arrive untagged and stay untagged for
  now (see "Known consequences").
- Ingesting `post-utme` or `university` papers. Our `ExamType` enum cannot
  represent them distinctly and folding them into `CUSTOM` would corrupt
  past-paper grouping. We simply never request them.
- Replacing the admin bulk-import path (`src/lib/admin-import.ts`). It stays;
  this reuses its validation rather than competing with it.

## Decisions

Four decisions were settled during design. The rejected options are recorded
because the rationale is the load-bearing part.

### 1. Coverage is tracked by a ledger, not inferred from question counts

**Rejected: "treat any matching rows as a cache hit."** If a student pulls 20
questions for WASSCE Physics 2019, we hold 20 rows. A later request for 40 would
find 20 and wrongly conclude that is the whole paper. Row counts cannot
distinguish "complete" from "partial".

**Rejected: "top up on shortfall."** Best UX, but the provider exposes no
offset or cursor, so topping up means re-drawing and discarding heavy overlap.

**Chosen:** a `ProviderFetch` ledger row per filter. Its *existence and status*,
not the presence of questions, decides whether we call out.

### 2. Raw capture is separated from mapping

**Rejected: "drop what we cannot map."** The ledger would record the filter as
fetched while the bank silently held a fraction of it. We would never re-fetch,
and the unmappable questions would be gone permanently. Independence with holes.

**Rejected: "force everything in with placeholders."** Ships unmarkable
questions to students and makes imported rows indistinguishable from authored
ones.

**Chosen: two tables.** Every payload is written verbatim to `ProviderQuestion`
before any mapping is attempted. A separate pure mapper promotes what passes
validation into `Question`. What fails stays raw with recorded reasons.

The insight: **the network call is expensive and unrepeatable; the mapping is
cheap and infinitely repeatable.** Separating them means a bad mapper costs
nothing and a fetch is never wasted. Bumping `MAPPER_VERSION` and re-running it
over stored rows promotes more questions with zero new API calls — which is what
turns the staging table into a growing asset rather than a dead-letter box.

### 3. On a miss, the user is served from what we just wrote

**Rejected: "serve the provider payload immediately, persist in `after()`."**
Fastest, but the practice flow turns a question list into an `Assessment` with
`AssessmentQuestion` rows keyed on `Question.id`. If those rows are not
committed yet, starting a quiz on what you are looking at fails on a foreign
key. It also shows the user questions that may then fail promotion.

**Rejected: "write, then re-read from Postgres."** Buys consistency we already
have, at the cost of an extra round trip on our slowest path.

**Chosen:** stage, promote and write the ledger synchronously, then serve the
promoted set from memory. One pass, real committed ids, and the user sees
exactly what a future cached user will see.

`after()` (confirmed available in Next 16.2.11 —
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`) is
reserved for work off the user's path: the remaining saturation draws, coverage
refreshes, audit logging.

### 4. Coverage means saturation, not completeness

The provider caps `limit` at 50 and exposes no `offset`, `page` or `total`. We
can draw batches but cannot walk a paper deterministically or learn its size.
Completeness is unknowable. Saturation is measurable.

A filter is `SATURATED` when any of three conditions holds:

- a full draw of 50 returns no `data.id` we have not already stored;
- a draw returns fewer than 50 payloads, which means their bank for that filter
  is smaller than one batch and we have just seen all of it;
- `drawCount` reaches a hard cap of 6, so a pathological filter cannot burn
  calls indefinitely.

Once saturated we never call out for that filter again.

## Provider API (as documented)

```
Base URL   https://sdashapi.com/api
Auth       AccessToken: <token>   (custom header, not Authorization)
Endpoint   GET /v1/q?subject=<slug>&type=<slug>&year=<yyyy>&limit=<n>
Discovery  GET /v1/subjects, GET /v1/years
```

`type` slugs: `utme`, `wassce`, `neco`, `post-utme`, `university`.
`limit` defaults to 1, maximum 50. **`limit=1` returns `data` as an object;
`limit>1` returns an array.** The adapter normalises this away.

Response shape:

```json
{
  "status": 200,
  "data": {
    "id": 4821,
    "question": "Which of the following is the chemical formula for table salt?",
    "section": null,
    "option": { "a": "NaCl", "b": "KCl", "c": "CaCO3", "d": "NaOH" },
    "answer": "a",
    "solution": "NaCl is sodium chloride...",
    "image": null,
    "examtype": "UTME",
    "examyear": "2022"
  }
}
```

### Field mapping

| Provider | Ours | Notes |
| --- | --- | --- |
| `data.id` | `ProviderQuestion.providerQuestionId` | Stable; the primary dedupe key |
| `data.question` | `Question.questionText` | |
| `data.option` | `Question.options` | Keys upper-cased by `normalizeOptions` |
| `data.answer` | `Question.correctAnswer` | Upper-cased, then verified as an option key |
| `data.solution` | `Question.explanation` | `null` when absent |
| `data.image` | `Question.questionImageUrl` | |
| `data.examtype` | `Question.examType` | `UTME→JAMB`, `WASSCE→WAEC`, `NECO→NECO` |
| `data.examyear` | `Question.examYear` | String → Int |
| `data.section` | — | No column; retained in the raw payload |
| request `subject` | `Question.subjectId` | Via `Subject.slug` + alias table |

Constant on every imported row: `questionType: OBJECTIVE`,
`difficulty: INTERMEDIATE` (they send none), `questionNumber: null`,
`topicId: null`.

Subject slugs mostly line up — `prisma/seed.ts:280` sets `slug: slugify(name)`,
so `chemistry` and `physics` match directly. Multi-word subjects do not
(`english-language`, `further-mathematics`, `christian-religious-studies`),
hence the alias table, which is verified against `/v1/subjects` by a sync
script rather than guessed.

### Known consequences

- **Imported questions never reach topic-scoped practice.**
  `src/lib/question-pool.ts` notes that a question with `topicId IS NULL` "can
  never satisfy a scope filter — it is silently outside every slot". Imported
  questions therefore serve past-paper and subject-level practice only. The
  imported bank and the curriculum bank remain separate populations until
  something tags them.
- **`explanation` becomes nullable.** Many provider questions have no
  `solution`. Rejecting them would discard most of a catalogue we have already
  paid to fetch, and the question is still perfectly answerable.

## Data model

Three new tables, three new fields on `Question`, and one back-relation on
`Subject`.

```prisma
enum QuestionProvider { SDASH }

enum ProviderFetchStatus { PENDING  SATURATED  FAILED }
enum ProviderQuestionStatus { PENDING  PROMOTED  REJECTED }

/// The coverage ledger. One row per filter we have ever asked the provider for.
/// Its existence — not the presence of questions — is what makes a read a hit.
model ProviderFetch {
  id        String              @id @default(cuid())
  provider  QuestionProvider
  cacheKey  String              // canonical serialisation of the normalised filter
  status    ProviderFetchStatus @default(PENDING)

  // Denormalised so the admin console can browse coverage without parsing keys.
  subjectId String?
  examType  ExamType?
  examYear  Int?

  drawCount     Int @default(0)  // calls made
  rawCount      Int @default(0)  // distinct questions captured
  newInLastDraw Int @default(0)  // saturation signal
  promotedCount Int @default(0)  // became real questions
  rejectedCount Int @default(0)  // awaiting a human or a better mapper

  error       String?  @db.Text
  questions   ProviderQuestion[]
  startedAt   DateTime @default(now())
  completedAt DateTime?

  @@unique([provider, cacheKey])   // claims the fetch; this is the in-flight lock
  @@index([subjectId, examType, examYear])
}

/// Verbatim capture. Written before any mapping is attempted, and never edited.
model ProviderQuestion {
  id      String        @id @default(cuid())
  fetchId String
  fetch   ProviderFetch @relation(fields: [fetchId], references: [id], onDelete: Cascade)

  provider           QuestionProvider
  providerQuestionId String?
  fingerprint        String   // sha256 of normalised text + sorted option values
  payload            Json     // their response object, untouched

  status           ProviderQuestionStatus @default(PENDING)
  rejectionReasons Json?    // [{ field, message }] — the ImportRowError shape
  mapperVersion    Int      @default(1)

  questionId String?   @unique
  question   Question? @relation(fields: [questionId], references: [id], onDelete: SetNull)

  createdAt  DateTime @default(now())
  promotedAt DateTime?

  @@unique([provider, providerQuestionId])
  @@unique([provider, fingerprint])
  @@index([status, mapperVersion])
}

/// Papers the provider advertises, so the picker can offer papers we do not
/// hold yet. Synced from /v1/subjects and /v1/years.
model ProviderCatalogue {
  id        String           @id @default(cuid())
  provider  QuestionProvider
  subjectId String
  subject   Subject          @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  examType  ExamType
  examYear  Int
  syncedAt  DateTime         @updatedAt

  @@unique([provider, subjectId, examType, examYear])
  @@index([examType, examYear])
}
```

On `Question`:

```prisma
  explanation String?  @db.Text   // was required
  needsReview Boolean  @default(false)
  providerQuestion ProviderQuestion?
```

And on `Subject`, the back-relation Prisma requires for `ProviderCatalogue`:

```prisma
  providerCatalogue ProviderCatalogue[]
```

`ProviderQuestion.providerQuestionId` is nullable and carries a unique
constraint. That is intentional and safe: Postgres permits multiple `NULL`s in
a unique index, so payloads without an id fall through to the `fingerprint`
constraint instead of colliding with each other.

### Why these shapes

`@@unique([provider, cacheKey])` does double duty. It records coverage *and*
serves as the concurrency lock: the first request inserts a `PENDING` row and
wins, a concurrent second request hits the constraint, finds the existing row,
and waits rather than firing its own API call.

`fingerprint` is a secondary guard, not the primary key — `data.id` is stable,
so it is preferred. The hash catches the same question reissued under a new id.

`mapperVersion` + `status` is the re-promotion machinery: sweep `REJECTED` rows
with a version below the current one and retry them offline.

`rejectedCount` is deliberately **not** a failure signal. A fetch that returns
50 and promotes 34 is `SATURATED` — we hold all 50 raw, permanently. Only a
network, auth or protocol failure marks a fetch `FAILED` and leaves it eligible
for a retry.

## Module layout

```
src/lib/question-provider/
  types.ts        — provider interface + payload types
  sdash.ts        — the adapter: URLs, AccessToken header, zod response schema
  alias.ts        — subject-slug and exam-type alias tables (pure)
  cache-key.ts    — filter normalisation → canonical key (pure)
  mapper.ts       — raw payload → Question create input | rejections (pure)
  saturation.ts   — the stop rule (pure)
  ingest.ts       — orchestrator: claim, fetch, stage, promote, count
scripts/
  sync-provider-catalogue.ts
  probe-sdash.ts                    — live smoke checks, not in `npm test`
  test-provider-mapper.mts
  test-provider-cache-key.mts
  test-provider-alias.mts
  test-provider-saturation.mts
```

Everything but `ingest.ts` and `sdash.ts` is pure.

### The adapter boundary

```ts
export type ProviderFilter = {
  subjectSlug: string;
  examType: "WAEC" | "JAMB" | "NECO";
  examYear: number;
};

export interface QuestionProviderAdapter {
  readonly name: QuestionProvider;
  /** Their stable id for a payload, when they expose one. */
  identify(payload: unknown): string | null;
  /** One draw. Throws ProviderError (retryable vs terminal) on failure. */
  draw(filter: ProviderFilter, limit: number): Promise<unknown[]>;
}
```

`draw` returns `unknown[]` deliberately. It normalises the object-vs-array
split so nothing downstream cares, and hands payloads on **unvalidated**.
Validation belongs to the mapper, which runs against what we stored rather than
what came off the wire — that is what makes offline re-promotion possible.

`sdash.ts` takes an injected `fetch`, so it is testable against canned
responses with no network.

### The entry point

```ts
/**
 * Serves a filter from our own bank, calling the provider only the first time
 * we ever see it. Returns the questions and how they were obtained.
 */
export async function ensureQuestionsCached(
  filter: ProviderFilter,
  limit: number,
): Promise<{
  questions: Question[];
  source: "db" | "provider";
  ledger: { status: ProviderFetchStatus; rawCount: number; promotedCount: number };
}>;
```

Callers get questions. Whether a network call happened is observable but never
something they must handle, and once a filter saturates that branch is dead
code for it forever.

## Two prerequisites in existing code

Both are pre-existing gaps that this design cannot work around.

### The picker can never trigger a miss

`PastQuestionPicker` (`src/components/practice/past-question-picker.tsx:42`)
builds its entire three-step UI from `/api/questions/past-papers`, which is
`listPastPapers` grouping over `Question`. A paper we have never fetched is not
in that list, so it cannot be selected, so it is never fetched. Cache-on-read
cannot bootstrap itself.

**Fix:** `listPastPapers` returns the union of papers we hold and papers
`ProviderCatalogue` advertises. `PastPaper` gains:

```ts
cached: boolean;
questionCount: number | null;   // null when not yet fetched
```

The picker renders uncached papers without a count. The first student to pick
one pays a single API call.

### The year is collected and then discarded

The picker's third step is a year, but
`src/app/(dashboard)/practice/past-questions/[subjectSlug]/page.tsx:12` sends
only `?exam=`, and `generateQuizSchema` (`src/lib/validators.ts:60-76`) has no
`examYear` field. Today a "2022 JAMB Chemistry" pick generates from every JAMB
Chemistry year in the bank.

Our cache key is (subject, examType, year), so this must be fixed regardless.
`examYear` is added to `generateQuizSchema`, threaded through the picker link,
and passed into `generateQuiz`.

## The read path

The fetch fires in `generateQuiz` (`src/lib/assessment-generation.ts:56`),
after the subject resolves and before `pickQuestionsPreferringUnseen`. Not in
`listQuestions` — that is the admin browse path and must not hit the network.

```
resolve subject
  ↓
examType && examYear present?  ──no──→  unchanged: pick from DB
  ↓ yes
ledger row SATURATED?          ──yes─→  unchanged: pick from DB
  ↓ no
await ensureQuestionsCached({ subjectSlug, examType, examYear }, 50)
  ↓
after(() => saturate(filter))   ← remaining draws, off the response path
  ↓
pick from DB as normal
```

Gated on all three of subject/type/year, so topic quizzes, mock exams and JAMB
CBT never reach it. Those flows keep reading `Question` through the raw SQL in
`question-pool.ts` and gain the new rows for free. **No generator changes.**

`src/lib/rate-limit.ts` also caps outbound provider calls so a burst of misses
cannot hammer them.

## Merge rules

Per staged payload, in one transaction:

1. **Dedupe.** Upsert on `(provider, providerQuestionId)` using `data.id`.
   Already present → skip entirely; do not re-count, do not re-promote. The
   `fingerprint` is checked as a second key.
2. **Map** via the pure mapper (field table above). Option entries that are
   `null` or empty are dropped before counting.
3. **Validate** with a zod schema for their envelope, then
   `checkQuestionInvariants` from `src/lib/admin-question.ts` — the same gate
   the admin bulk import already passes through.
4. **Promote or reject.** Promote → create the `Question`, set
   `ProviderQuestion.questionId`, `status: PROMOTED`. Reject → `status:
   REJECTED` with `rejectionReasons` in the `{field, message}` shape
   `ImportRowError` already uses, so the admin console can render it with
   existing components.
5. **Update ledger counts** in the same transaction, so they cannot drift.

### Rejects

- `answer` is not a key of `option`. This is the dangerous case: nothing in the
  schema stops it, and such a question marks every student wrong, silently.
- Fewer than `MIN_OBJECTIVE_OPTIONS` (4) usable options.
- Empty or whitespace-only `question`.
- `examyear` that will not parse to an integer.

### Explicitly does not reject

A missing or empty `solution`. It promotes with `explanation: null` and
`needsReview: true`. This is the case the nullable column exists for.

Everything rejected keeps its raw payload and is eligible for re-promotion when
`MAPPER_VERSION` bumps.

## Testing

The interesting logic is pure, so it tests in the existing `node --test` +
`tsx` style with no database and no network, matching
`scripts/test-admin-question.mts` and `scripts/test-admin-import.mts`.

- **`test-provider-mapper.mts`** — the documented payload as a fixture, plus
  mutations that must reject (`answer: "e"` against options a–d, three options,
  empty `question`, `examyear: "n/a"`) and mutations that must promote
  (`solution: null` → `explanation: null, needsReview: true`; `image` present;
  lower-case answer key).
- **`test-provider-cache-key.mts`** — `chemistry/JAMB/2022` and
  `Chemistry/jamb/2022 ` produce one key; different years never collide.
- **`test-provider-alias.mts`** — `utme→JAMB`, `wassce→WAEC`, `neco→NECO`;
  `post-utme` and `university` are refused rather than folded into `CUSTOM`;
  `english-language` and `further-mathematics` resolve.
- **`test-provider-saturation.mts`** — the stop rule as a pure function of
  `(drawCount, rawCount, newInLastDraw)`: a full draw with zero new ids
  saturates; the 6-draw cap saturates; a partial draw saturates.

`sdash.ts` is exercised against canned responses through its injected `fetch`,
covering the `limit=1` object vs `limit>1` array split, a non-200 `status` in
the body, and malformed JSON. `ingest.ts` stays thin — claim, call, delegate,
count — so little logic lives in the untested impure layer.

All four suites are added to the `test` script in `package.json`.

## Migration

This does **not** go through `prisma migrate deploy` (`DIRECT_URL` is
unreachable from the dev machine).

1. Hand-write
   `prisma/migrations/20260901000000_question_provider_cache/migration.sql`
   with **LF line endings** — with `core.autocrlf=true`, a CRLF file silently
   drifts the migration checksum.
2. Apply it through the Supabase SQL editor, then **verify against
   `information_schema`** rather than trusting the success message; that editor
   reports success on partly-applied batches.
3. Contents: three enums, three tables, plus on `Question`:
   `ALTER COLUMN "explanation" DROP NOT NULL` and the `needsReview` column.
4. **Stop the dev server before `prisma generate`** — otherwise it fails EPERM
   on the query engine DLL and leaves a stale client throwing bogus `tsc`
   errors.

The nullable `explanation` needs its read sites updated in the same change:
`src/components/assessment/results-view.tsx:514`, the classroom practice result
page (`.../practice/result/page.tsx:228`),
`src/components/admin/question-form.tsx`, and the zod schemas in
`src/lib/validators.ts`. Both render sites get an honest "No explanation
available yet" empty state.

## Environment

```
SDASH_BASE_URL=https://sdashapi.com/api
SDASH_ACCESS_TOKEN=
QUESTION_PROVIDER_ENABLED=false
```

In `.env` (gitignored) with placeholders mirrored into `.env.example`, matching
how `TERMII_API_KEY` and `CLOUDINARY_API_SECRET` are handled. The flag ships
the whole feature dark.

The access token was shared in plain text during design and should be rotated
once the integration is wired up.

## Rollout

Six independently shippable steps. Imported-question quality is verified before
any student sees one.

1. Migration, schema, regenerated client. Nothing references it yet.
2. Pure modules and their tests. No behaviour change.
3. Adapter plus `sync-provider-catalogue.ts`. Run it; `ProviderCatalogue` fills
   from `/v1/subjects` and `/v1/years`. Still dark.
4. `ingest.ts`, reachable **only** from an admin-triggered backfill. Saturate a
   few papers, then review them in the admin console — real data, real
   rejection reasons, nothing at stake if their bank is not good enough.
5. Thread `examYear` through `generateQuizSchema`, the picker link and
   `generateQuiz`. Fixes the existing bug on its own merits.
6. `ProviderCatalogue` into `listPastPapers`; flag on. Student misses now
   self-serve.

## Open questions

- **Do repeat draws for one filter return distinct questions?** The saturation
  rule terminates correctly either way — if draws happen to be non-random it
  simply terminates sooner — so this is not blocking. `probe-sdash.ts` answers
  it before step 4.
- **Published rate limits are unknown.** `probe-sdash.ts` inspects response
  headers; the outbound cap in step 4 is set conservatively until we know.
- **Their error envelope is undocumented.** The adapter treats any non-200
  `status` in the body, or a body that fails the zod envelope schema, as a
  terminal `ProviderError`; the shape is confirmed by probe before step 4.
- **`data.section` is unmapped.** It stays in the raw payload. If it turns out
  to carry paper-section information worth surfacing, it can be mapped later
  and back-promoted with a `MAPPER_VERSION` bump — no re-fetching.
