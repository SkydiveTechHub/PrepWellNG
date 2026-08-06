import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { parseBlocks } from "@/lib/lesson-engine";
import { isAuthored } from "@/lib/admin-lesson";
import { resolveTopicLesson, topicLessonSelectWith } from "@/lib/classroom";
import { LessonFilterBar } from "@/components/admin/lesson-filter-bar";
import {
  groupByClass,
  levelsPresent,
  normaliseFilter,
  type RawFilterParams,
} from "@/lib/admin-lesson-browse";
import { TERM_LABELS, type ClassLevel, type Term } from "@/lib/curriculum-scope";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TH_CLS = "text-[11px] font-semibold uppercase tracking-wider text-muted";

interface TopicRow {
  topicId: string;
  topicTitle: string;
  classLevel: ClassLevel;
  term: Term;
  blockCount: number;
  authored: boolean;
}

export default async function AdminLessonsPage({
  searchParams,
}: {
  searchParams: Promise<RawFilterParams>;
}) {
  const filter = normaliseFilter(await searchParams);

  // Always cheap, and it drives both dropdowns.
  const subjects = await db.subject.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, trackCategory: true },
  });

  // Only a chosen subject pulls topics and their lesson blocks. With nothing
  // selected the page does no topic work at all — the flat list this page used
  // to render loaded every lesson in the database.
  const topics = filter.subjectId
    ? await db.topic.findMany({
        where: {
          subjectId: filter.subjectId,
          curriculumLevel: {
            ...(filter.classLevel ? { classLevel: filter.classLevel } : {}),
            ...(filter.term ? { term: filter.term } : {}),
          },
        },
        orderBy: [
          { curriculumLevel: { classLevel: "asc" } },
          { curriculumLevel: { term: "asc" } },
          { orderIndex: "asc" },
        ],
        select: {
          id: true,
          title: true,
          curriculumLevel: { select: { classLevel: true, term: true } },
          // Canonical fragment, so this list reports on the same lesson the
          // Classroom renders. Hand-rolling the shape here is how the two
          // drifted apart.
          subtopics: topicLessonSelectWith({ blocks: true, createdBy: true }),
        },
      })
    : [];

  const rows: TopicRow[] = topics.map((topic) => {
    const lesson = resolveTopicLesson(topic);
    return {
      topicId: topic.id,
      topicTitle: topic.title,
      classLevel: topic.curriculumLevel.classLevel as ClassLevel,
      term: topic.curriculumLevel.term as Term,
      blockCount: lesson ? parseBlocks(lesson.blocks).length : 0,
      authored: lesson ? isAuthored(lesson.createdBy) : false,
    };
  });

  // Dropdown options come from the subject's *whole* topic set, never from the
  // filtered rows: deriving them from `topics` would leave the current class as
  // the only class on offer and strand the admin there. Ids only, so it stays
  // cheap next to the query above.
  const levelSource = filter.subjectId
    ? await db.topic.findMany({
        where: { subjectId: filter.subjectId },
        select: { curriculumLevel: { select: { classLevel: true, term: true } } },
      })
    : [];
  const { classLevels, terms } = levelsPresent(
    levelSource.map((t) => t.curriculumLevel),
    filter.classLevel,
  );

  const authoredCount = rows.filter((r) => r.authored).length;
  const sections = groupByClass(rows);
  const selectedSubject = subjects.find((s) => s.id === filter.subjectId);

  return (
    <div>
      <PageHeader
        title="Lessons"
        description="Upload a markdown lesson note against a topic. Uploaded notes replace the generated placeholder."
      />

      <LessonFilterBar
        subjects={subjects}
        filter={filter}
        classLevels={classLevels}
        terms={terms}
      />

      {!filter.subjectId ? (
        <p className="rounded-lg border border-dashed border-border-strong bg-card px-4 py-10 text-center text-sm text-muted">
          Choose a subject to list its topics.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">
            <span className="font-semibold tabular-nums text-foreground">{authoredCount}</span> of{" "}
            <span className="tabular-nums">{rows.length}</span> {selectedSubject?.name} topics have
            an authored lesson note.
          </p>

          <div className="overflow-x-auto rounded-lg border border-border-strong bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">
                {selectedSubject?.name} topics and their lesson note status
              </caption>
              <thead>
                <tr className="border-b border-border-strong bg-secondary/50">
                  <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>Topic</th>
                  <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>Term</th>
                  <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>Blocks</th>
                  <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-left")}>Status</th>
                  <th scope="col" className={cn(TH_CLS, "px-4 py-3 text-right")}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-strong">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted">
                      No topics match this filter.
                    </td>
                  </tr>
                ) : (
                  sections.map((section) => (
                    <Section key={section.classLevel} classLevel={section.classLevel} rows={section.rows} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ classLevel, rows }: { classLevel: ClassLevel; rows: TopicRow[] }) {
  return (
    <>
      <tr className="bg-secondary/30">
        <th scope="colgroup" colSpan={5} className="px-4 py-2 text-left text-xs font-semibold text-foreground">
          {classLevel}
          <span className="ml-2 font-normal tabular-nums text-muted">
            {rows.length} topic{rows.length === 1 ? "" : "s"}
          </span>
        </th>
      </tr>
      {rows.map((row) => (
        <tr key={row.topicId}>
          <td className="px-4 py-3 font-medium text-foreground">{row.topicTitle}</td>
          <td className="px-4 py-3 text-muted">{TERM_LABELS[row.term]}</td>
          <td className="px-4 py-3 tabular-nums text-muted">{row.blockCount}</td>
          <td className="px-4 py-3">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                row.authored
                  ? "bg-tone-green-soft text-tone-green-ink"
                  : "bg-secondary text-muted",
              )}
            >
              {row.authored ? "Authored" : "Placeholder"}
            </span>
          </td>
          <td className="px-4 py-3 text-right">
            <Link
              href={`/admin/lessons/upload?topicId=${row.topicId}`}
              className={buttonClass("outline", "sm")}
            >
              {row.authored ? "Replace" : "Upload"}
            </Link>
          </td>
        </tr>
      ))}
    </>
  );
}
