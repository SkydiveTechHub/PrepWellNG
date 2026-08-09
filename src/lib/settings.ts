import { db } from "./db";

export type SettingsProfile = {
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  state: string | null;
  image: string | null;
  classLevel: string | null;
  track: string | null;
  /** Google-only accounts have no password to change. */
  hasPassword: boolean;
};

/**
 * Read from the database rather than the session so the form always shows the
 * last saved values after `router.refresh()`. Returns null when the user row is
 * gone, which the caller treats as signed out.
 *
 * The password hash is never returned — only whether one exists.
 */
export async function getSettingsProfile(
  userId: string,
): Promise<SettingsProfile | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      state: true,
      image: true,
      classLevel: true,
      track: true,
      passwordHash: true,
    },
  });
  if (!user) return null;

  const { passwordHash, ...rest } = user;
  return { ...rest, hasPassword: Boolean(passwordHash) };
}
