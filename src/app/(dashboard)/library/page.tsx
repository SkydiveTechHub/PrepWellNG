import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { relevantTrackCategories } from "@/lib/subjects";
import { LibraryView } from "@/components/library/library-view";

// The shelf is resolved on the server. It used to mount a spinner and fetch
// /api/library, which also meant a second lookup of the student's track.
export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { track: true },
  });

  const subjects = await db.subject.findMany({
    where: { trackCategory: { in: [...relevantTrackCategories(user?.track)] } },
    orderBy: [{ trackCategory: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      code: true,
      description: true,
      trackCategory: true,
      _count: { select: { resources: true } },
    },
  });

  return <LibraryView subjects={subjects} />;
}
