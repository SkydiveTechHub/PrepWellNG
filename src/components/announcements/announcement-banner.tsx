import Link from "next/link";
import { getBannerAnnouncement } from "@/lib/announcement-data";
import { isInternalPath } from "@/lib/push-payload";
import { buttonClass } from "@/components/ui/button";
import { DismissibleAnnouncement } from "./dismiss-announcement-button";

export async function AnnouncementBanner({ userId }: { userId: string }) {
  let announcement;
  try {
    announcement = await getBannerAnnouncement(userId);
  } catch (error) {
    // A banner is never worth a broken page (e.g. before the migration).
    console.error("Loading announcement banner failed:", error);
    return null;
  }
  if (!announcement) return null;

  return (
    <DismissibleAnnouncement id={announcement.id}>
      <p className="text-sm font-bold text-foreground break-words">{announcement.title}</p>
      <p className="mt-0.5 text-sm text-muted break-words">{announcement.body}</p>
      {isInternalPath(announcement.url) && (
        <Link href={announcement.url} className={buttonClass("outline", "sm", "mt-3")}>
          Open
        </Link>
      )}
    </DismissibleAnnouncement>
  );
}
