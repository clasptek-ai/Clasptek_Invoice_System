-- =============================================================================
-- PHASE 5.1: AUTHORITATIVE APPLICANT STATUS TRACKING RPC (ANTI-ENUMERATION)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.track_applicant_application(
    p_application_number TEXT,
    p_verification_credential TEXT,
    p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_norm_app_num TEXT;
    v_norm_cred TEXT;
    v_norm_phone_digits TEXT;
    v_app RECORD;
    v_programme_name TEXT := 'Vocational Training Programme';
    v_public_status TEXT;
    v_status_label TEXT;
    v_status_description TEXT;
    v_masked_name TEXT;
BEGIN
    -- 1. Fail closed on empty/null inputs
    IF p_application_number IS NULL OR TRIM(p_application_number) = '' OR
       p_verification_credential IS NULL OR TRIM(p_verification_credential) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Application could not be found or verified with the provided details. Please check your reference number and contact information.'
        );
    END IF;

    -- 2. Normalize inputs
    v_norm_app_num := UPPER(TRIM(p_application_number));
    v_norm_cred := LOWER(TRIM(p_verification_credential));
    v_norm_phone_digits := REGEXP_REPLACE(p_verification_credential, '[^0-9]', '', 'g');

    -- 3. Resolve tenant (Fail-closed)
    v_tenant_id := public.get_auth_tenant_id();
    IF v_tenant_id IS NULL THEN
        IF p_tenant_id IS NOT NULL AND p_tenant_id = '00000000-0000-0000-0000-000000000001'::UUID THEN
            v_tenant_id := p_tenant_id;
        ELSE
            SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at ASC LIMIT 1;
            IF v_tenant_id IS NULL THEN
                v_tenant_id := '00000000-0000-0000-0000-000000000001'::UUID;
            END IF;
        END IF;
    END IF;

    -- 4. Query application by application_number within tenant
    SELECT a.*, p.name AS resolved_programme_name
    INTO v_app
    FROM public.crm_intake_applications a
    LEFT JOIN public.programmes p ON a.programme_id = p.id
    WHERE a.tenant_id = v_tenant_id
      AND UPPER(a.application_number) = v_norm_app_num
    LIMIT 1;

    -- Anti-enumeration check: if not found, return generic error immediately
    IF v_app.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Application could not be found or verified with the provided details. Please check your reference number and contact information.'
        );
    END IF;

    -- 5. Verify credential: Email match OR Phone match
    -- Email match: exact case-insensitive match
    -- Phone match: compare stripped numeric digits (require at least 8 digits)
    IF NOT (
        (v_app.email IS NOT NULL AND LOWER(TRIM(v_app.email)) = v_norm_cred) OR
        (v_app.phone IS NOT NULL AND LENGTH(v_norm_phone_digits) >= 7 AND (
            REGEXP_REPLACE(v_app.phone, '[^0-9]', '', 'g') = v_norm_phone_digits OR
            REGEXP_REPLACE(v_app.phone, '[^0-9]', '', 'g') LIKE '%' || v_norm_phone_digits OR
            v_norm_phone_digits LIKE '%' || REGEXP_REPLACE(v_app.phone, '[^0-9]', '', 'g') OR
            (
                LENGTH(v_norm_phone_digits) >= 8 AND 
                LENGTH(REGEXP_REPLACE(v_app.phone, '[^0-9]', '', 'g')) >= 8 AND
                RIGHT(REGEXP_REPLACE(v_app.phone, '[^0-9]', '', 'g'), 8) = RIGHT(v_norm_phone_digits, 8)
            )
        ))
    ) THEN
        -- Anti-enumeration check: identical failure response if credential does not match
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Application could not be found or verified with the provided details. Please check your reference number and contact information.'
        );
    END IF;

    -- 6. Map Status to Public Terminology & Guidance
    IF v_app.status = 'NEW' THEN
        v_public_status := 'RECEIVED';
        v_status_label := 'Application Received';
        v_status_description := 'Your application has been received and registered in our admissions intake queue.';
    ELSIF v_app.status = 'REVIEW_REQUIRED' THEN
        v_public_status := 'UNDER_REVIEW';
        v_status_label := 'Under Admissions Review';
        v_status_description := 'Admissions is reviewing your application details and schedule availability.';
    ELSIF v_app.status = 'MATCHED' THEN
        v_public_status := 'UNDER_REVIEW';
        v_status_label := 'Application Under Review';
        v_status_description := 'Your applicant profile has been verified. Academic qualification review is in progress.';
    ELSIF v_app.status = 'QUALIFIED' THEN
        v_public_status := 'QUALIFIED';
        v_status_label := 'Application Approved / Qualified';
        v_status_description := 'Congratulations! Your application has been approved. Enrolment processing is underway.';
    ELSIF v_app.status = 'CONVERTED' THEN
        v_public_status := 'ENROLLED';
        v_status_label := 'Enrolment Confirmed / Enrolled';
        v_status_description := 'You are officially enrolled. Please check your email or contact admissions for schedule details.';
    ELSIF v_app.status = 'REJECTED' OR v_app.status = 'CANCELLED' THEN
        v_public_status := 'CLOSED';
        v_status_label := 'Application Closed';
        v_status_description := 'This application is closed. Please contact admissions if you have any questions.';
    ELSE
        v_public_status := 'RECEIVED';
        v_status_label := 'Application Received';
        v_status_description := 'Your application is currently being processed by Admissions.';
    END IF;

    -- 7. Mask candidate name (e.g., "Victor C.")
    IF v_app.last_name IS NOT NULL AND LENGTH(TRIM(v_app.last_name)) > 0 THEN
        v_masked_name := TRIM(v_app.first_name) || ' ' || SUBSTRING(TRIM(v_app.last_name) FROM 1 FOR 1) || '.';
    ELSE
        v_masked_name := TRIM(v_app.first_name);
    END IF;

    IF v_app.resolved_programme_name IS NOT NULL AND TRIM(v_app.resolved_programme_name) <> '' THEN
        v_programme_name := v_app.resolved_programme_name;
    END IF;

    -- 8. Return Sanitized Public Response (Strict Allow-List, Zero Leakage)
    RETURN jsonb_build_object(
        'success', true,
        'application', jsonb_build_object(
            'application_number', v_app.application_number,
            'candidate_name', v_masked_name,
            'programme_name', v_programme_name,
            'delivery_mode', COALESCE(v_app.delivery_mode, 'IN_PERSON'),
            'preferred_schedule', COALESCE(v_app.preferred_schedule, 'WEEKDAY'),
            'submitted_at', v_app.submitted_at,
            'preferred_start_date', v_app.preferred_start_date,
            'preferred_duration', v_app.preferred_duration,
            'status', v_public_status,
            'status_label', v_status_label,
            'status_description', v_status_description,
            'raw_status', v_app.status,
            'required_documents', jsonb_build_array(
                jsonb_build_object('name', 'Proof of Identity (Govt. ID / NIN / Voter Card)', 'status', 'REQUIRED'),
                jsonb_build_object('name', 'Educational Background / Prior Experience CV', 'status', 'REQUIRED'),
                jsonb_build_object('name', 'Passport Photograph (Recent White Background)', 'status', 'REQUIRED')
            ),
            'admissions_contact', jsonb_build_object(
                'email', 'admissions@clasptek.com',
                'phone', '+234 (0) 800 CLASPTEK',
                'office', 'Clasptek Vocational Training Admissions Office'
            )
        )
    );
END;
$$;

-- Secure grants
REVOKE EXECUTE ON FUNCTION public.track_applicant_application(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_applicant_application(TEXT, TEXT, UUID) TO anon, authenticated;
