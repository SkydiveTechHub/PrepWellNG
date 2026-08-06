import { Fragment, type ReactNode } from "react";
import { segmentMarkdown } from "@/lib/markdown-segments";

// Renders the markdown subset used by lesson content: `## heading`,
// `- bullets`, `1. numbered items`, pipe tables, `**bold**`, `*italic*`,
// `---` rules, and blank-line-separated paragraphs.
//
// Safe against HTML injection by construction: every string reaches the DOM as
// a React text child, and there is no dangerouslySetInnerHTML here. Lesson
// content is authored by upload, so it is untrusted input.

function renderInline(text: string): ReactNode[] {
  // Bold first so `**x**` is never consumed by the italic alternative.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function Markdown({ content }: { content: string }) {
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

          case "ul":
            return (
              <ul key={idx} className="space-y-2">
                {segment.items.map((item, li) => (
                  <li
                    key={li}
                    className="flex items-start gap-2.5 text-sm text-foreground/90 leading-relaxed"
                  >
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    <span>{renderInline(item)}</span>
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
                    <span>{renderInline(item)}</span>
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
                          {renderInline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {segment.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-border last:border-0">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 text-foreground/90 align-top">
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          default:
            return (
              <p key={idx} className="text-sm text-foreground/90 leading-relaxed">
                {renderInline(segment.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
