-- ============================================================
--  Migration 003 — Department & Org Hierarchy
--  Additive only — no destructive changes
-- ============================================================

-- ── Department additions ──────────────────────────────────────
ALTER TABLE "Department"
  ADD COLUMN IF NOT EXISTS "parentId"    UUID,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "headCount"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "level"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "path"        TEXT,
  ADD COLUMN IF NOT EXISTS "position"    INTEGER NOT NULL DEFAULT 0;

-- Self-referencing FK: parentId → Department
ALTER TABLE "Department"
  ADD CONSTRAINT "fk_department_parentId"
    FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL;

-- Cannot be own parent
ALTER TABLE "Department"
  ADD CONSTRAINT "chk_department_no_self_parent"
    CHECK ("parentId" IS NULL OR "parentId" <> "id");

-- Unique name per parent scope within company
ALTER TABLE "Department"
  DROP CONSTRAINT IF EXISTS "uq_department_name_company";
ALTER TABLE "Department"
  ADD CONSTRAINT "uq_department_name_parent"
    UNIQUE ("name", "companyId", "parentId");

-- ── User additions ────────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "jobTitle"    TEXT,
  ADD COLUMN IF NOT EXISTS "reportsToId" UUID;

ALTER TABLE "User"
  ADD CONSTRAINT "fk_user_reportsToId"
    FOREIGN KEY ("reportsToId") REFERENCES "User"("id") ON DELETE SET NULL;

ALTER TABLE "User"
  ADD CONSTRAINT "chk_user_no_self_report"
    CHECK ("reportsToId" IS NULL OR "reportsToId" <> "id");

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_department_parentId"
  ON "Department"("parentId");

CREATE INDEX IF NOT EXISTS "idx_department_companyId_level"
  ON "Department"("companyId", "level");

-- Prefix index for path LIKE 'prefix%' subtree queries
CREATE INDEX IF NOT EXISTS "idx_department_path"
  ON "Department"("path" text_pattern_ops);

CREATE INDEX IF NOT EXISTS "idx_user_reportsToId"
  ON "User"("reportsToId");

-- ── Trigger: auto-compute level + path on Department upsert ───
CREATE OR REPLACE FUNCTION fn_department_set_level_path()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_level INT;
  v_parent_path  TEXT;
  v_slug         TEXT;
BEGIN
  -- Slugify name: lowercase, replace non-alphanumeric with '-', trim edges
  v_slug := trim('-' FROM lower(regexp_replace(NEW.name, '[^a-z0-9]+', '-', 'g')));
  IF v_slug = '' THEN v_slug := 'dept'; END IF;

  IF NEW."parentId" IS NULL THEN
    NEW."level" := 0;
    NEW."path"  := '/' || v_slug;
  ELSE
    SELECT "level", "path"
      INTO v_parent_level, v_parent_path
      FROM "Department"
      WHERE id = NEW."parentId";

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent department % not found', NEW."parentId";
    END IF;

    NEW."level" := v_parent_level + 1;
    NEW."path"  := v_parent_path || '/' || v_slug;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_department_set_level_path ON "Department";
CREATE TRIGGER trg_department_set_level_path
  BEFORE INSERT OR UPDATE OF "parentId", "name"
  ON "Department"
  FOR EACH ROW
  EXECUTE FUNCTION fn_department_set_level_path();

-- ── Trigger: maintain headCount on Department ─────────────────
CREATE OR REPLACE FUNCTION fn_user_maintain_headcount()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."departmentId" IS NOT NULL THEN
      UPDATE "Department"
        SET "headCount" = "headCount" + 1
        WHERE id = NEW."departmentId";
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD."departmentId" IS DISTINCT FROM NEW."departmentId" THEN
      -- Decrement old
      IF OLD."departmentId" IS NOT NULL THEN
        UPDATE "Department"
          SET "headCount" = GREATEST("headCount" - 1, 0)
          WHERE id = OLD."departmentId";
      END IF;
      -- Increment new
      IF NEW."departmentId" IS NOT NULL THEN
        UPDATE "Department"
          SET "headCount" = "headCount" + 1
          WHERE id = NEW."departmentId";
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD."departmentId" IS NOT NULL THEN
      UPDATE "Department"
        SET "headCount" = GREATEST("headCount" - 1, 0)
        WHERE id = OLD."departmentId";
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_maintain_headcount ON "User";
CREATE TRIGGER trg_user_maintain_headcount
  AFTER INSERT OR UPDATE OF "departmentId" OR DELETE
  ON "User"
  FOR EACH ROW
  EXECUTE FUNCTION fn_user_maintain_headcount();

-- ── Backfill existing departments with level/path ─────────────
-- Process in parent-first order using a recursive CTE
WITH RECURSIVE ordered AS (
  SELECT id, name, "parentId", 0 AS depth
    FROM "Department" WHERE "parentId" IS NULL
  UNION ALL
  SELECT d.id, d.name, d."parentId", o.depth + 1
    FROM "Department" d JOIN ordered o ON d."parentId" = o.id
)
UPDATE "Department" d
  SET "level" = o.depth
  FROM ordered o
  WHERE d.id = o.id;

-- Path update requires iterative pass; trigger handles going forward.
-- Run: UPDATE "Department" SET name=name; to fire trigger on all rows.

-- ── Diagnostic CTE (flat org table, run manually) ─────────────
-- WITH RECURSIVE org AS (
--   SELECT id, name, "parentId", 0 AS depth,
--          name::TEXT AS "ancestorPath"
--     FROM "Department" WHERE "parentId" IS NULL AND "companyId" = $1
--   UNION ALL
--   SELECT d.id, d.name, d."parentId", o.depth + 1,
--          o."ancestorPath" || ' > ' || d.name
--     FROM "Department" d JOIN org o ON d."parentId" = o.id
-- )
-- SELECT * FROM org ORDER BY "ancestorPath";
