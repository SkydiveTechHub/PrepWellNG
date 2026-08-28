import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-session";
import { DetailShell } from "@/components/admin/detail-shell";
import { Badge } from "@/components/admin/badge";
import { StudentProfileForm } from "@/components/admin/student-profile-form";
import { StudentTierControl } from "@/components/admin/student-tier-control";
import { StudentDangerZone } from "@/components/admin/student-danger-zone";
import {
  getStudentDeletionImpact,
  getStudentDetail,
} from "@/lib/admin-student-data";
import { fullName } from "@/lib/admin-student";
import { describeTier } from "@/lib/subscription";
import { describeAccountStatus } from "@/lib/account-status";
import {
  canDeleteStudent,
  canEditStudent,
  canForceSignOutStudent,
  canSuspendStudent,
} from "@/lib/admin-access";

export const dynamic = "force-dynamic";

const HEADING_CLS = "text-[11px] font-semibold uppercase tracking-wider text-muted";
const DATE = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function AdminStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdminPage();
  const { id } = await params;

  const student = await getStudentDetail(id);
  if (!student) notFound();

  // Seven COUNT queries, and only the owner can ever act on them. Computing
  // them for every admin viewing any student would tax every page view for a
  // control most viewers cannot even see.
  const impact = canDeleteStudent(admin)
    ? await getStudentDeletionImpact(id)
    : {};

  const tier = describeTier(student);
  const status = describeAccountStatus(student);

  return (
    <DetailShell
      breadcrumb={{ label: "Students", href: "/admin/students" }}
      title={fullName(student)}
      subtitle={student.email ?? student.phone ?? "No contact details"}
      actions={
        <div className="flex gap-2">
          <Badge tone={tier.tone}>{tier.label}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      }
    >
      {!student.isActive && (
        <section>
          <h2 className={HEADING_CLS}>Suspension</h2>
          <p className="mt-2 text-sm text-foreground">
            Suspended{" "}
            {student.suspendedAt ? DATE.format(student.suspendedAt) : "at an unknown time"}
            {student.suspendedReason ? ` — ${student.suspendedReason}` : ""}
          </p>
        </section>
      )}

      <section>
        <h2 className={HEADING_CLS}>Profile</h2>
        <StudentProfileForm
          student={student}
          canEdit={canEditStudent(admin)}
          className="mt-2"
        />
      </section>

      <section>
        <h2 className={HEADING_CLS}>Plan</h2>
        <StudentTierControl
          studentId={student.id}
          tier={student.tier}
          tierUpdatedAt={student.tierUpdatedAt ? DATE.format(student.tierUpdatedAt) : null}
          canEdit={canEditStudent(admin)}
          className="mt-2"
        />
      </section>

      <section>
        <h2 className={HEADING_CLS}>Activity</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Attempts" value={student.attemptCount} />
          <Stat label="Topics tracked" value={student.masteredTopicCount} />
          <Stat label="Flashcard reviews" value={student.flashcardReviewCount} />
          <Stat
            label="Last active"
            text={student.lastActiveAt ? DATE.format(student.lastActiveAt) : "Never"}
          />
        </dl>
      </section>

      <section>
        <h2 className={HEADING_CLS}>Danger zone</h2>
        <StudentDangerZone
          studentId={student.id}
          studentName={fullName(student)}
          isActive={student.isActive}
          impact={impact}
          canSuspend={canSuspendStudent(admin)}
          canForceSignOut={canForceSignOutStudent(admin)}
          canDelete={canDeleteStudent(admin)}
          className="mt-2"
        />
      </section>
    </DetailShell>
  );
}

function Stat({
  label,
  value,
  text,
}: {
  label: string;
  value?: number;
  text?: string;
}) {
  return (
    <div className="rounded-lg border border-border-strong bg-card px-4 py-3">
      <dt className={HEADING_CLS}>{label}</dt>
      <dd className="mt-1 text-lg font-bold tabular-nums text-foreground">
        {text ?? value}
      </dd>
    </div>
  );
}
