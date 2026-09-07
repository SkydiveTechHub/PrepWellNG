import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import {
  ensureQuestionsCached,
  saturate,
  readLedger,
  LEASE_WINDOW_MS,
  type IngestDb,
  type IngestDeps,
} from "../src/lib/question-provider/ingest";
import { MAX_DRAWS } from "../src/lib/question-provider/saturation";
import { fingerprintPayload } from "../src/lib/question-provider/mapper";
import { ProviderError, type ProviderFilter, type QuestionProviderAdapter } from "../src/lib/question-provider/types";
import { EXHAUSTED_COOLDOWN_MS } from "../src/lib/question-provider/state";

// Cloudinary is not part of the injected deps (only db and the provider
// adapter are, per the task's scope). The draw loop no longer mirrors images
// itself (that now happens in a later mirror pass), so these credentials and
// the `fetch` stubs below are no longer exercised by `drawOnce` — the stubs
// stay only to prove the draw never reaches Cloudinary at all.
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-key";
process.env.CLOUDINARY_API_SECRET = "test-secret";

const FILTER: ProviderFilter = { subjectSlug: "physics", examType: "JAMB", examYear: 2020 };

function validPayload(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    question: `Question number ${id}?`,
    solution: `Explanation for ${id}.`,
    examtype: "utme",
    examyear: "2020",
    option: { a: "One", b: "Two", c: "Three", d: "Four" },
    answer: "b",
    image: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// In-memory fake for the narrow `IngestDb` slice `ingest.ts` depends on.
// ---------------------------------------------------------------------------

type FetchRow = {
  id: string;
  status: "PENDING" | "SATURATED" | "FAILED";
  rawCount: number;
  promotedCount: number;
  rejectedCount: number;
  drawCount: number;
  newInLastDraw: number;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
};

type ProviderQuestionRow = {
  id: string;
  fetchId: string;
  provider: "SDASH";
  providerQuestionId: string | null;
  fingerprint: string;
  payload: unknown;
  status: "PENDING" | "PROMOTED" | "REJECTED";
  rejectionReasons?: unknown;
  mapperVersion: number;
  questionId?: string;
};

type QuestionRow = {
  id: string;
  subjectId: string;
  examType: string;
  examYear: number;
  questionText: string;
  questionImageUrl: string | null;
  questionType: "OBJECTIVE";
  options: Record<string, string>;
  correctAnswer: string;
  explanation: string;
};

function makeFakeDb(subjects: Record<string, string>) {
  const fetchesById = new Map<string, FetchRow>();
  const fetchesByKey = new Map<string, string>();
  const providerQuestions: ProviderQuestionRow[] = [];
  const questions: QuestionRow[] = [];
  let fetchSeq = 0;
  let pqSeq = 0;
  let qSeq = 0;

  // Test hook: make the Nth call to providerQuestion.findFirst throw, to
  // simulate a mid-draw crash after some payloads have already committed.
  let findFirstCalls = 0;
  let findFirstThrowsOnCall: number | null = null;

  let circuit: {
    provider: "SDASH";
    state: "OK" | "EXHAUSTED" | "BLOCKED";
    cooldownUntil: Date | null;
    lastError: string | null;
    creditsRemaining: number | null;
  } | null = null;

  const db: IngestDb & {
    providerState: {
      findUnique(args: { where: { provider: "SDASH" } }): Promise<{
        provider: "SDASH";
        state: "OK" | "EXHAUSTED" | "BLOCKED";
        cooldownUntil: Date | null;
        lastError: string | null;
        creditsRemaining: number | null;
      } | null>;
      upsert(args: {
        where: { provider: "SDASH" };
        create: {
          provider: "SDASH";
          state: "OK" | "EXHAUSTED" | "BLOCKED";
          cooldownUntil: Date | null;
          lastError?: string | null;
        };
        update: {
          state: "OK" | "EXHAUSTED" | "BLOCKED";
          cooldownUntil: Date | null;
          lastError?: string | null;
        };
      }): Promise<unknown>;
      updateMany(args: {
        where: {
          provider: "SDASH";
          state?: "OK" | "EXHAUSTED" | "BLOCKED";
          cooldownUntil?: Date | null;
        };
        data: {
          state?: "OK" | "EXHAUSTED" | "BLOCKED";
          cooldownUntil?: Date | null;
        };
      }): Promise<{ count: number }>;
    };
    _seedProviderQuestion: (row: Partial<ProviderQuestionRow> & { fingerprint: string }) => void;
    _providerQuestions: ProviderQuestionRow[];
    _questions: QuestionRow[];
    _throwOnFindFirstCall: (n: number) => void;
    _fetchRow: () => FetchRow | null;
  } = {
    subject: {
      async findUnique({ where }) {
        const id = subjects[where.slug];
        return id ? { id } : null;
      },
    },
    providerFetch: {
      async findUnique({ where }) {
        if ("id" in where) return fetchesById.get(where.id) ?? null;
        const id = fetchesByKey.get(
          `${where.provider_cacheKey.provider}:${where.provider_cacheKey.cacheKey}`,
        );
        return id ? (fetchesById.get(id) ?? null) : null;
      },
      async create({ data }) {
        const key = `${data.provider}:${data.cacheKey}`;
        if (fetchesByKey.has(key)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        const row: FetchRow = {
          id: `fetch-${++fetchSeq}`,
          status: "PENDING",
          rawCount: 0,
          promotedCount: 0,
          rejectedCount: 0,
          drawCount: 0,
          newInLastDraw: 0,
          startedAt: new Date(),
          completedAt: null,
          error: null,
        };
        fetchesById.set(row.id, row);
        fetchesByKey.set(key, row.id);
        return row;
      },
      // Mirrors the real conditional update: the write lands only if the row
      // still looks exactly as the caller last saw it.
      async updateMany({ where, data }) {
        const row = fetchesById.get(where.id);
        if (
          !row ||
          row.status !== where.status ||
          row.startedAt.getTime() !== where.startedAt.getTime()
        ) {
          return { count: 0 };
        }
        row.startedAt = data.startedAt;
        return { count: 1 };
      },
      async update({ where, data }) {
        const row = fetchesById.get(where.id);
        if (!row) throw new Error(`no fetch row ${where.id}`);
        for (const [k, v] of Object.entries(data)) {
          if (v === undefined) continue;
          if (v && typeof v === "object" && "increment" in (v as object)) {
            const current = (row as unknown as Record<string, number>)[k] ?? 0;
            (row as unknown as Record<string, number>)[k] =
              current + (v as { increment: number }).increment;
          } else {
            (row as unknown as Record<string, unknown>)[k] = v;
          }
        }
        return row;
      },
    },
    providerQuestion: {
      async findFirst({ where }) {
        findFirstCalls += 1;
        if (findFirstThrowsOnCall !== null && findFirstCalls === findFirstThrowsOnCall) {
          throw new Error("simulated database failure mid-draw");
        }
        const match = providerQuestions.find((pq) => {
          if (pq.fetchId !== where.fetchId) return false;
          return where.OR.some((cond) =>
            "providerQuestionId" in cond
              ? pq.providerQuestionId === cond.providerQuestionId
              : pq.fingerprint === cond.fingerprint,
          );
        });
        return match ? { id: match.id } : null;
      },
      async create({ data }) {
        const row: ProviderQuestionRow = {
          id: `pq-${++pqSeq}`,
          fetchId: data.fetchId,
          provider: data.provider,
          providerQuestionId: data.providerQuestionId,
          fingerprint: data.fingerprint,
          payload: data.payload,
          status: data.status,
          rejectionReasons: data.rejectionReasons,
          mapperVersion: data.mapperVersion,
          questionId: data.questionId,
        };
        providerQuestions.push(row);
        return row;
      },
    },
    question: {
      async findMany({ where, take }) {
        return questions
          .filter(
            (q) =>
              q.subjectId === where.subjectId &&
              q.examType === where.examType &&
              q.examYear === where.examYear &&
              q.questionType === where.questionType,
          )
          .slice(0, take) as unknown as import("@prisma/client").Question[];
      },
    },
    async $transaction(fn) {
      return fn({
        question: {
          async create({ data }) {
            const row: QuestionRow = { id: `q-${++qSeq}`, ...data };
            questions.push(row);
            return row as unknown as import("@prisma/client").Question;
          },
        },
        providerQuestion: db.providerQuestion,
      });
    },
    providerState: {
      async findUnique({ where }) {
        return circuit && circuit.provider === where.provider ? { ...circuit } : null;
      },
      async upsert({ where, create, update }) {
        circuit = circuit
          ? { ...circuit, ...update }
          : { lastError: null, creditsRemaining: null, ...create, provider: where.provider };
        return { ...circuit };
      },
      // Mirrors providerFetch.updateMany: the write lands only if the row
      // still matches every field named in `where`.
      async updateMany({ where, data }) {
        if (!circuit || circuit.provider !== where.provider) return { count: 0 };
        if ("state" in where && circuit.state !== where.state) return { count: 0 };
        if ("cooldownUntil" in where) {
          const want = where.cooldownUntil;
          const have = circuit.cooldownUntil;
          const same = want === null ? have === null : have !== null && have.getTime() === want.getTime();
          if (!same) return { count: 0 };
        }
        circuit = { ...circuit, ...data };
        return { count: 1 };
      },
    },
    _seedProviderQuestion(row) {
      providerQuestions.push({
        id: `pq-seed-${++pqSeq}`,
        fetchId: "seed",
        provider: "SDASH",
        providerQuestionId: null,
        payload: {},
        status: "PROMOTED",
        mapperVersion: 1,
        ...row,
      });
    },
    _providerQuestions: providerQuestions,
    _questions: questions,
    _fetchRow() {
      return [...fetchesById.values()][0] ?? null;
    },
    _throwOnFindFirstCall(n) {
      findFirstThrowsOnCall = n;
    },
  };

  return db;
}

function makeAdapter(draws: Array<() => Promise<unknown[]>>) {
  let i = 0;
  let calls = 0;
  const adapter: QuestionProviderAdapter = {
    name: "SDASH",
    async draw() {
      calls += 1;
      const fn = draws[Math.min(i, draws.length - 1)];
      i += 1;
      return fn();
    },
    async listSubjects() {
      return [];
    },
    async listYears() {
      return [];
    },
  };
  return { adapter, calls: () => calls };
}

function deps(db: IngestDb, adapter: QuestionProviderAdapter): IngestDeps {
  return { db, getAdapter: () => adapter, now: () => Date.now() };
}

// ---------------------------------------------------------------------------

test("an empty draw saturates the ledger with rawCount 0", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const { adapter } = makeAdapter([async () => []]);
  const result = await ensureQuestionsCached(FILTER, 10, deps(db, adapter));
  assert.equal(result.ledger.status, "SATURATED");
  assert.equal(result.ledger.rawCount, 0);
});

test("a terminal ProviderError fails the ledger permanently and is never redrawn", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const { adapter, calls } = makeAdapter([
    async () => {
      throw new ProviderError("revoked credential", "terminal");
    },
    async () => {
      throw new Error("must not be called — the filter is already FAILED");
    },
  ]);
  const d = deps(db, adapter);

  const first = await ensureQuestionsCached(FILTER, 10, d);
  assert.equal(first.ledger.status, "FAILED");

  const second = await ensureQuestionsCached(FILTER, 10, d);
  assert.equal(second.ledger.status, "FAILED");
  assert.equal(calls(), 1, "a FAILED ledger must short-circuit, not redraw");
});

