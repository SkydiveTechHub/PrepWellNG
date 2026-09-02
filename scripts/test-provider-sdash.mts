import { test } from "node:test";
import assert from "node:assert/strict";
import { createSdashAdapter } from "../src/lib/question-provider/sdash";
import { ProviderError } from "../src/lib/question-provider/types";

const QUESTION = {
  id: 4821,
  question: "Which of the following is the chemical formula for table salt?",
  section: null,
  option: { a: "NaCl", b: "KCl", c: "CaCO3", d: "NaOH" },
  answer: "a",
  solution: "NaCl is sodium chloride...",
  image: null,
  examtype: "UTME",
  examyear: "2022",
};

/** Records the requests made, and replays canned responses. */
function stubFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; token: string | null }[] = [];
  let index = 0;
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, token: headers.get("AccessToken") });
    const canned = responses[Math.min(index++, responses.length - 1)];
    return new Response(JSON.stringify(canned.body), {
      status: canned.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function adapter(responses: { status: number; body: unknown }[]) {
  const { impl, calls } = stubFetch(responses);
  return {
    subject: createSdashAdapter({
      baseUrl: "https://sdashapi.com/api",
      token: "test-token",
      fetchImpl: impl,
    }),
    calls,
  };
}

test("a draw sends our slugs translated into theirs, with the token header", async () => {
  const { subject, calls } = adapter([{ status: 200, body: { status: 200, data: [QUESTION] } }]);
  await subject.draw({ subjectSlug: "english-language", examType: "JAMB", examYear: 2022 }, 50);

  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/api/v1/q");
  assert.equal(url.searchParams.get("subject"), "english");
  assert.equal(url.searchParams.get("type"), "utme");
  assert.equal(url.searchParams.get("year"), "2022");
  assert.equal(url.searchParams.get("limit"), "50");
  assert.equal(calls[0].token, "test-token");
});

test("an array payload comes back as an array", async () => {
  const { subject } = adapter([
    { status: 200, body: { status: 200, data: [QUESTION, { ...QUESTION, id: 4822 }] } },
  ]);
  const rows = await subject.draw({ subjectSlug: "chemistry", examType: "JAMB", examYear: 2022 }, 50);
  assert.equal(rows.length, 2);
});

test("a single-object payload is normalised into an array", async () => {
  // limit=1 returns an object, limit>1 an array. Nothing downstream should care.
  const { subject } = adapter([{ status: 200, body: { status: 200, data: QUESTION } }]);
  const rows = await subject.draw({ subjectSlug: "chemistry", examType: "JAMB", examYear: 2022 }, 1);
  assert.equal(rows.length, 1);
});

test("404 yields an empty array, not an error", async () => {
  // The filter is genuinely empty; the ledger saturates it with rawCount 0.
  const { subject } = adapter([
    { status: 404, body: { status: 404, message: "No questions found for those filters." } },
  ]);
  const rows = await subject.draw({ subjectSlug: "biology", examType: "NECO", examYear: 2018 }, 50);
  assert.deepEqual(rows, []);
});

test("403 throws a terminal ProviderError", async () => {
  const { subject } = adapter([
    { status: 403, body: { status: 403, message: "Your API access is limited." } },
  ]);
  await assert.rejects(
    () => subject.draw({ subjectSlug: "chemistry", examType: "JAMB", examYear: 2022 }, 50),
    (err: unknown) => err instanceof ProviderError && err.kind === "terminal",
  );
});

test("401 throws a terminal ProviderError", async () => {
  const { subject } = adapter([{ status: 401, body: { status: 401, message: "Invalid AccessToken." } }]);
  await assert.rejects(
    () => subject.draw({ subjectSlug: "chemistry", examType: "JAMB", examYear: 2022 }, 50),
    (err: unknown) => err instanceof ProviderError && err.kind === "terminal",
  );
});

test("500 throws a retryable ProviderError", async () => {
  const { subject } = adapter([{ status: 500, body: { status: 500 } }]);
  await assert.rejects(
    () => subject.draw({ subjectSlug: "chemistry", examType: "JAMB", examYear: 2022 }, 50),
    (err: unknown) => err instanceof ProviderError && err.kind === "retryable",
  );
});

test("a subject the provider does not carry is refused without a call", async () => {
  const { subject, calls } = adapter([{ status: 200, body: { status: 200, data: [] } }]);
  await assert.rejects(
    () => subject.draw({ subjectSlug: "further-mathematics", examType: "JAMB", examYear: 2022 }, 50),
    (err: unknown) => err instanceof ProviderError && err.kind === "terminal",
  );
  assert.equal(calls.length, 0, "must not spend a request on a known-absent subject");
});

test("limit is clamped to their maximum", async () => {
  const { subject, calls } = adapter([{ status: 200, body: { status: 200, data: [QUESTION] } }]);
  await subject.draw({ subjectSlug: "chemistry", examType: "JAMB", examYear: 2022 }, 500);
  assert.equal(new URL(calls[0].url).searchParams.get("limit"), "50");
});

test("listSubjects and listYears unwrap the envelope", async () => {
  const { subject } = adapter([
    { status: 200, body: { status: 200, data: [{ id: 7, name: "Chemistry", slug: "chemistry" }] } },
  ]);
  assert.deepEqual(await subject.listSubjects(), [{ id: 7, name: "Chemistry", slug: "chemistry" }]);

  const years = adapter([{ status: 200, body: { status: 200, data: [2026, 2025] } }]);
  assert.deepEqual(await years.subject.listYears(), [2026, 2025]);
});
