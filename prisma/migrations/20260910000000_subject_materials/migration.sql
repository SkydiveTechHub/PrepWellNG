-- Clear the seeded placeholder library. These rows were third-party links
-- chosen to make the shelf look populated; nothing here is worth preserving,
-- and emptying the table first is what lets the column be retyped without
-- inventing a mapping from the old free-text values.
DELETE FROM "SubjectResource";

CREATE TYPE "MaterialType" AS ENUM ('PDF', 'IMAGE', 'VIDEO', 'LINK');

ALTER TABLE "SubjectResource"
  ALTER COLUMN "resourceType" TYPE "MaterialType"
  USING "resourceType"::"MaterialType";
