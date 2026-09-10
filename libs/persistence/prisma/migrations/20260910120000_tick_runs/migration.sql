-- One sweep, kept so a person can ask what happened rather than guess.
CREATE TABLE "TickRun" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "report" JSONB NOT NULL,
    "failed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TickRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TickRun_ownerId_startedAt_idx" ON "TickRun"("ownerId", "startedAt");

ALTER TABLE "TickRun" ADD CONSTRAINT "TickRun_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
