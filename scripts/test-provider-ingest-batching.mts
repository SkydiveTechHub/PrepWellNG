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
  let findManyCalls = 0;
  // Additional hooks for the flush/mid-loop failure-handling tests: make the
  // Nth $transaction (promotion) call throw, or make createMany (the staged
  // rows flush) throw.
  let transactionCalls = 0;
  let transactionThrowsOnCall: number | null = null;
  let createManyThrowsOnce = false;

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
    _findManyCalls: () => number;
    _findFirstCalls: () => number;
    _throwOnTransactionCall: (n: number) => void;
    _throwOnNextCreateMany: () => void;
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
      async findMany({ where }) {
        findManyCalls += 1;
        return providerQuestions
          .filter((row) => row.fetchId === where.fetchId)
          .map((row) => ({
            providerQuestionId: row.providerQuestionId,
            fingerprint: row.fingerprint,
          }));
      },
      async createMany({ data }) {
        if (createManyThrowsOnce) {
          createManyThrowsOnce = false;
          throw new Error("simulated database failure flushing staged rows");
        }
        for (const row of data as ProviderQuestionRow[]) {
          providerQuestions.push({ ...row, id: `pq-${++pqSeq}` });
        }
        return { count: data.length };
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
      transactionCalls += 1;
      if (transactionThrowsOnCall !== null && transactionCalls === transactionThrowsOnCall) {
        throw new Error("simulated database failure mid-promotion");
      }
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
    _findManyCalls: () => findManyCalls,
    _findFirstCalls: () => findFirstCalls,
    _throwOnTransactionCall(n) {
      transactionThrowsOnCall = n;
    },
    _throwOnNextCreateMany() {
      createManyThrowsOnce = true;
    },
  };

  return db;
}

test("one draw reads existing rows once, not once per payload", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const payloads = Array.from({ length: 20 }, (_, i) => validPayload(i + 1));

  await ensureQuestionsCached(FILTER, 40, {
    db,
    now: () => Date.now(),
    getAdapter: () => ({
      name: "SDASH",
      async draw() { return payloads; },
      async listSubjects() { return []; },
      async listYears() { return []; },
    }),
  });

  // The whole point of the task: round trips must not scale with payloads.
  assert.equal(db._findManyCalls(), 1);
  assert.equal(db._findFirstCalls(), 0);
  assert.equal(db._questions.length, 20);
});

test("batching still rejects a duplicate already staged in this fetch", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const duplicate = validPayload(7);

  await ensureQuestionsCached(FILTER, 40, {
    db,
    now: () => Date.now(),
    // The same question twice inside one draw, and again on the next.
    getAdapter: () => ({
      name: "SDASH",
      async draw() { return [duplicate, duplicate, validPayload(8)]; },
      async listSubjects() { return []; },
      async listYears() { return []; },
    }),
  });

  assert.equal(db._questions.length, 2);
  assert.equal(db._fetchRow()?.promotedCount, 2);
});

test("a duplicate by fingerprint under a different provider id is still caught", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const original = validPayload(11);
  const reissued = { ...original, id: 999 }; // same text and options, new id

  await ensureQuestionsCached(FILTER, 40, {
    db,
    now: () => Date.now(),
    getAdapter: () => ({
      name: "SDASH",
      async draw() { return [original, reissued]; },
      async listSubjects() { return []; },
      async listYears() { return []; },
    }),
  });

  assert.equal(db._questions.length, 1);
});

test("a throw part-way through the loop leaves the ledger matching what actually committed", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  const payloads = [validPayload(21), validPayload(22), validPayload(23)];
  // The first promotion's $transaction (call 1) succeeds; the second's
  // (call 2) throws, simulating a DB failure partway through the draw. The
  // third payload is never reached.
  db._throwOnTransactionCall(2);

  const result = await ensureQuestionsCached(FILTER, 40, {
    db,
    now: () => Date.now(),
    getAdapter: () => ({
      name: "SDASH",
      async draw() { return payloads; },
      async listSubjects() { return []; },
      async listYears() { return []; },
    }),
  });

  assert.equal(result.ledger.promotedCount, 1, "the first payload's promotion committed");
  assert.equal(result.ledger.status, "PENDING", "a mid-draw failure is retryable, not saturated");
  assert.equal(db._questions.length, 1, "only the committed question exists");
});

test("a throw flushing the staged rows does not escape drawOnce, and nothing is counted as committed", async () => {
  const db = makeFakeDb({ physics: "subj-1" });
  // An invalid payload (empty question text) is rejected and staged, not
  // written immediately — the flush that would persist it is made to throw,
  // simulating the createMany round trip itself failing.
  const invalid = validPayload(31, { question: "" });
  db._throwOnNextCreateMany();

  const result = await ensureQuestionsCached(FILTER, 40, {
    db,
    now: () => Date.now(),
    getAdapter: () => ({
      name: "SDASH",
      async draw() { return [invalid]; },
      async listSubjects() { return []; },
      async listYears() { return []; },
    }),
  });

  // drawOnce must not have thrown: ensureQuestionsCached returned normally,
  // and the ledger was still written.
  assert.equal(result.ledger.status, "PENDING", "a flush failure is retryable, not saturated");
  assert.equal(result.ledger.rawCount, 0, "the staged row never committed");
  assert.equal(
    db._providerQuestions.filter((row) => row.fetchId !== "seed").length,
    0,
    "nothing from the failed flush should be visible",
  );
});
