import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isDeviceRevokedSession } from "@/lib/device-limit";
import { Logo } from "@/components/ui/logo";
import { NOINDEX } from "@/lib/seo/metadata";

export const metadata = NOINDEX;

// Signed in but not yet through to the dashboard. Deliberately outside the
// (dashboard) group: that layout redirects incomplete profiles here, and
// sharing it would loop.
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (isDeviceRevokedSession(session)) redirect("/signed-out");
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="flex min-h-full flex-col items-center px-6 py-10 lg:py-16">
      <Logo href={null} className="mb-10" />
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
