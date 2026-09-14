import { getPreferences } from "@/lib/push-subscription-data";
import { Section } from "./section";
import { NotificationSettings } from "./notification-settings";

export async function NotificationsSection({ userId }: { userId: string }) {
  // Push not configured on this deployment: say nothing rather than offer a
  // switch that cannot work.
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return null;

  let preferences;
  try {
    preferences = await getPreferences(userId);
  } catch (error) {
    // Degrade this section, not all of Settings (e.g. before the migration).
    console.error("Loading notification preferences failed:", error);
    return (
      <Section title="Notifications">
        <p className="text-sm text-muted">Notification settings could not be loaded. Please try again later.</p>
      </Section>
    );
  }

  return (
    <Section title="Notifications" description="Reminders and announcements on your phone or computer.">
      <NotificationSettings initial={preferences} />
    </Section>
  );
}
