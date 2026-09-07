-- =============================================================================
-- CLASPTEK ENTERPRISE PLATFORM
-- Migration: Phase 5.1 Professional CRM Intake & Applicant Management (Fix 02)
-- Target Database: PostgreSQL / Supabase (logaawoigfxnisimfatf)
-- Safe, Additive, Idempotent, Non-Destructive, Transaction-Safe
-- Hardened: Zero-Exam Model, Authoritative RPC Ingestion, Concurrency-Safe Counters,
--           Strict Tenant Isolation, Immutable Raw Submissions, CSPRNG Identifiers,
--           Financial Data Separation & Strict Academic Conversion Authorization
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 2. CRM INTAKE COUNTERS TABLE (CONCURRENCY-SAFE ATOMIC NUMBERING)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_intake_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    application_seq INT NOT NULL DEFAULT 1,
    student_seq INT NOT NULL DEFAULT 100,
    enrolment_seq INT NOT NULL DEFAULT 1000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_intake_counters_tenant ON public.crm_intake_counters(tenant_id);

-- -----------------------------------------------------------------------------
-- 3. CRM INTAKE APPLICATIONS TABLE (AUTHORITATIVE SYSTEM OF RECORD)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_intake_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    application_number TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('WEB_INTAKE', 'GOOGLE_FORM', 'STAFF_ENTRY', 'PORTAL')),
    source_submission_id TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'REVIEW_REQUIRED', 'MATCHED', 'QUALIFIED', 'CONVERTED', 'REJECTED', 'CANCELLED')),
    
    -- Core Relational Applicant Fields
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    date_of_birth DATE,
    gender TEXT,
    marital_status TEXT,
    state_of_origin TEXT,
    nationality TEXT DEFAULT 'Nigerian',
    address TEXT,
    
    -- Relational Training Interest
    programme_id TEXT REFERENCES public.programmes(id) ON DELETE RESTRICT,
    expertise_level TEXT,
    preferred_schedule TEXT,
    preferred_start_date DATE,
    preferred_duration TEXT,
    delivery_mode TEXT NOT NULL DEFAULT 'IN_PERSON' CHECK (delivery_mode IN ('IN_PERSON', 'ONLINE', 'HYBRID')),
    
    -- Relational Sponsorship
    sponsor_type TEXT DEFAULT 'Self-sponsored',
    sponsor_name TEXT,
    sponsor_phone TEXT,
    sponsor_email TEXT,
    
    -- Claimed Existing Identifier & Additional Info
    claimed_student_number TEXT,
    employment_status TEXT,
    referral_source TEXT,
    notes TEXT,
    agreed_tuition_fee NUMERIC(14,2) DEFAULT 0 CHECK (agreed_tuition_fee >= 0),
    consent_acknowledged BOOLEAN NOT NULL DEFAULT true,
    
    -- Governed Identity & CRM Linkages
    matched_student_id TEXT REFERENCES public.students(id) ON DELETE SET NULL,
    enquiry_id TEXT REFERENCES public.enquiries(id) ON DELETE SET NULL,
    enrolment_id TEXT REFERENCES public.enrolments(id) ON DELETE SET NULL,
    identity_confidence TEXT CHECK (identity_confidence IN ('HIGH', 'AMBIGUOUS', 'NONE')),
    match_notes TEXT,
    review_reason TEXT,
    
    -- Immutable Raw Submission Snapshot (Guarded by Trigger)
    applicant_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_intake_apps_tenant_number UNIQUE (tenant_id, application_number),
    CONSTRAINT uq_intake_apps_idempotency UNIQUE (tenant_id, source, source_submission_id)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_intake_apps_tenant_status ON public.crm_intake_applications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_intake_apps_tenant_prog ON public.crm_intake_applications(tenant_id, programme_id);
