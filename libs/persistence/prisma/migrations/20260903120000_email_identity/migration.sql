-- The login has always been an email address in practice — every account this app has was
-- created with one, and the column called it a username only because the first screen did.
-- Renamed rather than added beside: two columns would need one of them to be the real one, and
-- a second copy of an identity is a second thing that can disagree.
--
-- A rename keeps every row, every session and every foreign key exactly as they are: nothing is
-- rewritten, so an account whose value is not a well-formed address still signs in with it. New
-- accounts are validated as addresses on the way in, which is where that rule belongs.
ALTER TABLE "User" RENAME COLUMN "username" TO "email";
ALTER INDEX "User_username_key" RENAME TO "User_email_key";
