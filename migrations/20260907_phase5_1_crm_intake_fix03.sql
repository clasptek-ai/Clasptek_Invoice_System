-- =============================================================================
-- CLASPTEK ENTERPRISE PLATFORM
-- Migration: Phase 5.1 CRM Intake & Applicant Management (Fix 03)
-- Target Database: PostgreSQL / Supabase (logaawoigfxnisimfatf)
-- Scope: Remediate public.convert_intake_application to supply mandatory
--        enrolment columns (student_name, student_email, student_phone)
-- Safety: Additive, Idempotent, Minimal, Non-Destructive, Transaction-Safe
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- REMEDIATED CONVERSION FUNCTION (ACADEMIC GOVERNANCE & ENROLMENT COMPLETION)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_intake_application(
    p_application_id UUID,
    p_options JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_role TEXT;
    v_app RECORD;
    v_student RECORD;
    v_student_id TEXT;
    v_enrolment_id TEXT;
    v_prog RECORD;
    v_cohort RECORD;
    v_year TEXT;
    v_stu_seq INT;
    v_enr_seq INT;
    v_existing_max_stu INT;
    v_existing_max_enr INT;
    v_student_no TEXT;
    v_enrolment_no TEXT;
    v_cohort_id TEXT;
    v_enrolment_tuition NUMERIC(14,2);
BEGIN
    -- 1. Authorization Gate (Training Admin / Super Admin ONLY — Finance-only roles strictly denied)
    v_tenant_id := public.get_auth_tenant_id();
    v_role := public.get_auth_user_role();

    IF v_tenant_id IS NULL OR NOT (
        public.is_super_admin() OR 
        v_role IN ('SUPER_ADMIN', 'super admin', 'admin', 'TRAINING_ADMIN', 'STAFF')
    ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only training administrators or super administrators can convert intake applications';
    END IF;

    -- 2. Fetch Application with Row Lock
    SELECT * INTO v_app
    FROM public.crm_intake_applications
    WHERE id = p_application_id AND tenant_id = v_tenant_id
    FOR UPDATE;

    IF v_app.id IS NULL THEN
        RAISE EXCEPTION 'APPLICATION_NOT_FOUND: Application does not exist or belongs to a different tenant';
    END IF;

    IF v_app.status = 'CONVERTED' THEN
        RAISE EXCEPTION 'ALREADY_CONVERTED: Application has already been converted';
    END IF;

    IF v_app.status NOT IN ('MATCHED', 'QUALIFIED') THEN
        RAISE EXCEPTION 'INVALID_STATUS_FOR_CONVERSION: Application must be in MATCHED or QUALIFIED status prior to conversion';
    END IF;

    v_year := TO_CHAR(CURRENT_DATE, 'YYYY');

    -- 3. Resolve or Create Authoritative Student
    IF v_app.matched_student_id IS NOT NULL THEN
        SELECT * INTO v_student FROM public.students WHERE id = v_app.matched_student_id AND tenant_id = v_tenant_id;
        IF v_student.id IS NULL THEN
            RAISE EXCEPTION 'STUDENT_NOT_FOUND: Linked student profile was not found';
        END IF;
        v_student_id := v_student.id;
        v_student_no := v_student.student_number;
    ELSE
        -- Concurrency-Safe Student Number Allocation via Atomic Row Lock Counter
        INSERT INTO public.crm_intake_counters (tenant_id, application_seq, student_seq, enrolment_seq, updated_at)
        VALUES (v_tenant_id, 1, 101, 1000, NOW())
        ON CONFLICT (tenant_id)
        DO UPDATE SET 
            student_seq = public.crm_intake_counters.student_seq + 1,
            updated_at = NOW()
        RETURNING student_seq - 1 INTO v_stu_seq;

        -- Synchronize with existing student records if manual additions exist
        SELECT COALESCE(MAX(SUBSTRING(student_number FROM '[0-9]+$')::INT), 0) INTO v_existing_max_stu
        FROM public.students
        WHERE tenant_id = v_tenant_id;

        IF v_existing_max_stu >= v_stu_seq THEN
            v_stu_seq := v_existing_max_stu + 1;
            UPDATE public.crm_intake_counters 
            SET student_seq = v_stu_seq + 1, updated_at = NOW() 
            WHERE tenant_id = v_tenant_id;
        END IF;

        v_student_no := 'STU-' || v_year || '-' || LPAD(v_stu_seq::TEXT, 4, '0');
        
        -- CSPRNG Cryptographically Secure Student Identifier
        v_student_id := 'stu_' || EXTRACT(EPOCH FROM NOW())::BIGINT || '_' || SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8);

        INSERT INTO public.students (
            id,
            tenant_id,
            student_number,
            first_name,
            last_name,
            email,
            phone,
            gender,
            address,
            emergency_contact_name,
            emergency_contact_phone,
            status,
            metadata
        ) VALUES (
            v_student_id,
            v_tenant_id,
            v_student_no,
            v_app.first_name,
            v_app.last_name,
            v_app.email,
            v_app.phone,
            v_app.gender,
            v_app.address,
            v_app.sponsor_name,
            v_app.sponsor_phone,
            'ACTIVE',
            jsonb_build_object(
                'source', 'intake_conversion',
                'application_id', v_app.id,
                'application_number', v_app.application_number,
                'sponsor_type', v_app.sponsor_type,
                'state_of_origin', v_app.state_of_origin,
                'nationality', v_app.nationality,
                'date_of_birth', v_app.date_of_birth
            )
        );
    END IF;

    -- 4. Create Enrolment with Strict Cohort & Programme Tenant Isolation & Financial Separation
    v_cohort_id := TRIM(COALESCE(p_options->>'cohort_id', ''));
    IF v_cohort_id = '' THEN
        v_cohort_id := NULL;
    END IF;

    IF v_cohort_id IS NOT NULL THEN
        IF v_app.programme_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_CONVERSION: Application does not have a resolved programme to enrol into cohort %', v_cohort_id;
        END IF;

        -- Verify cohort exists and belongs to caller tenant
        SELECT * INTO v_cohort 
        FROM public.cohorts 
        WHERE id = v_cohort_id AND tenant_id = v_tenant_id;

        IF v_cohort.id IS NULL THEN
            RAISE EXCEPTION 'COHORT_NOT_FOUND: Cohort % does not exist or does not belong to your tenant', v_cohort_id;
        END IF;

        -- Verify cohort belongs to the application's resolved programme
        IF v_cohort.programme_id <> v_app.programme_id THEN
            RAISE EXCEPTION 'COHORT_PROGRAMME_MISMATCH: Cohort % belongs to programme % but application is for %', 
                v_cohort_id, v_cohort.programme_id, v_app.programme_id;
        END IF;

        SELECT * INTO v_prog 
        FROM public.programmes 
        WHERE id = v_app.programme_id AND tenant_id = v_tenant_id;

        IF v_prog.id IS NULL THEN
            RAISE EXCEPTION 'PROGRAMME_NOT_FOUND: Programme % does not exist in your tenant', v_app.programme_id;
        END IF;

        -- Financial Data Separation: The public claimed fee CANNOT unilaterally set enrolment tuition.
        -- Enrolment tuition defaults to authoritative programme catalogue tuition fee,
        -- or an explicit administrator-approved tuition passed in p_options.
        IF p_options->>'approved_tuition_fee' IS NOT NULL AND (p_options->>'approved_tuition_fee')::NUMERIC >= 0 THEN
            v_enrolment_tuition := (p_options->>'approved_tuition_fee')::NUMERIC;
        ELSIF p_options->>'agreed_tuition_fee' IS NOT NULL AND (p_options->>'agreed_tuition_fee')::NUMERIC >= 0 THEN
            v_enrolment_tuition := (p_options->>'agreed_tuition_fee')::NUMERIC;
        ELSE
            v_enrolment_tuition := COALESCE(v_prog.tuition_fee, 0);
        END IF;

        -- Concurrency-Safe Enrolment Number Allocation via Atomic Row Lock Counter
        INSERT INTO public.crm_intake_counters (tenant_id, application_seq, student_seq, enrolment_seq, updated_at)
        VALUES (v_tenant_id, 1, 100, 1001, NOW())
        ON CONFLICT (tenant_id)
        DO UPDATE SET 
            enrolment_seq = public.crm_intake_counters.enrolment_seq + 1,
            updated_at = NOW()
        RETURNING enrolment_seq - 1 INTO v_enr_seq;

        -- Synchronize with existing enrolment records if manual additions exist
        SELECT COALESCE(MAX(SUBSTRING(enrolment_number FROM '[0-9]+$')::INT), 0) INTO v_existing_max_enr
        FROM public.enrolments
        WHERE tenant_id = v_tenant_id;

        IF v_existing_max_enr >= v_enr_seq THEN
            v_enr_seq := v_existing_max_enr + 1;
            UPDATE public.crm_intake_counters 
            SET enrolment_seq = v_enr_seq + 1, updated_at = NOW() 
            WHERE tenant_id = v_tenant_id;
        END IF;

        v_enrolment_no := 'ENR-' || v_year || '-' || LPAD(v_enr_seq::TEXT, 4, '0');
        
        -- CSPRNG Cryptographically Secure Enrolment Identifier
        v_enrolment_id := 'enr_' || EXTRACT(EPOCH FROM NOW())::BIGINT || '_' || SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8);

        -- Insert Enrolment (Preserving Authoritative Enrolment Tuition & Mandated Denormalized Fields)
        INSERT INTO public.enrolments (
            id,
            tenant_id,
            student_id,
            programme_id,
            cohort_id,
            enrolment_number,
            enrolment_date,
            student_name,
            student_email,
            student_phone,
            agreed_tuition_fee,
            status
        ) VALUES (
            v_enrolment_id,
            v_tenant_id,
            v_student_id,
            v_prog.id,
            v_cohort_id,
            v_enrolment_no,
            CURRENT_DATE,
            v_app.first_name || ' ' || v_app.last_name,
            v_app.email,
            v_app.phone,
            v_enrolment_tuition,
            'ACTIVE'
        );
    END IF;

    -- 5. Advance Application Status to CONVERTED
    UPDATE public.crm_intake_applications
    SET status = 'CONVERTED',
        matched_student_id = v_student_id,
        enrolment_id = v_enrolment_id,
        updated_at = NOW()
    WHERE id = v_app.id;

    -- 6. Advance Linked Enquiry (if present)
    IF v_app.enquiry_id IS NOT NULL THEN
        UPDATE public.enquiries
        SET status = 'ENROLLED',
            updated_at = NOW()
        WHERE id = v_app.enquiry_id AND tenant_id = v_tenant_id;
    END IF;

    -- 7. Authoritative Database-Level Audit Log on Conversion (CSPRNG Identifier)
    INSERT INTO public.finance_audit_log (
        id,
        tenant_id,
        action,
        entity_type,
        entity_id,
        entity_name,
        old_state,
        new_state,
        reason,
        actor_id,
        actor_role,
        source,
        created_at
    ) VALUES (
        'aud_' || gen_random_uuid()::TEXT,
        v_tenant_id,
        'APPLICATION_CONVERTED',
        'crm_intake_applications',
        v_app.id::TEXT,
        v_app.application_number,
        jsonb_build_object('status', v_app.status, 'matched_student_id', v_app.matched_student_id),
        jsonb_build_object(
            'status', 'CONVERTED',
            'student_id', v_student_id,
            'student_number', v_student_no,
            'enrolment_id', v_enrolment_id,
            'enrolment_number', v_enrolment_no
        ),
        'Intake application successfully converted to student profile and cohort enrolment',
        auth.uid(),
        COALESCE(v_role, 'TRAINING_ADMIN'),
        'supabase_rpc',
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'application_id', v_app.id,
        'application_number', v_app.application_number,
        'status', 'CONVERTED',
        'student_id', v_student_id,
        'student_number', v_student_no,
        'enrolment_id', v_enrolment_id,
        'enrolment_number', v_enrolment_no
    );
END;
$$;

-- Secure Authorization Boundary
REVOKE ALL ON FUNCTION public.convert_intake_application(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_intake_application(UUID, JSONB) TO authenticated, service_role;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
