-- =============================================================================
-- CLASPTEK RECORDING PIPELINE: RECONCILIATION ROTATION CURSOR MIGRATION
-- MIGRATION: 20261011_meeting_recording_reconciliation_cursor.sql
-- Description: Authoritative relational model for durable, concurrency-safe candidate
--              category rotation in the scheduled LiveKit recording reconciliation cron.
-- Status: PROPOSED (UNAPPLIED). Required for staging and production rollout.
-- =============================================================================

-- 1. Pre-validation: Detect Incompatible Pre-existing Table
-- Guarantees that if a table with this name already exists from an earlier prototype,
-- it must have compatible columns and a primary key on id, instead of silently passing.
DO $$
DECLARE
    v_missing_cols TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_tables
        WHERE schemaname = 'public' AND tablename = 'meeting_recording_reconciliation_cursor'
    ) THEN
        -- Check if existing table has required columns and compatible types
        SELECT string_agg(col, ', ')
        INTO v_missing_cols
        FROM (
            SELECT 'id (VARCHAR/TEXT)' AS col
            WHERE NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'meeting_recording_reconciliation_cursor'
                  AND column_name = 'id'
                  AND data_type IN ('character varying', 'text')
            )
            UNION ALL
            SELECT 'category_offset (INT)' AS col
            WHERE NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'meeting_recording_reconciliation_cursor'
                  AND column_name = 'category_offset'
                  AND data_type IN ('integer', 'smallint', 'bigint')
            )
            UNION ALL
            SELECT 'advanced_by' AS col
            WHERE NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'meeting_recording_reconciliation_cursor'
                  AND column_name = 'advanced_by'
            )
        ) missing;

        IF v_missing_cols IS NOT NULL AND v_missing_cols <> '' THEN
            RAISE EXCEPTION 'Pre-existing table public.meeting_recording_reconciliation_cursor is missing required columns or types: %. Aborting migration to prevent silent schema incompatibility.', v_missing_cols;
        END IF;

        -- Verify primary key constraint on (id)
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name
             AND tc.table_schema = ccu.table_schema
            WHERE tc.table_schema = 'public'
              AND tc.table_name = 'meeting_recording_reconciliation_cursor'
              AND tc.constraint_type = 'PRIMARY KEY'
              AND ccu.column_name = 'id'
        ) THEN
            RAISE EXCEPTION 'Pre-existing table public.meeting_recording_reconciliation_cursor lacks PRIMARY KEY constraint on (id). Aborting.';
        END IF;
    END IF;
END $$;

-- 2. Dedicated Durable Reconciliation Cursor Table
-- Stores the authoritative category starting offset across cron invocations.
-- Guaranteed single-row design via fixed primary key 'global_cursor'.
CREATE TABLE IF NOT EXISTS public.meeting_recording_reconciliation_cursor (
    id VARCHAR(32) PRIMARY KEY,
    category_offset INT NOT NULL DEFAULT 0,
    last_advanced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    advanced_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure category_offset constraint (0 <= category_offset <= 2)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_reconciliation_cursor_category_offset'
    ) THEN
        ALTER TABLE public.meeting_recording_reconciliation_cursor
        ADD CONSTRAINT chk_reconciliation_cursor_category_offset
        CHECK (category_offset IN (0, 1, 2));
    END IF;
END $$;

-- 3. Idempotent Singleton Cursor Initialization
-- Initializes the global cursor row if absent. Preserves existing offset if already initialized.
INSERT INTO public.meeting_recording_reconciliation_cursor (
    id,
    category_offset,
    last_advanced_at,
    advanced_by,
    created_at,
    updated_at
)
VALUES (
    'global_cursor',
    0,
    NOW(),
    'migration_bootstrap',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 4. Row Level Security Policies
-- Strictly service_role only. No access for authenticated, anon, or public.
ALTER TABLE public.meeting_recording_reconciliation_cursor ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.meeting_recording_reconciliation_cursor FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.meeting_recording_reconciliation_cursor TO service_role;

-- 5. Stored Database Function: Atomic Category Offset Advancement
-- Atomically reads the current category offset and advances it modulo 3:
-- Rotation sequence: 0 (STALE_PROCESSING) -> 1 (UNRESOLVED_START_INTENT) -> 2 (PENDING_PERMISSION_REVOCATION) -> 0 ...
-- First-call offset returns 0, and records initial state.
-- Subsequent calls atomically update and return the next offset.
-- Uses row-level lock (FOR UPDATE / ON CONFLICT) to serialize concurrent workers.
CREATE OR REPLACE FUNCTION public.advance_recording_reconciliation_cursor(
    p_worker_id VARCHAR(128) DEFAULT 'system_reconciliation_worker'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row RECORD;
    v_current_offset INT;
    v_next_offset INT;
    v_now TIMESTAMPTZ := NOW();
    v_worker_id VARCHAR(128);
BEGIN
    -- Validate and safely sanitize worker identifier
    v_worker_id := SUBSTRING(COALESCE(NULLIF(TRIM(p_worker_id), ''), 'system_reconciliation_worker'), 1, 128);

    -- Ensure row exists (default offset 0 for first call)
    INSERT INTO public.meeting_recording_reconciliation_cursor (
        id,
        category_offset,
        last_advanced_at,
        advanced_by,
        created_at,
        updated_at
    )
    VALUES (
        'global_cursor',
        0,
        v_now,
        v_worker_id,
        v_now,
        v_now
    )
    ON CONFLICT (id) DO NOTHING;

    -- Lock and advance offset atomically
    SELECT * INTO v_row
    FROM public.meeting_recording_reconciliation_cursor
    WHERE id = 'global_cursor'
    FOR UPDATE;

    v_current_offset := v_row.category_offset;
    v_next_offset := (v_current_offset + 1) % 3;

    UPDATE public.meeting_recording_reconciliation_cursor
    SET
        category_offset = v_next_offset,
        last_advanced_at = v_now,
        advanced_by = v_worker_id,
        updated_at = v_now
    WHERE id = 'global_cursor';

    RETURN jsonb_build_object(
        'success', true,
        'allocatedOffset', v_current_offset,
        'nextOffset', v_next_offset,
        'workerId', v_worker_id,
        'advancedAt', v_now
    );
END;
$$;

-- Restrict RPC execution to service_role only
REVOKE ALL ON FUNCTION public.advance_recording_reconciliation_cursor(VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_recording_reconciliation_cursor(VARCHAR) TO service_role;
