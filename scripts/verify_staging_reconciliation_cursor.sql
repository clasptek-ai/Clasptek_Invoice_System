-- =============================================================================
-- CLASPTEK: HARDENED POST-MIGRATION READ-ONLY VERIFICATION SCRIPT
-- Target Staging Project: dwhjoiebzwnjdpcvcwvs
-- Mode: Strictly READ-ONLY catalog validation. Zero mutations. Zero RPC calls.
-- Status: PREPARED FOR OPERATOR REVIEW — NOT EXECUTED.
-- =============================================================================

DO $$
DECLARE
    v_col_count INT;
    v_extra_cols TEXT;
    v_pk_cols name[];
    v_chk_def TEXT;
    v_chk_validated BOOLEAN;
    v_chk_cols name[];
    v_norm_chk TEXT;
    v_row_count INT;
    v_cursor_row RECORD;
    v_fn_oid OID;
    v_fn_overload_count INT;
    v_fn_definer BOOLEAN;
    v_fn_search_path TEXT[];
    v_fn_ret_type TEXT;
    v_fn_nargs INT;
    v_fn_arg_sig TEXT;
    v_fn_identity_args TEXT;
    v_table_privs TEXT[];
    v_unintended_table_grants TEXT;
    v_unintended_fn_grants TEXT;
    v_has_execute_grant BOOLEAN;
    v_relacl TEXT[];
    v_proacl TEXT[];
    v_acl_item TEXT;
    v_grantee TEXT;
