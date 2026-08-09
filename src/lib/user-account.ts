import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { db } from "./db";

/** Same cost factor as registration. */
const BCRYPT_ROUNDS = 12;

export type ProfilePatch = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  state?: string;
  classLevel?: Prisma.UserUpdateInput["classLevel"];
  track?: Prisma.UserUpdateInput["track"];
};

export type UpdatedProfile = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  state: string | null;
  classLevel: string | null;
  track: string | null;
};

/**
 * Applies a partial profile update.
 *
 * Only keys actually present are written, so the profile section never
 * overwrites the academic section's fields and vice versa. Returns
 * `"nothing-to-update"` when the patch is empty, and `"phone-taken"` when the
 * unique index on phone rejects the write.
 */
export async function updateUserProfile(
  userId: string,
  patch: ProfilePatch,
): Promise<UpdatedProfile | "nothing-to-update" | "phone-taken"> {
  const { firstName, lastName, phone, state, classLevel, track } = patch;

  const data: Prisma.UserUpdateInput = {};
  if (firstName !== undefined) data.firstName = firstName;
  if (lastName !== undefined) data.lastName = lastName;
  if (classLevel !== undefined) data.classLevel = classLevel;
  if (track !== undefined) data.track = track;
  // A cleared field must become NULL, not "": the unique index on phone would
  // otherwise collide across every user who left it blank.
  if (phone !== undefined) data.phone = phone || null;
  if (state !== undefined) data.state = state || null;

  if (Object.keys(data).length === 0) return "nothing-to-update";

  try {
    return await db.user.update({
      // Always the caller's own id — never one supplied by the request body.
      where: { id: userId },
      data,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        state: true,
        classLevel: true,
        track: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "phone-taken";
    }
    throw error;
  }
}

/**
 * Verifies the current password and replaces it.
 *
 * `"no-password"` means a Google-only account, which has nothing to change;
 * `"wrong-password"` means the current password did not match.
 */
export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<"ok" | "no-password" | "wrong-password"> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user?.passwordHash) return "no-password";
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return "wrong-password";
  }

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
  });
  return "ok";
}

/** Points the user's avatar at an already-uploaded image URL. */
export async function setUserAvatar(userId: string, image: string) {
  await db.user.update({ where: { id: userId }, data: { image } });
}

export type RegisterInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  classLevel: Prisma.UserCreateInput["classLevel"];
  track: Prisma.UserCreateInput["track"];
  state?: string | null;
};

/**
 * Creates a student account. Returns `"email-taken"` rather than throwing, so
 * the caller can answer 409 without inspecting Prisma error codes.
 *
 * Emails are stored normalized: the credentials provider lowercases on every
 * login, so the row must be findable regardless of how it was typed.
 */
export async function registerUser(input: RegisterInput) {
  const email = input.email.trim().toLowerCase();

  if (await db.user.findUnique({ where: { email } })) return "email-taken" as const;

  return db.user.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      classLevel: input.classLevel,
      track: input.track,
      state: input.state,
      role: "STUDENT",
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      classLevel: true,
      track: true,
    },
  });
}
