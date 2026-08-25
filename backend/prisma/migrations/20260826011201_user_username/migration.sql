-- Replace users.email with users.username as the login identifier.
-- Hand-written (not `prisma migrate dev`) because renaming a NOT NULL UNIQUE
-- column on a populated table needs a backfill step Prisma can't infer —
-- same reasoning as the trgm-index migration's hand-edit.
ALTER TABLE "users" ADD COLUMN "username" TEXT;

-- Backfill from the existing seeded admin's email local-part.
UPDATE "users" SET "username" = split_part("email", '@', 1);

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

ALTER TABLE "users" DROP COLUMN "email";
