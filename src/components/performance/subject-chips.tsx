import Link from "next/link";
import type { SubjectChoice } from "@/lib/analytics/subject-view";

/** Weakest-first, so the chip a student most needs sits nearest the thumb. */
export function SubjectChips({
  subjects,
  activeSlug,
}: {
  subjects: SubjectChoice[];
  activeSlug: string;
}) {
  return (
    <div className="-mx-4 mb-5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max gap-2">
        {subjects.map((subject) => {
          const active = subject.slug === activeSlug;
          return (
            <Link
              key={subject.id}
              href={`/performance/subjects?subject=${subject.slug}`}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted hover:text-foreground"
              }`}
            >
              {subject.code}
              {subject.accuracy !== null && (
                <span className="ml-1.5 font-semibold opacity-70">
                  {Math.round(subject.accuracy)}%
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
