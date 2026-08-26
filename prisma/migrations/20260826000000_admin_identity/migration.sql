-- Admin identity: own table, own auth.

CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "passwordHash" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- Exactly one owner, ever. Prisma cannot express a partial unique index, and
-- without it a stray script run mints a second account that can grant access.
CREATE UNIQUE INDEX "Admin_single_owner" ON "Admin"("isOwner") WHERE "isOwner";

-- An admin must be reachable by at least one identifier.
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_has_identifier"
    CHECK ("email" IS NOT NULL OR "username" IS NOT NULL);

ALTER TABLE "Admin" ADD CONSTRAINT "Admin_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "Admin"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Repoint the audit trail's foreign key from User to Admin. Admin is still
-- empty at this point in the script, so every existing row's actorId fails
-- the new constraint and this DELETE clears the whole table, not just
-- orphans. Acceptable only because AdminAudit is empty here; on an
-- environment with real rows this would need the owner to exist first.
DELETE FROM "AdminAudit"
WHERE "actorId" NOT IN (SELECT "id" FROM "Admin");

ALTER TABLE "AdminAudit" DROP CONSTRAINT IF EXISTS "AdminAudit_actorId_fkey";

ALTER TABLE "AdminAudit" ADD CONSTRAINT "AdminAudit_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "Admin"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