BEGIN
    RAISE NOTICE 'Starting fail-closed post-migration verification for public.meeting_recording_reconciliation_cursor...';

    -- -------------------------------------------------------------------------
    -- 1. Table Existence & Relation Type
    -- -------------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND c.relname = 'meeting_recording_reconciliation_cursor'
          AND c.relkind = 'r'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Relation public.meeting_recording_reconciliation_cursor does not exist as an ordinary table (relkind = ''r'').';
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. Exact Six-Column Schema Contract (types, lengths, nullability, defaults)
    -- -------------------------------------------------------------------------
    SELECT COUNT(*) INTO v_col_count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meeting_recording_reconciliation_cursor';

    IF v_col_count <> 6 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Expected exactly 6 columns, found %.', v_col_count;
    END IF;

    -- Reject unexpected extra columns
    SELECT string_agg(column_name, ', ') INTO v_extra_cols
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'meeting_recording_reconciliation_cursor'
      AND column_name NOT IN ('id', 'category_offset', 'last_advanced_at', 'advanced_by', 'created_at', 'updated_at');

    IF v_extra_cols IS NOT NULL AND v_extra_cols <> '' THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Unexpected extra columns found: %', v_extra_cols;
    END IF;

    -- id (VARCHAR(32), NOT NULL, NO DEFAULT)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'meeting_recording_reconciliation_cursor'
          AND column_name = 'id'
          AND data_type = 'character varying'
          AND character_maximum_length = 32
          AND is_nullable = 'NO'
          AND column_default IS NULL
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Column id does not match specification (VARCHAR(32), NOT NULL, NO DEFAULT).';
    END IF;

    -- category_offset (INTEGER, NOT NULL, DEFAULT 0)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'meeting_recording_reconciliation_cursor'
          AND column_name = 'category_offset'
          AND data_type = 'integer'
          AND character_maximum_length IS NULL
          AND is_nullable = 'NO'
          AND column_default IS NOT NULL
          AND trim(both '()' from regexp_replace(column_default, '::(integer|int4|int)$', '', 'i')) = '0'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Column category_offset does not match specification (INTEGER, NOT NULL, DEFAULT 0).';
    END IF;

    -- advanced_by (VARCHAR(128), NOT NULL, NO DEFAULT)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'meeting_recording_reconciliation_cursor'
          AND column_name = 'advanced_by'
          AND data_type = 'character varying'
          AND character_maximum_length = 128
          AND is_nullable = 'NO'
          AND column_default IS NULL
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Column advanced_by does not match specification (VARCHAR(128), NOT NULL, NO DEFAULT).';
    END IF;

    -- last_advanced_at (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'meeting_recording_reconciliation_cursor'
          AND column_name = 'last_advanced_at'
          AND data_type = 'timestamp with time zone'
          AND is_nullable = 'NO'
          AND column_default IS NOT NULL
          AND regexp_replace(lower(trim(column_default)), '^[\s\(]*(now\(\)|current_timestamp)[\s\)]*(::\s*(timestamp with time zone|timestamptz))?[\s\)]*$', '\1') IN ('now()', 'current_timestamp')
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Column last_advanced_at does not match specification (TIMESTAMPTZ, NOT NULL, DEFAULT NOW()).';
    END IF;

    -- created_at (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'meeting_recording_reconciliation_cursor'
          AND column_name = 'created_at'
          AND data_type = 'timestamp with time zone'
          AND is_nullable = 'NO'
          AND column_default IS NOT NULL
          AND regexp_replace(lower(trim(column_default)), '^[\s\(]*(now\(\)|current_timestamp)[\s\)]*(::\s*(timestamp with time zone|timestamptz))?[\s\)]*$', '\1') IN ('now()', 'current_timestamp')
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Column created_at does not match specification (TIMESTAMPTZ, NOT NULL, DEFAULT NOW()).';
    END IF;

    -- updated_at (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'meeting_recording_reconciliation_cursor'
          AND column_name = 'updated_at'
          AND data_type = 'timestamp with time zone'
          AND is_nullable = 'NO'
          AND column_default IS NOT NULL
          AND regexp_replace(lower(trim(column_default)), '^[\s\(]*(now\(\)|current_timestamp)[\s\)]*(::\s*(timestamp with time zone|timestamptz))?[\s\)]*$', '\1') IN ('now()', 'current_timestamp')
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Column updated_at does not match specification (TIMESTAMPTZ, NOT NULL, DEFAULT NOW()).';
    END IF;

    -- -------------------------------------------------------------------------
    -- 3. Primary Key Strictly on (id)
    -- -------------------------------------------------------------------------
    SELECT array_agg(a.attname ORDER BY u.ord) INTO v_pk_cols
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    CROSS JOIN unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
    WHERE n.nspname = 'public'
      AND t.relname = 'meeting_recording_reconciliation_cursor'
      AND c.contype = 'p';

    IF v_pk_cols IS NULL OR v_pk_cols <> ARRAY['id']::name[] THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Primary key must strictly consist of [''id''], found %', v_pk_cols;
    END IF;

    -- -------------------------------------------------------------------------
    -- 4. Validated Check Constraint (Semantic Equivalence & Relation Scope)
    -- -------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE c.conname = 'chk_reconciliation_cursor_category_offset'
          AND (n.nspname <> 'public' OR t.relname <> 'meeting_recording_reconciliation_cursor')
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Constraint chk_reconciliation_cursor_category_offset exists on another relation.';
    END IF;

    SELECT
        pg_get_constraintdef(c.oid),
        c.convalidated,
        ARRAY(
            SELECT a.attname
            FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
            ORDER BY u.ord
        )
    INTO v_chk_def, v_chk_validated, v_chk_cols
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'meeting_recording_reconciliation_cursor'
      AND c.conname = 'chk_reconciliation_cursor_category_offset'
      AND c.contype = 'c';

    IF v_chk_def IS NULL THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Constraint chk_reconciliation_cursor_category_offset not found on target table.';
    END IF;

    IF v_chk_validated IS NOT TRUE THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Constraint chk_reconciliation_cursor_category_offset is NOT VALID (convalidated = false).';
    END IF;

    IF v_chk_cols <> ARRAY['category_offset']::name[] THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Check constraint column scope must strictly be [''category_offset''], found %', v_chk_cols;
    END IF;

    v_norm_chk := lower(regexp_replace(v_chk_def, '\s+', '', 'g'));
    IF v_norm_chk NOT IN (
        'check((category_offset=any(array[0,1,2])))',
        'check(category_offset=any(array[0,1,2]))',
        'check(category_offsetin(0,1,2))',
        'check((category_offsetin(0,1,2)))',
        'check(((category_offset=0)or(category_offset=1)or(category_offset=2)))',
        'check((category_offset=0)or(category_offset=1)or(category_offset=2))',
        'check((category_offset=0)or((category_offset=1)or(category_offset=2)))'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Check constraint definition cannot be verified as equivalent to (category_offset IN (0, 1, 2)): %', v_chk_def;
    END IF;

    -- Confirm all existing rows strictly adhere to the invariant
    IF EXISTS (
        SELECT 1 FROM public.meeting_recording_reconciliation_cursor
        WHERE category_offset IS NULL OR category_offset NOT IN (0, 1, 2)
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Existing rows violate category_offset IN (0, 1, 2).';
    END IF;

    -- -------------------------------------------------------------------------
    -- 5. Row Level Security
    -- -------------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND c.relname = 'meeting_recording_reconciliation_cursor'
          AND c.relrowsecurity = true
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Row Level Security is NOT enabled on table.';
    END IF;

    -- -------------------------------------------------------------------------
    -- 6. Singleton Row & Domain Check (0, 1, 2)
    -- -------------------------------------------------------------------------
    SELECT COUNT(*) INTO v_row_count
    FROM public.meeting_recording_reconciliation_cursor;

    IF v_row_count <> 1 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Expected exactly 1 row in table, found %.', v_row_count;
    END IF;

    SELECT * INTO v_cursor_row
    FROM public.meeting_recording_reconciliation_cursor
    WHERE id = 'global_cursor';

    IF v_cursor_row.id IS NULL THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Required singleton row with id = ''global_cursor'' not found.';
    END IF;

    IF v_cursor_row.category_offset NOT IN (0, 1, 2) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Singleton row category_offset % is outside domain (0, 1, 2).', v_cursor_row.category_offset;
    END IF;

    IF v_cursor_row.advanced_by IS NULL OR v_cursor_row.last_advanced_at IS NULL OR v_cursor_row.created_at IS NULL OR v_cursor_row.updated_at IS NULL THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Singleton row has unexpected NULL in timestamp or worker field.';
    END IF;

    -- -------------------------------------------------------------------------
    -- 7. Stored Function: Exact Catalog Identity, SECURITY DEFINER, Search Path
    -- -------------------------------------------------------------------------
    SELECT COUNT(*) INTO v_fn_overload_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'advance_recording_reconciliation_cursor';

    IF v_fn_overload_count = 0 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Function public.advance_recording_reconciliation_cursor does not exist.';
    ELSIF v_fn_overload_count > 1 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Found % overloads of advance_recording_reconciliation_cursor. Expected exactly 1.', v_fn_overload_count;
    END IF;

    SELECT
        p.oid,
        p.prosecdef,
        p.proconfig,
        pg_get_function_result(p.oid),
        p.pronargs,
        p.proargtypes,
        p.prorettype,
        p.prokind,
        pg_get_function_arguments(p.oid),
        pg_get_function_identity_arguments(p.oid),
        p.proacl::text[]
    INTO
        v_fn_oid,
        v_fn_definer,
        v_fn_search_path,
        v_fn_ret_type,
        v_fn_nargs,
        v_table_privs, -- temporary reuse of variable for type check if needed
        v_table_privs,
        v_table_privs,
        v_fn_arg_sig,
        v_fn_identity_args,
        v_proacl
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'advance_recording_reconciliation_cursor';

    -- Confirm exact catalog types
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'advance_recording_reconciliation_cursor'
          AND p.prokind = 'f'
          AND p.pronargs = 1
          AND p.proargtypes = 'character varying'::regtype::oidvector
          AND p.prorettype = 'jsonb'::regtype
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Function catalog types do not strictly match 1 argument of character varying returning jsonb.';
    END IF;

    IF v_fn_definer IS NOT TRUE THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Function is NOT SECURITY DEFINER.';
    END IF;

    IF v_fn_ret_type <> 'jsonb' THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Function return type is %, expected jsonb.', v_fn_ret_type;
    END IF;

    IF v_fn_nargs <> 1 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Function argument count is %, expected 1.', v_fn_nargs;
    END IF;

    IF v_fn_identity_args NOT IN ('p_worker_id character varying', 'character varying') THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Function identity arguments [%] do not match expected character varying.', v_fn_identity_args;
    END IF;

    IF v_fn_search_path IS NULL OR NOT (
        'search_path=public, pg_temp' = ANY(v_fn_search_path) OR
        'search_path=public,pg_temp' = ANY(v_fn_search_path) OR
        ('search_path="public", "pg_temp"' = ANY(v_fn_search_path))
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Function search_path is not strictly [public, pg_temp]. Found: %', v_fn_search_path;
    END IF;

    IF v_fn_arg_sig !~* '^p_worker_id\s+(character\s+varying(\(128\))?|varchar(\(128\))?)\s+DEFAULT\s+''system_reconciliation_worker''' THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Function argument signature does not match expected: %', v_fn_arg_sig;
    END IF;

    -- -------------------------------------------------------------------------
    -- 8. Direct Table Grants: service_role only, no PUBLIC/anon/authenticated
    -- -------------------------------------------------------------------------
    SELECT array_agg(DISTINCT privilege_type) INTO v_table_privs
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'meeting_recording_reconciliation_cursor'
      AND grantee = 'service_role';

    IF v_table_privs IS NULL OR NOT (
        'ALL' = ANY(v_table_privs) OR
        ('SELECT' = ANY(v_table_privs) AND 'INSERT' = ANY(v_table_privs) AND 'UPDATE' = ANY(v_table_privs) AND 'DELETE' = ANY(v_table_privs))
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: service_role lacks required direct privileges on table. Found: %', v_table_privs;
    END IF;

    SELECT string_agg(format('%s (%s)', grantee, privilege_type), ', ') INTO v_unintended_table_grants
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'meeting_recording_reconciliation_cursor'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated');

    IF v_unintended_table_grants IS NOT NULL AND v_unintended_table_grants <> '' THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Unintended direct table grants detected: %', v_unintended_table_grants;
    END IF;

    -- Catalog ACL check on table
    SELECT c.relacl::text[] INTO v_relacl
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'meeting_recording_reconciliation_cursor';

    IF v_relacl IS NOT NULL THEN
        FOREACH v_acl_item IN ARRAY v_relacl LOOP
            v_grantee := split_part(v_acl_item, '=', 1);
            IF v_grantee IN ('PUBLIC', 'anon', 'authenticated') OR v_grantee = '' THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Catalog relacl contains unintended grant entry: %', v_acl_item;
            END IF;
        END LOOP;
    END IF;

    -- -------------------------------------------------------------------------
    -- 9. Direct Function Grants: EXECUTE to service_role only
    -- -------------------------------------------------------------------------
    SELECT EXISTS (
        SELECT 1 FROM information_schema.routine_privileges
        WHERE routine_schema = 'public'
          AND routine_name = 'advance_recording_reconciliation_cursor'
          AND grantee = 'service_role'
          AND privilege_type = 'EXECUTE'
    ) INTO v_has_execute_grant;

    IF NOT v_has_execute_grant THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: service_role missing EXECUTE privilege on advance_recording_reconciliation_cursor.';
    END IF;

    SELECT string_agg(format('%s (%s)', grantee, privilege_type), ', ') INTO v_unintended_fn_grants
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'advance_recording_reconciliation_cursor'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated');

    IF v_unintended_fn_grants IS NOT NULL AND v_unintended_fn_grants <> '' THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: Unintended direct function grants detected: %', v_unintended_fn_grants;
    END IF;

    -- Catalog ACL check on function
    IF v_proacl IS NOT NULL THEN
        FOREACH v_acl_item IN ARRAY v_proacl LOOP
            v_grantee := split_part(v_acl_item, '=', 1);
            IF v_grantee IN ('PUBLIC', 'anon', 'authenticated') OR v_grantee = '' THEN
                RAISE EXCEPTION 'VERIFICATION FAILED: Catalog proacl contains unintended grant entry: %', v_acl_item;
            END IF;
        END LOOP;
    END IF;

    -- -------------------------------------------------------------------------
    -- 10. Audit Summary & Scope Limitations Notice
    -- -------------------------------------------------------------------------
    RAISE NOTICE '✔ ALL POST-MIGRATION VERIFICATION CHECKS PASSED SUCCESSFULLY.';
    RAISE NOTICE '  - Proven: Table relkind = ''r'', exact 6 columns, PK strictly on (id), CHECK constraint validated and verified on (0, 1, 2).';
    RAISE NOTICE '  - Proven: Singleton row present (id=global_cursor), valid offset, non-null timestamps, zero violating rows.';
    RAISE NOTICE '  - Proven: Function catalog identity verified (1 arg, character varying, return jsonb, SECURITY DEFINER, search_path=public,pg_temp).';
    RAISE NOTICE '  - Proven: Direct table/function ACLs grant service_role and explicitly revoke PUBLIC, anon, and authenticated.';
    RAISE NOTICE '  - SCOPE LIMITATION NOTICE: Catalog checks prove direct explicit ACLs only.';
    RAISE NOTICE '    Effective permissions through superuser bypass (postgres/supabase_admin), future ALTER DEFAULT PRIVILEGES,';
    RAISE NOTICE '    or indirect role inheritance (pg_auth_members) remain governed at cluster/database level.';
END $$;
