import { classifyStatus } from "./errors";
import { DRAW_LIMIT } from "./saturation";
import { toProviderExamSlug, toProviderSubjectSlug } from "./alias";
import {
  ProviderError,
  type ProviderFilter,
  type QuestionProviderAdapter,
} from "./types";

export type SdashConfig = {
  baseUrl: string;
  token: string;
  /** Test seam. */
  fetchImpl?: typeof fetch;
};

type Envelope = { status?: number; data?: unknown; message?: string };

export function createSdashAdapter(config: SdashConfig): QuestionProviderAdapter {
  const doFetch = config.fetchImpl ?? fetch;
  const root = config.baseUrl.replace(/\/$/, "");

  async function call(path: string, params: Record<string, string> = {}) {
    const url = new URL(root + path);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    let res: Response;
    try {
      res = await doFetch(url, { headers: { AccessToken: config.token } });
    } catch (error) {
      throw new ProviderError(`Provider unreachable: ${String(error)}`, "retryable");
    }

    const kind = classifyStatus(res.status);
    if (kind === "empty") return null;

    if (kind !== "ok") {
      const body = (await res.json().catch(() => null)) as Envelope | null;
      throw new ProviderError(
        body?.message ?? `Provider returned ${res.status}`,
        kind,
        res.status,
      );
    }

    const body = (await res.json().catch(() => null)) as Envelope | null;
    if (!body || body.data === undefined) {
      throw new ProviderError("Provider returned an unreadable body", "retryable", res.status);
    }
    return body.data;
  }

  return {
    name: "SDASH",

    async draw(filter: ProviderFilter, limit: number): Promise<unknown[]> {
      const subject = toProviderSubjectSlug(filter.subjectSlug);
      const type = toProviderExamSlug(filter.examType);

      // Refuse before spending a request. A subject they do not carry, or an
      // exam we are not entitled to, can never succeed.
      if (!subject) {
        throw new ProviderError(
          `The provider does not carry "${filter.subjectSlug}".`,
          "terminal",
        );
      }
      if (!type) {
        throw new ProviderError(`Exam type "${filter.examType}" is not requestable.`, "terminal");
      }

      const data = await call("/v1/q", {
        subject,
        type,
        year: String(filter.examYear),
        limit: String(Math.min(Math.max(1, limit), DRAW_LIMIT)),
      });

      if (data === null) return []; // 404 — nothing here
      // limit=1 gives an object, limit>1 an array. Normalise it away.
      return Array.isArray(data) ? data : [data];
    },

    async listSubjects() {
      const data = await call("/v1/subjects");
      return Array.isArray(data) ? (data as { id: number; name: string; slug: string }[]) : [];
    },

    async listYears() {
      const data = await call("/v1/years");
      return Array.isArray(data) ? (data as number[]) : [];
    },
  };
}

/** The configured adapter, from env. Throws when the token is missing. */
export function getSdashAdapter(): QuestionProviderAdapter {
  const token = process.env.SDASH_ACCESS_TOKEN;
  if (!token) throw new ProviderError("SDASH_ACCESS_TOKEN is not set", "terminal");
  return createSdashAdapter({
    baseUrl: process.env.SDASH_BASE_URL ?? "https://sdashapi.com/api",
    token,
  });
}
