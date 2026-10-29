-- =============================================================================
-- CLASPTEK ENTERPRISE PLATFORM — GOOGLE DRIVE CONNECTION CONSTRAINT FORWARD MIGRATION
-- MIGRATION: 20261029_fix_google_drive_connection_constraint.sql
-- Description: Additive forward migration to replace the unconditional
--              (tenant_id, user_id) unique constraint with a composite
--              (tenant_id, user_id, connection_type) unique constraint.
--
-- Target Invariants:
-- 1. A tenant may have multiple personal Google Drive connections for different users.
-- 2. A single user may have both a USER_PERSONAL connection and a TENANT_CENTRAL
--    connection within the same tenant simultaneously.
-- 3. Each (tenant_id, user_id, connection_type) triplet must be unique.
-- 4. At most one TENANT_CENTRAL connection may exist per tenant, enforced by
--    the existing partial unique index:
--    uq_tenant_central_gdrive ON (tenant_id) WHERE connection_type = 'TENANT_CENTRAL'.
-- 5. Personal connection operations remain scoped to connection_type = 'USER_PERSONAL'.
-- 6. Tenant-central connection operations remain tenant-scoped.
-- 7. All existing tokens, folder metadata, connection statuses, timestamps,
--    RLS policies, grants, and service-role access are strictly preserved.
-- 8. Non-destructive: if duplicate rows exist that would violate the new
--    constraint, the migration aborts with a diagnostic error and deletes zero rows.
-- 9. Idempotent: safe to execute multiple times without error.
-- =============================================================================

DO $$
BEGIN
    -- -------------------------------------------------------------------------
    -- Step 1: Pre-flight Verification
    -- -------------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'google_drive_connections'
    ) THEN
        RAISE EXCEPTION 'Prerequisite table public.google_drive_connections does not exist. Apply 20260917_google_drive_oauth.sql first.';
    END IF;

    -- Ensure column connection_type exists (from 20260917_google_drive_central_repository.sql)
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'google_drive_connections'
          AND column_name = 'connection_type'
    ) THEN
        ALTER TABLE public.google_drive_connections
        ADD COLUMN connection_type TEXT NOT NULL DEFAULT 'USER_PERSONAL'
        CHECK (connection_type IN ('TENANT_CENTRAL', 'USER_PERSONAL'));
    END IF;

    -- Ensure partial unique index for central repository exists
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'google_drive_connections'
          AND indexname = 'uq_tenant_central_gdrive'
    ) THEN
        CREATE UNIQUE INDEX uq_tenant_central_gdrive
        ON public.google_drive_connections (tenant_id)
        WHERE connection_type = 'TENANT_CENTRAL';
    END IF;

    -- -------------------------------------------------------------------------
    -- Step 2: Data Integrity & Invariant Validation (Fail-Safe Pre-Checks)
    -- -------------------------------------------------------------------------

    -- Check A: Disallow duplicate (tenant_id, user_id, connection_type) triplets
    IF EXISTS (
        SELECT tenant_id, user_id, connection_type, COUNT(*)
        FROM public.google_drive_connections
        GROUP BY tenant_id, user_id, connection_type
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot apply uq_google_drive_tenant_user_type: duplicate (tenant_id, user_id, connection_type) rows detected in public.google_drive_connections. Manual reconciliation required; zero rows were modified.';
    END IF;

    -- Check B: Disallow multiple TENANT_CENTRAL connections per tenant
    IF EXISTS (
        SELECT tenant_id, COUNT(*)
        FROM public.google_drive_connections
        WHERE connection_type = 'TENANT_CENTRAL'
        GROUP BY tenant_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot apply migration: multiple TENANT_CENTRAL connections detected for a single tenant in public.google_drive_connections. Manual reconciliation required; zero rows were modified.';
    END IF;

    -- -------------------------------------------------------------------------
    -- Step 3: Transition Constraints Idempotently
    -- -------------------------------------------------------------------------

    -- Drop legacy unconditional (tenant_id, user_id) constraint if present
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_google_drive_tenant_user'
          AND conrelid = 'public.google_drive_connections'::regclass
    ) THEN
        ALTER TABLE public.google_drive_connections
        DROP CONSTRAINT uq_google_drive_tenant_user;
    END IF;

    -- Add replacement composite (tenant_id, user_id, connection_type) constraint
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_google_drive_tenant_user_type'
          AND conrelid = 'public.google_drive_connections'::regclass
    ) THEN
        ALTER TABLE public.google_drive_connections
        ADD CONSTRAINT uq_google_drive_tenant_user_type
        UNIQUE (tenant_id, user_id, connection_type);
    END IF;

    -- Ensure lookup index exists for tenant, connection_type, and status
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'google_drive_connections'
          AND indexname = 'idx_gdrive_connections_lookup'
    ) THEN
        CREATE INDEX idx_gdrive_connections_lookup
        ON public.google_drive_connections (tenant_id, connection_type, status);
    END IF;

END $$;

-- -----------------------------------------------------------------------------
-- Step 4: PostgREST Schema Cache Refresh
-- Notify PostgREST to reload its schema cache so that upsert requests targeting
-- ?on_conflict=tenant_id,user_id,connection_type are recognized immediately.
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
