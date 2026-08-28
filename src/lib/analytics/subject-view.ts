import { db } from "../db";
import { getGrade } from "../performance";
import { computePathState } from "../learning-path";
import { groupTopics, type TopicGroups } from "@/engines/analytics/topic-groups";
import { buildProfile, type AnswerSample, type Profile } from "@/engines/analytics/profile";
import { subjectInsights } from "@/engines/analytics/subject-insights";
import { selectInsights, type Insight } from "@/engines/analytics/insight";

// Assembles the subject lens. Every rule here lives in the engines; this file
// only fetches and hands over.
// See docs/superpowers/specs/2026-08-28-performance-analytics-design.md §4.

export type SubjectChoice = {
  id: string;
  name: string;
  slug: string;
  code: string;
  /** Accuracy across all recorded answers, 0..100, or null with no answers. */
  accuracy: number | null;
  answered: number;
};

export type SubjectVerdict = {
  accuracy: number | null;
  grade: string | null;
  answered: number;
  correct: number;
  topicsCovered: number;
  topicsInScope: number;
  secondsSpent: number;
};

export type SubjectPerformance = {
  subject: { id: string; name: string; slug: string; code: string };
  verdict: SubjectVerdict;
  groups: TopicGroups;
  profile: Profile;
  insights: Insight[];
};

/**
 * Subjects the student has any evidence in, weakest first — the ordering is
 * itself advice, so the chip they most need is the one nearest the thumb.
 */
export async function getSubjectChoices(userId: string): Promise<SubjectChoice[]> {
  const attemptedQuery = db.learningEvent.groupBy({
    by: ["subjectId"],
    where: { studentId: userId, kind: "QUESTION_ANSWERED" },
    _count: { _all: true },
  });
  const correctQuery = db.learningEvent.groupBy({
    by: ["subjectId"],
    where: { studentId: userId, kind: "QUESTION_ANSWERED", correct: true },
    _count: { _all: true },
  });
  const [attempted, correct] = await db.$transaction([attemptedQuery, correctQuery]);

  const correctBySubject = new Map(
    correct.map((row) => [row.subjectId, row._count._all]),
  );
  const subjects = await db.subject.findMany({
    where: { id: { in: attempted.map((row) => row.subjectId) } },
    select: { id: true, name: true, slug: true, code: true },
  });
  const byId = new Map(subjects.map((subject) => [subject.id, subject]));

  return attempted
    .flatMap((row) => {
      const subject = byId.get(row.subjectId);
      if (!subject) return [];
      const answered = row._count._all;
      const right = correctBySubject.get(row.subjectId) ?? 0;
      return [
        {
          ...subject,
          answered,
          accuracy: answered > 0 ? (right / answered) * 100 : null,
        },
      ];
    })
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0));
}

export async function getSubjectPerformance(
  userId: string,
  subjectSlug: string,
  now = new Date(),
): Promise<SubjectPerformance | null> {
  const subject = await db.subject.findFirst({
    where: { slug: subjectSlug },
    select: { id: true, name: true, slug: true, code: true },
  });
  if (!subject) return null;

  const { graph, state, pretestPassed } = await computePathState(
    db,
    userId,
    [subject.id],
    now,
  );

  // Decoration, not diagnosis: a failure here costs the Unproven group its
  // "you started this and left" reason line, which is a far better outcome
  // than failing the page. Same pattern as lib/dashboard.ts.
  let abandonedByTopic = new Map<string, number>();
  try {
    const rows = await db.learningEvent.groupBy({
      by: ["topicId"],
      where: {
        studentId: userId,
        subjectId: subject.id,
        kind: "QUIZ_ABANDONED",
        topicId: { not: null },
      },
      _count: { _all: true },
    });
    abandonedByTopic = new Map(
      rows
        .filter((row): row is typeof row & { topicId: string } => row.topicId !== null)
        .map((row) => [row.topicId, row._count._all]),
    );
  } catch (error) {
    console.error("Loading abandonment counts failed:", error);
  }

  const groups = groupTopics(state, graph, pretestPassed, abandonedByTopic, now);

  const answers = await db.learningEvent.findMany({
    where: {
      studentId: userId,
      subjectId: subject.id,
      kind: "QUESTION_ANSWERED",
    },
    select: { difficulty: true, correct: true, seconds: true },
  });
  const samples: AnswerSample[] = answers.map((row) => ({
    difficulty: row.difficulty,
    correct: row.correct === true,
    seconds: row.seconds,
  }));

  const estimate = await db.question.aggregate({
    where: { subjectId: subject.id },
    _avg: { timeEstimateSeconds: true },
  });
  const profile = buildProfile(samples, estimate._avg.timeEstimateSeconds ?? null);

  const answered = samples.length;
  const correctCount = samples.filter((sample) => sample.correct).length;
  const accuracy = answered > 0 ? (correctCount / answered) * 100 : null;
  const covered = [
    ...groups.NEEDS_WORK,
    ...groups.NEEDS_REVISION,
    ...groups.COMING_ALONG,
    ...groups.SOLID,
  ].length;

  return {
    subject,
    verdict: {
      accuracy,
      grade: accuracy === null ? null : getGrade(accuracy),
      answered,
      correct: correctCount,
      topicsCovered: covered,
      topicsInScope: graph.nodes.size,
      secondsSpent: samples.reduce((sum, s) => sum + (s.seconds ?? 0), 0),
    },
    groups,
    profile,
    insights: selectInsights(
      subjectInsights({
        subjectId: subject.id,
        subjectSlug: subject.slug,
        groups,
        profile,
      }),
      4,
    ),
  };
}
