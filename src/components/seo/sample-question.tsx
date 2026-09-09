import type { PublicSampleQuestion } from "@/lib/seo/learn-data";

/**
 * A worked question, rendered fully open.
 *
 * No accordion and no client JS on purpose: content hidden behind an
 * interaction is discounted by crawlers, and these samples are the reason the
 * page deserves to rank at all.
 */
export function SampleQuestion({
  question,
  index,
}: {
  question: PublicSampleQuestion;
  index: number;
}) {
  const entries = Object.entries(question.options).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <article className="surface rounded-2xl border border-black/5 p-5 sm:p-6">
      <h3 className="text-base font-semibold ink">
        <span className="ink-muted mr-2">{index}.</span>
        {question.questionText}
      </h3>

      <ol className="mt-4 space-y-2">
        {entries.map(([letter, text]) => (
          <li
            key={letter}
            className={
              letter === question.correctAnswer
                ? "flex gap-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"
                : "flex gap-3 rounded-xl px-3 py-2 text-sm ink-muted"
            }
          >
            <span className="font-bold">{letter}.</span>
            <span>{text}</span>
          </li>
        ))}
      </ol>

      <div className="mt-4 border-t border-black/5 pt-4">
        <p className="text-xs font-bold uppercase tracking-widest ink-muted">
          Answer — {question.correctAnswer}
        </p>
        <p className="mt-2 text-sm leading-relaxed ink">{question.explanation}</p>
      </div>
    </article>
  );
}
