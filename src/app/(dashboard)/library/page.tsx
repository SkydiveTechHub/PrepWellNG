import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLibraryShelf } from "@/lib/library";
import { LibraryView } from "@/components/library/library-view";

// The shelf is resolved on the server. It used to mount a spinner and fetch
// /api/library, which also meant a second lookup of the student's track.
export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const subjects = await getLibraryShelf(session.user.id);

  return <LibraryView subjects={subjects} />;
}
