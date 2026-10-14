-- =============================================================================
-- CLASPTEK RECORDING PIPELINE: RECONCILIATION ROTATION CURSOR MIGRATION
-- MIGRATION: 20261011_meeting_recording_reconciliation_cursor.sql
-- Description: Authoritative relational model for durable, concurrency-safe candidate
--              category rotation in the scheduled LiveKit recording reconciliation cron.
-- Status: PROPOSED (UNAPPLIED). Required for staging and production rollout.
-- =============================================================================

BEGIN;

-- 1. Pre-validation: Detect Incompatible Pre-existing Table
-- Guarantees that if a relation with this name already exists from an earlier prototype,
-- it must be an ordinary table ('r') with compatible columns and a primary key on id, instead of silently passing.
DO $$
DECLARE
    v_missing_cols TEXT;
    v_extra_cols TEXT;
    v_invalid_rows INT;
    v_row_count INT;
    v_non_global_rows INT;
    v_relkind CHAR(1);
BEGIN
    -- Check if ANY relation with this name exists in public schema (table, view, partitioned table, etc.)
    SELECT c.relkind INTO v_relkind
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'meeting_recording_reconciliation_cursor';

    IF v_relkind IS NOT NULL THEN
        -- Strictly require ordinary table ('r'). Reject views ('v'), materialized views ('m'), foreign tables ('f'), partitioned tables ('p'), etc.
        IF v_relkind <> 'r' THEN
            RAISE EXCEPTION 'Relation public.meeting_recording_reconciliation_cursor exists but is not an ordinary table (relkind: %). Aborting to prevent schema corruption.', v_relkind;
        END IF;

        -- Check if existing table has exact required columns, types, lengths, nullability, and defaults
        SELECT string_agg(col, ', ')
        INTO v_missing_cols
        FROM (
            SELECT 'id (VARCHAR(32), NOT NULL)' AS col
            WHERE NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'meeting_recording_reconciliation_cursor'
                  AND column_name = 'id'
                  AND data_type = 'character varying'
                  AND character_maximum_length = 32
                  AND is_nullable = 'NO'
            )
            UNION ALL
            SELECT 'category_offset (INT, NOT NULL, DEFAULT 0)' AS col
            WHERE NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'meeting_recording_reconciliation_cursor'
                  AND column_name = 'category_offset'
                  AND data_type = 'integer'
                  AND is_nullable = 'NO'
                  AND column_default IS NOT NULL
                  AND trim(both '()' from regexp_replace(column_default, '::(integer|int4|int)$', '', 'i')) = '0'
            )
            UNION ALL
            SELECT 'advanced_by (VARCHAR(128), NOT NULL)' AS col
            WHERE NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'meeting_recording_reconciliation_cursor'
                  AND column_name = 'advanced_by'
                  AND data_type = 'character varying'
                  AND character_maximum_length = 128
                  AND is_nullable = 'NO'
            )
            UNION ALL
            SELECT 'last_advanced_at (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())' AS col
            WHERE NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'meeting_recording_reconciliation_cursor'
                  AND column_name = 'last_advanced_at'
                  AND data_type = 'timestamp with time zone'
                  AND is_nullable = 'NO'
                  AND column_default IS NOT NULL
                  AND regexp_replace(lower(trim(column_default)), '^[\s\(]*(now\(\)|current_timestamp)[\s\)]*(::\s*(timestamp with time zone|timestamptz))?[\s\)]*$', '\1') IN ('now()', 'current_timestamp')
            )
            UNION ALL
            SELECT 'created_at (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())' AS col
            WHERE NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'meeting_recording_reconciliation_cursor'
                  AND column_name = 'created_at'
                  AND data_type = 'timestamp with time zone'
                  AND is_nullable = 'NO'
                  AND column_default IS NOT NULL
                  AND regexp_replace(lower(trim(column_default)), '^[\s\(]*(now\(\)|current_timestamp)[\s\)]*(::\s*(timestamp with time zone|timestamptz))?[\s\)]*$', '\1') IN ('now()', 'current_timestamp')
            )
            UNION ALL
            SELECT 'updated_at (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())' AS col
            WHERE NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'meeting_recording_reconciliation_cursor'
                  AND column_name = 'updated_at'
                  AND data_type = 'timestamp with time zone'
                  AND is_nullable = 'NO'
                  AND column_default IS NOT NULL
                  AND regexp_replace(lower(trim(column_default)), '^[\s\(]*(now\(\)|current_timestamp)[\s\)]*(::\s*(timestamp with time zone|timestamptz))?[\s\)]*$', '\1') IN ('now()', 'current_timestamp')
            )
        ) missing;

        IF v_missing_cols IS NOT NULL AND v_missing_cols <> '' THEN
            RAISE EXCEPTION 'Pre-existing table public.meeting_recording_reconciliation_cursor is missing required columns, has incompatible data types/lengths, allows NULLs, or lacks expected defaults: %. Aborting migration.', v_missing_cols;
        END IF;

        -- Enforce exact schema contract: reject unexpected extra columns
        SELECT string_agg(column_name, ', ')
        INTO v_extra_cols
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'meeting_recording_reconciliation_cursor'
          AND column_name NOT IN ('id', 'category_offset', 'last_advanced_at', 'advanced_by', 'created_at', 'updated_at');

        IF v_extra_cols IS NOT NULL AND v_extra_cols <> '' THEN
            RAISE EXCEPTION 'Pre-existing table public.meeting_recording_reconciliation_cursor contains unexpected extra columns: %. Exact schema contract required. Aborting.', v_extra_cols;
        END IF;

        -- Verify relation-scoped primary key whose ordered column list consists exclusively of (id)
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE n.nspname = 'public'
              AND t.relname = 'meeting_recording_reconciliation_cursor'
              AND c.contype = 'p'
              AND (
                  SELECT array_agg(a.attname ORDER BY u.ord)
                  FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
              ) = ARRAY['id']::name[]
        ) THEN
            RAISE EXCEPTION 'Pre-existing table public.meeting_recording_reconciliation_cursor lacks a valid PRIMARY KEY whose ordered column list is strictly (id). Aborting.';
        END IF;

        -- Verify pre-existing data consistency safely after columns and types are confirmed
        SELECT COUNT(*) INTO v_invalid_rows
        FROM public.meeting_recording_reconciliation_cursor
        WHERE category_offset IS NULL
           OR category_offset NOT IN (0, 1, 2)
           OR id IS NULL
           OR advanced_by IS NULL
           OR last_advanced_at IS NULL
           OR created_at IS NULL
           OR updated_at IS NULL;

        IF v_invalid_rows > 0 THEN
            RAISE EXCEPTION 'Pre-existing table public.meeting_recording_reconciliation_cursor contains % rows with NULL values or invalid category_offset. Aborting.', v_invalid_rows;
        END IF;

        -- Enforce singleton row invariant on pre-existing table: at most one row, strictly with id = 'global_cursor'
        SELECT COUNT(*) INTO v_row_count
        FROM public.meeting_recording_reconciliation_cursor;

        IF v_row_count > 1 THEN
            RAISE EXCEPTION 'Pre-existing table public.meeting_recording_reconciliation_cursor contains % rows. Singleton contract requires at most one row. Aborting.', v_row_count;
        END IF;

        IF v_row_count = 1 THEN
            SELECT COUNT(*) INTO v_non_global_rows
            FROM public.meeting_recording_reconciliation_cursor
            WHERE id <> 'global_cursor';

            IF v_non_global_rows > 0 THEN
                RAISE EXCEPTION 'Pre-existing table public.meeting_recording_reconciliation_cursor contains unexpected row ID (expected strictly global_cursor). Aborting.';
            END IF;
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
DECLARE
    v_existing_def TEXT;
    v_existing_validated BOOLEAN;
    v_norm_def TEXT;
    v_is_valid_semantics BOOLEAN := FALSE;
    v_violating_rows INT;
