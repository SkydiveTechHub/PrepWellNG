import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  LuArrowLeft,
  LuBookOpen,
  LuChevronRight,
  LuPlay,
} from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { loadGraph } from "@/engines/learning/graph";
import { computeTopicState } from "@/engines/learning/mastery";
import {
  isAvailable,
  loadPretestPassed,
  TARGET,
} from "@/engines/learning/availability";
import { recommendNext } from "@/engines/learning/recommend";
import {
  GraphView,
  type GraphNodeState,
  type GraphViewEdge,
  type GraphViewNode,
} from "@/components/path/graph-view";
import { CurriculumViewToggle } from "@/components/path/view-toggle";
import {
  ClassTermBrowser,
  type ClassGroup,
} from "@/components/classroom/class-term-browser";
import { resolveClassLevel } from "@/lib/classroom";
import { CLASS_LEVELS, TERMS } from "@/lib/curriculum-scope";

type TopicRow = {
  id: string;
  title: string;
  slug: string;
  estimatedMinutes: number;
  curriculumLevel: { classLevel: string; term: string };
  _count: { questions: number };
};

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ subjectSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { subjectSlug } = await params;
  const userClassLevel = (session.user as { classLevel?: string | null }).classLevel ?? null;

  const subject = await db.subject.findUnique({
    where: { slug: subjectSlug },
    include: {
      _count: { select: { questions: true, topics: true } },
      topics: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          estimatedMinutes: true,
          curriculumLevel: { select: { classLevel: true, term: true } },
          _count: { select: { questions: true } },
        },
      },
    },
  });

  if (!subject) notFound();

  const examLabels: string[] = [];
  if (subject.isWaec) examLabels.push("WAEC");
  if (subject.isJamb) examLabels.push("JAMB");
  if (subject.isNeco) examLabels.push("NECO");

  // Learning Path Engine — graph view (spec Stage 0). Derive per-topic state
  // from live evidence + the student's self-certified pretests, so the graph
  // node colours carry the unlock/mastery/revision signal.
  const graph = await loadGraph(db, subject.id);
  const [state, pretestPassed, completedProgress] = await Promise.all([
    computeTopicState(db, session.user.id, graph),
    loadPretestPassed(db, session.user.id, subject.id),
    db.studentProgress.findMany({
      where: {
        studentId: session.user.id,
        subjectId: subject.id,
        status: "COMPLETED",
        topicId: { not: null },
      },
      select: { topicId: true },
    }),
  ]);
  const completedTopicIds = new Set(
    completedProgress.map((p) => p.topicId).filter((id): id is string => id != null),
  );

  const REVISION_RETENTION = 0.85;
  const graphNodes: GraphViewNode[] = [];
  let masteredCount = 0;
  let readyCount = 0;
  let dueCount = 0;
  for (const [topicId, node] of graph.nodes) {
    if (node.subjectId !== subject.id) continue;
    const topicState = state.get(topicId);
    const mastery = topicState?.mastery ?? 0;
    const retention = topicState?.retention ?? null;
    const lastStudy = topicState?.lastStudy ?? null;
    const available = isAvailable(topicId, state, graph, pretestPassed);

    let nodeState: GraphNodeState;
    if (retention != null && retention < REVISION_RETENTION) {
      nodeState = "DECAYED";
    } else if (mastery >= TARGET) {
      nodeState = "MASTERED";
    } else if (available && lastStudy != null) {
      nodeState = "STARTED";
    } else if (available) {
      nodeState = "READY";
    } else {
      nodeState = "LOCKED";
    }

    if (nodeState === "MASTERED") masteredCount += 1;
    if (nodeState === "READY") readyCount += 1;
    if (nodeState === "DECAYED") dueCount += 1;

    graphNodes.push({
      id: topicId,
      title: node.title,
      slug: node.slug,
      orderIndex: node.orderIndex,
      state: nodeState,
      mastery,
      isNext: false,
    });
  }

  const graphEdges: GraphViewEdge[] = graph.edges
    .filter(
      (edge) =>
        graph.nodes.get(edge.from)?.subjectId === subject.id &&
        graph.nodes.get(edge.to)?.subjectId === subject.id,
    )
    .map((edge) => ({ from: edge.from, to: edge.to }));

  const nextRecs = recommendNext(state, graph, { k: 1, pretestPassed });
  const nextTopicId = nextRecs[0]?.topicId ?? null;
  for (const node of graphNodes) {
    if (node.id === nextTopicId) node.isNext = true;
  }

  const grouped: Record<string, Record<string, TopicRow[]>> = {};
  for (const level of CLASS_LEVELS) grouped[level] = { FIRST: [], SECOND: [], THIRD: [] };
  for (const topic of subject.topics as TopicRow[]) {
    const { classLevel, term } = topic.curriculumLevel;
    if (!grouped[classLevel] || !grouped[classLevel][term]) continue;
    grouped[classLevel][term].push(topic);
  }

  const classes: ClassGroup[] = CLASS_LEVELS.map((level) => ({
    classLevel: level,
    terms: TERMS.map((term) => ({
      term,
      topics: grouped[level][term].map((topic) => ({
        slug: topic.slug,
        title: topic.title,
        completed: completedTopicIds.has(topic.id),
      })),
    })),
  }));

  const classesWithTopics = classes
    .filter((group) => group.terms.some((t) => t.topics.length > 0))
    .map((group) => group.classLevel);

  const initialClassLevel = resolveClassLevel(userClassLevel, classesWithTopics);

  const practiceHref = (classLevel: string) =>
    `/practice/mock-exam?subjectId=${subject.id}` +
    `&fromClass=${classLevel}&fromTerm=FIRST` +
    `&toClass=${classLevel}&toTerm=THIRD`;

  const totalQuestions = subject._count.questions;

  const examBadge = (exam: string) =>
    exam === "WAEC" ? "blue" : exam === "JAMB" ? "green" : "purple";

  return (
    <div>
      <Link
        href="/classroom"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <LuArrowLeft className="h-4 w-4" />
        All Subjects
      </Link>

      {/* Subject header */}
      <div className="card relative overflow-hidden p-6 md:p-8">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/5" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-sm font-bold text-primary">
                {subject.code}
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {subject.name}
                </h1>
                <p className="text-sm text-muted">{subject.description}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {examLabels.map((exam) => (
                <Badge key={exam} variant={examBadge(exam)}>
                  {exam}
                </Badge>
              ))}
            </div>
          </div>

          <Link
            href={`/practice/past-questions/${subjectSlug}`}
            className={buttonClass("primary", "lg", "flex-shrink-0")}
          >
            <LuPlay className="h-4 w-4" />
            Take Quiz
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-6">
          <div className="text-center">
            <p className="text-2xl font-bold tracking-tight text-foreground">{totalQuestions}</p>
            <p className="text-xs text-muted">Questions</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold tracking-tight text-foreground">{subject._count.topics}</p>
            <p className="text-xs text-muted">Topics</p>
          </div>
          <div className="text-center">
            <Link
              href={`/practice/past-questions?subject=${subject.slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
            >
              Practice <LuChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Curriculum — list/graph toggle (Learning Path Engine, spec Stage 0) */}
      <div className="mt-8">
        <CurriculumViewToggle
          graph={
            <GraphView
              nodes={graphNodes}
              edges={graphEdges}
              subjectSlug={subject.slug}
              mastered={masteredCount}
              ready={readyCount}
              due={dueCount}
              total={subject._count.topics}
            />
          }
        >
          {subject.topics.length > 0 ? (
            <ClassTermBrowser
              subjectSlug={subjectSlug}
              classes={classes}
              initialClassLevel={initialClassLevel}
              practiceHref={practiceHref}
            />
          ) : (
            <EmptyState
              icon={<LuBookOpen className="h-6 w-6" />}
              title="No topics yet"
              description="Topics for this subject are being prepared. Check back soon."
            />
          )}
        </CurriculumViewToggle>
      </div>

      {/* Quick practice */}
      <div className="card mt-8 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h3 className="text-sm font-bold text-foreground">Quick Practice</h3>
          <p className="mt-0.5 text-xs text-muted">
            Jump straight into questions for a specific exam.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {examLabels.map((exam) => (
            <Link
              key={exam}
              href={`/practice/past-questions/${subjectSlug}?exam=${exam}`}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-bold transition-colors",
                exam === "WAEC"
                  ? "bg-tone-blue-soft text-tone-blue-ink hover:bg-tone-blue-line"
                  : exam === "JAMB"
                    ? "bg-tone-green-soft text-tone-green-ink hover:bg-tone-green-line"
                    : "bg-tone-purple-soft text-tone-purple-ink hover:bg-tone-purple-line",
              )}
            >
              Practice {exam} Questions
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
