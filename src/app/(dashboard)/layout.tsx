import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { isDeviceRevokedSession } from "@/lib/device-limit";
import { Sidebar } from "@/components/ui/sidebar";
import { MobileNav } from "@/components/ui/mobile-nav";
import { MobileHeader } from "@/components/ui/mobile-header";
import { PushSync } from "@/components/push/push-sync";
import { AnnouncementBanner } from "@/components/announcements/announcement-banner";
import type { ProfileUser } from "@/components/ui/user-menu";
import {
  ExamCountdownCard,
  ExamCountdownRow,
} from "@/components/ui/exam-countdown";
import { NOINDEX } from "@/lib/seo/metadata";

// Nothing under here is useful in a search result, and an indexed login wall
// is a ranking liability. Async layouts can still export static metadata.
export const metadata = NOINDEX;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative guard. The proxy check is optimistic and can be bypassed by
  // a stale or forged cookie surviving long enough to reach the app.
  const session = await auth();
  // Signed out elsewhere: /signed-out deletes the cookie, which auth() can't.
  if (isDeviceRevokedSession(session)) redirect("/signed-out");
  if (!session?.user?.id) redirect("/login");

  // The session callback already enriches these, so the chrome needs no
  // separate query and no SessionProvider.
  const user = session.user as ProfileUser;

  // The countdown comes from the student's study plan, which means a query —
  // and this layout wraps every page in the dashboard, so it cannot block on
  // the pooler. Streamed in as a slot instead, the same way the announcement
  // banner below is, and request-cached so both shells share one query.
  const countdown = { userId: session.user.id, classLevel: user.classLevel };

  return (
    <div className="min-h-full">
      <PushSync />
      <Sidebar
        user={user}
        countdown={
          <Suspense fallback={null}>
            <ExamCountdownCard {...countdown} />
          </Suspense>
        }
      />
      <MobileHeader
        user={user}
        countdown={
          <Suspense fallback={null}>
            <ExamCountdownRow {...countdown} />
          </Suspense>
        }
      />
      <MobileNav />

      {/* Main content — offset by sidebar on desktop */}
      <main className="lg:pl-64 pb-20 lg:pb-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {/* Streams in: a slow pooler connection must not hold up the page. */}
          <Suspense fallback={null}>
            <AnnouncementBanner userId={session.user.id} />
          </Suspense>
          {children}
        </div>
      </main>
    </div>
  );
}