BEGIN
    -- Ensure constraint does not collide with a same-named constraint on another relation
    IF EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE c.conname = 'chk_reconciliation_cursor_category_offset'
          AND (n.nspname <> 'public' OR t.relname <> 'meeting_recording_reconciliation_cursor')
    ) THEN
        RAISE EXCEPTION 'Constraint chk_reconciliation_cursor_category_offset exists on another relation. Aborting to prevent conflict.';
    END IF;

    -- Query relation-scoped constraint definition, validation status, and column scope
    SELECT pg_get_constraintdef(c.oid), c.convalidated
    INTO v_existing_def, v_existing_validated
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'meeting_recording_reconciliation_cursor'
      AND c.conname = 'chk_reconciliation_cursor_category_offset'
      AND c.contype = 'c'
      AND (
          SELECT array_agg(a.attname ORDER BY u.ord)
          FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
      ) = ARRAY['category_offset']::name[];

    IF v_existing_def IS NULL THEN
        -- If constraint with this name exists on table with wrong column scope or wrong contype, reject
        IF EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE n.nspname = 'public'
              AND t.relname = 'meeting_recording_reconciliation_cursor'
              AND c.conname = 'chk_reconciliation_cursor_category_offset'
        ) THEN
            RAISE EXCEPTION 'Constraint chk_reconciliation_cursor_category_offset on target relation is not scoped strictly to column (category_offset) or is not a CHECK constraint. Aborting.';
        END IF;

        ALTER TABLE public.meeting_recording_reconciliation_cursor
        ADD CONSTRAINT chk_reconciliation_cursor_category_offset
        CHECK (category_offset IN (0, 1, 2));
    ELSE
        -- Ensure pre-existing constraint is validated (enforced)
        IF v_existing_validated IS NOT TRUE THEN
            RAISE EXCEPTION 'Pre-existing constraint chk_reconciliation_cursor_category_offset is marked NOT VALID (convalidated = false). Aborting.';
        END IF;

        -- Ensure existing rows satisfy the invariant
        SELECT COUNT(*) INTO v_violating_rows
        FROM public.meeting_recording_reconciliation_cursor
        WHERE category_offset IS NULL OR category_offset NOT IN (0, 1, 2);

        IF v_violating_rows > 0 THEN
            RAISE EXCEPTION 'Pre-existing table public.meeting_recording_reconciliation_cursor contains % rows violating category_offset IN (0, 1, 2). Aborting.', v_violating_rows;
        END IF;

        -- Validate intended check semantics: restricts category_offset strictly to integer set (0, 1, 2)
        v_norm_def := lower(regexp_replace(v_existing_def, '\s+', '', 'g'));
        v_is_valid_semantics := (
            v_norm_def IN (
                'check((category_offset=any(array[0,1,2])))',
                'check(category_offset=any(array[0,1,2]))',
                'check(category_offsetin(0,1,2))',
                'check((category_offsetin(0,1,2)))',
                'check(((category_offset=0)or(category_offset=1)or(category_offset=2)))',
                'check((category_offset=0)or(category_offset=1)or(category_offset=2))',
                'check((category_offset=0)or((category_offset=1)or(category_offset=2)))'
            )
        );

        IF NOT v_is_valid_semantics THEN
            RAISE EXCEPTION 'Pre-existing constraint chk_reconciliation_cursor_category_offset on meeting_recording_reconciliation_cursor has definition "%" which cannot be verified as equivalent to (category_offset IN (0, 1, 2)). Conservative fail-closed rejection applied. Aborting.', v_existing_def;
        END IF;
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

