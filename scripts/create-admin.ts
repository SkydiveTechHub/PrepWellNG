import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { normalizeIdentifier } from "../src/lib/admin-access";

// Mints the owner admin. This is the only way to open the console for the
// first time — there is no seeded account and no env-var backdoor.
//
//   npx tsx scripts/create-admin.ts michael@example.com "some password"
//   npx tsx scripts/create-admin.ts michael "some password"
//
// Every subsequent admin is created from /admin/team by the owner.

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;

async function main() {
  const [rawIdentifier, password] = process.argv.slice(2);

  if (!rawIdentifier || !password) {
    console.error(
      'Usage: npx tsx scripts/create-admin.ts <email-or-username> "<password>"',
    );
    process.exit(1);
  }

  if (password.length < 12) {
    // Stricter than the student minimum of 6: this account edits the question
    // bank, and nobody has to type it on a phone during registration.
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const identifier = normalizeIdentifier(rawIdentifier);
  if (!identifier) {
    console.error(
      `"${rawIdentifier}" is neither a valid email nor a valid username ` +
        "(3-32 chars, a-z 0-9 . _ - only).",
    );
    process.exit(1);
  }

  const existingOwner = await prisma.admin.findFirst({
    where: { isOwner: true },
    select: { id: true, email: true, username: true },
  });

  if (existingOwner) {
    console.error(
      `An owner already exists (${existingOwner.email ?? existingOwner.username}). ` +
        "Create further admins from /admin/team.",
    );
    process.exit(1);
  }

  const admin = await prisma.admin.create({
    data: {
      ...identifier,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      isOwner: true,
    },
    select: { id: true, email: true, username: true },
  });

  console.log(`Owner created: ${admin.email ?? admin.username} (${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
