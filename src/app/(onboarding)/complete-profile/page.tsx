import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProfileCompletionFields } from "@/lib/user-account";
import { isNigerianState } from "@/lib/constants/exam-types";
import { isProfileComplete } from "@/lib/profile-completion";
import { CompleteProfileForm } from "@/components/onboarding/complete-profile-form";

export const dynamic = "force-dynamic";

export default async function CompleteProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // The row, not the cached session: the dashboard gate may be acting on a
  // stale cache, and only the database can say the step is already done.
  const user = await getProfileCompletionFields(session.user.id);
  if (!user) redirect("/login");
  if (isProfileComplete(user)) redirect("/dashboard");

  return (
    <CompleteProfileForm
      firstName={user.firstName}
      initial={{
        classLevel: user.classLevel ?? "",
        track: user.track ?? "",
        // A free-text value from before the list existed can't be selected.
        state: isNigerianState(user.state) ? user.state : "",
      }}
    />
  );
}
