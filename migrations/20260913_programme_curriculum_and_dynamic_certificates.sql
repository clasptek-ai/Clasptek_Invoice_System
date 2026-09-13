-- =============================================================================
-- CLASPTEK ENTERPRISE PLATFORM MIGRATION
-- File: 20260913_programme_curriculum_and_dynamic_certificates.sql
-- Description: Authoritative Programme Curriculum (courses, programme_courses) &
--              Dynamic Certificate System (certificate_templates, programme_certificate_settings,
--              certificates snapshot extensions) with closed RLS perimeters.
-- Target Tenant: f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. COURSES / CURRICULUM MODULES TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    duration_hours NUMERIC(6,2) NOT NULL DEFAULT 10 CHECK (duration_hours >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_courses_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_courses_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_courses_tenant_status ON public.courses(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_courses_tenant_code ON public.courses(tenant_id, code);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courses_tenant_select" ON public.courses FOR SELECT TO authenticated
USING (tenant_id = public.get_auth_tenant_id());

CREATE POLICY "courses_staff_insert" ON public.courses FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_staff());

CREATE POLICY "courses_staff_update" ON public.courses FOR UPDATE TO authenticated
USING (tenant_id = public.get_auth_tenant_id() AND public.is_staff())
WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_staff());

CREATE POLICY "courses_admin_delete" ON public.courses FOR DELETE TO authenticated
USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 2. PROGRAMME-COURSE RELATIONSHIP TABLE (programme_courses)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.programme_courses (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    programme_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 1 CHECK (display_order > 0),
    is_required BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_programme_courses_unique UNIQUE (tenant_id, programme_id, course_id),
    CONSTRAINT fk_pc_tenant_programme FOREIGN KEY (tenant_id, programme_id)
        REFERENCES public.programmes(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_pc_tenant_course FOREIGN KEY (tenant_id, course_id)
        REFERENCES public.courses(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_programme_courses_tenant_programme ON public.programme_courses(tenant_id, programme_id);
CREATE INDEX IF NOT EXISTS idx_programme_courses_tenant_course ON public.programme_courses(tenant_id, course_id);
CREATE INDEX IF NOT EXISTS idx_programme_courses_order ON public.programme_courses(programme_id, display_order);

ALTER TABLE public.programme_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "programme_courses_tenant_select" ON public.programme_courses FOR SELECT TO authenticated
USING (tenant_id = public.get_auth_tenant_id());

CREATE POLICY "programme_courses_staff_insert" ON public.programme_courses FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_staff());

CREATE POLICY "programme_courses_staff_update" ON public.programme_courses FOR UPDATE TO authenticated
USING (tenant_id = public.get_auth_tenant_id() AND public.is_staff())
WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_staff());

CREATE POLICY "programme_courses_admin_delete" ON public.programme_courses FOR DELETE TO authenticated
USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 3. CERTIFICATE TEMPLATES TABLE (certificate_templates)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.certificate_templates (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT,
    version TEXT NOT NULL DEFAULT '1.0',
    template_type TEXT NOT NULL DEFAULT 'standard_completion',
    template_asset_url TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED')),
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cert_templates_tenant_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_cert_templates_tenant_status ON public.certificate_templates(tenant_id, status);

ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cert_templates_tenant_select" ON public.certificate_templates FOR SELECT TO authenticated
USING (tenant_id = public.get_auth_tenant_id());

CREATE POLICY "cert_templates_staff_insert" ON public.certificate_templates FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_staff());

CREATE POLICY "cert_templates_staff_update" ON public.certificate_templates FOR UPDATE TO authenticated
USING (tenant_id = public.get_auth_tenant_id() AND public.is_staff())
WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_staff());

CREATE POLICY "cert_templates_admin_delete" ON public.certificate_templates FOR DELETE TO authenticated
USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 4. PROGRAMME CERTIFICATE SETTINGS TABLE (programme_certificate_settings)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.programme_certificate_settings (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    programme_id TEXT NOT NULL,
    certificate_template_id TEXT NOT NULL,
    certificate_title TEXT NOT NULL DEFAULT 'Certificate of Completion',
    certificate_description TEXT NOT NULL,
    certificate_role TEXT NOT NULL,
    certificate_enabled BOOLEAN NOT NULL DEFAULT true,
    requires_admin_approval BOOLEAN NOT NULL DEFAULT true,
    completion_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_pcs_tenant_programme UNIQUE (tenant_id, programme_id),
    CONSTRAINT fk_pcs_tenant_programme FOREIGN KEY (tenant_id, programme_id)
        REFERENCES public.programmes(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_pcs_template FOREIGN KEY (certificate_template_id)
        REFERENCES public.certificate_templates(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_pcs_tenant_programme ON public.programme_certificate_settings(tenant_id, programme_id);

ALTER TABLE public.programme_certificate_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcs_tenant_select" ON public.programme_certificate_settings FOR SELECT TO authenticated
USING (tenant_id = public.get_auth_tenant_id());

CREATE POLICY "pcs_staff_insert" ON public.programme_certificate_settings FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_staff());

CREATE POLICY "pcs_staff_update" ON public.programme_certificate_settings FOR UPDATE TO authenticated
USING (tenant_id = public.get_auth_tenant_id() AND public.is_staff())
WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_staff());

CREATE POLICY "pcs_admin_delete" ON public.programme_certificate_settings FOR DELETE TO authenticated
USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 5. EXTEND CERTIFICATES TABLE WITH SNAPSHOT & METADATA COLUMNS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'certificates' AND column_name = 'certificate_title_snapshot') THEN
        ALTER TABLE public.certificates ADD COLUMN certificate_title_snapshot TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'certificates' AND column_name = 'certificate_description_snapshot') THEN
        ALTER TABLE public.certificates ADD COLUMN certificate_description_snapshot TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'certificates' AND column_name = 'certificate_role_snapshot') THEN
        ALTER TABLE public.certificates ADD COLUMN certificate_role_snapshot TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'certificates' AND column_name = 'certificate_template_id') THEN
        ALTER TABLE public.certificates ADD COLUMN certificate_template_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'certificates' AND column_name = 'template_version') THEN
        ALTER TABLE public.certificates ADD COLUMN template_version TEXT DEFAULT '1.0';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'certificates' AND column_name = 'verification_url') THEN
        ALTER TABLE public.certificates ADD COLUMN verification_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'certificates' AND column_name = 'pdf_url') THEN
        ALTER TABLE public.certificates ADD COLUMN pdf_url TEXT;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 6. AUTHORITATIVE SEEDING FOR EXISTING CYBERSECURITY PROGRAMME