test("a retryable ProviderError leaves the ledger PENDING", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const { adapter } = makeAdapter([
    async () => {
      throw new ProviderError("temporary blip", "retryable");
    },
  ]);
  const result = await ensureQuestionsCached(FILTER, 10, deps(db, adapter));
  assert.equal(result.ledger.status, "PENDING");
});

test("a payload already seen in THIS fetch is skipped entirely: not counted, not staged", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const payload = validPayload(999);
  const fingerprint = fingerprintPayload(payload);
  // fetch-1 is the row ensureQuestionsCached is about to create for FILTER.
  db._seedProviderQuestion({
    fetchId: "fetch-1",
    providerQuestionId: "some-other-id",
    fingerprint,
  });

  const rowsBefore = db._providerQuestions.length;
  const { adapter } = makeAdapter([async () => [payload]]);
  const result = await ensureQuestionsCached(FILTER, 10, deps(db, adapter));

  assert.equal(db._providerQuestions.length, rowsBefore, "no new row should be staged");
  assert.equal(result.ledger.rawCount, 0);
  assert.equal(result.ledger.promotedCount, 0);
});

test("an image the mirror pass would later blame on us (blameCaller: false) stages PENDING without ever calling Cloudinary", async () => {
  // The fetch stub used to control what `uploadRemoteImage` reported back
  // (a 503, blamed on Cloudinary/us). Now that mirroring has left the draw
  // loop, this outcome can no longer be produced inline at all — the stub
  // stays only to prove the draw never reaches it.
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return {
      ok: false,
      status: 503,
      json: async () => ({ error: { message: "Service unavailable" } }),
    } as unknown as Response;
  }) as typeof fetch;

  try {
    const db = makeFakeDb({ physics: "subj-1" });
    const payload = validPayload(501, {
      image: "https://res.cloudinary.com/aloc-ng/image/upload/v1/q.png",
    });
    const { adapter } = makeAdapter([async () => [payload]]);
    const result = await ensureQuestionsCached(FILTER, 10, deps(db, adapter));

    assert.equal(fetchCalls, 0, "the draw must not call Cloudinary at all");
    assert.equal(result.ledger.rawCount, 1);
    assert.equal(result.ledger.promotedCount, 0);
    assert.equal(db._fetchRow()?.rejectedCount, 0);
    const staged = db._providerQuestions.at(-1);
    assert.equal(staged?.status, "PENDING");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an image the mirror pass would later reject (blameCaller: true) still stages PENDING, not REJECTED, until that pass runs", async () => {
  // This used to be the case where Cloudinary rejected the file itself and
  // the draw staged it REJECTED on the spot. `drawOnce` no longer attempts
  // the mirror, so it cannot know yet whether Cloudinary will accept the
  // file — that verdict, and the REJECTED/PENDING split it drives, belongs
  // to the mirror pass now, not to the draw. The stub stays to prove the
  // draw never reaches Cloudinary to find out.
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return {
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Invalid image file" } }),
    } as unknown as Response;
  }) as typeof fetch;

  try {
    const db = makeFakeDb({ physics: "subj-1" });
    const payload = validPayload(502, {
      image: "https://res.cloudinary.com/aloc-ng/image/upload/v1/q.png",
    });
    const { adapter } = makeAdapter([async () => [payload]]);
    const result = await ensureQuestionsCached(FILTER, 10, deps(db, adapter));

    assert.equal(fetchCalls, 0, "the draw must not call Cloudinary at all");
    assert.equal(result.ledger.promotedCount, 0);
    assert.equal(db._fetchRow()?.rejectedCount, 0);
    const staged = db._providerQuestions.at(-1);
    assert.equal(staged?.status, "PENDING");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a throw mid-draw leaves the ledger counters matching what actually committed", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const payloads = [validPayload(1), validPayload(2)];
  // The first payload's dedupe check (call 1) succeeds; the second's (call 2)
  // throws, simulating a DB failure partway through the draw.
  db._throwOnFindFirstCall(2);

  const { adapter } = makeAdapter([async () => payloads]);
  const result = await ensureQuestionsCached(FILTER, 10, deps(db, adapter));

  assert.equal(result.ledger.promotedCount, 1, "the first payload's promotion committed");
  assert.equal(result.ledger.status, "PENDING", "a mid-draw failure is retryable, not saturated");
  assert.equal(db._questions.length, 1, "only the committed question exists");
});