CREATE INDEX IF NOT EXISTS idx_intake_apps_tenant_student ON public.crm_intake_applications(tenant_id, matched_student_id);
CREATE INDEX IF NOT EXISTS idx_intake_apps_tenant_submitted ON public.crm_intake_applications(tenant_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_apps_email ON public.crm_intake_applications(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_intake_apps_phone ON public.crm_intake_applications(tenant_id, phone);

-- -----------------------------------------------------------------------------
-- 4. DATABASE TRIGGER: IMMUTABILITY ENFORCEMENT ON RAW APPLICANT DATA
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_crm_intake_immutable_applicant_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.applicant_data IS DISTINCT FROM OLD.applicant_data THEN
        RAISE EXCEPTION 'IMMUTABLE_FIELD: applicant_data preserves the authoritative raw submission snapshot and cannot be modified';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_applicant_data_update ON public.crm_intake_applications;
CREATE TRIGGER trg_prevent_applicant_data_update
    BEFORE UPDATE ON public.crm_intake_applications
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_crm_intake_immutable_applicant_data();

-- -----------------------------------------------------------------------------
-- 5. CONCURRENCY-SAFE ATOMIC APPLICATION NUMBERING (INTERNAL HELPER ONLY)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_next_application_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seq INT;
    v_year TEXT;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'p_tenant_id is required to allocate application number';
    END IF;

    -- Internal authorization guard: authenticated callers cannot request counters for other tenants
    IF auth.role() = 'authenticated' AND public.get_auth_tenant_id() IS NOT NULL THEN
        IF p_tenant_id <> public.get_auth_tenant_id() AND NOT public.is_super_admin() THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Cannot allocate application number for another tenant';
        END IF;
    END IF;

    v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    -- Atomic row increment with insert on conflict
    INSERT INTO public.crm_intake_counters (tenant_id, application_seq, student_seq, enrolment_seq, updated_at)
    VALUES (p_tenant_id, 2, 101, 1001, NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET 
        application_seq = public.crm_intake_counters.application_seq + 1,
        updated_at = NOW()
    RETURNING application_seq - 1 INTO v_seq;

    RETURN 'APP-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
END;
$$;

-- Secure Authorization Boundary: COMPLETELY INACCESSIBLE TO BROWSER / REST CLIENTS
REVOKE ALL ON FUNCTION public.get_next_application_number(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_application_number(UUID) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. HARDENED PUBLIC INTAKE RPC FUNCTION (AUTHORITATIVE INGESTION PATH)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_applicant_intake(
    p_source TEXT,
    p_source_submission_id TEXT,
    p_first_name TEXT,
    p_last_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_date_of_birth DATE DEFAULT NULL,
    p_gender TEXT DEFAULT NULL,
    p_marital_status TEXT DEFAULT NULL,
    p_state_of_origin TEXT DEFAULT NULL,
    p_nationality TEXT DEFAULT 'Nigerian',
    p_address TEXT DEFAULT NULL,
    p_programme_id TEXT DEFAULT NULL,
    p_expertise_level TEXT DEFAULT NULL,
    p_preferred_schedule TEXT DEFAULT NULL,
    p_preferred_start_date DATE DEFAULT NULL,
    p_preferred_duration TEXT DEFAULT NULL,
    p_delivery_mode TEXT DEFAULT 'IN_PERSON',
    p_sponsor_type TEXT DEFAULT 'Self-sponsored',
    p_sponsor_name TEXT DEFAULT NULL,
    p_sponsor_phone TEXT DEFAULT NULL,
    p_sponsor_email TEXT DEFAULT NULL,
    p_claimed_student_number TEXT DEFAULT NULL,
    p_employment_status TEXT DEFAULT NULL,
    p_referral_source TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_agreed_tuition_fee NUMERIC DEFAULT 0,
    p_consent_acknowledged BOOLEAN DEFAULT true,
    p_honeypot TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_app_number TEXT;
    v_norm_email TEXT;
    v_norm_phone TEXT;
    v_clean_first TEXT;
    v_clean_last TEXT;
    v_programme RECORD;
    v_existing_app RECORD;
    v_status TEXT := 'NEW';
    v_identity_confidence TEXT := 'NONE';
    v_matched_student_id TEXT := NULL;
    v_review_reason TEXT := NULL;
    v_match_notes TEXT := NULL;
    v_matched_student RECORD;
    v_claimed_student RECORD;
    v_phone_matched_student RECORD;
    v_email_matched_student RECORD;
    v_new_app_id UUID;
    v_raw_snapshot JSONB;
    v_is_staff BOOLEAN;
BEGIN
    -- 1. Anti-Bot / Honeypot Gate
    IF p_honeypot IS NOT NULL AND TRIM(p_honeypot) <> '' THEN
        -- Silent drop for automated bots
        RETURN jsonb_build_object(
            'success', true,
            'application_number', 'APP-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-000000',
            'status', 'REJECTED',
            'message', 'Application received'
        );
    END IF;

    -- 2. Determine Caller Privilege Level (Used for Sanitizing Public Responses)
    v_is_staff := (public.is_super_admin() OR public.get_auth_user_role() IN ('SUPER_ADMIN', 'admin', 'TRAINING_ADMIN', 'STAFF'));

    -- 3. Authoritative Public Tenant Resolution (Designated Intake Tenant, Fail-Closed)
    -- Never allow an anonymous caller to select or switch tenant via programme identifiers.
    v_tenant_id := public.get_auth_tenant_id();
    IF v_tenant_id IS NULL THEN
        -- Resolve the designated intake tenant authoritatively
        SELECT id INTO v_tenant_id 
        FROM public.tenants 
        WHERE slug = 'clasptek_main';
        
        -- Fallback: resolve ONLY if there is an unambiguous single tenant registered
        IF v_tenant_id IS NULL THEN
            SELECT id INTO v_tenant_id 
            FROM public.tenants 
            WHERE (SELECT count(*) FROM public.tenants) = 1
            LIMIT 1;
        END IF;
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'TENANT_RESOLUTION_FAILED: Authoritative tenant could not be determined unambiguously. Public intake requires a designated tenant.';
    END IF;

    -- 4. Parameter Validation & Server-Side String Bounds
    v_clean_first := TRIM(COALESCE(p_first_name, ''));
    v_clean_last := TRIM(COALESCE(p_last_name, ''));
    IF v_clean_first = '' OR v_clean_last = '' THEN
        RAISE EXCEPTION 'INVALID_APPLICATION: Applicant first name and last name are required';
    END IF;
    IF LENGTH(v_clean_first) > 100 OR LENGTH(v_clean_last) > 100 THEN
        RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Applicant name exceeds maximum permitted length of 100 characters';
    END IF;

    -- String bounds checks for all public inputs
    IF p_address IS NOT NULL AND LENGTH(p_address) > 500 THEN
        RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Address exceeds maximum length of 500 characters';
    END IF;
    IF p_sponsor_name IS NOT NULL AND LENGTH(p_sponsor_name) > 100 THEN
        RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Sponsor name exceeds maximum length of 100 characters';
    END IF;
    IF p_sponsor_phone IS NOT NULL AND LENGTH(p_sponsor_phone) > 30 THEN
        RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Sponsor phone exceeds maximum length of 30 characters';
    END IF;
    IF p_sponsor_email IS NOT NULL AND LENGTH(p_sponsor_email) > 255 THEN
        RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Sponsor email exceeds maximum length of 255 characters';
    END IF;
    IF p_claimed_student_number IS NOT NULL AND LENGTH(p_claimed_student_number) > 50 THEN
        RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Claimed student number exceeds maximum length of 50 characters';
    END IF;
    IF p_employment_status IS NOT NULL AND LENGTH(p_employment_status) > 50 THEN
        RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Employment status exceeds maximum length of 50 characters';
    END IF;
    IF p_referral_source IS NOT NULL AND LENGTH(p_referral_source) > 100 THEN
        RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Referral source exceeds maximum length of 100 characters';
    END IF;
    IF p_expertise_level IS NOT NULL AND LENGTH(p_expertise_level) > 50 THEN
        RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Expertise level exceeds maximum length of 50 characters';
    END IF;
    IF p_preferred_schedule IS NOT NULL AND LENGTH(p_preferred_schedule) > 50 THEN
        RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Preferred schedule exceeds maximum length of 50 characters';
    END IF;
    IF p_preferred_duration IS NOT NULL AND LENGTH(p_preferred_duration) > 50 THEN
        RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Preferred duration exceeds maximum length of 50 characters';
    END IF;
    IF p_state_of_origin IS NOT NULL AND LENGTH(p_state_of_origin) > 50 THEN
        RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: State of origin exceeds maximum length of 50 characters';
    END IF;
    IF p_nationality IS NOT NULL AND LENGTH(p_nationality) > 50 THEN
        RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Nationality exceeds maximum length of 50 characters';
    END IF;

    -- Normalize email
    v_norm_email := LOWER(TRIM(COALESCE(p_email, '')));
    IF v_norm_email <> '' THEN
        IF v_norm_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
            RAISE EXCEPTION 'INVALID_APPLICATION: Malformed email address format';
        END IF;
        IF LENGTH(v_norm_email) > 255 THEN
            RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Email address exceeds maximum permitted length of 255 characters';
        END IF;
    ELSE
        v_norm_email := NULL;
    END IF;

    -- Normalize phone (digits and optional leading +)
    v_norm_phone := REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9+]', '', 'g');
    IF v_norm_phone <> '' THEN
        IF LENGTH(REGEXP_REPLACE(v_norm_phone, '[^0-9]', '', 'g')) < 8 THEN
            RAISE EXCEPTION 'INVALID_APPLICATION: Phone number must contain at least 8 digits';
        END IF;
        IF LENGTH(v_norm_phone) > 30 THEN
            RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Phone number exceeds maximum permitted length of 30 characters';
        END IF;
    ELSE
        v_norm_phone := NULL;
    END IF;

    -- Financial Data Guard (Strict Rejection, Never Clamp)
    IF p_agreed_tuition_fee IS NULL OR p_agreed_tuition_fee < 0 THEN
        RAISE EXCEPTION 'INVALID_FEE: Agreed tuition fee cannot be negative or empty';
    END IF;

    -- Consent Validation
    IF NOT COALESCE(p_consent_acknowledged, false) THEN
        RAISE EXCEPTION 'INVALID_APPLICATION: Declaration and privacy consent must be explicitly acknowledged';
    END IF;

    -- Notes length check
    IF p_notes IS NOT NULL AND LENGTH(p_notes) > 2000 THEN
        RAISE EXCEPTION 'FIELD_LENGTH_EXCEEDED: Application notes exceed maximum length of 2000 characters';
    END IF;

    -- Source validation
    IF p_source NOT IN ('WEB_INTAKE', 'GOOGLE_FORM', 'STAFF_ENTRY', 'PORTAL') THEN
        RAISE EXCEPTION 'INVALID_APPLICATION: Unsupported intake source';
    END IF;

    IF p_source_submission_id IS NULL OR TRIM(p_source_submission_id) = '' THEN
        RAISE EXCEPTION 'INVALID_APPLICATION: source_submission_id is required for idempotency';
    END IF;

    -- 5. Sequential Idempotency Check (Fast Path)
    SELECT * INTO v_existing_app 
    FROM public.crm_intake_applications
    WHERE tenant_id = v_tenant_id 
      AND source = p_source 
      AND source_submission_id = TRIM(p_source_submission_id);

    IF v_existing_app.id IS NOT NULL THEN
        -- Sanitized Response for Public / Detailed for Staff (Zero Oracle Leakage)
        IF v_is_staff THEN
            RETURN jsonb_build_object(
                'success', true,
                'is_replay', true,
                'application_id', v_existing_app.id,
                'application_number', v_existing_app.application_number,
                'status', v_existing_app.status,
                'identity_confidence', v_existing_app.identity_confidence,
                'matched_student_id', v_existing_app.matched_student_id,
                'programme_id', v_existing_app.programme_id,
                'message', 'Application already received (idempotent replay)'
            );
        ELSE
            RETURN jsonb_build_object(
                'success', true,
                'is_replay', true,
                'application_number', v_existing_app.application_number,
                'status', 'RECEIVED',
                'message', 'Application already received'
            );
        END IF;
    END IF;

    -- 6. Authoritative Programme Resolution strictly within Authoritative Tenant
    IF p_programme_id IS NOT NULL AND TRIM(p_programme_id) <> '' THEN
        SELECT * INTO v_programme 
        FROM public.programmes 
        WHERE tenant_id = v_tenant_id 
          AND (id = TRIM(p_programme_id) OR code = TRIM(p_programme_id))
        LIMIT 1;

        IF v_programme.id IS NULL THEN
            v_status := 'REVIEW_REQUIRED';
            v_review_reason := 'PROGRAMME_NOT_FOUND_OR_RETIRED';
            v_match_notes := 'Submitted programme identifier could not be resolved to an active catalogue programme in the designated tenant';
        ELSIF v_programme.status <> 'active' THEN
            v_status := 'REVIEW_REQUIRED';
            v_review_reason := 'PROGRAMME_NOT_FOUND_OR_RETIRED';
            v_match_notes := 'Requested programme is not currently active';
        END IF;
    END IF;

    -- 7. Identity Resolution Engine
    -- Signal 1: Claimed Student Number Check
    IF p_claimed_student_number IS NOT NULL AND TRIM(p_claimed_student_number) <> '' THEN
        SELECT * INTO v_claimed_student
        FROM public.students
        WHERE tenant_id = v_tenant_id
          AND student_number = TRIM(p_claimed_student_number)
        LIMIT 1;

        IF v_claimed_student.id IS NOT NULL THEN
            -- Verify claimed student corresponds to submitted name or contacts
            IF (LOWER(v_claimed_student.last_name) = LOWER(v_clean_last)) OR
               (v_norm_email IS NOT NULL AND LOWER(COALESCE(v_claimed_student.email, '')) = v_norm_email) OR
               (v_norm_phone IS NOT NULL AND REGEXP_REPLACE(COALESCE(v_claimed_student.phone, ''), '[^0-9]', '', 'g') = REGEXP_REPLACE(v_norm_phone, '[^0-9]', '', 'g')) THEN
                v_matched_student_id := v_claimed_student.id;
                v_identity_confidence := 'HIGH';
                IF v_status <> 'REVIEW_REQUIRED' THEN
                    v_status := 'MATCHED';
                END IF;
                v_match_notes := 'Authoritative match via claimed Student Number verified against records';
            ELSE
                -- Conflict: Student number belongs to another identity
                v_status := 'REVIEW_REQUIRED';
                v_identity_confidence := 'AMBIGUOUS';
                v_review_reason := 'STUDENT_NUMBER_MISMATCH';
                v_match_notes := 'Submitted Student Number belongs to a different student profile in records';
            END IF;
        ELSE
            -- Student number not found
            v_status := 'REVIEW_REQUIRED';
            v_identity_confidence := 'AMBIGUOUS';
            v_review_reason := 'STUDENT_NUMBER_NOT_FOUND';
            v_match_notes := 'Claimed Student Number was not found in authoritative records';
        END IF;
    END IF;

    -- Signal 2 & 3: Email and Phone Match (if not already resolved by claimed student number)
    IF v_matched_student_id IS NULL AND v_status <> 'REVIEW_REQUIRED' THEN
        IF v_norm_email IS NOT NULL THEN
            SELECT * INTO v_email_matched_student
            FROM public.students
            WHERE tenant_id = v_tenant_id AND LOWER(email) = v_norm_email
            LIMIT 1;
        END IF;

        IF v_norm_phone IS NOT NULL THEN
            SELECT * INTO v_phone_matched_student
            FROM public.students
            WHERE tenant_id = v_tenant_id 
              AND REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') = REGEXP_REPLACE(v_norm_phone, '[^0-9]', '', 'g')
              AND LENGTH(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 8
            LIMIT 1;
        END IF;

        IF v_email_matched_student.id IS NOT NULL AND v_phone_matched_student.id IS NOT NULL THEN
            IF v_email_matched_student.id = v_phone_matched_student.id THEN
                -- Multi-signal convergence (Email + Phone match same student)
                v_matched_student_id := v_email_matched_student.id;
                v_identity_confidence := 'HIGH';
                v_status := 'MATCHED';
                v_match_notes := 'Definitive match via converging normalized email and phone';
            ELSE
                -- Signal conflict: Email matches Student A, Phone matches Student B
                v_status := 'REVIEW_REQUIRED';
                v_identity_confidence := 'AMBIGUOUS';
                v_review_reason := 'CONFLICTING_IDENTITY_SIGNALS';
                v_match_notes := 'Email matches student ' || v_email_matched_student.student_number || ' but phone matches ' || v_phone_matched_student.student_number;
            END IF;
        ELSIF v_email_matched_student.id IS NOT NULL THEN
            -- Check for strong name conflict on shared email
            IF LOWER(v_email_matched_student.last_name) <> LOWER(v_clean_last) AND 
               LOWER(v_email_matched_student.first_name) <> LOWER(v_clean_first) THEN
                v_status := 'REVIEW_REQUIRED';
                v_identity_confidence := 'AMBIGUOUS';
                v_review_reason := 'CONTACT_SHARED_NAME_CONFLICT';
                v_match_notes := 'Email matches ' || v_email_matched_student.student_number || ' but applicant name strongly differs';
            ELSE
                v_matched_student_id := v_email_matched_student.id;
                v_identity_confidence := 'HIGH';
                v_status := 'MATCHED';
                v_match_notes := 'Match via normalized email address';
            END IF;
        ELSIF v_phone_matched_student.id IS NOT NULL THEN
            -- Check for strong name conflict on shared phone
            IF LOWER(v_phone_matched_student.last_name) <> LOWER(v_clean_last) AND 
               LOWER(v_phone_matched_student.first_name) <> LOWER(v_clean_first) THEN
                v_status := 'REVIEW_REQUIRED';
                v_identity_confidence := 'AMBIGUOUS';
                v_review_reason := 'CONTACT_SHARED_NAME_CONFLICT';
                v_match_notes := 'Phone matches ' || v_phone_matched_student.student_number || ' but applicant name strongly differs';
            ELSE
                v_matched_student_id := v_phone_matched_student.id;
                v_identity_confidence := 'HIGH';
                v_status := 'MATCHED';
                v_match_notes := 'Match via normalized phone number';
            END IF;
        END IF;
    END IF;

    -- 8. Prepare Immutable Raw Snapshot
    v_raw_snapshot := jsonb_build_object(
        'first_name', v_clean_first,
        'last_name', v_clean_last,
        'email', v_norm_email,
        'phone', v_norm_phone,
        'date_of_birth', p_date_of_birth,
        'gender', p_gender,
        'marital_status', p_marital_status,
        'state_of_origin', p_state_of_origin,
        'nationality', p_nationality,
        'address', p_address,
        'programme_id', COALESCE(v_programme.id, p_programme_id),
        'expertise_level', p_expertise_level,
        'preferred_schedule', p_preferred_schedule,
        'preferred_start_date', p_preferred_start_date,
        'preferred_duration', p_preferred_duration,
        'delivery_mode', p_delivery_mode,
        'sponsor_type', p_sponsor_type,
        'sponsor_name', p_sponsor_name,
        'sponsor_phone', p_sponsor_phone,
        'sponsor_email', p_sponsor_email,
        'claimed_student_number', p_claimed_student_number,
        'employment_status', p_employment_status,
        'referral_source', p_referral_source,
        'notes', p_notes,
        'agreed_tuition_fee', p_agreed_tuition_fee,
        'consent_acknowledged', p_consent_acknowledged,
        'source', p_source,
        'source_submission_id', p_source_submission_id,
        'submitted_at', NOW()
    );

    -- 9. Atomic Numbering, Insertion & Audit with Concurrent Idempotency Conflict Guard
    BEGIN
        -- Generate next monotonic application number inside sub-transaction
        v_app_number := public.get_next_application_number(v_tenant_id);

        INSERT INTO public.crm_intake_applications (
            tenant_id,
            application_number,
            source,
            source_submission_id,
            status,
            first_name,
            last_name,
            email,
            phone,
            date_of_birth,
            gender,
            marital_status,
            state_of_origin,
            nationality,
            address,
            programme_id,
            expertise_level,
            preferred_schedule,
            preferred_start_date,
            preferred_duration,
            delivery_mode,
            sponsor_type,
            sponsor_name,
            sponsor_phone,
            sponsor_email,
            claimed_student_number,
            employment_status,
            referral_source,
            notes,
            agreed_tuition_fee,
            consent_acknowledged,
            matched_student_id,
            identity_confidence,
            match_notes,
            review_reason,
            applicant_data,
            submitted_at
        ) VALUES (
            v_tenant_id,
            v_app_number,
            p_source,
            TRIM(p_source_submission_id),
            v_status,
            v_clean_first,
            v_clean_last,
            v_norm_email,
            v_norm_phone,
            p_date_of_birth,
            p_gender,
            p_marital_status,
            p_state_of_origin,
            COALESCE(p_nationality, 'Nigerian'),
            p_address,
            v_programme.id,
            p_expertise_level,
            p_preferred_schedule,
            p_preferred_start_date,
            p_preferred_duration,
            COALESCE(p_delivery_mode, 'IN_PERSON'),
            COALESCE(p_sponsor_type, 'Self-sponsored'),
            p_sponsor_name,
            p_sponsor_phone,
            p_sponsor_email,
            p_claimed_student_number,
            p_employment_status,
            p_referral_source,
            p_notes,
            p_agreed_tuition_fee,
            p_consent_acknowledged,
            v_matched_student_id,
            v_identity_confidence,
            v_match_notes,
            v_review_reason,
            v_raw_snapshot,
            NOW()
        )
        RETURNING id INTO v_new_app_id;

        -- Authoritative Database-Level Audit Log on Creation (CSPRNG Identifier)
        INSERT INTO public.finance_audit_log (
            id,
            tenant_id,
            action,
            entity_type,
            entity_id,
            entity_name,
            new_state,
            reason,
            actor_id,
            actor_role,
            source,
            created_at
        ) VALUES (
            'aud_' || gen_random_uuid()::TEXT,
            v_tenant_id,
            'APPLICATION_CREATED',
            'crm_intake_applications',
            v_new_app_id::TEXT,
            v_app_number,
            jsonb_build_object(
                'application_number', v_app_number,
                'status', v_status,
                'source', p_source,
                'programme_id', v_programme.id,
                'identity_confidence', v_identity_confidence
            ),
            'Intake application registered via ' || p_source,
            auth.uid(),
            CASE WHEN auth.uid() IS NOT NULL THEN COALESCE(public.get_auth_user_role(), 'AUTHENTICATED') ELSE 'ANONYMOUS' END,
            'supabase_rpc',
            NOW()
        );

    EXCEPTION WHEN unique_violation THEN
        -- Sub-transaction rollback ensures application counter increment is cleanly rolled back
        SELECT * INTO v_existing_app 
        FROM public.crm_intake_applications
        WHERE tenant_id = v_tenant_id 
          AND source = p_source 
          AND source_submission_id = TRIM(p_source_submission_id);

        IF v_existing_app.id IS NOT NULL THEN
            IF v_is_staff THEN
                RETURN jsonb_build_object(
                    'success', true,
                    'is_replay', true,
                    'application_id', v_existing_app.id,
                    'application_number', v_existing_app.application_number,
                    'status', v_existing_app.status,
                    'identity_confidence', v_existing_app.identity_confidence,
                    'matched_student_id', v_existing_app.matched_student_id,
                    'programme_id', v_existing_app.programme_id,
                    'message', 'Application already received (concurrent idempotent replay)'
                );
            ELSE
                RETURN jsonb_build_object(
                    'success', true,
                    'is_replay', true,
                    'application_number', v_existing_app.application_number,
                    'status', 'RECEIVED',
                    'message', 'Application already received'
                );
            END IF;
        ELSE
            RAISE;
        END IF;
    END;

    -- Return Sanitized Response for Public / Detailed for Staff (Zero Oracle Leakage)
    IF v_is_staff THEN
        RETURN jsonb_build_object(
            'success', true,
            'application_id', v_new_app_id,
            'application_number', v_app_number,
            'status', v_status,
            'identity_confidence', v_identity_confidence,
            'matched_student_id', v_matched_student_id,
            'programme_id', v_programme.id,
            'message', 'Application successfully submitted and registered with Clasptek'
        );
    ELSE
        RETURN jsonb_build_object(
            'success', true,
            'application_number', v_app_number,
            'status', 'RECEIVED',
            'message', 'Application successfully submitted and registered with Clasptek'
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_applicant_intake(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_applicant_intake(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, TEXT
) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. TRANSACTIONAL GOVERNED CONVERSION FUNCTION (ACADEMIC GOVERNANCE)
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

        -- Insert Enrolment (Preserving Authoritative Enrolment Tuition & Capacity Integrity)
        INSERT INTO public.enrolments (
            id,
            tenant_id,
            student_id,
            programme_id,
            cohort_id,
            enrolment_number,
            enrolment_date,
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

REVOKE EXECUTE ON FUNCTION public.convert_intake_application(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_intake_application(UUID, JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.crm_intake_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_intake_counters ENABLE ROW LEVEL SECURITY;

-- Revoke direct table modifications from public/anon
REVOKE INSERT, UPDATE, DELETE ON public.crm_intake_applications FROM anon, public;
REVOKE INSERT, UPDATE, DELETE ON public.crm_intake_counters FROM anon, public;

-- Drop existing policies if rerun
DROP POLICY IF EXISTS intake_apps_select_admin_staff ON public.crm_intake_applications;
DROP POLICY IF EXISTS intake_apps_select_student ON public.crm_intake_applications;
DROP POLICY IF EXISTS intake_apps_modify_admin ON public.crm_intake_applications;

-- Policy 1: Admin/Staff can view all tenant applications
CREATE POLICY intake_apps_select_admin_staff ON public.crm_intake_applications
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id() AND
        (public.is_staff() OR public.is_super_admin() OR public.get_auth_user_role() IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'STAFF', 'admin', 'staff', 'super admin', 'TRAINING_ADMIN'))
    );

-- Policy 2: Student can only view their own linked application
CREATE POLICY intake_apps_select_student ON public.crm_intake_applications
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id() AND
        matched_student_id IN (
            SELECT id FROM public.students 
            WHERE user_id = auth.uid() AND tenant_id = public.crm_intake_applications.tenant_id
        )
    );

-- Policy 3: Admin/Training Staff can update applications within their tenant
CREATE POLICY intake_apps_modify_admin ON public.crm_intake_applications
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id() AND
        (public.is_super_admin() OR public.get_auth_user_role() IN ('SUPER_ADMIN', 'admin', 'TRAINING_ADMIN', 'STAFF'))
    )
    WITH CHECK (
        tenant_id = public.get_auth_tenant_id() AND
        (public.is_super_admin() OR public.get_auth_user_role() IN ('SUPER_ADMIN', 'admin', 'TRAINING_ADMIN', 'STAFF'))
    );

-- Schema Reload Notification for PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
