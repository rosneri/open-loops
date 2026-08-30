-- Composio keys connected accounts to a user id of our choosing, and until now that was one
-- environment variable shared by every account: connecting Slack once connected it for
-- everybody. The identity moves onto the account row here.
--
-- The column is left NULL rather than backfilled. Only the running app knows what
-- OPEN_LOOPS_USER_ID says, and the first account has to claim exactly that value to keep the
-- connections it already made; a migration guessing an id would orphan them. The claim happens
-- on first use, once per account, and the unique index below is what stops two accounts from
-- landing on the same upstream connections.
ALTER TABLE "User" ADD COLUMN "composioUserId" TEXT;
CREATE UNIQUE INDEX "User_composioUserId_key" ON "User"("composioUserId");

-- The handles that make a signal "mine". Also per account for the same reason: one shared list
-- attributes one person's mail to everyone.
ALTER TABLE "User" ADD COLUMN "handles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