test("a live lease means a second concurrent caller reads the DB without drawing", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  // 50 distinct, valid payloads: a full batch that all promote, so the draw
  // stays PENDING (not saturated) — the case the lease actually needs to
  // cover, since a SATURATED/FAILED ledger already short-circuits on its own.
  const fullBatch = Array.from({ length: 50 }, (_, i) => validPayload(2000 + i));
  const { adapter, calls } = makeAdapter([
    async () => fullBatch,
    async () => {
      throw new Error("must not be called — the lease is still live");
    },
  ]);
  const d = deps(db, adapter);

  const first = await ensureQuestionsCached(FILTER, 10, d);
  assert.equal(first.ledger.status, "PENDING");
  assert.equal(first.ledger.rawCount, 50);

  const second = await ensureQuestionsCached(FILTER, 10, d);
  assert.equal(second.source, "db");
  assert.equal(second.ledger.rawCount, 50);
  assert.equal(calls(), 1, "the second call must not draw while the lease is live");
});

test("LEASE_WINDOW_MS is the documented 120 seconds", () => {
  assert.equal(LEASE_WINDOW_MS, 120_000);
});

test("a payload seen under a DIFFERENT fetch is still staged: boards recycle questions", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const payload = validPayload(999);
  const fingerprint = fingerprintPayload(payload);
  // The same question, already staged for another paper. Scoping the dedupe
  // to the fetch is what lets the second paper hold it too — globally unique
  // fingerprints would give it to whichever filter drew first.
  db._seedProviderQuestion({ fetchId: "fetch-other", fingerprint });

  const rowsBefore = db._providerQuestions.length;
  const { adapter } = makeAdapter([async () => [payload]]);
  const result = await ensureQuestionsCached(FILTER, 10, deps(db, adapter));

  assert.equal(db._providerQuestions.length, rowsBefore + 1, "it should stage again");
  assert.equal(result.ledger.rawCount, 1);
  assert.equal(result.ledger.promotedCount, 1);
});

