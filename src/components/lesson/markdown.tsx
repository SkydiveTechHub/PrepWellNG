import { Fragment, type ReactNode } from "react";

// Renders the simple markdown subset used by lesson content:
// `## heading`, `- list items`, blank-line-separated paragraphs, and
// inline `**bold**`. Safe against HTML injection — everything is escaped.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {escapeHtml(part.slice(2, -2))}
        </strong>
      );
    }
    return <Fragment key={i}>{escapeHtml(part)}</Fragment>;
  });
}

export function Markdown({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);

  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith("## ")) {
          return (
            <h3
              key={idx}
              className="text-base font-semibold text-foreground pt-1"
            >
              {trimmed.slice(3)}
            </h3>
          );
        }

        const lines = trimmed.split("\n");
        if (lines.every((line) => line.trim().startsWith("- "))) {
          return (
            <ul key={idx} className="space-y-2">
              {lines.map((line, li) => (
                <li
                  key={li}
                  className="flex items-start gap-2.5 text-sm text-foreground/90 leading-relaxed"
                >
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span>{renderInline(line.trim().slice(2))}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={idx} className="text-sm text-foreground/90 leading-relaxed">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}
