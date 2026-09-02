-- The podcast is a plugin now, and a plugin keeps what it knows about itself in its own records
-- rather than in tables of its own. Every episode and every saved preference is carried across
-- before the table and the columns go, so nobody's history or voice choice is lost.

INSERT INTO "PluginRecord" ("ownerId", "pluginId", "collection", "key", "value", "updatedAt")
SELECT
  "ownerId",
  'podcast',
  'episodes',
  "day",
  jsonb_strip_nulls(jsonb_build_object(
    'id', "id",
    'day', "day",
    'status', "status",
    'title', "title",
    'brief', "brief",
    'audioUrl', "audioUrl",
    'durationSeconds', "durationSeconds",
    'externalRef', "externalRef",
    'error', "error",
    'requestedAt', (EXTRACT(EPOCH FROM "requestedAt") * 1000)::bigint,
    'completedAt', (EXTRACT(EPOCH FROM "completedAt") * 1000)::bigint
  )),
  NOW()
FROM "PodcastEpisode"
ON CONFLICT DO NOTHING;

INSERT INTO "PluginRecord" ("ownerId", "pluginId", "collection", "key", "value", "updatedAt")
SELECT
  "userId",
  'podcast',
  '__settings',
  'value',
  jsonb_strip_nulls(jsonb_build_object(
    'length', "podcastLength",
    'hostVoiceId', "podcastHostVoiceId",
    'guestVoiceId', "podcastGuestVoiceId"
  )),
  NOW()
FROM "UserSettings"
ON CONFLICT DO NOTHING;

DROP TABLE "PodcastEpisode";

ALTER TABLE "UserSettings" DROP COLUMN "podcastLength";
ALTER TABLE "UserSettings" DROP COLUMN "podcastHostVoiceId";
ALTER TABLE "UserSettings" DROP COLUMN "podcastGuestVoiceId";
