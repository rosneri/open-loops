-- Schedules stop being two columns named after the two things the app happened to do. The
-- expressions people already saved are carried across before the columns go, so nobody's sweep
-- time is reset by this deployment.
CREATE TABLE "ScheduleEntry" (
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleEntry_pkey" PRIMARY KEY ("ownerId","kind")
);

ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ScheduleEntry" ("ownerId", "kind", "cron", "enabled", "updatedAt")
SELECT "userId", 'sweep', "sweepCron", true, NOW() FROM "UserSettings";

INSERT INTO "ScheduleEntry" ("ownerId", "kind", "cron", "enabled", "updatedAt")
SELECT "userId", 'podcast', "podcastCron", "podcastEnabled", NOW() FROM "UserSettings";

ALTER TABLE "UserSettings" DROP COLUMN "sweepCron";
ALTER TABLE "UserSettings" DROP COLUMN "podcastCron";
ALTER TABLE "UserSettings" DROP COLUMN "podcastEnabled";
