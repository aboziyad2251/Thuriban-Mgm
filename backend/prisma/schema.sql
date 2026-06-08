-- ============================================================
--  Enterprise Management System — PostgreSQL DDL
--  3-Tier RBAC: ADMIN > MANAGER > EMPLOYEE
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE "Tier" AS ENUM ('ADMIN', 'MANAGER', 'EMPLOYEE');

-- ── CompanyProfile (top-level tenant) ────────────────────────
CREATE TABLE "CompanyProfile" (
    "id"           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name"         TEXT NOT NULL,
    "logoUrl"      TEXT,
    "mission"      TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address"      TEXT,
    "website"      TEXT,
    "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Department (circular FK resolved via ALTER below) ─────────
CREATE TABLE "Department" (
    "id"        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name"      TEXT NOT NULL,
    "companyId" UUID NOT NULL REFERENCES "CompanyProfile"("id") ON DELETE CASCADE,
    "managerId" UUID UNIQUE,    -- FK to User added below (circular)
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "uq_department_name_company" UNIQUE ("name", "companyId")
);
CREATE INDEX "idx_department_companyId" ON "Department"("companyId");

-- ── User ─────────────────────────────────────────────────────
CREATE TABLE "User" (
    "id"           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "email"        TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "tier"         "Tier" NOT NULL,
    "departmentId" UUID REFERENCES "Department"("id") ON DELETE CASCADE,
    "companyId"    UUID NOT NULL REFERENCES "CompanyProfile"("id") ON DELETE CASCADE,
    "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- MANAGER and EMPLOYEE must belong to a department; ADMIN may not
    CONSTRAINT "chk_user_department" CHECK (
        ("tier" IN ('MANAGER', 'EMPLOYEE') AND "departmentId" IS NOT NULL)
        OR ("tier" = 'ADMIN')
    )
);
CREATE INDEX "idx_user_companyId"      ON "User"("companyId");
CREATE INDEX "idx_user_departmentId"   ON "User"("departmentId");
CREATE INDEX "idx_user_companyId_tier" ON "User"("companyId", "tier");

-- Resolve circular FK: Department.managerId → User
ALTER TABLE "Department"
    ADD CONSTRAINT "fk_department_manager"
        FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL;

-- ── Permission ───────────────────────────────────────────────
CREATE TABLE "Permission" (
    "id"          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name"        TEXT NOT NULL UNIQUE,
    "description" TEXT
);

-- ── RolePermission ───────────────────────────────────────────
CREATE TABLE "RolePermission" (
    "roleId"       "Tier" NOT NULL,
    "permissionId" UUID NOT NULL REFERENCES "Permission"("id") ON DELETE CASCADE,
    PRIMARY KEY ("roleId", "permissionId")
);
CREATE INDEX "idx_rolepermission_permissionId" ON "RolePermission"("permissionId");

-- ── AuditLog ─────────────────────────────────────────────────
CREATE TABLE "AuditLog" (
    "id"         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId"     UUID REFERENCES "User"("id") ON DELETE SET NULL,
    "action"     TEXT NOT NULL,
    "resource"   TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata"   JSONB DEFAULT '{}'::jsonb,
    "ipAddress"  TEXT,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "idx_auditlog_userId_createdAt"  ON "AuditLog"("userId", "createdAt");
CREATE INDEX "idx_auditlog_resource_resourceId" ON "AuditLog"("resource", "resourceId");
CREATE INDEX "idx_auditlog_createdAt"          ON "AuditLog"("createdAt");

-- ── Seed: default permissions ────────────────────────────────
INSERT INTO "Permission" ("name", "description") VALUES
  ('*',                   'Wildcard – all operations'),
  ('users:read',          'Read any user'),
  ('users:create',        'Create users'),
  ('users:update',        'Update any user'),
  ('users:delete',        'Delete users'),
  ('users:read:self',     'Read own user record'),
  ('departments:read',    'Read department data'),
  ('departments:update',  'Update department data'),
  ('tasks:*',             'All task operations'),
  ('tasks:read',          'Read tasks'),
  ('tasks:update:self',   'Update own tasks'),
  ('company:read',        'Read company profile'),
  ('company:update',      'Update company profile');
