-- Clear the seeded placeholder library. These rows were third-party links
-- chosen to make the shelf look populated; nothing here is worth preserving,
-- and emptying the table first is what lets the column be retyped without
-- inventing a mapping from the old free-text values. Guarded on the column's
-- current type so a second execution of this script (e.g. a re-applied
-- migration) is inert instead of silently wiping materials an admin has
-- since filed: once "resourceType" is already "MaterialType", the DELETE is
-- skipped and CREATE TYPE below fails loudly on the duplicate type instead.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'SubjectResource'
               AND column_name = 'resourceType'
               AND udt_name <> 'MaterialType') THEN
    DELETE FROM "SubjectResource";
  END IF;
END $$;

CREATE TYPE "MaterialType" AS ENUM ('PDF', 'IMAGE', 'VIDEO', 'LINK');

ALTER TABLE "SubjectResource"
  ALTER COLUMN "resourceType" TYPE "MaterialType"
  USING "resourceType"::"MaterialType";
