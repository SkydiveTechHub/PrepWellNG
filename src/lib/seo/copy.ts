/** Google renders roughly 155-160 characters of a description. */
const MAX_DESCRIPTION = 160;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Truncate at a word boundary so the snippet never ends mid-word. */
function clamp(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= MAX_DESCRIPTION) return trimmed;

  const cut = trimmed.slice(0, MAX_DESCRIPTION - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function topicPageTitle({
  topicTitle,
  subjectName,
}: {
  topicTitle: string;
  subjectName: string;
}): string {
  return `${topicTitle} — ${subjectName}`;
}

export function topicPageDescription({
  topicTitle,
  subjectName,
  description,
  subtopicTitles,
}: {
  topicTitle: string;
  subjectName: string;
  description: string | null;
  subtopicTitles: readonly string[];
}): string {
  const authored = description?.trim();
  if (authored) return clamp(authored);

  // No boilerplate-only fallback: the subtopic titles are the page's real
  // content, so the snippet describes them.
  const covered = subtopicTitles.slice(0, 3).join(", ");
  const tail = covered ? ` Covers ${covered}.` : "";
  return clamp(
    `${topicTitle} in ${subjectName} for WAEC, JAMB and NECO, with worked past questions.${tail}`,
  );
}

export function paperPageTitle({
  exam,
  year,
  subjectName,
}: {
  exam: string;
  year: number;
  subjectName: string;
}): string {
  return `${exam} ${year} ${subjectName} Past Questions and Answers`;
}

export function paperPageDescription({
  exam,
  year,
  subjectName,
  questionCount,
  topicCount,
}: {
  exam: string;
  year: number;
  subjectName: string;
  questionCount: number;
  topicCount: number;
}): string {
  return clamp(
    `${plural(questionCount, "question")} from the ${exam} ${year} ${subjectName} paper across ${plural(topicCount, "topic")}, each with the correct answer and a worked explanation.`,
  );
}

/**
 * The visible intro paragraph, distinct from paperPageDescription.
 *
 * paperPageDescription is defensible as a <meta> snippet (a summary of what
 * the paper is), but it is false as the page's own opening sentence: it says
 * "each with the correct answer and a worked explanation" while the page
 * renders only `sampleCount` worked questions. A reader who lands, counts the
 * samples, and leaves is the exact outcome this page exists to avoid. This
 * function states the paper's real size but claims worked answers only for
 * the samples actually shown.
 */
export function paperPageIntro({
  exam,
  year,
  subjectName,
  questionCount,
  topicCount,
  sampleCount,
}: {
  exam: string;
  year: number;
  subjectName: string;
  questionCount: number;
  topicCount: number;
  sampleCount: number;
}): string {
  return clamp(
    `The ${exam} ${year} ${subjectName} paper has ${plural(questionCount, "question")} across ${plural(topicCount, "topic")}. See ${plural(sampleCount, "sample question")} below, each with the correct answer and a worked explanation.`,
  );
}
