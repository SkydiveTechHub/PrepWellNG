import { db } from "../db";
import { getGrade } from "../performance";
import { computePathState } from "../learning-path";
import { groupTopics, type TopicGroups } from "@/engines/analytics/topic-groups";
import { OBSERVATION_FLOOR } from "@/engines/learning/evidence";
import { buildProfile, type AnswerSample, type Profile } from "@/engines/analytics/profile";
import { subjectInsights } from "@/engines/analytics/subject-insights";
import { selectInsights, type Insight } from "@/engines/analytics/insight";

// Assembles the subject lens. Every rule here lives in the engines; this file
// only fetches and hands over.
// See docs/superpowers/specs/2026-08-28-performance-analytics-design.md §4.

/**
 * Answers required before this page will state an accuracy figure or a grade.
 *
 * Deliberately the same floor the profile uses to decide whether it will
 * describe *how* a student answers: it would be incoherent to refuse to
 * describe their answering below 20 answers while confidently grading how well
 * they answer off one. A precise-looking figure the evidence cannot support is
 * worse than no figure — so below this we show the raw count instead, which is
 * what tells the student how to resolve the uncertainty.
 */
export const MIN_GRADED_ANSWERS = 20;

export type SubjectChoice = {
  id: string;
  name: string;
  slug: string;
  code: string;
  /**
   * Accuracy across all recorded answers, 0..100, or null below
   * MIN_GRADED_ANSWERS — including with no answers at all.
   */
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
          // The chips render this figure, so it is gated by the same floor as
          // the verdict — a "PHY 100%" chip off one answer is not a fact.
          accuracy:
            answered >= MIN_GRADED_ANSWERS ? (right / answered) * 100 : null,
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
  // `answered` and `correct` below stay the real counts even when we withhold
  // the figure: the count is what tells the student how to resolve it.
  const accuracy =
    answered >= MIN_GRADED_ANSWERS ? (correctCount / answered) * 100 : null;
  // Coverage is defined by evidence volume, not by which group a topic landed
  // in: `classifyTopic` routes BOTTLENECK on graph position with no volume gate
  // and WEAK on decaying confidence, so "not UNPROVEN" is not the same question.
  const covered = [
    ...groups.NEEDS_WORK,
    ...groups.NEEDS_REVISION,
    ...groups.UNPROVEN,
    ...groups.COMING_ALONG,
    ...groups.SOLID,
  ].filter((row) => row.observations >= OBSERVATION_FLOOR).length;

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
