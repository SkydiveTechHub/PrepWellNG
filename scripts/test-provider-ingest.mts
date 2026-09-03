import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import {
  ensureQuestionsCached,
  LEASE_WINDOW_MS,
  type IngestDb,
  type IngestDeps,
} from "../src/lib/question-provider/ingest";
import { fingerprintPayload } from "../src/lib/question-provider/mapper";
import { ProviderError, type ProviderFilter, type QuestionProviderAdapter } from "../src/lib/question-provider/types";

// Cloudinary is not part of the injected deps (only db and the provider
// adapter are, per the task's scope). To exercise the mirror-failure paths
// we configure real (but fake-valued) credentials and stub the global
// `fetch` that `uploadRemoteImage` calls, then restore both afterwards.
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

  const db: IngestDb & {
    _seedProviderQuestion: (row: Partial<ProviderQuestionRow> & { fingerprint: string }) => void;
    _providerQuestions: ProviderQuestionRow[];
    _questions: QuestionRow[];
    _throwOnFindFirstCall: (n: number) => void;
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
  return { db, getAdapter: () => adapter };
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

test("a mirror failure Cloudinary blames on us (blameCaller: false) stages PENDING, not REJECTED", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: "Service unavailable" } }),
    }) as unknown as Response) as typeof fetch;

  try {
    const db = makeFakeDb({ physics: "subj-1" });
    const payload = validPayload(501, {
      image: "https://res.cloudinary.com/aloc-ng/image/upload/v1/q.png",
    });
    const { adapter } = makeAdapter([async () => [payload]]);
    const result = await ensureQuestionsCached(FILTER, 10, deps(db, adapter));

    assert.equal(result.ledger.rawCount, 1);
    assert.equal(result.ledger.promotedCount, 0);
    const staged = db._providerQuestions.at(-1);
    assert.equal(staged?.status, "PENDING");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a mirror failure Cloudinary blames on the file (blameCaller: true) is REJECTED", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Invalid image file" } }),
    }) as unknown as Response) as typeof fetch;

  try {
    const db = makeFakeDb({ physics: "subj-1" });
    const payload = validPayload(502, {
      image: "https://res.cloudinary.com/aloc-ng/image/upload/v1/q.png",
    });
    const { adapter } = makeAdapter([async () => [payload]]);
    const result = await ensureQuestionsCached(FILTER, 10, deps(db, adapter));

    assert.equal(result.ledger.promotedCount, 0);
    const staged = db._providerQuestions.at(-1);
    assert.equal(staged?.status, "REJECTED");
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
