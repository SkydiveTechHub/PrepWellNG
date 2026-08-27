import { db } from "@/lib/db";

export type AuditAction =
  | "question.create"
  | "question.update"
  | "question.delete"
  | "question.import"
  | "lesson.import"
  | "admin.create"
  | "admin.deactivate"
  | "admin.reactivate"
  | "student.update"
  | "student.suspend"
  | "student.reactivate"
  | "student.tier"
  | "student.force_signout"
  | "student.delete";

export type AuditEntry = {
  actorId: string;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary: string;
};

/**
 * Records an admin mutation. Deliberately swallows its own failures: losing an
 * audit row must never turn a successful edit into an error the admin sees.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.adminAudit.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
      },
    });
  } catch (error) {
    console.error("Failed to record admin audit entry:", error);
  }
}
