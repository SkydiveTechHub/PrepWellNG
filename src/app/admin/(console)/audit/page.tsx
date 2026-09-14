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
import { AuditFilterBar } from "@/components/admin/audit-filter-bar";
import {
  AUDIT_PAGE_SIZE,
  auditFilterParams,
  normaliseAuditFilter,
  type RawAuditParams,
} from "@/lib/admin-audit-filter";
import { listAuditActors, listAuditEntries } from "@/lib/admin-audit-data";

export const dynamic = "force-dynamic";

const STAMP = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<RawAuditParams>;
}) {
  // The layout's check does not re-run on client-side navigation between admin
  // routes, so each page carries its own.
  await requireAdminPage();

  const filter = normaliseAuditFilter(await searchParams);
  const [{ rows, total }, actors] = await Promise.all([
    listAuditEntries(filter),
    listAuditActors(),
  ]);
  const win = pageWindow({ page: filter.page, pageSize: AUDIT_PAGE_SIZE, total });

  return (
    <div>
      <PageHeader
        title="Audit log"
        description={`${total} recorded ${total === 1 ? "action" : "actions"}.`}
      />

      <AuditFilterBar filter={filter} actors={actors} />

      {rows.length === 0 ? (
        <EmptyState
          title="No matching activity"
          message="Widen the date range or clear the filters."
        />
      ) : (
        <>
          <AdminTable caption="Recorded admin actions">
            <thead>
              <tr className="border-b border-border-strong">
                <AdminTh className={HIDE_BELOW.sm}>When</AdminTh>
                <AdminTh className={HIDE_BELOW.md}>Who</AdminTh>
                <AdminTh className={HIDE_BELOW.md}>Action</AdminTh>
                <AdminTh>What</AdminTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <AdminTr key={row.id}>
                  <AdminTd className={cn(HIDE_BELOW.sm, "whitespace-nowrap tabular-nums text-muted")}>
                    {STAMP.format(row.createdAt)}
                  </AdminTd>
                  <AdminTd className={cn(HIDE_BELOW.md, "text-muted")}>{row.actorLabel}</AdminTd>
                  <AdminTd className={HIDE_BELOW.md}>
                    <code className="break-all rounded bg-secondary px-1.5 py-0.5 text-xs text-foreground">
                      {row.action}
                    </code>
                  </AdminTd>
                  <AdminTd className="text-foreground">
                    <p className="break-words">{row.summary}</p>
                    {/* The columns this cell stands in for on a narrow screen. */}
                    <div
                      className={cn(
                        SHOW_BELOW.md,
                        "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted",
                      )}
                    >
                      <code className="break-all rounded bg-secondary px-1.5 py-0.5 text-foreground">
                        {row.action}
                      </code>
                      <span>{row.actorLabel}</span>
                      <span className={cn(SHOW_BELOW.sm, "tabular-nums")}>
                        {STAMP.format(row.createdAt)}
                      </span>
                    </div>
                  </AdminTd>
                </AdminTr>
              ))}
            </tbody>
          </AdminTable>

          <Pagination
            window={win}
            basePath="/admin/audit"
            params={auditFilterParams(filter)}
          />
        </>
      )}
    </div>
  );
}
