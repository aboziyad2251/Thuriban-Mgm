-- ============================================================
--  Migration 004 — Document Management
--  Additive only — no destructive changes
-- ============================================================

CREATE TYPE "AccessLevel" AS ENUM ('PRIVATE', 'DEPARTMENT', 'GLOBAL');

CREATE TABLE "Document" (
  "id"           UUID          NOT NULL DEFAULT gen_random_uuid(),
  "name"         VARCHAR(255)  NOT NULL,
  "storagePath"  TEXT          NOT NULL,
  "mimeType"     VARCHAR(255)  NOT NULL,
  "sizeBytes"    INTEGER       NOT NULL,
  "accessLevel"  "AccessLevel" NOT NULL DEFAULT 'PRIVATE',
  "companyId"    UUID          NOT NULL,
  "uploadedById" UUID          NOT NULL,
  "departmentId" UUID,
  "tags"         TEXT[]        NOT NULL DEFAULT '{}',
  "createdAt"    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ   NOT NULL DEFAULT now(),

  PRIMARY KEY ("id"),

  CONSTRAINT "Document_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "CompanyProfile" ("id") ON DELETE CASCADE,
  CONSTRAINT "Document_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "Document_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL
);

CREATE TABLE "DocumentShare" (
  "documentId"  UUID        NOT NULL,
  "userId"      UUID        NOT NULL,
  "grantedById" UUID        NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY ("documentId", "userId"),

  CONSTRAINT "DocumentShare_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE,
  CONSTRAINT "DocumentShare_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "DocumentShare_grantedById_fkey"
    FOREIGN KEY ("grantedById") REFERENCES "User" ("id") ON DELETE CASCADE
);

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX "idx_Document_companyId"             ON "Document" ("companyId");
CREATE INDEX "idx_Document_uploadedById"          ON "Document" ("uploadedById");
CREATE INDEX "idx_Document_departmentId"          ON "Document" ("departmentId");
CREATE INDEX "idx_Document_accessLevel"           ON "Document" ("accessLevel");
CREATE INDEX "idx_Document_companyId_accessLevel" ON "Document" ("companyId", "accessLevel");
CREATE INDEX "idx_Document_name_pattern"          ON "Document" ("name" varchar_pattern_ops);

CREATE INDEX "idx_DocumentShare_userId"           ON "DocumentShare" ("userId");
CREATE INDEX "idx_DocumentShare_grantedById"      ON "DocumentShare" ("grantedById");

-- ── Trigger: auto-update updatedAt on Document ────────────────────
CREATE OR REPLACE FUNCTION fn_document_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_document_set_updated_at
  BEFORE UPDATE ON "Document"
  FOR EACH ROW
  EXECUTE FUNCTION fn_document_set_updated_at();
