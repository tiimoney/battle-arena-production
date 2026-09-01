-- AlterTable: add nullable first so existing rows can be backfilled
ALTER TABLE "User" ADD COLUMN "displayNameNormalized" TEXT;

-- Backfill existing rows: trim + collapse whitespace + lowercase, matching the app
-- layer's normalizeName()
UPDATE "User" SET "displayNameNormalized" = lower(regexp_replace(trim("displayName"), '\s+', ' ', 'g'));

-- Now that every row has a value, enforce NOT NULL + UNIQUE
ALTER TABLE "User" ALTER COLUMN "displayNameNormalized" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_displayNameNormalized_key" ON "User"("displayNameNormalized");
