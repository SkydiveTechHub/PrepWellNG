import { Prisma } from "@prisma/client";
import { db } from "./db";
import { computePathState } from "./learning-path";
import { loadRevisionExtras, revisionQueue } from "@/engines/learning/revision";
import { relevantTrackCategories } from "./subjects";
import { lagosDayKey } from "./streak";
import { listAcademicTerms } from "./academic-terms";
import type { StudyPlanSettingsInput } from "./validators";
import type { ClassLevel } from "./curriculum-scope";
import { TERM_LABELS } from "./curriculum-scope";
import { addDays, dateToDayKey, dayKeyToDate, daysBetween, type DayKey } from "@/engines/planner/days";
import { manualStatusChange, type ManualStatus } from "@/engines/planner/completion";
import {
  computeRunwayStart,
  DEFAULT_MINUTES,
  planSettingsProblem,
  resolvePlanMode,
  type PlanMode,
} from "@/engines/planner/mode";
import type { Overload } from "@/engines/planner/layout";
import type { OutlineWeek } from "@/engines/planner/outline";
import { CARRY_OVER_DAYS, isReplanStale, partitionForReplan } from "@/engines/planner/replan";
import { resolveTermContext, termHeaderLabel, type TermSource } from "@/engines/planner/term-context";
import { planWindow, type PlannerSubject } from "@/engines/planner/term-plan";
import { atOrBelowClass, calendarTopicId, type PlanTopic } from "@/engines/planner/topics";

// Study plan persistence: settings, the rolling re-plan, and the page payload.
// See docs/superpowers/specs/2026-09-14-study-plan-term-mode-design.md §6–§9.

type Failure = { ok: false; status: 400 | 404; error: string };

/**
 * Accounts created before class level was collected have none. Treating them as
 * SS3 keeps every topic reachable instead of hiding most of the syllabus.
 */
const UNKNOWN_CLASS_LEVEL: ClassLevel = "SS3";

/** Generous waits for the Supabase pooler, which can take seconds to hand out a connection. */
const REPLAN_TRANSACTION = { maxWait: 15_000, timeout: 30_000 } as const;

export type StudyPlanSubject = { id: string; name: string; code: string; slug: string };

export type StudyPlanItemData = {
  id: string;
  date: DayKey;
  subjectId: string;
  topicId: string | null;
  topicSlug: string | null;
  topicTitle: string | null;
  activityType: string;
  durationMinutes: number;
  status: string;
  notes: string | null;
  carriedFrom: DayKey | null;
  completionSource: string | null;
  subject: { name: string; code: string; slug: string };
};

export type PositionOption = { id: string; title: string; scope: string };

export type StudyPlanData = {
  id: string;
  mode: PlanMode;
  subjectIds: string[];
  studyDays: number[];
  weekdayMinutes: number;
  weekendMinutes: number;
  targetExam: string | null;
  targetDate: DayKey | null;
  forceExamMode: boolean;
  plannedThrough: DayKey | null;
  outline: OutlineWeek[];
  overload: Overload | null;
  items: StudyPlanItemData[];
  /** subjectId → the student's override, if any. */
  positions: Record<string, string>;
  /** subjectId → where the calendar thinks the class is. */
  calendarPositions: Record<string, string | null>;
  /** subjectId → topics the student may choose as "my class is here". */
  positionOptions: Record<string, PositionOption[]>;
};

export type StudyPlanPageData = {
  today: DayKey;
  classLevel: ClassLevel | null;
  termLabel: string;
  termSource: TermSource;
  daysToExam: number | null;
  defaults: { weekdayMinutes: number; weekendMinutes: number };
  subjects: StudyPlanSubject[];
  plan: StudyPlanData | null;
};

function asStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

async function loadTermRanges() {
  return (await listAcademicTerms()).map((t) => ({
    session: t.session, term: t.term, startsOn: t.startsOn, endsOn: t.endsOn,
  }));
}

type SnapshotPosition = { subjectId: string; topicId: string };

type PlanSnapshotInput = {
  updatedAt: Date;
  isActive: boolean;
  lastReplannedAt: Date | null;
  subjectIds: readonly string[];
  studyDays: readonly number[];
  weekdayMinutes: number;
  weekendMinutes: number;
  targetExam: string | null;
  targetDate: Date | null;
  forceExamMode: boolean;
  positions: readonly SnapshotPosition[];
};

