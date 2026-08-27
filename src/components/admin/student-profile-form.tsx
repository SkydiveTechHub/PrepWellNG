"use client";

import { cn } from "@/lib/utils";

const HEADING_CLS = "text-[11px] font-semibold uppercase tracking-wider text-muted";

export function StudentProfileForm({
  student,
  canEdit,
  className,
}: {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    classLevel: string | null;
    track: string | null;
    state: string | null;
    schoolName: string | null;
  };
  canEdit: boolean;
  className?: string;
}) {
  const fields: Array<[string, string]> = [
    ["First name", student.firstName],
    ["Last name", student.lastName],
    ["Email", student.email ?? "—"],
    ["Phone", student.phone ?? "—"],
    ["Class", student.classLevel ?? "—"],
    ["Track", student.track ?? "—"],
    ["State", student.state ?? "—"],
    ["School", student.schoolName ?? "—"],
  ];

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-4 rounded-lg border border-border-strong bg-card p-4 sm:grid-cols-4",
        className,
      )}
    >
      {fields.map(([label, value]) => (
        <div key={label}>
          <p className={HEADING_CLS}>{label}</p>
          <p className="mt-1 text-sm text-foreground">{value}</p>
        </div>
      ))}
      {!canEdit && (
        <p className="col-span-full text-xs text-muted">
          You do not have permission to edit this profile.
        </p>
      )}
    </div>
  );
}
