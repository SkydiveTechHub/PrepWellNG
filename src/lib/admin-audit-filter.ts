import type { AuditAction } from "@/lib/admin-audit";

/**
 * Narrowing the audit log. Pure — no Prisma — so the date and enum handling
 * can be tested without a database.
 */

export const AUDIT_PAGE_SIZE = 50;

// Kept in step with the AuditAction union in admin-audit.ts. Listed here as
// values because a type cannot be iterated to build a <select>.
export const AUDIT_ACTIONS: readonly AuditAction[] = [
  "question.create",
  "question.update",
  "question.delete",
  "question.import",
  "lesson.import",
  "admin.create",
  "admin.deactivate",
  "admin.reactivate",
  "student.update",
  "student.suspend",
  "student.reactivate",
  "student.tier",
  "student.force_signout",
  "student.delete",
];

export const AUDIT_ENTITIES = ["Question", "Lesson", "Admin", "User"] as const;

export interface RawAuditParams {
  actor?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
  page?: string;
}

export interface AuditFilter {
  actorId: string | null;
  action: string | null;
  entity: string | null;
  from: Date | null;
  to: Date | null;
  page: number;
}

function parseDate(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * A reversed range is dropped rather than passed through: `from > to` can only
 * ever match zero rows, and an empty table reads as "nothing happened" rather
 * than "your dates are backwards".
 */
export function normaliseAuditFilter(params: RawAuditParams): AuditFilter {
  const page = Number.parseInt(params.page ?? "", 10);

  let from = parseDate(params.from);
  let to = parseDate(params.to);
  if (from && to && from > to) {
    from = null;
    to = null;
  }

  const action =
    params.action && (AUDIT_ACTIONS as readonly string[]).includes(params.action)
      ? params.action
      : null;

  const entity =
    params.entity && (AUDIT_ENTITIES as readonly string[]).includes(params.entity)
      ? params.entity
      : null;

  return {
    actorId: params.actor?.trim() ? params.actor : null,
    action,
    entity,
    from,
    to,
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

export function auditFilterParams(filter: AuditFilter): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.actorId) params.actor = filter.actorId;
  if (filter.action) params.action = filter.action;
  if (filter.entity) params.entity = filter.entity;
  if (filter.from) params.from = filter.from.toISOString().slice(0, 10);
  if (filter.to) params.to = filter.to.toISOString().slice(0, 10);
  return params;
}
