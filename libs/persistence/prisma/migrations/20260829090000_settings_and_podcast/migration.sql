-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "sweepCron" TEXT NOT NULL,
    "podcastCron" TEXT NOT NULL,
    "podcastEnabled" BOOLEAN NOT NULL DEFAULT false,
    "podcastLength" TEXT NOT NULL DEFAULT 'default',
    "podcastHostVoiceId" TEXT,
    "podcastGuestVoiceId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PodcastEpisode" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "audioUrl" TEXT,
    "durationSeconds" INTEGER,
    "externalRef" TEXT,
    "error" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PodcastEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PodcastEpisode_day_key" ON "PodcastEpisode"("day");

-- CreateIndex
CREATE INDEX "PodcastEpisode_requestedAt_idx" ON "PodcastEpisode"("requestedAt");
