-- Two identical observations of the same criterion at the same instant are the same
-- observation. Collapse any that already exist so the unique index can be created.
DELETE FROM "EvidenceRecord" a
USING "EvidenceRecord" b
WHERE a."criterionId" = b."criterionId"
  AND a."observedAt"  = b."observedAt"
  AND a."verdict"     = b."verdict"
  AND a."id" > b."id";

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceRecord_criterionId_observedAt_verdict_key" ON "EvidenceRecord"("criterionId", "observedAt", "verdict");

