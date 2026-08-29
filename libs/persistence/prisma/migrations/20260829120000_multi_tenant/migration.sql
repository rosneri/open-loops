-- Every root table gains an owner. The child tables (Criterion, EvidenceRecord, PlanBlock,
-- LoopEventLog) deliberately do not: they are reachable only through a parent that already has
-- one, and a second copy of the answer could disagree with it.
--
-- Existing rows predate accounts, so they belong to the account that has been using them: the
-- first one created. If there is data but no account at all, this migration stops rather than
-- inventing an owner or deleting the data.
DO $$
DECLARE
  owner_id TEXT;
  orphans  BIGINT;
BEGIN
  SELECT id INTO owner_id FROM "User" ORDER BY "createdAt" ASC LIMIT 1;

  SELECT
    (SELECT count(*) FROM "OpenLoop")
    + (SELECT count(*) FROM "DailyPlan")
    + (SELECT count(*) FROM "Integration")
    + (SELECT count(*) FROM "SyncCursor")
    + (SELECT count(*) FROM "RawSignal")
    + (SELECT count(*) FROM "ProbeTask")
  INTO orphans;

  IF owner_id IS NULL AND orphans > 0 THEN
    RAISE EXCEPTION
      'There are % rows to assign but no account to assign them to. Create one first with: bun run create-user <username>',
      orphans;
  END IF;
END $$;

-- Nullable first, backfilled, then tightened: adding a NOT NULL column to a populated table
-- cannot work in one step.
ALTER TABLE "OpenLoop"       ADD COLUMN "ownerId" TEXT;
ALTER TABLE "DailyPlan"      ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Integration"    ADD COLUMN "ownerId" TEXT;
ALTER TABLE "SyncCursor"     ADD COLUMN "ownerId" TEXT;
ALTER TABLE "RawSignal"      ADD COLUMN "ownerId" TEXT;
ALTER TABLE "ProbeTask"      ADD COLUMN "ownerId" TEXT;
ALTER TABLE "PodcastEpisode" ADD COLUMN "ownerId" TEXT;

UPDATE "OpenLoop"       SET "ownerId" = (SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1);
UPDATE "DailyPlan"      SET "ownerId" = (SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1);
UPDATE "Integration"    SET "ownerId" = (SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1);
UPDATE "SyncCursor"     SET "ownerId" = (SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1);
UPDATE "RawSignal"      SET "ownerId" = (SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1);
UPDATE "ProbeTask"      SET "ownerId" = (SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1);
UPDATE "PodcastEpisode" SET "ownerId" = (SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1);

-- Anything still unowned means the table was empty, so deleting is a no-op that keeps the
-- NOT NULL below from failing on a row nothing can claim.
DELETE FROM "OpenLoop"       WHERE "ownerId" IS NULL;
DELETE FROM "DailyPlan"      WHERE "ownerId" IS NULL;
DELETE FROM "Integration"    WHERE "ownerId" IS NULL;
DELETE FROM "SyncCursor"     WHERE "ownerId" IS NULL;
DELETE FROM "RawSignal"      WHERE "ownerId" IS NULL;
DELETE FROM "ProbeTask"      WHERE "ownerId" IS NULL;
DELETE FROM "PodcastEpisode" WHERE "ownerId" IS NULL;

ALTER TABLE "OpenLoop"       ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "DailyPlan"      ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Integration"    ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "SyncCursor"     ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "RawSignal"      ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "ProbeTask"      ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "PodcastEpisode" ALTER COLUMN "ownerId" SET NOT NULL;

-- Uniqueness was global and is now per owner: two people may each have a loop for the same
-- upstream item, and each needs their own cursor per provider.
DROP INDEX IF EXISTS "OpenLoop_sourceKey_key";
DROP INDEX IF EXISTS "OpenLoop_updatedAt_idx";
DROP INDEX IF EXISTS "OpenLoop_provider_idx";
DROP INDEX IF EXISTS "DailyPlan_day_key";
DROP INDEX IF EXISTS "Integration_provider_key";
DROP INDEX IF EXISTS "RawSignal_provider_externalId_key";
DROP INDEX IF EXISTS "RawSignal_processedAt_occurredAt_idx";
DROP INDEX IF EXISTS "RawSignal_kind_occurredAt_idx";
DROP INDEX IF EXISTS "ProbeTask_criterionId_answeredAt_idx";
DROP INDEX IF EXISTS "ProbeTask_answeredAt_consumedAt_idx";
DROP INDEX IF EXISTS "PodcastEpisode_day_key";
DROP INDEX IF EXISTS "PodcastEpisode_requestedAt_idx";

ALTER TABLE "SyncCursor" DROP CONSTRAINT "SyncCursor_pkey";
ALTER TABLE "SyncCursor" ADD CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("ownerId", "provider");

CREATE UNIQUE INDEX "OpenLoop_ownerId_sourceKey_key" ON "OpenLoop"("ownerId", "sourceKey");
CREATE INDEX "OpenLoop_ownerId_updatedAt_idx" ON "OpenLoop"("ownerId", "updatedAt");
CREATE INDEX "OpenLoop_ownerId_provider_idx" ON "OpenLoop"("ownerId", "provider");
CREATE UNIQUE INDEX "DailyPlan_ownerId_day_key" ON "DailyPlan"("ownerId", "day");
CREATE UNIQUE INDEX "Integration_ownerId_provider_key" ON "Integration"("ownerId", "provider");
CREATE UNIQUE INDEX "RawSignal_ownerId_provider_externalId_key" ON "RawSignal"("ownerId", "provider", "externalId");
CREATE INDEX "RawSignal_ownerId_processedAt_occurredAt_idx" ON "RawSignal"("ownerId", "processedAt", "occurredAt");
CREATE INDEX "RawSignal_ownerId_kind_occurredAt_idx" ON "RawSignal"("ownerId", "kind", "occurredAt");
CREATE INDEX "ProbeTask_ownerId_criterionId_answeredAt_idx" ON "ProbeTask"("ownerId", "criterionId", "answeredAt");
CREATE INDEX "ProbeTask_ownerId_answeredAt_consumedAt_idx" ON "ProbeTask"("ownerId", "answeredAt", "consumedAt");
CREATE UNIQUE INDEX "PodcastEpisode_ownerId_day_key" ON "PodcastEpisode"("ownerId", "day");
CREATE INDEX "PodcastEpisode_ownerId_requestedAt_idx" ON "PodcastEpisode"("ownerId", "requestedAt");

ALTER TABLE "OpenLoop"       ADD CONSTRAINT "OpenLoop_ownerId_fkey"       FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyPlan"      ADD CONSTRAINT "DailyPlan_ownerId_fkey"      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Integration"    ADD CONSTRAINT "Integration_ownerId_fkey"    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncCursor"     ADD CONSTRAINT "SyncCursor_ownerId_fkey"     FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RawSignal"      ADD CONSTRAINT "RawSignal_ownerId_fkey"      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProbeTask"      ADD CONSTRAINT "ProbeTask_ownerId_fkey"      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PodcastEpisode" ADD CONSTRAINT "PodcastEpisode_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Settings become one row per person rather than one row for the deployment. The singleton was
-- never released, so it is replaced outright instead of being migrated.
DROP TABLE IF EXISTS "AppSettings";

CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sweepCron" TEXT NOT NULL,
    "podcastCron" TEXT NOT NULL,
    "podcastEnabled" BOOLEAN NOT NULL DEFAULT false,
    "podcastLength" TEXT NOT NULL DEFAULT 'default',
    "podcastHostVoiceId" TEXT,
    "podcastGuestVoiceId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
