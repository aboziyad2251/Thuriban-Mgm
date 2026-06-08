-- ============================================================
--  Migration 002 — Employee Lifecycle Management additions
--  Additive only — no destructive changes to existing tables
-- ============================================================

-- New enum for offboard type
CREATE TYPE "OffboardType" AS ENUM ('FIRED', 'RESIGNED');

-- ELM columns on User
ALTER TABLE "User"
  ADD COLUMN "isActive"          BOOLEAN      NOT NULL DEFAULT TRUE,
  ADD COLUMN "tokenVersion"      INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "terminationDate"   TIMESTAMPTZ,
  ADD COLUMN "terminationReason" TEXT,
  ADD COLUMN "offboardType"      "OffboardType",
  ADD COLUMN "terminatedById"    UUID REFERENCES "User"("id") ON DELETE SET NULL;

-- New indexes for common ELM query patterns
CREATE INDEX "idx_user_companyId_isActive"  ON "User"("companyId", "isActive");
CREATE INDEX "idx_user_email_isActive"       ON "User"("email", "isActive");

-- CHECK constraint: inactive users must have a terminationDate
ALTER TABLE "User"
  ADD CONSTRAINT "chk_user_termination_date"
    CHECK (
      ("isActive" = TRUE  AND "terminationDate" IS NULL)
      OR
      ("isActive" = FALSE AND "terminationDate" IS NOT NULL)
    );