test("saturate draws under a claim: a second loop on the same filter exits without drawing", async () => {
  const db = makeFakeDb({ physics: "subj-1" });

  // One full draw of unique payloads, so the filter stays PENDING and both
  // loops find work to do.
  let drawn = 0;
  const { adapter } = makeAdapter([
    async () => {
      drawn += 1;
      return Array.from({ length: 50 }, (_, i) => validPayload(drawn * 1000 + i));
    },
  ]);

  await ensureQuestionsCached(FILTER, 10, deps(db, adapter));
  const afterFirst = drawn;

  // Two background loops pointed at the same paper, exactly as two students
  // arriving inside the lease window would produce.
  await Promise.all([
    saturate(FILTER, deps(db, adapter)),
    saturate(FILTER, deps(db, adapter)),
  ]);

  assert.ok(drawn > afterFirst, "one loop should have gone on drawing");
  const ledger = await readLedger(FILTER, deps(db, adapter));
  assert.ok(
    ledger !== null && ledger.rawCount > 0,
    "the winning loop's work should be recorded",
  );
  // Every draw is claimed, so the cap holds however many loops were started.
  const row = db._fetchRow();
  assert.ok(
    row !== null && row.drawCount <= MAX_DRAWS + 1,
    `drawCount ${row?.drawCount} should not exceed the cap`,
  );
});