/**
 * A comparable fingerprint of everything a re-plan reads from the plan row and
 * its positions, order-independent. Used to detect that a concurrent forced
 * re-plan committed a newer snapshot while this one was still reading —
 * writing this one's (now stale) plan would silently discard the newer
 * settings/positions until the next day's staleness check. Pure and
 * DB-independent, but private: there's no DB test harness to exercise the
 * transaction it guards, so it isn't unit tested directly.
 */
function planSnapshotKey(snapshot: PlanSnapshotInput): string {
  return JSON.stringify({
    updatedAt: snapshot.updatedAt.getTime(),
    isActive: snapshot.isActive,
    lastReplannedAt: snapshot.lastReplannedAt?.getTime() ?? null,
    subjectIds: [...snapshot.subjectIds].sort(),
    studyDays: [...snapshot.studyDays].sort((a, b) => a - b),
    weekdayMinutes: snapshot.weekdayMinutes,
    weekendMinutes: snapshot.weekendMinutes,
    targetExam: snapshot.targetExam,
    targetDate: snapshot.targetDate?.getTime() ?? null,
    forceExamMode: snapshot.forceExamMode,
    positions: snapshot.positions.map((p) => `${p.subjectId}:${p.topicId}`).sort(),
  });
}

/** Every topic in the chosen subjects, with the class and term it belongs to. */
async function loadPlanTopics(subjectIds: readonly string[]): Promise<Map<string, PlanTopic[]>> {
  const rows = await db.topic.findMany({
    where: { subjectId: { in: [...subjectIds] } },
    select: {
      id: true, subjectId: true, title: true, slug: true, orderIndex: true, estimatedMinutes: true,
      waecWeight: true, jambWeight: true, prerequisiteTopicId: true,
      curriculumLevel: { select: { classLevel: true, term: true } },
    },
  });
  const bySubject = new Map<string, PlanTopic[]>();
  for (const { curriculumLevel, ...topic } of rows) {
    const list = bySubject.get(topic.subjectId) ?? [];
    list.push({ ...topic, classLevel: curriculumLevel.classLevel, term: curriculumLevel.term });
    bySubject.set(topic.subjectId, list);
  }
  return bySubject;
}

/**
 * Rebuilds the plan's detailed window when it was last built before today (Lagos
 * time), or always when `force` is set. Completed, skipped and missed sessions
 * are never changed; pending sessions from today onwards are regenerated.
 */
