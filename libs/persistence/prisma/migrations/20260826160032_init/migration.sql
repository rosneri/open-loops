-- CreateTable
CREATE TABLE "OpenLoop" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "threadRef" TEXT,
    "url" TEXT,
    "channel" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "counterpartyName" TEXT,
    "counterpartyHandle" TEXT,
    "counterpartyEmail" TEXT,
    "counterpartyImportance" TEXT,
    "dueAt" TIMESTAMP(3),
    "promisedFor" TIMESTAMP(3),
    "estimateMinutes" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "manualState" TEXT,
    "manualReason" TEXT,
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),

    CONSTRAINT "OpenLoop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Criterion" (
    "id" TEXT NOT NULL,
    "loopId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "probe" JSONB NOT NULL,

    CONSTRAINT "Criterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceRecord" (
    "id" TEXT NOT NULL,
    "loopId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "url" TEXT,

    CONSTRAINT "EvidenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlan" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "dayStartAt" TIMESTAMP(3) NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "manualOrder" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanBlock" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "loopId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "position" INTEGER NOT NULL,
    "disposition" TEXT NOT NULL,
    "slipCount" INTEGER NOT NULL DEFAULT 0,
    "pinned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlanBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "accountLabel" TEXT,
    "externalAccountRef" TEXT,
    "scopes" TEXT[],
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "connectedAt" TIMESTAMP(3),

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "provider" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "RawSignal" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" JSONB NOT NULL,
    "participants" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "threadRef" TEXT,
    "url" TEXT,
    "channel" TEXT,
    "isDirectedAtMe" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "RawSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoopEventLog" (
    "id" TEXT NOT NULL,
    "loopId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "LoopEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbeTask" (
    "id" TEXT NOT NULL,
    "loopId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "probe" JSONB NOT NULL,
    "describedAs" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "verdict" TEXT,
    "summary" TEXT,
    "url" TEXT,

    CONSTRAINT "ProbeTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpenLoop_sourceKey_key" ON "OpenLoop"("sourceKey");

-- CreateIndex
CREATE INDEX "OpenLoop_updatedAt_idx" ON "OpenLoop"("updatedAt");

-- CreateIndex
CREATE INDEX "OpenLoop_provider_idx" ON "OpenLoop"("provider");

-- CreateIndex
CREATE INDEX "Criterion_loopId_idx" ON "Criterion"("loopId");

-- CreateIndex
CREATE INDEX "EvidenceRecord_loopId_observedAt_idx" ON "EvidenceRecord"("loopId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlan_day_key" ON "DailyPlan"("day");

-- CreateIndex
CREATE INDEX "PlanBlock_planId_startAt_idx" ON "PlanBlock"("planId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlanBlock_planId_loopId_key" ON "PlanBlock"("planId", "loopId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_provider_key" ON "Integration"("provider");

-- CreateIndex
CREATE INDEX "RawSignal_processedAt_occurredAt_idx" ON "RawSignal"("processedAt", "occurredAt");

-- CreateIndex
CREATE INDEX "RawSignal_kind_occurredAt_idx" ON "RawSignal"("kind", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "RawSignal_provider_externalId_key" ON "RawSignal"("provider", "externalId");

-- CreateIndex
CREATE INDEX "LoopEventLog_loopId_at_idx" ON "LoopEventLog"("loopId", "at");

-- CreateIndex
CREATE INDEX "ProbeTask_criterionId_answeredAt_idx" ON "ProbeTask"("criterionId", "answeredAt");

-- CreateIndex
CREATE INDEX "ProbeTask_answeredAt_consumedAt_idx" ON "ProbeTask"("answeredAt", "consumedAt");

-- AddForeignKey
ALTER TABLE "Criterion" ADD CONSTRAINT "Criterion_loopId_fkey" FOREIGN KEY ("loopId") REFERENCES "OpenLoop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_loopId_fkey" FOREIGN KEY ("loopId") REFERENCES "OpenLoop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanBlock" ADD CONSTRAINT "PlanBlock_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DailyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanBlock" ADD CONSTRAINT "PlanBlock_loopId_fkey" FOREIGN KEY ("loopId") REFERENCES "OpenLoop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoopEventLog" ADD CONSTRAINT "LoopEventLog_loopId_fkey" FOREIGN KEY ("loopId") REFERENCES "OpenLoop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
