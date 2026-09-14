import { db } from "./db";
import { DEVICE_LIMIT, devicesToRevoke } from "./device-limit";

/**
 * Creates the device row for a sign-in and, for a limited account, signs out
 * the least recently used devices past DEVICE_LIMIT.
 *
 * One transaction, with the user row locked, so two simultaneous sign-ins
 * cannot both read "one other device" and both survive. `FOR NO KEY UPDATE`
 * still serializes registerDevice per user, but unlike `FOR UPDATE` it doesn't
 * block the foreign-key checks and unrelated writes that only need
 * `FOR KEY SHARE` on the User row. The generous waits are
 * for the Supabase pooler, which can take many seconds to hand out a connection.
 */
export async function registerDevice(args: {
  userId: string;
  label: string;
  limited: boolean;
}): Promise<string> {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${args.userId} FOR NO KEY UPDATE`;

      const device = await tx.userDevice.create({
        data: { userId: args.userId, label: args.label },
        select: { id: true },
      });

      if (args.limited) {
        const active = await tx.userDevice.findMany({
          where: { userId: args.userId, revokedAt: null },
          select: { id: true, lastSeenAt: true },
        });
        const revoke = devicesToRevoke(active, device.id, DEVICE_LIMIT);
        if (revoke.length > 0) {
          await tx.userDevice.updateMany({
            where: { id: { in: revoke } },
            data: { revokedAt: new Date() },
          });
        }
      }

      return device.id;
    },
    { maxWait: 15_000, timeout: 20_000 },
  );
}

export function listActiveDevices(userId: string) {
  return db.userDevice.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, label: true, lastSeenAt: true },
    orderBy: { lastSeenAt: "desc" },
  });
}

/** Scoped by userId, so a student can only ever sign out their own devices. */
export async function revokeDevice(userId: string, deviceId: string): Promise<boolean> {
  const { count } = await db.userDevice.updateMany({
    where: { id: deviceId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count > 0;
}

/**
 * Signs out every device except `keepDeviceId`. Tokens minted before device
 * tracking have no row and are not reached by this; they lapse at their normal
 * session expiry or their next sign-in.
 */
export async function revokeOtherDevices(
  userId: string,
  keepDeviceId: string | undefined,
): Promise<number> {
  const { count } = await db.userDevice.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(keepDeviceId ? { id: { not: keepDeviceId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return count;
}

export async function touchDevice(deviceId: string): Promise<void> {
  await db.userDevice.update({
    where: { id: deviceId },
    data: { lastSeenAt: new Date() },
  });
}
