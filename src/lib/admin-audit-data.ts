import { db } from "@/lib/db";
import { AUDIT_PAGE_SIZE, type AuditFilter } from "@/lib/admin-audit-filter";

export interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  createdAt: Date;
  actorLabel: string;
}

export async function listAuditEntries(
  filter: AuditFilter,
): Promise<{ rows: AuditRow[]; total: number }> {
  const where = {
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.entity ? { entity: filter.entity } : {}),
    ...(filter.from || filter.to
      ? {
          createdAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            // The `to` date is a day, so include everything within it rather
            // than stopping at midnight and silently dropping that day's rows.
            //
            // Both bounds are UTC: `new Date("2026-08-01")` parses as UTC
            // midnight, so in WAT (+01:00) a day runs 01:00 to 00:59 local.
            // An action logged at 00:30 local therefore falls under the
            // previous day's filter. Acceptable for a coarse date-range
            // filter over a log that also shows each row's exact timestamp;
            // fixing it properly means resolving the admin's timezone rather
            // than assuming one, which is not worth it here.
            ...(filter.to
              ? { lte: new Date(filter.to.getTime() + 24 * 60 * 60 * 1000 - 1) }
              : {}),
          },
        }
      : {}),
  };

  // Counted FIRST, not in parallel with the fetch — same rule as listStudents.
  // Skipping by an unclamped page walks past the end of the log and renders
  // "no matching activity" over a log full of entries, which reads as "nothing
  // happened" rather than "your page number is out of range".
  const total = await db.adminAudit.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, filter.page), totalPages);

  const entries = await db.adminAudit.findMany({
    where,
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      summary: true,
      createdAt: true,
      actor: { select: { email: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE,
  });

  return {
    total,
    rows: entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      summary: entry.summary,
      createdAt: entry.createdAt,
      actorLabel: entry.actor.email ?? entry.actor.username ?? "Unknown admin",
    })),
  };
}

/** Actors who have actually acted, for the filter dropdown. */
export async function listAuditActors(): Promise<
  Array<{ id: string; label: string }>
> {
  const admins = await db.admin.findMany({
    where: { audits: { some: {} } },
    select: { id: true, email: true, username: true },
    orderBy: { createdAt: "asc" },
  });
  return admins.map((admin) => ({
    id: admin.id,
    label: admin.email ?? admin.username ?? admin.id,
  }));
}
