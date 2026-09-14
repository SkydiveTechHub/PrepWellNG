// Who an announcement is for. Pure. The SQL twin lives in
// push-audience-sql.ts and is built from the same clauses.

import { z } from "zod";

export const audienceFilterSchema = z
  .object({
    examTargets: z.array(z.enum(["WAEC", "JAMB", "NECO"])).max(3).optional(),
    classLevels: z.array(z.enum(["SS1", "SS2", "SS3"])).max(3).optional(),
    tracks: z.array(z.enum(["SCIENCE", "ARTS", "COMMERCIAL"])).max(3).optional(),
    tiers: z.array(z.enum(["FREEMIUM", "STANDARD", "PREMIUM"])).max(3).optional(),
    userIds: z.array(z.string().min(1).max(64)).max(1000).optional(),
  })
  .strict();

export type AudienceFilter = z.infer<typeof audienceFilterSchema>;

export type AudienceClause = {
  field: "examTarget" | "classLevel" | "track" | "tier" | "userId";
  values: string[];
};

/** Order is fixed; the SQL builder and its test rely on it. */
export function audienceClauses(filter: AudienceFilter): AudienceClause[] {
  const entries: [AudienceClause["field"], string[] | undefined][] = [
    ["examTarget", filter.examTargets],
    ["classLevel", filter.classLevels],
    ["track", filter.tracks],
    ["tier", filter.tiers],
    ["userId", filter.userIds],
  ];
  return entries
    .filter(([, values]) => values && values.length > 0)
    .map(([field, values]) => ({ field, values: [...new Set(values)] }));
}

export type AudienceStudent = {
  id: string;
  role: string;
  isActive: boolean;
  classLevel: string | null;
  track: string | null;
  tier: string;
  /** targetExam of each active StudyPlan. */
  activeExamTargets: string[];
};

function clauseMatches(student: AudienceStudent, clause: AudienceClause): boolean {
  switch (clause.field) {
    case "examTarget":
      return student.activeExamTargets.some((t) => clause.values.includes(t));
    case "classLevel":
      return student.classLevel !== null && clause.values.includes(student.classLevel);
    case "track":
      return student.track !== null && clause.values.includes(student.track);
    case "tier":
      return clause.values.includes(student.tier);
    case "userId":
      return clause.values.includes(student.id);
  }
}

export function matchesAudience(student: AudienceStudent, filter: AudienceFilter): boolean {
  if (student.role !== "STUDENT" || !student.isActive) return false;
  return audienceClauses(filter).every((clause) => clauseMatches(student, clause));
}

export function parseStoredAudience(json: unknown): AudienceFilter | null {
  const parsed = audienceFilterSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export function describeAudience(filter: AudienceFilter): string {
  const parts: string[] = [];
  if (filter.userIds?.length) {
    parts.push(filter.userIds.length === 1 ? "1 specific student" : `${filter.userIds.length} specific students`);
  }
  if (filter.examTargets?.length) parts.push(`${filter.examTargets.join("/")} plan`);
  if (filter.classLevels?.length) parts.push(filter.classLevels.join("/"));
  if (filter.tracks?.length) parts.push(filter.tracks.map((t) => t[0] + t.slice(1).toLowerCase()).join("/"));
  if (filter.tiers?.length) parts.push(filter.tiers.map((t) => t[0] + t.slice(1).toLowerCase()).join("/"));
  return parts.length ? parts.join(" · ") : "All students";
}
