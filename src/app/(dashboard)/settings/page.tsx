import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSettingsProfile } from "@/lib/settings";
import { AvatarUpload } from "@/components/settings/avatar-upload";
import { ProfileForm } from "@/components/settings/profile-form";
import { AcademicForm } from "@/components/settings/academic-form";
import { PasswordForm } from "@/components/settings/password-form";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Settings — PrepWell NG",
};

export default async function SettingsPage() {
  const session = await auth();
  // The layout already guards this, but the page reads by id and must not
  // fall through to a query with an undefined id.
  if (!session?.user?.id) redirect("/login");

  const user = await getSettingsProfile(session.user.id);
  if (!user) redirect("/login");

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Settings"
        description="Manage your account and study preferences."
      />

      <div className="space-y-5 max-w-2xl">
        <AvatarUpload
          image={user.image}
          firstName={user.firstName}
          lastName={user.lastName}
        />

        <ProfileForm
          email={user.email}
          firstName={user.firstName}
          lastName={user.lastName}
          phone={user.phone}
          state={user.state}
        />

        <AcademicForm classLevel={user.classLevel} track={user.track} />

        {/* Google-only accounts have no password to change. */}
        {user.hasPassword && <PasswordForm />}
      </div>
    </div>
  );
}