test("a stale lease is reclaimed by exactly one of two racing callers", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  // A full draw, so the filter stays PENDING rather than saturating on the
  // spot — a short draw would end the fetch and there would be no lease left
  // to race for.
  const { adapter } = makeAdapter([
    async () => Array.from({ length: 50 }, (_, i) => validPayload(i)),
  ]);
  await ensureQuestionsCached(FILTER, 10, deps(db, adapter));

  // Age the lease past the window so both callers see it as reclaimable.
  const row = db._fetchRow();
  assert.ok(row);
  row.startedAt = new Date(Date.now() - LEASE_WINDOW_MS - 1_000);
  const before = row.drawCount;

  let draws = 0;
  const { adapter: counting } = makeAdapter([
    async () => {
      draws += 1;
      return [validPayload(900 + draws)];
    },
  ]);
  await Promise.all([
    ensureQuestionsCached(FILTER, 10, deps(db, counting)),
    ensureQuestionsCached(FILTER, 10, deps(db, counting)),
  ]);

  assert.equal(draws, 1, "only one caller should reclaim the stale lease");
  assert.equal(db._fetchRow()?.drawCount, before + 1);
});

test("an exhausted draw leaves the fetch PENDING and arms the breaker", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const deps: IngestDeps = {
    db,
    now: () => Date.UTC(2026, 8, 7, 12, 0, 0),
    getAdapter: () => ({
      name: "SDASH",
      async draw() {
        throw new ProviderError("Insufficient credit. Please top up your wallet.", "exhausted", 403);
      },
      async listSubjects() { return []; },
      async listYears() { return []; },
    }),
  };

  await ensureQuestionsCached(FILTER, 40, deps);

  // FAILED here is the bug this whole task exists to prevent: it would retire
  // the paper permanently over a billing lapse.
  assert.equal(db._fetchRow()?.status, "PENDING");
  const circuit = await db.providerState.findUnique({ where: { provider: "SDASH" } });
  assert.equal(circuit?.state, "EXHAUSTED");
  assert.equal(
    circuit?.cooldownUntil?.getTime(),
    Date.UTC(2026, 8, 7, 12, 0, 0) + EXHAUSTED_COOLDOWN_MS,
  );
});

