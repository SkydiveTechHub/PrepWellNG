import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/ui/sidebar";
import { MobileNav } from "@/components/ui/mobile-nav";
import { MobileHeader } from "@/components/ui/mobile-header";
import type { ProfileUser } from "@/components/ui/user-menu";
import { daysUntilExam, examTargetFor } from "@/lib/exam-target";

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

  // Derived from the student's own class level rather than hard-coded, and
  // computed here on the server: deriving it inside the client components ran
  // it against two different clocks — once during SSR, once on hydration.
  const now = new Date();
  const examTarget = examTargetFor({ classLevel: user.classLevel, now });
  const daysToExam = daysUntilExam(examTarget, now);

  return (
    <div className="min-h-full">
      <Sidebar
        user={user}
        examLabel={examTarget.label}
        daysToExam={daysToExam}
      />
      <MobileHeader
        user={user}
        examLabel={examTarget.label}
        daysToExam={daysToExam}
      />
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
