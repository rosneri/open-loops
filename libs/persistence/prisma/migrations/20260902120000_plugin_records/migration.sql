-- A plugin's own rows. The composite primary key is the namespace: one plugin cannot read
-- another's records and no plugin can read another account's, because there is no key that
-- would express the question.
CREATE TABLE "PluginRecord" (
    "ownerId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginRecord_pkey" PRIMARY KEY ("ownerId","pluginId","collection","key")
);

CREATE INDEX "PluginRecord_ownerId_pluginId_collection_idx" ON "PluginRecord"("ownerId", "pluginId", "collection");

ALTER TABLE "PluginRecord" ADD CONSTRAINT "PluginRecord_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