test("no provider call is made while the breaker is open", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const now = Date.UTC(2026, 8, 7, 12, 0, 0);
  await db.providerState.upsert({
    where: { provider: "SDASH" },
    create: { provider: "SDASH", state: "EXHAUSTED", cooldownUntil: new Date(now + 60_000) },
    update: { state: "EXHAUSTED", cooldownUntil: new Date(now + 60_000) },
  });

  let calls = 0;
  const deps: IngestDeps = {
    db,
    now: () => now,
    getAdapter: () => ({
      name: "SDASH",
      async draw() { calls += 1; return []; },
      async listSubjects() { return []; },
      async listYears() { return []; },
    }),
  };

  await ensureQuestionsCached(FILTER, 40, deps);
  assert.equal(calls, 0);
});

test("once the cooldown expires exactly one probe is spent", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const now = Date.UTC(2026, 8, 7, 12, 0, 0);
  await db.providerState.upsert({
    where: { provider: "SDASH" },
    create: { provider: "SDASH", state: "EXHAUSTED", cooldownUntil: new Date(now - 1) },
    update: { state: "EXHAUSTED", cooldownUntil: new Date(now - 1) },
  });

  let calls = 0;
  const deps: IngestDeps = {
    db,
    now: () => now,
    getAdapter: () => ({
      name: "SDASH",
      async draw() { calls += 1; return [validPayload(1)]; },
      async listSubjects() { return []; },
      async listYears() { return []; },
    }),
  };

  await ensureQuestionsCached(FILTER, 40, deps);
  assert.equal(calls, 1);
  // A successful probe closes the breaker — this is the auto-recovery.
  const circuit = await db.providerState.findUnique({ where: { provider: "SDASH" } });
  assert.equal(circuit?.state, "OK");
});

test("a terminal failure blocks the provider and still marks the fetch FAILED", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const deps: IngestDeps = {
    db,
    now: () => Date.UTC(2026, 8, 7, 12, 0, 0),
    getAdapter: () => ({
      name: "SDASH",
      async draw() { throw new ProviderError("Invalid AccessToken.", "terminal", 401); },
      async listSubjects() { return []; },
      async listYears() { return []; },
    }),
  };

  await ensureQuestionsCached(FILTER, 40, deps);
  assert.equal(db._fetchRow()?.status, "FAILED");
  const circuit = await db.providerState.findUnique({ where: { provider: "SDASH" } });
  assert.equal(circuit?.state, "BLOCKED");
});

