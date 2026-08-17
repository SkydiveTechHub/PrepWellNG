import { Fragment, type ReactNode } from "react";
import {
  isMathSpan,
  segmentMarkdown,
  splitInline,
  stripMathDelimiters,
} from "@/lib/markdown-segments";
// KaTeX markup is unreadable without its stylesheet -- fractions collapse onto
// one line and radicals lose their bar.
//
// It lives here, beside the only component that emits KaTeX markup, rather
// than in the root layout: imported there it was on the critical path of every
// route in the app, including the landing page and login, neither of which
// renders a formula. Next.js code-splits CSS per route, so colocating it means
// the ~23KB stylesheet loads for the lesson, flashcard and admin surfaces and
// nowhere else.
import "katex/dist/katex.min.css";

// Renders the markdown subset used by lesson content: `## heading`,
// `- bullets`, `1. numbered items`, pipe tables, `**bold**`, `*italic*`,
// `$…$` and `$$…$$` maths, `---` rules, and blank-line-separated paragraphs.
//
// Text is safe against HTML injection by construction: every string reaches
// the DOM as a React text child. The single exception is KaTeX output, which
// has to be injected as markup because that is the only way to mount it -- see
// src/lib/latex.ts for why `trust: false` makes that safe. Lesson content is
// authored by upload, so it is untrusted input.
//
// Maths arrives through the `renderMath` prop rather than a direct KaTeX
// import, so that this file can be rendered from either side of the client
// boundary without dragging a 260KB renderer into the browser bundle. The two
// bindings are markdown.tsx (server: KaTeX directly) and markdown-client.tsx
// (client: a lookup into markup the server already produced).

/** Turns a formula's source into KaTeX markup. */
export type RenderMath = (tex: string, displayMode: boolean) => string;

function renderInline(text: string, renderMath: RenderMath): ReactNode[] {
  const parts = splitInline(text);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (isMathSpan(part)) {
      return (
        <span
          key={i}
          className="inline-block align-middle"
          dangerouslySetInnerHTML={{
            __html: renderMath(stripMathDelimiters(part), false),
          }}
        />
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** See {@link InlineMarkdown} in markdown.tsx. */
export function InlineMarkdownBase({
  content,
  renderMath,
}: {
  content: string;
  renderMath: RenderMath;
}) {
  return <>{renderInline(content, renderMath)}</>;
}

/** See {@link Markdown} in markdown.tsx. */
export function MarkdownBase({
  content,
  renderMath,
}: {
  content: string;
  renderMath: RenderMath;
}) {
  const segments = segmentMarkdown(content);

  return (
    <div className="space-y-4">
      {segments.map((segment, idx) => {
        switch (segment.kind) {
          case "heading":
            return (
              <h3 key={idx} className="text-base font-semibold text-foreground pt-1">
                {segment.text}
              </h3>
            );

          case "rule":
            return <hr key={idx} className="border-border" />;

          case "math":
            // Display formulas can be wider than the column on a phone, so the
            // overflow scroller is not optional -- without it a long fraction
            // pushes the whole page sideways.
            return (
              <div
                key={idx}
                className="overflow-x-auto py-1 text-foreground"
                dangerouslySetInnerHTML={{ __html: renderMath(segment.tex, true) }}
              />
            );

          case "ul":
            return (
              <ul key={idx} className="space-y-2">
                {segment.items.map((item, li) => (
                  <li
                    key={li}
                    className="flex items-start gap-2.5 text-sm text-foreground/90 leading-relaxed"
                  >
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    <span>{renderInline(item, renderMath)}</span>
                  </li>
                ))}
              </ul>
            );

          case "ol":
            return (
              <ol key={idx} className="space-y-2">
                {segment.items.map((item, li) => (
                  <li
                    key={li}
                    className="flex items-start gap-2.5 text-sm text-foreground/90 leading-relaxed"
                  >
                    <span className="mt-0.5 text-xs font-semibold text-primary tabular-nums shrink-0">
                      {li + 1}.
                    </span>
                    <span>{renderInline(item, renderMath)}</span>
                  </li>
                ))}
              </ol>
            );

          case "table":
            return (
              <div key={idx} className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border-strong">
                      {segment.header.map((cell, ci) => (
                        <th
                          key={ci}
                          className="px-3 py-2 text-left font-semibold text-foreground"
                        >
                          {renderInline(cell, renderMath)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {segment.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-border last:border-0">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 text-foreground/90 align-top">
                            {renderInline(cell, renderMath)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          default:
            // `whitespace-pre-line` keeps single newlines as line breaks.
            // Strict markdown folds them into spaces, which ran consecutive
            // definitions together on one line -- "**Effort (E):** The force
            // applied to the machine" and "**Load (L):** The resistance…" are
            // written as two lines and read as one. Teachers type notes with
            // hard line breaks and expect to see them; the surrounding blank
            // lines still separate paragraphs, so nothing else changes.
            return (
              <p
                key={idx}
                className="whitespace-pre-line text-sm text-foreground/90 leading-relaxed"
              >
                {renderInline(segment.text, renderMath)}
              </p>
            );
        }
      })}
    </div>
  );
}
