import { requireAdminPage } from "@/lib/admin-session";
import { PageHeader } from "@/components/ui/page-header";
import { AdminTable, AdminTd, AdminTh, AdminTr } from "@/components/admin/admin-table";
import { EmptyState } from "@/components/admin/empty-state";
import { Pagination, pageWindow } from "@/components/admin/pagination";
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
                <AdminTh>When</AdminTh>
                <AdminTh>Who</AdminTh>
                <AdminTh>Action</AdminTh>
                <AdminTh>What</AdminTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <AdminTr key={row.id}>
                  <AdminTd className="whitespace-nowrap tabular-nums text-muted">
                    {STAMP.format(row.createdAt)}
                  </AdminTd>
                  <AdminTd className="text-muted">{row.actorLabel}</AdminTd>
                  <AdminTd>
                    <code className="rounded bg-secondary px-1.5 py-0.5 text-xs text-foreground">
                      {row.action}
                    </code>
                  </AdminTd>
                  <AdminTd className="text-foreground">{row.summary}</AdminTd>
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
