import { LuShield } from "react-icons/lu";
import { requireAdminPage } from "@/lib/admin-session";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminSignOut } from "@/components/admin/admin-sign-out";
import { AdminSessionProvider } from "@/components/admin/admin-session-provider";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Chrome only. Each page calls requireAdminPage() itself — Partial Rendering
  // means this layout does not re-run on client-side navigation between admin
  // routes, so it cannot be the wall.
  const admin = await requireAdminPage();

  return (
    <div className="min-h-full">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      >
        Skip to content
      </a>
      <div className="flex min-h-full">
        <aside className="w-56 border-r border-border bg-card flex-shrink-0 hidden lg:block">
          <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
            <LuShield className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground text-sm">Admin</span>
          </div>
          <AdminNav variant="sidebar" isOwner={admin.isOwner} />
          <div className="px-3 pt-3 border-t border-border mt-3">
            {/* AdminSignOut calls next-auth/react signOut, which needs the
                admin base path or it targets the student instance. */}
            <AdminSessionProvider>
              <AdminSignOut />
            </AdminSessionProvider>
          </div>
        </aside>

        <main id="admin-main" tabIndex={-1} className="flex-1 pb-24 lg:pb-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>

      <AdminNav variant="mobile" isOwner={admin.isOwner} />
    </div>
  );
}
