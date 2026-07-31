import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/ui/sidebar";
import { MobileNav } from "@/components/ui/mobile-nav";
import { MobileHeader } from "@/components/ui/mobile-header";
import type { ProfileUser } from "@/components/ui/user-menu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative guard. The proxy check is optimistic and can be bypassed by
  // a stale or forged cookie surviving long enough to reach the app.
  const session = await auth();
  if (!session?.user) redirect("/login");

  // The session callback already enriches these, so the chrome needs no
  // separate query and no SessionProvider.
  const user = session.user as ProfileUser;

  return (
    <div className="min-h-full">
      <Sidebar user={user} />
      <MobileHeader user={user} />
      <MobileNav />

      {/* Main content — offset by sidebar on desktop */}
      <main className="lg:pl-64 pb-20 lg:pb-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
