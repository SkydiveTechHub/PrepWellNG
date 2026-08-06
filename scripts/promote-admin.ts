import { PrismaClient, Role } from "@prisma/client";

// Grants (or revokes) admin access by email.
//
//   npx tsx scripts/promote-admin.ts someone@example.com
//   npx tsx scripts/promote-admin.ts someone@example.com STUDENT   # demote
//
// There is no seeded admin account and no env-var backdoor — `requireAdmin()`
// reads `User.role` straight from the database — so this is the only way to
// open the console for the first time. Idempotent: re-running is a no-op.

const prisma = new PrismaClient();

async function main() {
  const [emailArg, roleArg = "ADMIN"] = process.argv.slice(2);

  if (!emailArg) {
    console.error("Usage: npx tsx scripts/promote-admin.ts <email> [ROLE]");
    process.exit(1);
  }

  if (!Object.values(Role).includes(roleArg as Role)) {
    console.error(
      `Unknown role "${roleArg}". Expected one of: ${Object.values(Role).join(", ")}`,
    );
    process.exit(1);
  }

  // Registration normalizes emails, so match the same way rather than failing
  // on a capitalized argument.
  const email = emailArg.trim().toLowerCase();
  const role = roleArg as Role;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    console.error(`No user with email ${email}.`);
    process.exit(1);
  }

  if (user.role === role) {
    console.log(`${user.email} is already ${role}. Nothing to do.`);
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role } });
  console.log(`${user.email}: ${user.role} → ${role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
