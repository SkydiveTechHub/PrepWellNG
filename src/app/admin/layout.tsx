import { redirect } from "next/navigation";
import Link from "next/link";
import { LuArrowLeft, LuDatabase, LuUsers, LuBookOpen, LuShield } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const adminNav = [
  { name: "Questions", href: "/admin/questions", icon: LuDatabase },
  { name: "Subjects", href: "/admin/subjects", icon: LuBookOpen },
  { name: "Users", href: "/admin/users", icon: LuUsers },
  { name: "Lessons", href: "/admin/lessons", icon: LuBookOpen },
];

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
      <div className="flex min-h-full">
        {/* Admin sidebar */}
        <aside className="w-56 border-r border-border bg-card flex-shrink-0 hidden lg:block">
          <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
            <LuShield className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground text-sm">Admin</span>
          </div>
          <nav className="p-3 space-y-1">
            {adminNav.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:bg-secondary hover:text-foreground transition-colors"
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            ))}
          </nav>
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
        <main className="flex-1">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile admin nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border z-50">
        <div className="flex items-center justify-around py-2">
          {adminNav.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs font-medium text-muted"
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