export async function replanIfStale(
  userId: string,
  options: { force?: boolean; now?: Date } = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const plan = await db.studyPlan.findFirst({
    where: { studentId: userId, isActive: true },
    orderBy: { createdAt: "desc" },
    include: { positions: { select: { subjectId: true, topicId: true } } },
  });
  if (!plan) return;
  if (!options.force && !isReplanStale(plan.lastReplannedAt, now)) return;

  const today = lagosDayKey(now);
  const subjectIds = asStringArray(plan.subjectIds);

  // The heavy reads happen before the transaction. Holding the row lock across
  // them would stall every other write to this plan for seconds.
  const [user, subjects, topicsBySubject, terms, pathState] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { classLevel: true } }),
    db.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true } }),
    loadPlanTopics(subjectIds),
    loadTermRanges(),
    computePathState(db, userId, subjectIds, now),
  ]);
  const { graph, state, pretestPassed } = pathState;
  const extras = await loadRevisionExtras(db, userId, graph);
  const chosen = new Set(subjectIds);
  const revisionDue = revisionQueue(state, graph, extras, { now })
    .filter((item) => chosen.has(item.subjectId))
    .map((item) => ({ topicId: item.topicId, subjectId: item.subjectId, title: item.title, reason: item.reason }));

  const classLevel = user?.classLevel ?? UNKNOWN_CLASS_LEVEL;
  const targetDate = plan.targetDate ? dateToDayKey(plan.targetDate) : null;
  const plannerSubjects: PlannerSubject[] = subjects.map((s) => ({
    id: s.id, name: s.name, topics: topicsBySubject.get(s.id) ?? [],
  }));
  const preLockSnapshot = planSnapshotKey({
    updatedAt: plan.updatedAt,
    isActive: plan.isActive,
    lastReplannedAt: plan.lastReplannedAt,
    subjectIds,
    studyDays: plan.studyDays,
    weekdayMinutes: plan.weekdayMinutes,
    weekendMinutes: plan.weekendMinutes,
    targetExam: plan.targetExam,
    targetDate: plan.targetDate,
    forceExamMode: plan.forceExamMode,
    positions: plan.positions,
  });

  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "StudyPlan" WHERE "id" = ${plan.id} FOR NO KEY UPDATE`;
    const locked = await tx.studyPlan.findUnique({
      where: { id: plan.id },
      select: {
        isActive: true,
        lastReplannedAt: true,
        updatedAt: true,
        subjectIds: true,
        studyDays: true,
        weekdayMinutes: true,
        weekendMinutes: true,
        targetExam: true,
        targetDate: true,
        forceExamMode: true,
        positions: { select: { subjectId: true, topicId: true } },
      },
    });
    // Another request re-planned while we were loading.
    if (!locked?.isActive) return;
    if (!options.force && !isReplanStale(locked.lastReplannedAt, now)) return;
    // A concurrent forced re-plan (e.g. another "Where is your class?" save)
    // committed a newer snapshot while this one was still reading. Writing
    // this stale one would silently discard the newer settings/positions
    // until tomorrow's staleness check — bail and let the newer writer's own
    // re-plan stand.
    const postLockSnapshot = planSnapshotKey({
      updatedAt: locked.updatedAt,
      isActive: locked.isActive,
      lastReplannedAt: locked.lastReplannedAt,
      subjectIds: asStringArray(locked.subjectIds),
      studyDays: locked.studyDays,
      weekdayMinutes: locked.weekdayMinutes,
      weekendMinutes: locked.weekendMinutes,
      targetExam: locked.targetExam,
      targetDate: locked.targetDate,
      forceExamMode: locked.forceExamMode,
      positions: locked.positions,
    });
    if (postLockSnapshot !== preLockSnapshot) return;

    // Legacy plans can hold months of pending sessions; mark every past one.
    await tx.studyPlanItem.updateMany({
      where: { studyPlanId: plan.id, status: "PENDING", scheduledDate: { lt: dayKeyToDate(today) } },
      data: { status: "MISSED" },
    });

    const recent = await tx.studyPlanItem.findMany({
      where: { studyPlanId: plan.id, scheduledDate: { gte: dayKeyToDate(addDays(today, -CARRY_OVER_DAYS)) } },
      select: { id: true, scheduledDate: true, subjectId: true, topicId: true, activityType: true, status: true, durationMinutes: true },
    });
    const partition = partitionForReplan(
      recent.map((row) => ({ ...row, date: dateToDayKey(row.scheduledDate) })),
      today,
    );

    await tx.studyPlanItem.deleteMany({
      where: { studyPlanId: plan.id, status: "PENDING", scheduledDate: { gte: dayKeyToDate(today) } },
    });

    const mode = resolvePlanMode({ classLevel, targetDate, forceExamMode: plan.forceExamMode });
    const runwayStart =
      mode !== "TERM" && targetDate ? computeRunwayStart(lagosDayKey(plan.createdAt), targetDate) : null;
    // Mocks already sat or skipped are not offered again; missed ones are.
    const mocksTaken = runwayStart
      ? await tx.studyPlanItem.count({
          where: {
            studyPlanId: plan.id,
            activityType: "MOCK_EXAM",
            status: { in: ["COMPLETED", "SKIPPED"] },
            scheduledDate: { gte: dayKeyToDate(runwayStart) },
          },
        })
      : 0;

    const output = planWindow({
      today,
      planStart: lagosDayKey(plan.createdAt),
      mode,
      classLevel,
      targetDate,
      termContext: resolveTermContext(today, terms),
      availability: {
        studyDays: plan.studyDays,
        weekdayMinutes: plan.weekdayMinutes,
        weekendMinutes: plan.weekendMinutes,
      },
      subjects: plannerSubjects,
      graph,
      state,
      pretestPassed,
      positions: new Map(plan.positions.map((p) => [p.subjectId, p.topicId])),
      revisionDue,
      carryOver: partition.carryOver,
      fixed: partition.fixed,
      mocksTaken,
    });

    if (output.items.length > 0) {
      await tx.studyPlanItem.createMany({
        data: output.items.map((item) => ({
          studyPlanId: plan.id,
          scheduledDate: dayKeyToDate(item.date),
          subjectId: item.subjectId,
          topicId: item.topicId,
          activityType: item.activityType,
          durationMinutes: item.durationMinutes,
          notes: item.notes,
          carriedFromDate: item.carriedFrom ? dayKeyToDate(item.carriedFrom) : null,
        })),
      });
    }

    await tx.studyPlan.update({
      where: { id: plan.id },
      data: {
        plannedThrough: dayKeyToDate(output.plannedThrough),
        lastReplannedAt: now,
        outline: output.outline as unknown as Prisma.InputJsonValue,
        overload: output.overload ? (output.overload as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }, REPLAN_TRANSACTION);
}

async function checkSettings(
  userId: string,
  settings: StudyPlanSettingsInput,
): Promise<{ ok: true; subjectIds: string[] } | Failure> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { classLevel: true } });
  const problem = planSettingsProblem({
    classLevel: user?.classLevel ?? null,
    targetDate: settings.targetDate ?? null,
    forceExamMode: settings.forceExamMode,
    studyDays: settings.studyDays,
    weekdayMinutes: settings.weekdayMinutes,
    weekendMinutes: settings.weekendMinutes,
    today: lagosDayKey(new Date()),
  });
  if (problem) return { ok: false, status: 400, error: problem };

  const subjects = await db.subject.findMany({
    where: { id: { in: settings.subjectIds } },
    select: { id: true },
  });
  if (subjects.length === 0) return { ok: false, status: 404, error: "No valid subjects found" };
  return { ok: true, subjectIds: subjects.map((s) => s.id) };
}

function settingsData(settings: StudyPlanSettingsInput, subjectIds: string[]) {
  return {
    subjectIds,
    studyDays: [...new Set(settings.studyDays)].sort((a, b) => a - b),
    weekdayMinutes: settings.weekdayMinutes,
    weekendMinutes: settings.weekendMinutes,
    targetExam: settings.targetExam ?? null,
    targetDate: settings.targetDate ? dayKeyToDate(settings.targetDate) : null,
    forceExamMode: settings.forceExamMode,
  };
}

/** Retires any active plan and builds a new one. */
export async function createStudyPlan(
  userId: string,
  settings: StudyPlanSettingsInput,
): Promise<{ ok: true; planId: string } | Failure> {
  const checked = await checkSettings(userId, settings);
  if (!checked.ok) return checked;

  const plan = await db.$transaction(async (tx) => {
    await tx.studyPlan.updateMany({ where: { studentId: userId, isActive: true }, data: { isActive: false } });
    return tx.studyPlan.create({
      data: { studentId: userId, ...settingsData(settings, checked.subjectIds) },
      select: { id: true },
    });
  }, REPLAN_TRANSACTION);

  await replanIfStale(userId, { force: true });
  return { ok: true, planId: plan.id };
}

/** Changes the active plan's settings in place, keeping its history. */
export async function updateStudyPlanSettings(
  userId: string,
  settings: StudyPlanSettingsInput,
): Promise<{ ok: true } | Failure> {
  const checked = await checkSettings(userId, settings);
  if (!checked.ok) return checked;

  const { count } = await db.studyPlan.updateMany({
    where: { studentId: userId, isActive: true },
    // Clearing lastReplannedAt means a forced re-plan that fails below is
    // still retried on the student's next page load today, rather than
    // waiting until tomorrow's staleness check.
    data: { ...settingsData(settings, checked.subjectIds), lastReplannedAt: null },
  });
  if (count === 0) return { ok: false, status: 404, error: "No active study plan" };

  // Positions for subjects no longer in the plan would never be read again.
  await db.studyPlanPosition.deleteMany({
    where: { studyPlan: { studentId: userId, isActive: true }, subjectId: { notIn: checked.subjectIds } },
  });

  await replanIfStale(userId, { force: true });
  return { ok: true };
}

export async function setClassPositions(
  userId: string,
  positions: { subjectId: string; topicId: string | null }[],
): Promise<{ ok: true } | Failure> {
  const [plan, user] = await Promise.all([
    db.studyPlan.findFirst({ where: { studentId: userId, isActive: true }, select: { id: true, subjectIds: true } }),
    db.user.findUnique({ where: { id: userId }, select: { classLevel: true } }),
  ]);
  if (!plan) return { ok: false, status: 404, error: "No active study plan" };

  const planSubjects = new Set(asStringArray(plan.subjectIds));
  const classLevel = user?.classLevel ?? UNKNOWN_CLASS_LEVEL;
  const topicIds = positions.map((p) => p.topicId).filter((id): id is string => id !== null);
  const topics = await db.topic.findMany({
    where: { id: { in: topicIds } },
    select: { id: true, subjectId: true, curriculumLevel: { select: { classLevel: true } } },
  });
  const topicById = new Map(topics.map((t) => [t.id, t]));

  for (const position of positions) {
    if (!planSubjects.has(position.subjectId)) {
      return { ok: false, status: 400, error: "That subject is not in your plan." };
    }
    if (position.topicId === null) continue;
    const topic = topicById.get(position.topicId);
    if (
      !topic ||
      topic.subjectId !== position.subjectId ||
      !atOrBelowClass(topic.curriculumLevel, classLevel)
    ) {
      return { ok: false, status: 400, error: "That topic can't be chosen for this subject." };
    }
  }

  await db.$transaction([
    ...positions.map((position) =>
      position.topicId === null
        ? db.studyPlanPosition.deleteMany({ where: { studyPlanId: plan.id, subjectId: position.subjectId } })
        : db.studyPlanPosition.upsert({
            where: { studyPlanId_subjectId: { studyPlanId: plan.id, subjectId: position.subjectId } },
            create: { studyPlanId: plan.id, subjectId: position.subjectId, topicId: position.topicId },
            update: { topicId: position.topicId },
          }),
    ),
    // Same reasoning as updateStudyPlanSettings: retry today if the forced
    // re-plan below fails.
    db.studyPlan.update({ where: { id: plan.id }, data: { lastReplannedAt: null } }),
  ]);

  await replanIfStale(userId, { force: true });
  return { ok: true };
}

export async function setPlanItemStatus(
  userId: string,
  itemId: string,
  requested: ManualStatus,
): Promise<{ ok: true; status: string } | Failure> {
  const item = await db.studyPlanItem.findFirst({
    where: { id: itemId, studyPlan: { studentId: userId, isActive: true } },
    select: { id: true, scheduledDate: true, studyPlan: { select: { plannedThrough: true } } },
  });
  if (!item) return { ok: false, status: 404, error: "Session not found" };

  const change = manualStatusChange(
    { date: dateToDayKey(item.scheduledDate) },
    requested,
    lagosDayKey(new Date()),
    item.studyPlan.plannedThrough ? dateToDayKey(item.studyPlan.plannedThrough) : null,
  );
  if (!change.ok) return { ok: false, status: 400, error: change.error };

  const completed = change.status === "COMPLETED";
  // updateMany + a re-checked where, not update-by-id: a concurrent re-plan
  // can delete this pending item between the findFirst above and here, and an
  // update-by-id on a gone row throws P2025 instead of failing gracefully.
  const { count } = await db.studyPlanItem.updateMany({
    where: { id: item.id, studyPlan: { studentId: userId, isActive: true } },
    data: {
      status: change.status,
      completionSource: completed ? "MANUAL" : null,
      completedAt: completed ? new Date() : null,
    },
  });
  if (count === 0) return { ok: false, status: 404, error: "Session not found" };
  return { ok: true, status: change.status };
}

export async function getStudyPlanPageData(userId: string): Promise<StudyPlanPageData> {
  // A failed re-plan must not take the page down: the previous window still shows.
  try {
    await replanIfStale(userId);
  } catch (error) {
    console.error("Study plan re-plan failed:", error);
  }

  const now = new Date();
  const today = lagosDayKey(now);
  const [user, terms, plan] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { track: true, classLevel: true } }),
    loadTermRanges(),
    db.studyPlan.findFirst({
      where: { studentId: userId, isActive: true },
      orderBy: { createdAt: "desc" },
      include: { positions: { select: { subjectId: true, topicId: true } } },
    }),
  ]);

  const subjects = await db.subject.findMany({
    where: { trackCategory: { in: [...relevantTrackCategories(user?.track)] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, slug: true },
  });

  const classLevel = user?.classLevel ?? null;
  const termContext = resolveTermContext(today, terms);
  const base = {
    today,
    classLevel,
    termLabel: termHeaderLabel(termContext),
    termSource: termContext.source,
    defaults: DEFAULT_MINUTES[classLevel ?? "SS1"],
    subjects,
  };
  if (!plan) return { ...base, daysToExam: null, plan: null };

  const subjectIds = asStringArray(plan.subjectIds);
  const effectiveClass = classLevel ?? UNKNOWN_CLASS_LEVEL;
  const [items, topicsBySubject] = await Promise.all([
    db.studyPlanItem.findMany({
      where: {
        studyPlanId: plan.id,
        scheduledDate: {
          gte: dayKeyToDate(addDays(today, -7)),
          // Unbounded when a plan has never had plannedThrough set: fall back
          // to the same 14-day window a fresh re-plan would produce.
          lte: plan.plannedThrough ?? dayKeyToDate(addDays(today, 13)),
        },
      },
      orderBy: [{ scheduledDate: "asc" }, { id: "asc" }],
      include: {
        subject: { select: { name: true, code: true, slug: true } },
        topic: { select: { slug: true, title: true } },
      },
    }),
    loadPlanTopics(subjectIds),
  ]);

  const positionOptions: Record<string, PositionOption[]> = {};
  const calendarPositions: Record<string, string | null> = {};
  for (const subjectId of subjectIds) {
    const topics = (topicsBySubject.get(subjectId) ?? []).filter((t) => atOrBelowClass(t, effectiveClass));
    positionOptions[subjectId] = [...topics]
      .sort((a, b) =>
        a.classLevel.localeCompare(b.classLevel) ||
        ["FIRST", "SECOND", "THIRD"].indexOf(a.term) - ["FIRST", "SECOND", "THIRD"].indexOf(b.term) ||
        a.orderIndex - b.orderIndex)
      .map((t) => ({ id: t.id, title: t.title, scope: `${t.classLevel} ${TERM_LABELS[t.term]}` }));
    calendarPositions[subjectId] = calendarTopicId(topics, effectiveClass, termContext);
  }

  const targetDate = plan.targetDate ? dateToDayKey(plan.targetDate) : null;
  return {
    ...base,
    daysToExam: targetDate ? Math.max(0, daysBetween(today, targetDate)) : null,
    plan: {
      id: plan.id,
      mode: resolvePlanMode({ classLevel: effectiveClass, targetDate, forceExamMode: plan.forceExamMode }),
      subjectIds,
      studyDays: plan.studyDays,
      weekdayMinutes: plan.weekdayMinutes,
      weekendMinutes: plan.weekendMinutes,
      targetExam: plan.targetExam,
      targetDate,
      forceExamMode: plan.forceExamMode,
      plannedThrough: plan.plannedThrough ? dateToDayKey(plan.plannedThrough) : null,
      outline: (plan.outline as unknown as OutlineWeek[] | null) ?? [],
      overload: (plan.overload as unknown as Overload | null) ?? null,
      positions: Object.fromEntries(plan.positions.map((p) => [p.subjectId, p.topicId])),
      calendarPositions,
      positionOptions,
      items: items.map((item) => ({
        id: item.id,
        date: dateToDayKey(item.scheduledDate),
        subjectId: item.subjectId,
        topicId: item.topicId,
        topicSlug: item.topic?.slug ?? null,
        topicTitle: item.topic?.title ?? null,
        activityType: item.activityType,
        durationMinutes: item.durationMinutes,
        status: item.status,
        notes: item.notes,
        carriedFrom: item.carriedFromDate ? dateToDayKey(item.carriedFromDate) : null,
        completionSource: item.completionSource,
        subject: item.subject,
      })),
    },
  };
}
