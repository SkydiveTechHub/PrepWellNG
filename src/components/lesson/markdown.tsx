import { renderLatex } from "@/lib/latex";
import {
  InlineMarkdownBase,
  MarkdownBase,
} from "@/components/lesson/markdown-base";

// Server binding of the markdown renderer: formulas go straight through KaTeX
// as the tree is built, so the browser receives finished markup and no
// renderer.
//
// Import this from server components only. A client component importing it
// pulls KaTeX (~260KB) into that route's bundle -- use markdown-client.tsx
// there instead, which renders identically from a server-built dictionary.
// The rendering itself lives in markdown-base.tsx and is shared by both.

/**
 * Inline markdown with no block wrapper — for places whose content model is
 * phrasing only, where `<Markdown>`'s `<div>`/`<p>` would be invalid HTML: a
 * `<button>` teaser, a heading, a table cell. Renders bold, italic and maths;
 * block constructs are not applicable here and are left as literal text.
 */
export function InlineMarkdown({ content }: { content: string }) {
  return <InlineMarkdownBase content={content} renderMath={renderLatex} />;
}

/** Lesson prose: headings, lists, tables, rules, formulas and paragraphs. */
export function Markdown({ content }: { content: string }) {
  return <MarkdownBase content={content} renderMath={renderLatex} />;
}
