import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-session";
import { PageHeader } from "@/components/ui/page-header";
import {
  AdminTable,
  AdminTd,
  AdminTh,
  AdminTr,
  HIDE_BELOW,
  SHOW_BELOW,
} from "@/components/admin/admin-table";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/admin/empty-state";
import { Pagination, pageWindow } from "@/components/ui/pagination";
import { StudentFilterBar } from "@/components/admin/student-filter-bar";
import {
  STUDENT_PAGE_SIZE,
  fullName,
  normaliseStudentFilter,
  studentFilterParams,
  type RawStudentParams,
} from "@/lib/admin-student";
import { listStudents } from "@/lib/admin-student-data";
import { describeTier } from "@/lib/subscription";
import { describeAccountStatus } from "@/lib/account-status";
import { Badge } from "@/components/admin/badge";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<RawStudentParams>;
}) {
  // The layout's check does not re-run on client-side navigation between admin
  // routes, so each page carries its own.
  await requireAdminPage();

  const filter = normaliseStudentFilter(await searchParams);
  const { rows, total } = await listStudents(filter);
  const win = pageWindow({
    page: filter.page,
    pageSize: STUDENT_PAGE_SIZE,
    total,
  });

  return (
    <div>
      <PageHeader
        title="Students"
        description={`${total} ${total === 1 ? "account" : "accounts"} match the current filters.`}
      />

      <StudentFilterBar filter={filter} />

      {rows.length === 0 ? (
        <EmptyState
          title="No students match"
          message="Try widening the filters, or clear the search box."
        />
      ) : (
        <>
          <AdminTable caption="Student accounts">
            <thead>
              <tr className="border-b border-border-strong">
                <AdminTh>Name</AdminTh>
                <AdminTh className={HIDE_BELOW.md}>Contact</AdminTh>
                <AdminTh className={HIDE_BELOW.lg}>Class</AdminTh>
                <AdminTh className={HIDE_BELOW.lg}>Track</AdminTh>
                <AdminTh>Plan</AdminTh>
                <AdminTh className={HIDE_BELOW.sm}>Status</AdminTh>
                <AdminTh align="right" className={HIDE_BELOW.lg}>Joined</AdminTh>
                <AdminTh align="right" className={HIDE_BELOW.md}>Last active</AdminTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const tier = describeTier(row);
                const status = describeAccountStatus(row);
                return (
                  <AdminTr key={row.id}>
                    <AdminTd>
                      <Link
                        href={`/admin/students/${row.id}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {fullName(row)}
                      </Link>
                      <p className={cn(SHOW_BELOW.md, "mt-0.5 break-all text-xs text-muted")}>
                        {row.email ?? row.phone ?? "—"}
                      </p>
                    </AdminTd>
                    <AdminTd className={cn(HIDE_BELOW.md, "text-muted")}>
                      {row.email ?? row.phone ?? "—"}
                    </AdminTd>
                    <AdminTd className={cn(HIDE_BELOW.lg, "text-muted")}>
                      {row.classLevel ?? "—"}
                    </AdminTd>
                    <AdminTd className={cn(HIDE_BELOW.lg, "text-muted")}>
                      {row.track
                        ? row.track.charAt(0) + row.track.slice(1).toLowerCase()
                        : "—"}
                    </AdminTd>
                    <AdminTd>
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={tier.tone}>{tier.label}</Badge>
                        <span className={SHOW_BELOW.sm}>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </span>
                      </div>
                    </AdminTd>
                    <AdminTd className={HIDE_BELOW.sm}>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </AdminTd>
                    <AdminTd align="right" className={cn(HIDE_BELOW.lg, "tabular-nums text-muted")}>
                      {DATE.format(row.createdAt)}
                    </AdminTd>
                    <AdminTd align="right" className={cn(HIDE_BELOW.md, "whitespace-nowrap tabular-nums text-muted")}>
                      {row.lastActiveAt ? DATE.format(row.lastActiveAt) : "Never"}
                    </AdminTd>
                  </AdminTr>
                );
              })}
            </tbody>
          </AdminTable>

          <Pagination
            window={win}
            basePath="/admin/students"
            params={studentFilterParams(filter)}
          />
        </>
      )}
    </div>
  );
}
