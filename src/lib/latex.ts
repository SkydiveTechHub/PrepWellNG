import katex from "katex";
import {
  collectMathRefs,
  type MathDictionary,
} from "@/lib/math-dictionary";

// One KaTeX entry point for every surface that renders maths -- lesson prose,
// flashcards, and anything added later. It previously lived inline in
// flashcard-view.tsx behind a `require()`, so lessons had no maths at all and
// a teacher's "$$MA = \frac{Load}{Effort}$$" reached students as raw source.
//
// SECURITY. The output is injected with dangerouslySetInnerHTML, which is the
// only way to mount KaTeX's markup, so the safety argument has to be explicit:
//
//   * `trust: false` (KaTeX's default, set here so it cannot drift) refuses
//     the commands that can emit arbitrary markup or URLs -- \htmlClass,
//     \htmlData, \includegraphics, and \href. Without it, uploaded lesson
//     notes could inject a javascript: link through a formula.
//   * `throwOnError: false` makes a malformed formula render as an inline
//     error node rather than throwing and taking the whole lesson page down.
//     Uploaded notes are hand-typed; a stray brace must not be fatal.
//   * Everything KaTeX emits is HTML it constructed itself from a fixed
//     command set. It escapes the TeX source it echoes back into error nodes.
//
// The remaining requirement is the stylesheet: KaTeX markup is unreadable
// without katex.min.css, which is imported once in src/app/layout.tsx.

export function renderLatex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      trust: false,
    });
  } catch {
    // renderToString should not throw with throwOnError:false, but a KaTeX
    // upgrade changing that must degrade to the literal source, never to a
    // blank card or a crashed page.
    return tex;
  }
}

/**
 * Pre-renders every formula in a payload, for handing to a client component.
 *
 * Importing this module pulls KaTeX in, so this must only ever be called from
 * a server component — that is the whole point of it. The client counterpart
 * (`MathProvider` in src/components/lesson/markdown-client.tsx) consumes the
 * result and never imports KaTeX at all.
 *
 * Deduplicated by construction: `collectMathRefs` keys by formula, so a symbol
 * repeated across thirty cards is rendered once and sent once.
 */
export function buildMathDictionary(value: unknown): MathDictionary {
  const dictionary: MathDictionary = {};
  for (const [key, ref] of collectMathRefs(value)) {
    dictionary[key] = renderLatex(ref.tex, ref.displayMode);
  }
  return dictionary;
}
