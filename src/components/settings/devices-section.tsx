import { currentEntitlement } from "@/lib/billing/subscription-data";
import { listActiveDevices } from "@/lib/devices";
import { DEVICE_LIMIT, formatLastActive, isDeviceLimited } from "@/lib/device-limit";
import { Section } from "./section";
import { DeviceList } from "./device-list";

/**
 * "Last active" is formatted here on the server: formatting a timestamp in a
 * client component renders differently on the server and in the browser.
 */
export async function DevicesSection({
  userId,
  currentDeviceId,
}: {
  userId: string;
  currentDeviceId: string | undefined;
}) {
  let loaded: [
    Awaited<ReturnType<typeof currentEntitlement>>,
    Awaited<ReturnType<typeof listActiveDevices>>,
  ];
  try {
    loaded = await Promise.all([currentEntitlement(userId), listActiveDevices(userId)]);
  } catch (error) {
    // Degrade this one section rather than taking down all of Settings — e.g.
    // code deployed before the UserDevice migration has no table to read.
    console.error("Loading devices failed:", error);
    return (
      <Section title="Devices">
        <p className="text-sm text-muted">
          Your devices could not be loaded. Please try again later.
        </p>
      </Section>
    );
  }
  const [{ tier }, devices] = loaded;
  const now = new Date();

  return (
    <Section
      title="Devices"
      description={
        isDeviceLimited(tier)
          ? `Your plan allows ${DEVICE_LIMIT} devices at a time. Signing in on a new device signs out the one used least recently.`
          : "Browsers where you are signed in."
      }
    >
      <DeviceList
        devices={devices.map((d) => ({
          id: d.id,
          label: d.label,
          lastActive:
            d.id === currentDeviceId ? "Active now" : formatLastActive(d.lastSeenAt, now),
          isCurrent: d.id === currentDeviceId,
        }))}
      />
    </Section>
  );
}
