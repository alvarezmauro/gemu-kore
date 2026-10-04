-- CreateEnum
CREATE TYPE "AccessRole" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "access_grant" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "email" TEXT NOT NULL,
    "role" "AccessRole" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_grant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "access_grant_email_normalized" CHECK ("email" <> '' AND "email" = lower(btrim("email")))
);

-- CreateIndex
CREATE UNIQUE INDEX "access_grant_email_key" ON "access_grant"("email");
