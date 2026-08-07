"use client";

import { useRouter } from "next/navigation";
import { TERM_LABELS, type ClassLevel, type Term } from "@/lib/curriculum-scope";
import {
  subjectsForTrack,
  tracksWithSubjects,
  type LessonFilter,
  type SubjectOption,
} from "@/lib/admin-lesson-browse";

const SELECT_CLS =
  "px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";
const LABEL_CLS = "text-[11px] font-semibold uppercase tracking-wider text-muted";

interface Props {
  subjects: SubjectOption[];
  filter: LessonFilter;
  /** Class levels and terms the selected subject actually teaches. */
  classLevels: ClassLevel[];
  terms: Term[];
}

export function LessonFilterBar({ subjects, filter, classLevels, terms }: Props) {
  const router = useRouter();

  // Each control clears the ones below it. A subject from the old track, or a
  // term from the old class, would otherwise survive into a filter it does not
  // belong to and silently return nothing.
  function go(next: Partial<Record<"track" | "subject" | "class" | "term", string>>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `/admin/lessons?${query}` : "/admin/lessons");
  }

  const trackOptions = tracksWithSubjects(subjects);
  const subjectOptions = subjectsForTrack(subjects, filter.track);

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border-strong bg-card p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="track-filter" className={LABEL_CLS}>
          Track
        </label>
        <select
          id="track-filter"
          value={filter.track ?? ""}
          onChange={(e) => go({ track: e.target.value })}
          className={SELECT_CLS}
        >
          <option value="">All tracks</option>
          {trackOptions.map((track) => (
            <option key={track.value} value={track.value}>
              {track.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="subject-filter" className={LABEL_CLS}>
          Subject
        </label>
        <select
          id="subject-filter"
          value={filter.subjectId ?? ""}
          onChange={(e) => go({ track: filter.track ?? "", subject: e.target.value })}
          className={SELECT_CLS}
        >
          <option value="">Choose a subject…</option>
          {subjectOptions.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="class-filter" className={LABEL_CLS}>
          Class
        </label>
        <select
          id="class-filter"
          value={filter.classLevel ?? ""}
          disabled={!filter.subjectId}
          onChange={(e) =>
            go({
              track: filter.track ?? "",
              subject: filter.subjectId ?? "",
              class: e.target.value,
            })
          }
          className={`${SELECT_CLS} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <option value="">All classes</option>
          {classLevels.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="term-filter" className={LABEL_CLS}>
          Term
        </label>
        <select
          id="term-filter"
          value={filter.term ?? ""}
          disabled={!filter.subjectId}
          onChange={(e) =>
            go({
              track: filter.track ?? "",
              subject: filter.subjectId ?? "",
              class: filter.classLevel ?? "",
              term: e.target.value,
            })
          }
          className={`${SELECT_CLS} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <option value="">All terms</option>
          {terms.map((term) => (
            <option key={term} value={term}>
              {TERM_LABELS[term]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
