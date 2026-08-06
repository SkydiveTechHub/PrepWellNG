// Recognisers for natural teacher's-markdown conventions — a document header,
// a numbered quiz, and worked examples. Each is gated on an explicit heading
// by the scanner in ./index.ts, and each falls back to prose rather than
// erroring when its inner shape does not match.
// See docs/superpowers/specs/2026-08-06-natural-lesson-note-format-design.md

/**
 * Strips the `<Subject> Lesson Note:` boilerplate teachers put in front of the
 * real title. Anchored and specific: a title containing a colon for any other
 * reason ("Osmosis: A Closer Look") keeps it.
 */
export function stripLessonNotePrefix(title: string): string {
  return title.replace(/^[A-Za-z][A-Za-z\s]*?\blesson\s+notes?\s*:\s*/i, "").trim() || title.trim();
}

/**
 * `**Class:** SSS1 | **Term:** First Term` → `{ Class: "SSS1", Term: "First Term" }`.
 *
 * Returns null unless EVERY `|`-separated segment is a `**Key:** value` pair.
 * That is what keeps an ordinary sentence containing one bold run — "This
 * lesson is **important** for WAEC." — from being swallowed as metadata.
 */
export function parseInfoLine(line: string): Record<string, string> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("**")) return null;

  const segments = trimmed.split("|").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  const info: Record<string, string> = {};
  for (const segment of segments) {
    const match = /^\*\*([^*]+?)\s*:?\s*\*\*\s*:?\s*(.*)$/.exec(segment);
    if (!match) return null;
    const key = match[1].trim();
    const value = match[2].trim();
    if (!key || !value) return null;
    info[key] = value;
  }
  return info;
}

/** `---`, `***` or `___` alone on a line. */
export function isHorizontalRule(line: string): boolean {
  return /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}
