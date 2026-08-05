import { toNotes, type NotesBlock } from "@/lib/classroom";
import type { LessonBlock } from "@/lib/lesson-engine";
import { Markdown } from "@/components/lesson/markdown";
import { WorkedExample } from "@/components/lesson/worked-example";
import { InteractiveDiagram } from "@/components/lesson/interactive-diagram";

export function LessonNotes({
  blocks,
  fallbackContent,
}: {
  blocks: LessonBlock[];
  fallbackContent: string | null;
}) {
  const notes = toNotes(blocks);

  // All 150 authored lessons have blocks; this path is defensive.
  if (notes.length === 0) {
    return fallbackContent ? <Markdown content={fallbackContent} /> : null;
  }

  return (
    <article className="space-y-6">
      {notes.map((block) => (
        <NoteBlock key={block.id} block={block} />
      ))}
    </article>
  );
}

function NoteBlock({ block }: { block: NotesBlock }) {
  switch (block.type) {
    case "concept":
      return (
        <section>
          {block.title && (
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              {block.title}
            </h2>
          )}
          <div className="mt-2 leading-relaxed text-foreground">
            <Markdown content={block.text} />
          </div>
          {block.reveal && (
            <details className="mt-3 rounded-xl border border-border bg-secondary/40 p-3.5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                Show more
              </summary>
              <div className="mt-2 text-sm text-muted">
                <Markdown content={block.reveal} />
              </div>
            </details>
          )}
        </section>
      );

    case "example":
      return <WorkedExample block={block} />;

    case "diagram":
      return <InteractiveDiagram block={block} />;

    case "tip":
      return (
        <aside className="rounded-xl bg-tone-blue-soft p-4 text-sm text-tone-blue-ink">
          {block.text}
        </aside>
      );

    case "mistake":
      return (
        <aside className="rounded-xl bg-tone-red-soft p-4 text-sm text-tone-red-ink">
          <p className="line-through opacity-70">{block.wrong}</p>
          <p className="mt-1 font-semibold">{block.right}</p>
        </aside>
      );

    case "mnemonic":
      return (
        <aside className="rounded-xl bg-tone-purple-soft p-4 text-sm text-tone-purple-ink">
          <p className="font-bold">{block.phrase}</p>
          <ul className="mt-2 space-y-0.5">
            {block.encoded.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </aside>
      );

    default:
      return null;
  }
}
