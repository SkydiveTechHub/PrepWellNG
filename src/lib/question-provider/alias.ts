// Translations between our vocabulary and sdashapi's.
//
// Written from their live GET /v1/subjects on 2026-09-02, not guessed.
// scripts/sync-provider-catalogue.ts re-verifies it against the live list and
// fails loudly if a mapped slug disappears.

export type SupportedExamType = "WAEC" | "JAMB" | "NECO";
export type ProviderExamSlug = "utme" | "wassce" | "neco";

/**
 * The only exam types we ever request. `post-utme` and `university` exist in
 * their API but answer 403 — our token is not entitled to them — and our
 * ExamType enum could only represent them as CUSTOM, which would corrupt
 * past-paper grouping.
 */
export const PROVIDER_EXAM_SLUGS = ["utme", "wassce", "neco"] as const;

const EXAM_BY_SLUG: Record<ProviderExamSlug, SupportedExamType> = {
  utme: "JAMB",
  wassce: "WAEC",
  neco: "NECO",
};

export function toExamType(providerSlug: string): SupportedExamType | null {
  const key = providerSlug.trim().toLowerCase() as ProviderExamSlug;
  return EXAM_BY_SLUG[key] ?? null;
}

export function toProviderExamSlug(examType: string): ProviderExamSlug | null {
  const found = PROVIDER_EXAM_SLUGS.find(
    (slug) => EXAM_BY_SLUG[slug] === examType.trim().toUpperCase(),
  );
  return found ?? null;
}

/** Every slug their /v1/subjects returned. */
const PROVIDER_SUBJECT_SLUGS = new Set([
  "accounting", "agriculture", "arabic", "biology", "chemistry", "civiledu",
  "commerce", "computer", "crk", "currentaffairs", "economics", "english",
  "englishlit", "fineart", "geography", "government", "hausa", "history",
  "homeeconomics", "igbo", "independ", "insurance", "irk", "lastdays",
  "lekki", "lifechanger", "mathematics", "music", "physics", "sweetsixteen",
  "yoruba",
]);

/**
 * Our `Subject.slug` (from `slugify(name)` in prisma/seed.ts) to theirs, for
 * the cases where they differ. Anything not listed is tried as-is.
 */
const SUBJECT_ALIASES: Record<string, string> = {
  "english-language": "english",
  "literature-in-english": "englishlit",
  "christian-religious-studies": "crk",
  "islamic-studies": "irk",
  "civic-education": "civiledu",
  "computer-studies": "computer",
  "fine-art": "fineart",
  "agricultural-science": "agriculture",
  "financial-accounting": "accounting",
};

/**
 * Null means the provider does not carry the subject at all — measured cases
 * are Further Mathematics, Technical Drawing, Health Education, Marketing,
 * Office Practice and French. Those subjects are simply outside this feature.
 */
export function toProviderSubjectSlug(ourSlug: string): string | null {
  const normalised = ourSlug.trim().toLowerCase();
  const candidate = SUBJECT_ALIASES[normalised] ?? normalised;
  return PROVIDER_SUBJECT_SLUGS.has(candidate) ? candidate : null;
}