-- -----------------------------------------------------------------------------
-- Default Certificate Template V1
INSERT INTO public.certificate_templates (
    id, tenant_id, name, description, version, template_type, status, is_default, created_at, updated_at
) VALUES (
    'tpl_clasptek_v1',
    'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
    'Clasptek Certificate of Completion V1',
    'Official Executive Vocational & Technical Certificate of Completion with ornate navy double border, Academy Director signature, and red embossed serrated rosette seal.',
    '1.0',
    'standard_completion',
    'ACTIVE',
    true,
    NOW(),
    NOW()
) ON CONFLICT (tenant_id, id) DO NOTHING;

-- Seed Curriculum Courses for existing Cybersecurity Programme (prog_1788900434260_uujj7)
INSERT INTO public.courses (id, tenant_id, code, name, description, duration_hours, status)
VALUES
    ('crs_cyb_101', 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6', 'CYB-101', 'Threat Detection & Incident Analysis', 'Log parsing, IOC tracking, telemetry analysis, and incident triage.', 10, 'active'),
    ('crs_cyb_102', 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6', 'CYB-102', 'Network Security & Perimeter Defense', 'Firewalls, IDS/IPS, network segmentation, and zero trust architecture.', 10, 'active'),
    ('crs_cyb_103', 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6', 'CYB-103', 'Risk Mitigation & Vulnerability Assessment', 'CVE assessment, risk matrices, patch prioritization, and compliance.', 10, 'active'),
    ('crs_cyb_104', 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6', 'CYB-104', 'Industry-Standard Security Tooling & SIEM Operations', 'Hands-on practice with Splunk, Wireshark, Nmap, and modern SIEM platforms.', 10, 'active')
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Connect Courses to Cybersecurity Programme (programme_courses)
INSERT INTO public.programme_courses (id, tenant_id, programme_id, course_id, display_order, is_required, status)
VALUES
    ('pc_cyb_101', 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6', 'prog_1788900434260_uujj7', 'crs_cyb_101', 1, true, 'active'),
    ('pc_cyb_102', 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6', 'prog_1788900434260_uujj7', 'crs_cyb_102', 2, true, 'active'),
    ('pc_cyb_103', 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6', 'prog_1788900434260_uujj7', 'crs_cyb_103', 3, true, 'active'),
    ('pc_cyb_104', 'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6', 'prog_1788900434260_uujj7', 'crs_cyb_104', 4, true, 'active')
ON CONFLICT (tenant_id, programme_id, course_id) DO NOTHING;

-- Seed Programme Certificate Settings for Cybersecurity (prog_1788900434260_uujj7)
INSERT INTO public.programme_certificate_settings (
    id, tenant_id, programme_id, certificate_template_id,
    certificate_title, certificate_description, certificate_role,
    certificate_enabled, requires_admin_approval, completion_requirements
) VALUES (
    'pcs_cyb_001',
    'f70d5788-b4ae-4425-a5d4-b7b7d0f01ff6',
    'prog_1788900434260_uujj7',
    'tpl_clasptek_v1',
    'Certificate of Completion',
    'Threat Detection, Network Security, Risk Mitigation, and use of industry-standard tools.',
    'CyberSecurity Professional',
    true,
    true,
    '["100% Curriculum Modules Completed", "Verified Practical Assessment Passed", "Minimum 80% Attendance Record", "Academic Directorate Sign-off"]'::jsonb
) ON CONFLICT (tenant_id, programme_id) DO UPDATE SET
    certificate_description = EXCLUDED.certificate_description,
    certificate_role = EXCLUDED.certificate_role,
    updated_at = NOW();

-- NOTE REGARDING OTHER PROGRAMMES (Data Analysis, Web Development, UI/UX):
-- As mandated by Rule 17, only confirmed existing programmes in PostgreSQL are seeded.
-- Non-existent programmes are reported as missing and must be registered via the authoritative
-- Programme Catalogue before certificate configurations can be bound to them.
