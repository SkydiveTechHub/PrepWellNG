-- Admin identity: own table, own auth.
--
-- Hand-applied through the Supabase SQL Editor, not `prisma migrate` —
-- DIRECT_URL does not resolve from the dev machine and `prisma db execute`
-- fails here. The editor batches the paste in one transaction but a
-- mid-script syntax error still leaves earlier DDL uncertain to the person
-- re-running it, so the CREATE/ALTER statements below use IF NOT EXISTS /
-- DO guards a generated migration wouldn't need, purely so a retry after a
-- partial failure is safe.

CREATE TABLE IF NOT EXISTS "Admin" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "Admin_email_key" ON "Admin" ("email");

CREATE UNIQUE INDEX IF NOT EXISTS "Admin_username_key" ON "Admin" ("username");

-- Exactly one owner, ever. Prisma cannot express a partial unique index, and
-- without it a stray script run mints a second account that can grant access.
-- The explicit `= true` comparison (rather than the bare boolean column) is
-- what pg_dump emits for a partial index predicate; the bare form parses
-- fine in plain Postgres but the SQL editor's parser rejected it.
CREATE UNIQUE INDEX IF NOT EXISTS "Admin_single_owner" ON "Admin" ("isOwner") WHERE ("isOwner" = true);

-- An admin must be reachable by at least one identifier, and self-created
-- admins chain back through createdById. Guarded so re-running this block
-- after a partial failure doesn't error on constraints that already exist.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Admin_has_identifier') THEN
    ALTER TABLE "Admin" ADD CONSTRAINT "Admin_has_identifier"
      CHECK ("email" IS NOT NULL OR "username" IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Admin_createdById_fkey') THEN
    ALTER TABLE "Admin" ADD CONSTRAINT "Admin_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "Admin"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Repoint the audit trail's foreign key from User to Admin. Admin is still
-- empty at this point in the script, so every existing row's actorId fails
-- the new constraint and this DELETE clears the whole table, not just
-- orphans. Acceptable only because AdminAudit is empty here; on an
-- environment with real rows this would need the owner to exist first.
DELETE FROM "AdminAudit" WHERE "actorId" NOT IN (SELECT "id" FROM "Admin");

ALTER TABLE "AdminAudit" DROP CONSTRAINT IF EXISTS "AdminAudit_actorId_fkey";

ALTER TABLE "AdminAudit" ADD CONSTRAINT "AdminAudit_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "Admin"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
