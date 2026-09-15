import { Prisma } from "@prisma/client";
import { audienceClauses, type AudienceClause, type AudienceFilter } from "@/lib/push-audience";

function clauseSql(clause: AudienceClause): Prisma.Sql {
  const values = Prisma.join(clause.values);
  switch (clause.field) {
    case "examTarget":
      return Prisma.sql`EXISTS (SELECT 1 FROM "StudyPlan" sp WHERE sp."studentId" = u."id" AND sp."isActive" AND sp."targetExam"::text IN (${values}))`;
    case "classLevel":
      return Prisma.sql`u."classLevel"::text IN (${values})`;
    case "track":
      return Prisma.sql`u."track"::text IN (${values})`;
    case "tier":
      return Prisma.sql`u."tier"::text IN (${values})`;
    case "userId":
      return Prisma.sql`u."id" IN (${values})`;
  }
}

/** Mirrors matchesAudience(): role, active, then every clause with AND. */
export function audienceWhereSql(filter: AudienceFilter): Prisma.Sql {
  const conditions = [
    Prisma.sql`u."role"::text = ${"STUDENT"}`,
    Prisma.sql`u."isActive"`,
    ...audienceClauses(filter).map(clauseSql),
  ];
  return Prisma.join(conditions, " AND ");
}