test("two callers on an expired cooldown claim the single probe: only one calls the provider", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const now = Date.UTC(2026, 8, 7, 12, 0, 0);
  await db.providerState.upsert({
    where: { provider: "SDASH" },
    create: { provider: "SDASH", state: "EXHAUSTED", cooldownUntil: new Date(now - 1) },
    update: { state: "EXHAUSTED", cooldownUntil: new Date(now - 1) },
  });

  let calls = 0;
  const adapter: QuestionProviderAdapter = {
    name: "SDASH",
    async draw() {
      calls += 1;
      return [validPayload(1)];
    },
    async listSubjects() { return []; },
    async listYears() { return []; },
  };
  const depsA: IngestDeps = { db, now: () => now, getAdapter: () => adapter };
  const depsB: IngestDeps = { db, now: () => now, getAdapter: () => adapter };

  // Two distinct filters, exactly as two different past papers scheduling a
  // background draw off the same expired cooldown would produce.
  const filterB: ProviderFilter = { subjectSlug: "physics", examType: "JAMB", examYear: 2019 };
  await Promise.all([
    ensureQuestionsCached(FILTER, 40, depsA),
    ensureQuestionsCached(filterB, 40, depsB),
  ]);

  assert.equal(calls, 1, "the cooldown lapse must be claimed once, not once per filter");
});

test("a success-close does not clobber a breaker armed after the draw started", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const now = Date.UTC(2026, 8, 7, 12, 0, 0);
  const deps: IngestDeps = {
    db,
    now: () => now,
    getAdapter: () => ({
      name: "SDASH",
      async draw() {
        // Stands in for a concurrent caller arming the breaker while this
        // draw is still in flight — the race the guard exists to survive.
        await db.providerState.upsert({
          where: { provider: "SDASH" },
          create: { provider: "SDASH", state: "EXHAUSTED", cooldownUntil: new Date(now + 60_000) },
          update: { state: "EXHAUSTED", cooldownUntil: new Date(now + 60_000) },
        });
        return [validPayload(1)];
      },
      async listSubjects() { return []; },
      async listYears() { return []; },
    }),
  };

  await ensureQuestionsCached(FILTER, 40, deps);

  const circuit = await db.providerState.findUnique({ where: { provider: "SDASH" } });
  assert.equal(circuit?.state, "EXHAUSTED", "the late arm must win over the stale success");
});

test("an image-bearing question stages for the mirror pass and is not promoted inline", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const deps: IngestDeps = {
    db,
    now: () => Date.now(),
    getAdapter: () => ({
      name: "SDASH",
      async draw() {
        return [
          validPayload(1),
          validPayload(2, { image: "https://provider.test/diagram.png" }),
        ];
      },
      async listSubjects() { return []; },
      async listYears() { return []; },
    }),
  };

  await ensureQuestionsCached(FILTER, 40, deps);

  // The plain question promotes; the image one waits for the mirror pass.
  assert.equal(db._questions.length, 1);
  const staged = db._providerQuestions.find((row) => row.providerQuestionId === "2");
  assert.equal(staged?.status, "PENDING");
  assert.equal(db._fetchRow()?.promotedCount, 1);
  // Neither promoted nor rejected — it is pending work, not a failure.
  assert.equal(db._fetchRow()?.rejectedCount, 0);
});

test("a draw containing images does not call fetch during the loop", async () => {
  // The mirror is the slowest thing in ingest and must not sit between a
  // draw and its ledger write.
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response("", { status: 200 });
  }) as typeof fetch;

  try {
    const db = makeFakeDb({ physics: "subj-1" });
    await ensureQuestionsCached(FILTER, 40, {
      db,
      now: () => Date.now(),
      getAdapter: () => ({
        name: "SDASH",
        async draw() { return [validPayload(1, { image: "https://provider.test/a.png" })]; },
        async listSubjects() { return []; },
        async listYears() { return []; },
      }),
    });
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