-- Ensure no conflicting overloads or incompatible pre-existing routines of advance_recording_reconciliation_cursor exist
DO $$
DECLARE
    v_fn_record RECORD;
    v_count INT := 0;
BEGIN
    FOR v_fn_record IN (
        SELECT
            p.oid,
            p.proname,
            p.pronargs,
            p.proargtypes,
            p.prorettype,
            p.prokind,
            pg_get_function_identity_arguments(p.oid) AS identity_args,
            pg_get_function_result(p.oid) AS result_type
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'advance_recording_reconciliation_cursor'
    ) LOOP
        v_count := v_count + 1;

        -- Reject if not a standard function (e.g. procedure, aggregate, window)
        IF v_fn_record.prokind <> 'f' THEN
            RAISE EXCEPTION 'Routine public.advance_recording_reconciliation_cursor exists but is not a standard function (prokind: %). Aborting.', v_fn_record.prokind;
        END IF;

        -- Reject conflicting overloads: must take exactly 1 argument of type character varying
        IF v_fn_record.pronargs <> 1 OR v_fn_record.proargtypes <> 'character varying'::regtype::oidvector THEN
            RAISE EXCEPTION 'Conflicting overload of public.advance_recording_reconciliation_cursor detected with arguments (%): incompatible signature. Aborting.', v_fn_record.identity_args;
        END IF;

        -- Reject incompatible return type (PostgreSQL forbids changing return type in CREATE OR REPLACE)
        IF v_fn_record.prorettype <> 'jsonb'::regtype THEN
            RAISE EXCEPTION 'Pre-existing function public.advance_recording_reconciliation_cursor has incompatible return type (%) instead of jsonb. Aborting.', v_fn_record.result_type;
        END IF;
    END LOOP;

    IF v_count > 1 THEN
        RAISE EXCEPTION 'Multiple overloads (%) of public.advance_recording_reconciliation_cursor detected in public schema. Aborting.', v_count;
    END IF;
END $$;

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

    -- Guard against missing row
    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'Reconciliation cursor row "global_cursor" not found.';
    END IF;

    v_current_offset := v_row.category_offset;

    -- Guard against invalid or corrupted offset domain
    IF v_current_offset IS NULL OR v_current_offset NOT IN (0, 1, 2) THEN
        RAISE EXCEPTION 'Invalid category_offset % found in reconciliation cursor; expected 0, 1, or 2.', v_current_offset;
    END IF;

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

COMMIT;
