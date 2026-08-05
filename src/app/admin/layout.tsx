import { redirect } from "next/navigation";
import Link from "next/link";
import { LuArrowLeft, LuShield } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (user?.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="min-h-full">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      >
        Skip to content
      </a>
      <div className="flex min-h-full">
        {/* Admin sidebar */}
        <aside className="w-56 border-r border-border bg-card flex-shrink-0 hidden lg:block">
          <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
            <LuShield className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground text-sm">Admin</span>
          </div>
          <AdminNav variant="sidebar" />
          <div className="px-3 pt-3 border-t border-border mt-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted hover:text-foreground transition-colors"
            >
              <LuArrowLeft className="w-3.5 h-3.5" />
              Back to Dashboard
            </Link>
          </div>
        </aside>

        {/* Main */}
        <main id="admin-main" tabIndex={-1} className="flex-1 pb-24 lg:pb-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile admin nav */}
      <AdminNav variant="mobile" />
    </div>
  );
}
