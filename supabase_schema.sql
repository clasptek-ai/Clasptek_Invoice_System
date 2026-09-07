-- =============================================================================
-- CLASPTEK PORTAL & ENTERPRISE MANAGEMENT SYSTEM — PRODUCTION SUPABASE SCHEMA
-- Version: 13.0.1 (Production Hardened, Dependency-Safe, Multi-Tenant Architecture)
-- =============================================================================

-- =============================================================================
-- PHASE 1 — EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- PHASE 2 — CORE IDENTITY & TENANT TABLES
-- =============================================================================

-- 1. Tenants Table
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Profiles Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tenant Memberships Table (Authoritative Tenant & Role Mapping)
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'STAFF')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'invited')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

-- =============================================================================
-- PHASE 3 — MASTER DATA TABLES
-- =============================================================================

-- 4. Income Categories
CREATE TABLE IF NOT EXISTS public.income_categories (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Expense Categories
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    group_name TEXT NOT NULL,
    sub_category TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Programmes Table (Authoritative Educational Catalog)
CREATE TABLE IF NOT EXISTS public.programmes (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    duration_weeks INT NOT NULL DEFAULT 8 CHECK (duration_weeks > 0),
    session_count INT NOT NULL DEFAULT 16 CHECK (session_count > 0),
    tuition_fee NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tuition_fee >= 0),
    max_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (max_discount_pct BETWEEN 0 AND 100),
    allow_installments BOOLEAN NOT NULL DEFAULT true,
    installment_first_pct NUMERIC(5,2) NOT NULL DEFAULT 60 CHECK (installment_first_pct BETWEEN 0 AND 100),
    installment_second_pct NUMERIC(5,2) NOT NULL DEFAULT 40 CHECK (installment_second_pct BETWEEN 0 AND 100),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_programme_installments CHECK (NOT allow_installments OR (installment_first_pct + installment_second_pct = 100)),
    CONSTRAINT uq_programmes_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_programmes_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_programmes_tenant ON public.programmes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_programmes_status ON public.programmes(tenant_id, status);

-- 7. Finance Approval Settings
CREATE TABLE IF NOT EXISTS public.finance_approval_settings (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    threshold_amount NUMERIC(14,2) NOT NULL DEFAULT 500000 CHECK (threshold_amount >= 0),
    require_super_admin_threshold NUMERIC(14,2) NOT NULL DEFAULT 2000000 CHECK (require_super_admin_threshold >= threshold_amount),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id),
    UNIQUE(tenant_id)
);

-- 8. Financial Periods Table (Month-End Locking)
CREATE TABLE IF NOT EXISTS public.finance_periods (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    period TEXT NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES auth.users(id),
    locked_at TIMESTAMPTZ,
    locked_by UUID REFERENCES auth.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, period)
);

-- 9. Counters Table
CREATE TABLE IF NOT EXISTS public.finance_counters (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    invoice_seq INT NOT NULL DEFAULT 100,
    receipt_seq INT NOT NULL DEFAULT 100,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id)
);

-- 10. Budgets Table
CREATE TABLE IF NOT EXISTS public.budgets (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    period TEXT NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
    category_group TEXT NOT NULL,
    budget_amount NUMERIC(14,2) NOT NULL CHECK (budget_amount > 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(tenant_id, period, category_group)
);

-- =============================================================================
-- PHASE 4 — FINANCIAL TRANSACTION & LEDGER TABLES
-- =============================================================================

-- 11. Invoices Table
CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    invoice_no INT NOT NULL,
    invoice_display_no TEXT NOT NULL,
    programme_id TEXT NOT NULL REFERENCES public.programmes(id) ON DELETE RESTRICT,
    customer_id TEXT,
    student_name TEXT NOT NULL,
    student_email TEXT,
    student_phone TEXT,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    payment_plan TEXT NOT NULL CHECK (payment_plan IN ('full', 'installment')),
    installments_count INT NOT NULL DEFAULT 1,
    base_price NUMERIC(14,2) NOT NULL CHECK (base_price >= 0),
    discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
    income_category TEXT NOT NULL DEFAULT 'Student Tuition',
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid', 'voided', 'cancelled')),
    installment_details JSONB,
    source TEXT NOT NULL DEFAULT 'supabase_app',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, invoice_no),
    CONSTRAINT uq_invoices_tenant_id UNIQUE (tenant_id, id)
);

-- 12. Invoice Line Items Table
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    invoice_id TEXT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    item_description TEXT NOT NULL,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_total NUMERIC(14,2) NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    receipt_no INT NOT NULL,
    receipt_display_no TEXT NOT NULL,
    invoice_id TEXT NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Bank Transfer', 'POS', 'Card', 'Online Payment', 'Payment Gateway', 'Cash', 'Other')),
    reference TEXT,
    payment_date DATE NOT NULL,
    notes TEXT,
    reconciliation_status TEXT NOT NULL DEFAULT 'unreconciled' CHECK (reconciliation_status IN ('unreconciled', 'matched', 'reconciled')),
    source TEXT NOT NULL DEFAULT 'supabase_app',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(tenant_id, receipt_no)
);

-- 14. Receipts Table
CREATE TABLE IF NOT EXISTS public.receipts (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    receipt_no TEXT NOT NULL,
    invoice_id TEXT REFERENCES public.invoices(id) ON DELETE RESTRICT,
    payment_id TEXT REFERENCES public.payments(id) ON DELETE RESTRICT,
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    payment_date DATE NOT NULL,
    payer_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(tenant_id, receipt_no)
);

-- 15. Direct Income Table
CREATE TABLE IF NOT EXISTS public.direct_income (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    income_category TEXT NOT NULL,
    payer_name TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Bank Transfer', 'POS', 'Card', 'Online Payment', 'Payment Gateway', 'Cash', 'Other')),
    reference TEXT,
    income_date DATE NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'voided')),
    cancelled_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES auth.users(id),
    source TEXT NOT NULL DEFAULT 'supabase_app',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- 16. Expenses Table
CREATE TABLE IF NOT EXISTS public.expenses (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    category_group TEXT NOT NULL,
    sub_category TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL,
    description TEXT NOT NULL,
    beneficiary TEXT NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Bank Transfer', 'POS', 'Card', 'Online Payment', 'Payment Gateway', 'Cash', 'Other')),
    reference TEXT,
    programme_id TEXT REFERENCES public.programmes(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'pending_approval', 'approved', 'rejected', 'cancelled', 'voided')),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    cancelled_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES auth.users(id),
    source TEXT NOT NULL DEFAULT 'supabase_app',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- 17. Reconciliations Table
CREATE TABLE IF NOT EXISTS public.reconciliations (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    account_name TEXT NOT NULL,
    period TEXT NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    expected_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    actual_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    variance NUMERIC(14,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'reconciled', 'discrepancy')),
    reconciled_at TIMESTAMPTZ,
    reconciled_by UUID REFERENCES auth.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, account_name, period)
);

-- 18. Collection Notes Table
CREATE TABLE IF NOT EXISTS public.collection_notes (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    invoice_id TEXT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    promised_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- 19. Payment Reminders Table
CREATE TABLE IF NOT EXISTS public.payment_reminders (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    invoice_id TEXT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('Email', 'WhatsApp', 'SMS')),
    template_type TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_by UUID REFERENCES auth.users(id)
);

-- 20. Recurring Expenses Template
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    category_group TEXT NOT NULL,
    sub_category TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    beneficiary TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('Monthly', 'Quarterly', 'Annually')),
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- 21. Recurring Invoices Template
CREATE TABLE IF NOT EXISTS public.recurring_invoices (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    client_name TEXT NOT NULL,
    client_email TEXT,
    programme_id TEXT NOT NULL REFERENCES public.programmes(id) ON DELETE RESTRICT,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    frequency TEXT NOT NULL CHECK (frequency IN ('Monthly', 'Quarterly', 'Annually')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- 22. Immutable Financial Audit Log Table
CREATE TABLE IF NOT EXISTS public.finance_audit_log (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_name TEXT,
    old_state JSONB,
    new_state JSONB,
    reason TEXT,
    actor_id UUID REFERENCES auth.users(id),
    actor_role TEXT NOT NULL DEFAULT 'SYSTEM',
    source TEXT NOT NULL DEFAULT 'supabase_app',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- PHASE 5 — HR / PAYROLL / CRM TABLES
-- =============================================================================

-- 23. Personnel Directory (Staff & Facilitators)
CREATE TABLE IF NOT EXISTS public.personnel (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES auth.users(id),
    employee_id TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    employee_type TEXT NOT NULL CHECK (employee_type IN ('staff', 'facilitator')),
    department TEXT NOT NULL,
    job_title TEXT NOT NULL,
    employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active', 'on_leave', 'suspended', 'deactivated', 'terminated')),
    date_joined DATE,
    bank_name TEXT,
    account_name TEXT,
    account_number TEXT,
    compensation_type TEXT NOT NULL DEFAULT 'salaried' CHECK (compensation_type IN ('salaried', 'per_session', 'per_hour', 'per_class', 'per_programme', 'fixed_contract')),
    basic_pay NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (basic_pay >= 0),
    facilitator_rate NUMERIC(14,2) DEFAULT 0 CHECK (facilitator_rate >= 0),
    rate_type TEXT DEFAULT 'session',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, employee_id),
    CONSTRAINT uq_personnel_tenant_id UNIQUE (tenant_id, id)
);

-- 24. Payslips & Compensation Statements
CREATE TABLE IF NOT EXISTS public.payslips (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    payslip_no INT NOT NULL,
    payslip_display_no TEXT NOT NULL,
    personnel_id TEXT NOT NULL REFERENCES public.personnel(id) ON DELETE RESTRICT,
    employee_name TEXT NOT NULL,
    employee_type TEXT NOT NULL,
    department TEXT NOT NULL,
    role TEXT NOT NULL,
    pay_period TEXT NOT NULL CHECK (pay_period ~ '^\d{4}-\d{2}$'),
    pay_date DATE NOT NULL,
    basic_pay NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (basic_pay >= 0),
    allowances JSONB DEFAULT '[]'::JSONB,
    gross_pay NUMERIC(14,2) NOT NULL CHECK (gross_pay >= 0),
    deductions JSONB DEFAULT '[]'::JSONB,
    total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_deductions >= 0),
    net_pay NUMERIC(14,2) NOT NULL CHECK (net_pay >= 0),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'acknowledged', 'approved', 'paid', 'cancelled')),
    statement_version INT NOT NULL DEFAULT 1,
    payslip_hash TEXT,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    acknowledgement_method TEXT,
    acknowledgement_remarks TEXT,
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    paid_at TIMESTAMPTZ,
    paid_by TEXT,
    paid_amount NUMERIC(14,2),
    actual_payment_date DATE,
    payment_method TEXT,
    payment_reference TEXT,
    linked_expense_id TEXT,
    cancel_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by TEXT,
    queries JSONB DEFAULT '[]'::JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, payslip_no)
);

-- 25. Company Legal & Finance Settings
CREATE TABLE IF NOT EXISTS public.finance_settings (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    company_name TEXT NOT NULL DEFAULT 'Clasptek Coaching Limited',
    trading_name TEXT DEFAULT 'Clasptek',
    address TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    tax_id TEXT,
    registration_number TEXT,
    invoice_footer TEXT,
    default_terms TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id)
);

-- 26. Corporate Settlement Bank Accounts
CREATE TABLE IF NOT EXISTS public.payment_accounts (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    bank_name TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_type TEXT DEFAULT 'Corporate Current',
    currency TEXT NOT NULL DEFAULT 'NGN',
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, account_number)
);

-- 27. Admissions Enquiries (CRM Leads)
CREATE TABLE IF NOT EXISTS public.enquiries (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    student_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    programme_id TEXT REFERENCES public.programmes(id),
    source TEXT,
    status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'INTERESTED', 'APPLIED', 'OFFERED', 'ENROLLED', 'LOST')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_enquiries_tenant_id UNIQUE (tenant_id, id)
);

-- 28. Customer Registry
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    total_invoiced NUMERIC(14,2) DEFAULT 0,
    total_paid NUMERIC(14,2) DEFAULT 0,
    outstanding_balance NUMERIC(14,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customers_tenant_id UNIQUE (tenant_id, id)
);

-- 29. Authoritative Student Registry (Training Identity)
CREATE TABLE IF NOT EXISTS public.students (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    customer_id TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    student_number TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    gender TEXT,
    address TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'SUSPENDED', 'WITHDRAWN')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, student_number),
    UNIQUE(tenant_id, email),
    CONSTRAINT uq_students_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_students_customer_tenant FOREIGN KEY (tenant_id, customer_id)
        REFERENCES public.customers(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_students_tenant_status ON public.students(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_students_tenant_email ON public.students(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_students_customer_id ON public.students(customer_id);

-- 30. Cohorts Model (Programme Offerings & Capacity)
CREATE TABLE IF NOT EXISTS public.cohorts (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    programme_id TEXT NOT NULL,
    lead_facilitator_id TEXT,
    cohort_code TEXT NOT NULL,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    delivery_mode TEXT NOT NULL DEFAULT 'IN_PERSON' CHECK (delivery_mode IN ('IN_PERSON', 'ONLINE', 'HYBRID')),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK (status IN ('PLANNING', 'UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cohort_dates CHECK (end_date >= start_date),
    CONSTRAINT uq_cohorts_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_cohorts_tenant_code UNIQUE (tenant_id, cohort_code),
    CONSTRAINT uq_cohorts_tenant_prog UNIQUE (tenant_id, id, programme_id),
    CONSTRAINT fk_cohorts_programme_tenant FOREIGN KEY (tenant_id, programme_id)
        REFERENCES public.programmes(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_cohorts_facilitator_tenant FOREIGN KEY (tenant_id, lead_facilitator_id)
        REFERENCES public.personnel(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cohorts_tenant_status ON public.cohorts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cohorts_tenant_prog ON public.cohorts(tenant_id, programme_id);
CREATE INDEX IF NOT EXISTS idx_cohorts_tenant_dates ON public.cohorts(tenant_id, start_date, end_date);

-- 31. Authoritative Student Enrolments (Contractual Lifecycle)
CREATE TABLE IF NOT EXISTS public.enrolments (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    student_id TEXT NOT NULL,
    programme_id TEXT NOT NULL,
    cohort_id TEXT NOT NULL,
    invoice_id TEXT,
    customer_id TEXT,
    enquiry_id TEXT,
    enrolment_number TEXT NOT NULL,
    enrolment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    agreed_tuition_fee NUMERIC(14,2) NOT NULL CHECK (agreed_tuition_fee >= 0),
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'DEFERRED', 'WITHDRAWN', 'CANCELLED')),
    completion_date DATE,
    completion_status TEXT NOT NULL DEFAULT 'NOT_ELIGIBLE' CHECK (completion_status IN ('NOT_ELIGIBLE', 'ELIGIBLE', 'VERIFIED')),
    completion_verified_by UUID REFERENCES auth.users(id),
    completion_verified_at TIMESTAMPTZ,
    completion_notes TEXT,
    completion_attendance_pct NUMERIC(5,2) CHECK (completion_attendance_pct IS NULL OR (completion_attendance_pct >= 0 AND completion_attendance_pct <= 100)),
    certificate_issued BOOLEAN NOT NULL DEFAULT false,
    certificate_number TEXT,
    certificate_issued_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_enrolments_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_enrolments_tenant_number UNIQUE (tenant_id, enrolment_number),
    CONSTRAINT uq_enrolments_student_cohort UNIQUE (tenant_id, student_id, cohort_id),
    CONSTRAINT uq_enrolments_tenant_cohort UNIQUE (tenant_id, id, cohort_id),
    CONSTRAINT fk_enrolments_student_tenant FOREIGN KEY (tenant_id, student_id)
        REFERENCES public.students(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_enrolments_programme_tenant FOREIGN KEY (tenant_id, programme_id)
        REFERENCES public.programmes(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_enrolments_cohort_tenant FOREIGN KEY (tenant_id, cohort_id)
        REFERENCES public.cohorts(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_enrolments_cohort_prog_tenant FOREIGN KEY (tenant_id, cohort_id, programme_id)
        REFERENCES public.cohorts(tenant_id, id, programme_id) ON DELETE RESTRICT,
    CONSTRAINT fk_enrolments_invoice_tenant FOREIGN KEY (tenant_id, invoice_id)
        REFERENCES public.invoices(tenant_id, id) ON DELETE SET NULL,
    CONSTRAINT fk_enrolments_customer_tenant FOREIGN KEY (tenant_id, customer_id)
        REFERENCES public.customers(tenant_id, id) ON DELETE SET NULL,
    CONSTRAINT fk_enrolments_enquiry_tenant FOREIGN KEY (tenant_id, enquiry_id)
        REFERENCES public.enquiries(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_enrolments_tenant_status ON public.enrolments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_enrolments_tenant_student ON public.enrolments(tenant_id, student_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_tenant_cohort ON public.enrolments(tenant_id, cohort_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_tenant_programme ON public.enrolments(tenant_id, programme_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_invoice_id ON public.enrolments(invoice_id);

-- 32. Authoritative Cohort Training Sessions
CREATE TABLE IF NOT EXISTS public.training_sessions (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    cohort_id TEXT NOT NULL,
    facilitator_id TEXT NOT NULL,
    session_number INT NOT NULL CHECK (session_number > 0),
    session_title TEXT NOT NULL,
    session_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    delivery_mode TEXT NOT NULL DEFAULT 'IN_PERSON' CHECK (delivery_mode IN ('IN_PERSON', 'ONLINE', 'HYBRID')),
    location TEXT,
    status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED')),
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_training_sessions_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_training_sessions_tenant_number UNIQUE (tenant_id, cohort_id, session_number),
    CONSTRAINT uq_training_sessions_tenant_cohort UNIQUE (tenant_id, id, cohort_id),
    CONSTRAINT fk_training_sessions_tenant_cohort FOREIGN KEY (tenant_id, cohort_id)
        REFERENCES public.cohorts(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_training_sessions_tenant_facilitator FOREIGN KEY (tenant_id, facilitator_id)
        REFERENCES public.personnel(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_training_session_times CHECK (
        end_time IS NULL OR start_time IS NULL OR end_time > start_time
    )
);

CREATE INDEX IF NOT EXISTS idx_training_sessions_tenant_cohort ON public.training_sessions(tenant_id, cohort_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_tenant_facilitator ON public.training_sessions(tenant_id, facilitator_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_tenant_date ON public.training_sessions(tenant_id, session_date);
CREATE INDEX IF NOT EXISTS idx_training_sessions_tenant_status ON public.training_sessions(tenant_id, status);

-- 33. Authoritative Training Attendance (With Database-Enforced Cohort Match)
CREATE TABLE IF NOT EXISTS public.attendance (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    cohort_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    enrolment_id TEXT NOT NULL,
    attendance_status TEXT NOT NULL CHECK (attendance_status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
    check_in_at TIMESTAMPTZ,
    check_out_at TIMESTAMPTZ,
    facilitator_note TEXT,
    recorded_by UUID REFERENCES auth.users(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_attendance_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_attendance_session_enrolment UNIQUE (tenant_id, session_id, enrolment_id),
    CONSTRAINT fk_attendance_session_cohort FOREIGN KEY (tenant_id, session_id, cohort_id)
        REFERENCES public.training_sessions(tenant_id, id, cohort_id) ON DELETE RESTRICT,
    CONSTRAINT fk_attendance_enrolment_cohort FOREIGN KEY (tenant_id, enrolment_id, cohort_id)
        REFERENCES public.enrolments(tenant_id, id, cohort_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_attendance_tenant_cohort ON public.attendance(tenant_id, cohort_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_session ON public.attendance(tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_enrolment ON public.attendance(tenant_id, enrolment_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_status ON public.attendance(tenant_id, attendance_status);

-- 34. Authoritative Facilitator Training Delivery Reports
CREATE TABLE IF NOT EXISTS public.facilitator_reports (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    cohort_id TEXT NOT NULL,
    session_id TEXT,
    facilitator_id TEXT NOT NULL,
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    session_summary TEXT NOT NULL,
    topics_covered TEXT NOT NULL,
    attendance_observations TEXT,
    student_participation_notes TEXT,
    issues_encountered TEXT,
    follow_up_recommendations TEXT,
    status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'REVIEWED')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facilitator_reports_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_facilitator_reports_cohort FOREIGN KEY (tenant_id, cohort_id)
        REFERENCES public.cohorts(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_facilitator_reports_facilitator FOREIGN KEY (tenant_id, facilitator_id)
        REFERENCES public.personnel(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_facilitator_reports_session_cohort FOREIGN KEY (tenant_id, session_id, cohort_id)
        REFERENCES public.training_sessions(tenant_id, id, cohort_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_facilitator_reports_tenant_cohort ON public.facilitator_reports(tenant_id, cohort_id);
CREATE INDEX IF NOT EXISTS idx_facilitator_reports_tenant_facilitator ON public.facilitator_reports(tenant_id, facilitator_id);
CREATE INDEX IF NOT EXISTS idx_facilitator_reports_tenant_session ON public.facilitator_reports(tenant_id, session_id);

-- 35. Authoritative Certificates of Completion
CREATE TABLE IF NOT EXISTS public.certificates (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    student_id TEXT NOT NULL,
    enrolment_id TEXT NOT NULL,
    programme_id TEXT NOT NULL,
    cohort_id TEXT NOT NULL,
    certificate_number TEXT NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    completion_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('DRAFT', 'ISSUED', 'REVOKED')),
    issued_by UUID REFERENCES auth.users(id),
    verification_token TEXT NOT NULL,
    student_name_snapshot TEXT NOT NULL,
    programme_name_snapshot TEXT NOT NULL,
    programme_code_snapshot TEXT NOT NULL,
    cohort_name_snapshot TEXT NOT NULL,
    cohort_code_snapshot TEXT NOT NULL,
    attendance_pct_snapshot NUMERIC(5,2) CHECK (attendance_pct_snapshot IS NULL OR (attendance_pct_snapshot >= 0 AND attendance_pct_snapshot <= 100)),
    revocation_reason TEXT,
    revoked_by UUID REFERENCES auth.users(id),
    revoked_at TIMESTAMPTZ,
    reissued_from_certificate_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_certificates_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_certificates_tenant_number UNIQUE (tenant_id, certificate_number),
    CONSTRAINT uq_certificates_tenant_token UNIQUE (tenant_id, verification_token),
    CONSTRAINT fk_certificates_tenant_student FOREIGN KEY (tenant_id, student_id)
        REFERENCES public.students(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_certificates_tenant_enrolment FOREIGN KEY (tenant_id, enrolment_id)
        REFERENCES public.enrolments(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_certificates_tenant_programme FOREIGN KEY (tenant_id, programme_id)
        REFERENCES public.programmes(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_certificates_tenant_cohort FOREIGN KEY (tenant_id, cohort_id)
        REFERENCES public.cohorts(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_certificates_tenant_enrolment_cohort FOREIGN KEY (tenant_id, enrolment_id, cohort_id)
        REFERENCES public.enrolments(tenant_id, id, cohort_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_certificates_tenant_student ON public.certificates(tenant_id, student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_tenant_enrolment ON public.certificates(tenant_id, enrolment_id);
CREATE INDEX IF NOT EXISTS idx_certificates_tenant_cohort ON public.certificates(tenant_id, cohort_id);
CREATE INDEX IF NOT EXISTS idx_certificates_tenant_status ON public.certificates(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_certificates_verification_token ON public.certificates(verification_token);

-- Exactly one active ISSUED certificate per enrolment
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_certificate_per_enrolment
    ON public.certificates(tenant_id, enrolment_id)
    WHERE status = 'ISSUED';

-- =============================================================================
-- PHASE 6 — OPERATIONAL & ENGAGEMENT TABLES
-- =============================================================================

-- 30. Facilitator Operational Sessions Table
CREATE TABLE IF NOT EXISTS public.facilitator_sessions (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    facilitator_id TEXT NOT NULL REFERENCES public.personnel(id) ON DELETE RESTRICT,
    facilitator_name TEXT NOT NULL,
    programme_id TEXT REFERENCES public.programmes(id) ON DELETE RESTRICT,
    programme_name TEXT NOT NULL,
    session_date DATE NOT NULL,
    session_type TEXT NOT NULL DEFAULT 'Classroom Lecture',
    sessions_count NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (sessions_count > 0),
    rate_per_session NUMERIC(14,2) NOT NULL CHECK (rate_per_session >= 0),
    total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
    topic TEXT,
    status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'included_in_payslip')),
    payroll_period TEXT CHECK (payroll_period ~ '^\d{4}-\d{2}$'),
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    payslip_id TEXT REFERENCES public.payslips(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 31. Customer Dynamic Activity Timeline Table
CREATE TABLE IF NOT EXISTS public.customer_timeline (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    enquiry_id TEXT REFERENCES public.enquiries(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    contact_method TEXT,
    outcome TEXT,
    next_action TEXT,
    next_follow_up_date DATE,
    reference_id TEXT,
    actor_name TEXT NOT NULL DEFAULT 'System',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- PHASE 7 — CONTROL, INTELLIGENCE & RECONCILIATION TABLES
-- =============================================================================

-- 32. Schema Version Tracking
CREATE TABLE IF NOT EXISTS public.schema_versions (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    description TEXT NOT NULL,
    compatible BOOLEAN NOT NULL DEFAULT TRUE
);

-- 33. Database-Level Idempotency Keys Table (Tenant-Scoped)
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_idempotency_tenant_key UNIQUE (tenant_id, idempotency_key)
);

-- 34. Management Attention & Alert Dispatcher Table
CREATE TABLE IF NOT EXISTS public.management_alerts (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    domain TEXT NOT NULL CHECK (domain IN ('finance', 'crm', 'hr', 'security', 'operations')),
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'informational')),
    title TEXT NOT NULL,
    description TEXT,
    record_type TEXT NOT NULL,
    record_id TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
    assigned_role TEXT NOT NULL DEFAULT 'Super Admin',
    action_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT
);

-- 35. CRM Pipeline Stage Transition History
CREATE TABLE IF NOT EXISTS public.crm_stage_history (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    enquiry_id TEXT NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
    from_stage TEXT NOT NULL,
    to_stage TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 36. Bank Reconciliation Control Table
CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    payment_account_id TEXT NOT NULL REFERENCES public.payment_accounts(id) ON DELETE RESTRICT,
    reconciliation_period TEXT NOT NULL CHECK (reconciliation_period ~ '^\d{4}-\d{2}$'),
    book_balance NUMERIC NOT NULL DEFAULT 0,
    statement_balance NUMERIC NOT NULL DEFAULT 0,
    uncleared_inflows NUMERIC NOT NULL DEFAULT 0,
    uncleared_outflows NUMERIC NOT NULL DEFAULT 0,
    difference NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'UNRECONCILED' CHECK (status IN ('UNRECONCILED', 'RECONCILED', 'EXCEPTION')),
    reconciled_by TEXT,
    reconciled_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 37. Bank Reconciliation Line Items
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_items (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    reconciliation_id TEXT NOT NULL REFERENCES public.bank_reconciliations(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('payment_inflow', 'expense_outflow', 'adjustment')),
    transaction_id TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    cleared BOOLEAN NOT NULL DEFAULT FALSE,
    cleared_at TIMESTAMPTZ
);

-- 38. Expense Lifecycle Status Transition History
CREATE TABLE IF NOT EXISTS public.expense_status_history (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    expense_id TEXT NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 39. Financial Reversals and Adjustments Table
CREATE TABLE IF NOT EXISTS public.financial_adjustments (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    original_table TEXT NOT NULL,
    original_record_id TEXT NOT NULL,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('REVERSAL', 'CREDIT_NOTE', 'DEBIT_NOTE', 'REALLOCATION', 'WRITE_OFF')),
    amount NUMERIC NOT NULL,
    reason TEXT NOT NULL,
    financial_period TEXT NOT NULL CHECK (financial_period ~ '^\d{4}-\d{2}$'),
    authorized_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 40. Financial Budgets (Annual/Quarterly Envelopes by Department)
CREATE TABLE IF NOT EXISTS public.financial_budgets (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    financial_year TEXT NOT NULL,
    period_type TEXT NOT NULL CHECK (period_type IN ('annual', 'quarterly', 'monthly')),
    period_key TEXT NOT NULL,
    department TEXT NOT NULL,
    total_budget_amount NUMERIC NOT NULL DEFAULT 0,
    allocated_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 41. Budget Lines
CREATE TABLE IF NOT EXISTS public.budget_lines (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    budget_id TEXT NOT NULL REFERENCES public.financial_budgets(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    sub_category TEXT,
    month_key TEXT NOT NULL CHECK (month_key ~ '^\d{4}-\d{2}$'),
    budget_amount NUMERIC NOT NULL DEFAULT 0,
    actual_amount NUMERIC NOT NULL DEFAULT 0,
    variance NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 42. Management Metrics (Historical Executive KPIs)
CREATE TABLE IF NOT EXISTS public.management_metrics (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    metric_period TEXT NOT NULL,
    period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'annual', 'custom')),
    total_revenue NUMERIC NOT NULL DEFAULT 0,
    revenue_collected NUMERIC NOT NULL DEFAULT 0,
    operating_expenses NUMERIC NOT NULL DEFAULT 0,
    payroll_costs NUMERIC NOT NULL DEFAULT 0,
    net_position NUMERIC NOT NULL DEFAULT 0,
    collection_rate_pct NUMERIC NOT NULL DEFAULT 0,
    operating_margin_pct NUMERIC NOT NULL DEFAULT 0,
    payroll_ratio_pct NUMERIC NOT NULL DEFAULT 0,
    snapshot_data JSONB,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 43. Cash Flow Forecasts (Runway Projections)
CREATE TABLE IF NOT EXISTS public.cash_flow_forecasts (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    forecast_date DATE NOT NULL,
    horizon_days INTEGER NOT NULL CHECK (horizon_days IN (7, 30, 60, 90)),
    opening_cash NUMERIC NOT NULL DEFAULT 0,
    expected_inflows NUMERIC NOT NULL DEFAULT 0,
    expected_outflows NUMERIC NOT NULL DEFAULT 0,
    forecast_closing_cash NUMERIC NOT NULL DEFAULT 0,
    runway_status TEXT NOT NULL DEFAULT 'HEALTHY' CHECK (runway_status IN ('HEALTHY', 'TIGHT', 'CRITICAL')),
    forecast_breakdown JSONB,
    generated_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 44. Customer Revenue Segments
CREATE TABLE IF NOT EXISTS public.customer_segments (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    segment TEXT NOT NULL CHECK (segment IN ('VIP', 'High Value', 'Regular', 'New', 'At Risk', 'Delinquent', 'Fully Paid')),
    lifetime_value NUMERIC NOT NULL DEFAULT 0,
    outstanding_balance NUMERIC NOT NULL DEFAULT 0,
    payment_reliability_score INTEGER NOT NULL DEFAULT 100,
    days_overdue INTEGER NOT NULL DEFAULT 0,
    last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 45. Collection Follow-up Actions Log
CREATE TABLE IF NOT EXISTS public.collection_actions (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    invoice_id TEXT REFERENCES public.invoices(id) ON DELETE SET NULL,
    priority TEXT NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    action_type TEXT NOT NULL CHECK (action_type IN ('WhatsApp', 'Email', 'Phone Call', 'Escalation', 'Payment Plan Discussion', 'In-Person')),
    action_notes TEXT NOT NULL,
    promised_payment_date DATE,
    actor_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 46. Configurable Financial Approval Thresholds
CREATE TABLE IF NOT EXISTS public.approval_thresholds (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    tier_level INTEGER NOT NULL CHECK (tier_level IN (1, 2, 3)),
    min_amount NUMERIC NOT NULL DEFAULT 0,
    max_amount NUMERIC,
    authorized_role TEXT NOT NULL,
    requires_dual_approval BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 47. Executive Management Recommendations
CREATE TABLE IF NOT EXISTS public.management_recommendations (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    domain TEXT NOT NULL CHECK (domain IN ('receivables', 'programmes', 'budget', 'cashflow', 'payroll', 'crm', 'operations')),
    priority TEXT NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    finding TEXT NOT NULL,
    evidence TEXT NOT NULL,
    financial_impact NUMERIC NOT NULL DEFAULT 0,
    recommended_action TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISMISSED', 'IMPLEMENTED')),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 48. Management Report Snapshots
CREATE TABLE IF NOT EXISTS public.report_snapshots (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    report_type TEXT NOT NULL,
    report_title TEXT NOT NULL,
    financial_period TEXT NOT NULL,
    generated_by TEXT NOT NULL,
    summary_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 49. System Diagnostics & Persistence Probes
CREATE TABLE IF NOT EXISTS public.system_diagnostics (
    id TEXT PRIMARY KEY,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    probe_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);

-- 50. Production Data Migration & Reconciliation Audit Log
CREATE TABLE IF NOT EXISTS public.production_migration_runs (
    id TEXT PRIMARY KEY,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    migration_type TEXT NOT NULL DEFAULT 'LEGACY_LOCALSTORAGE_TO_POSTGRES',
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    total_detected INTEGER NOT NULL DEFAULT 0,
    total_migrated INTEGER NOT NULL DEFAULT 0,
    total_existing INTEGER NOT NULL DEFAULT 0,
    total_failed INTEGER NOT NULL DEFAULT 0,
    entity_breakdown JSONB DEFAULT '{}'::jsonb,
    reconciliation_summary JSONB DEFAULT '{}'::jsonb,
    initiated_by TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 51. Transaction Recovery Queue
CREATE TABLE IF NOT EXISTS public.transaction_recovery_queue (
    id TEXT PRIMARY KEY,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_name TEXT NOT NULL,
    attempted_operation TEXT NOT NULL,
    failure_reason TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    retry_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    resolution_notes TEXT,
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_recovery_queue_tenant_idemp UNIQUE (tenant_id, idempotency_key)
);

-- 52. Production Continuous Reconciliation Runs
CREATE TABLE IF NOT EXISTS public.production_reconciliation_runs (
    id TEXT PRIMARY KEY,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    run_type TEXT NOT NULL DEFAULT 'CONTINUOUS',
    status TEXT NOT NULL DEFAULT 'SUCCESS',
    total_entities_checked INTEGER NOT NULL DEFAULT 0,
    discrepancy_count INTEGER NOT NULL DEFAULT 0,
    summary_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    initiated_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 53. Production Reconciliation Exceptions
CREATE TABLE IF NOT EXISTS public.production_reconciliation_exceptions (
    id TEXT PRIMARY KEY,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    run_id TEXT REFERENCES public.production_reconciliation_runs(id) ON DELETE CASCADE,
    exception_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    severity TEXT NOT NULL DEFAULT 'MATERIAL',
    description TEXT NOT NULL,
    discrepancy_data JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'OPEN',
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 54. Month-End Closures Workflow Engine
CREATE TABLE IF NOT EXISTS public.month_end_closures (
    id TEXT PRIMARY KEY,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    period_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    reconciliation_run_id TEXT REFERENCES public.production_reconciliation_runs(id) ON DELETE SET NULL,
    closing_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_revenue NUMERIC(15,2) DEFAULT 0,
    total_expenses NUMERIC(15,2) DEFAULT 0,
    net_position NUMERIC(15,2) DEFAULT 0,
    closed_by TEXT,
    closed_at TIMESTAMPTZ,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_month_end_closures_period UNIQUE (tenant_id, period_key)
);

-- 55. Financial Control Checks & Ledger Invariant Tracking
CREATE TABLE IF NOT EXISTS public.financial_control_checks (
    id TEXT PRIMARY KEY,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    check_type TEXT NOT NULL,
    check_period TEXT NOT NULL,
    expected_value NUMERIC(15,2) NOT NULL,
    actual_value NUMERIC(15,2) NOT NULL,
    variance NUMERIC(15,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'BALANCED',
    details JSONB DEFAULT '{}'::jsonb,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- PHASE 8 — SECURITY HELPER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id 
    FROM public.tenant_memberships 
    WHERE user_id = auth.uid() 
      AND status = 'active'
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role 
    FROM public.tenant_memberships 
    WHERE user_id = auth.uid() 
      AND status = 'active'
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (public.get_auth_user_role() = 'SUPER_ADMIN');
$$;

CREATE OR REPLACE FUNCTION public.is_finance_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (public.get_auth_user_role() IN ('SUPER_ADMIN', 'FINANCE_MANAGER'));
$$;

CREATE OR REPLACE FUNCTION public.is_finance_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (public.get_auth_user_role() IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF'));
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (public.get_auth_user_role() IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_finance()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (public.get_auth_user_role() IN ('SUPER_ADMIN', 'FINANCE_MANAGER'));
$$;

CREATE OR REPLACE FUNCTION public.can_manage_people()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (public.get_auth_user_role() IN ('SUPER_ADMIN', 'FINANCE_MANAGER'));
$$;

-- Personnel & Payroll Dependent Security Helpers (Now created after public.personnel & public.payslips)
CREATE OR REPLACE FUNCTION public.is_facilitator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.personnel
        WHERE user_id = auth.uid()
          AND employee_type = 'facilitator'
          AND employment_status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_view_own_personnel_record(p_personnel_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (
        public.can_manage_people()
        OR EXISTS (
            SELECT 1 FROM public.personnel 
            WHERE id = p_personnel_id 
              AND user_id = auth.uid()
              AND tenant_id = public.get_auth_tenant_id()
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_view_own_payslip(p_payslip_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (
        public.can_manage_finance()
        OR EXISTS (
            SELECT 1 FROM public.payslips p
            JOIN public.personnel per ON p.personnel_id = per.id
            WHERE p.id = p_payslip_id 
              AND p.tenant_id = public.get_auth_tenant_id()
              AND per.user_id = auth.uid()
        )
    );
$$;

-- =============================================================================
-- PHASE 9 — AUDIT & PERIOD CONTROL FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_audit_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY VIOLATION: The financial audit log is strictly immutable and append-only. UPDATE and DELETE operations are prohibited.';
END;
$$;

CREATE OR REPLACE FUNCTION public.check_financial_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_tenant_id UUID;
    v_tx_date DATE;
    v_period TEXT;
    v_period_status TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_tenant_id := OLD.tenant_id;
        IF TG_TABLE_NAME = 'invoices' THEN v_tx_date := OLD.invoice_date;
        ELSIF TG_TABLE_NAME = 'payments' THEN v_tx_date := OLD.payment_date;
        ELSIF TG_TABLE_NAME = 'expenses' THEN v_tx_date := OLD.expense_date;
        ELSIF TG_TABLE_NAME = 'direct_income' THEN v_tx_date := OLD.income_date;
        ELSIF TG_TABLE_NAME = 'payslips' THEN v_period := OLD.pay_period;
        ELSIF TG_TABLE_NAME = 'facilitator_sessions' THEN 
            v_period := COALESCE(OLD.payroll_period, TO_CHAR(OLD.session_date, 'YYYY-MM'));
        ELSIF TG_TABLE_NAME = 'financial_adjustments' THEN v_period := OLD.financial_period;
        ELSIF TG_TABLE_NAME = 'reconciliations' THEN v_period := OLD.period;
        ELSIF TG_TABLE_NAME = 'bank_reconciliations' THEN v_period := OLD.reconciliation_period;
        ELSE v_tx_date := CURRENT_DATE;
        END IF;
    ELSE
        v_tenant_id := NEW.tenant_id;
        IF TG_TABLE_NAME = 'invoices' THEN v_tx_date := NEW.invoice_date;
        ELSIF TG_TABLE_NAME = 'payments' THEN v_tx_date := NEW.payment_date;
        ELSIF TG_TABLE_NAME = 'expenses' THEN v_tx_date := NEW.expense_date;
        ELSIF TG_TABLE_NAME = 'direct_income' THEN v_tx_date := NEW.income_date;
        ELSIF TG_TABLE_NAME = 'payslips' THEN v_period := NEW.pay_period;
        ELSIF TG_TABLE_NAME = 'facilitator_sessions' THEN 
            v_period := COALESCE(NEW.payroll_period, TO_CHAR(NEW.session_date, 'YYYY-MM'));
        ELSIF TG_TABLE_NAME = 'financial_adjustments' THEN v_period := NEW.financial_period;
        ELSIF TG_TABLE_NAME = 'reconciliations' THEN v_period := NEW.period;
        ELSIF TG_TABLE_NAME = 'bank_reconciliations' THEN v_period := NEW.reconciliation_period;
        ELSE v_tx_date := CURRENT_DATE;
        END IF;
    END IF;

    IF v_period IS NULL AND v_tx_date IS NOT NULL THEN
        v_period := TO_CHAR(v_tx_date, 'YYYY-MM');
    END IF;

    IF v_period IS NOT NULL THEN
        SELECT status INTO v_period_status
        FROM public.finance_periods
        WHERE tenant_id = v_tenant_id AND period = v_period;

        IF v_period_status = 'locked' THEN
            RAISE EXCEPTION 'PERIOD LOCK VIOLATION: Financial period % is LOCKED. Direct mutations on % are prohibited.', v_period, TG_TABLE_NAME;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- =============================================================================
-- PHASE 10 — ALL FINANCIAL PERIOD LOCKING TRIGGERS
-- =============================================================================

DROP TRIGGER IF EXISTS trg_audit_immutability ON public.finance_audit_log;
CREATE TRIGGER trg_audit_immutability
BEFORE UPDATE OR DELETE ON public.finance_audit_log
FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_immutability();

DROP TRIGGER IF EXISTS trg_period_lock_invoices ON public.invoices;
CREATE TRIGGER trg_period_lock_invoices
BEFORE INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.check_financial_period_lock();

DROP TRIGGER IF EXISTS trg_period_lock_payments ON public.payments;
CREATE TRIGGER trg_period_lock_payments
BEFORE INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.check_financial_period_lock();

DROP TRIGGER IF EXISTS trg_period_lock_expenses ON public.expenses;
CREATE TRIGGER trg_period_lock_expenses
BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.check_financial_period_lock();

DROP TRIGGER IF EXISTS trg_period_lock_direct_income ON public.direct_income;
CREATE TRIGGER trg_period_lock_direct_income
BEFORE INSERT OR UPDATE OR DELETE ON public.direct_income
FOR EACH ROW EXECUTE FUNCTION public.check_financial_period_lock();

DROP TRIGGER IF EXISTS trg_period_lock_payslips ON public.payslips;
CREATE TRIGGER trg_period_lock_payslips
BEFORE INSERT OR UPDATE OR DELETE ON public.payslips
FOR EACH ROW EXECUTE FUNCTION public.check_financial_period_lock();

DROP TRIGGER IF EXISTS trg_period_lock_facilitator_sessions ON public.facilitator_sessions;
CREATE TRIGGER trg_period_lock_facilitator_sessions
BEFORE INSERT OR UPDATE OR DELETE ON public.facilitator_sessions
FOR EACH ROW EXECUTE FUNCTION public.check_financial_period_lock();

DROP TRIGGER IF EXISTS trg_period_lock_adjustments ON public.financial_adjustments;
CREATE TRIGGER trg_period_lock_adjustments
BEFORE INSERT OR UPDATE OR DELETE ON public.financial_adjustments
FOR EACH ROW EXECUTE FUNCTION public.check_financial_period_lock();

DROP TRIGGER IF EXISTS trg_period_lock_reconciliations ON public.reconciliations;
CREATE TRIGGER trg_period_lock_reconciliations
BEFORE INSERT OR UPDATE OR DELETE ON public.reconciliations
FOR EACH ROW EXECUTE FUNCTION public.check_financial_period_lock();

DROP TRIGGER IF EXISTS trg_period_lock_bank_reconciliations ON public.bank_reconciliations;
CREATE TRIGGER trg_period_lock_bank_reconciliations
BEFORE INSERT OR UPDATE OR DELETE ON public.bank_reconciliations
FOR EACH ROW EXECUTE FUNCTION public.check_financial_period_lock();

-- Cohort Capacity Concurrency Lock Enforcement
CREATE OR REPLACE FUNCTION public.check_cohort_capacity_before_enrolment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capacity INTEGER;
    v_enrolled_count INTEGER;
BEGIN
    -- Only enforce on active, confirmed, or completed enrolments
    IF NEW.status IN ('PENDING_PAYMENT', 'CONFIRMED', 'ACTIVE', 'COMPLETED') THEN
        -- Pessimistic row lock on the cohort to prevent race conditions
        SELECT capacity INTO v_capacity
        FROM public.cohorts
        WHERE tenant_id = NEW.tenant_id AND id = NEW.cohort_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'COHORT NOT FOUND: Cohort % does not exist in this tenant.', NEW.cohort_id;
        END IF;

        -- Count existing active enrolments in this cohort
        SELECT COUNT(*) INTO v_enrolled_count
        FROM public.enrolments
        WHERE tenant_id = NEW.tenant_id 
          AND cohort_id = NEW.cohort_id
          AND status IN ('PENDING_PAYMENT', 'CONFIRMED', 'ACTIVE', 'COMPLETED')
          AND id != COALESCE(NEW.id, '___NEW___');

        IF v_enrolled_count >= v_capacity THEN
            RAISE EXCEPTION 'COHORT CAPACITY EXCEEDED: Cohort % is at capacity (%/%). Enrolment rejected.',
                NEW.cohort_id, v_enrolled_count, v_capacity;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Revoke direct RPC execution on trigger function
REVOKE ALL ON FUNCTION public.check_cohort_capacity_before_enrolment() FROM PUBLIC, authenticated, anon;

DROP TRIGGER IF EXISTS trg_check_cohort_capacity ON public.enrolments;
CREATE TRIGGER trg_check_cohort_capacity
BEFORE INSERT OR UPDATE OF cohort_id, status ON public.enrolments
FOR EACH ROW
EXECUTE FUNCTION public.check_cohort_capacity_before_enrolment();

-- 3. Prevent attendance on cancelled training sessions
CREATE OR REPLACE FUNCTION public.check_session_status_before_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_status TEXT;
BEGIN
    SELECT status INTO v_session_status
    FROM public.training_sessions
    WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id;

    IF v_session_status IS NULL THEN
        RAISE EXCEPTION 'TRAINING_SESSION_NOT_FOUND: Referenced training session does not exist';
    END IF;

    IF v_session_status = 'CANCELLED' THEN
        RAISE EXCEPTION 'INVALID_OPERATION: Cannot record attendance against a cancelled training session';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_session_status_before_attendance() FROM PUBLIC, authenticated, anon;

DROP TRIGGER IF EXISTS trg_check_session_status_before_attendance ON public.attendance;
CREATE TRIGGER trg_check_session_status_before_attendance
BEFORE INSERT OR UPDATE OF session_id, attendance_status ON public.attendance
FOR EACH ROW
EXECUTE FUNCTION public.check_session_status_before_attendance();

-- 4. Validate completion verifier tenant membership and role
CREATE OR REPLACE FUNCTION public.validate_completion_verifier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_is_authorized BOOLEAN;
BEGIN
    IF (NEW.completion_status = 'VERIFIED' AND (OLD.completion_status IS DISTINCT FROM 'VERIFIED' OR OLD.completion_verified_by IS DISTINCT FROM NEW.completion_verified_by)) THEN
        v_user_id := auth.uid();

        IF v_user_id IS NOT NULL THEN
            IF public.is_super_admin() OR public.is_staff() THEN
                v_is_authorized := TRUE;
            ELSE
                SELECT EXISTS (
                    SELECT 1 FROM public.cohorts c
                    JOIN public.personnel p ON p.id = c.lead_facilitator_id
                    WHERE c.tenant_id = NEW.tenant_id 
                      AND c.id = NEW.cohort_id 
                      AND p.user_id = v_user_id
                      AND p.tenant_id = NEW.tenant_id
                ) INTO v_is_authorized;
            END IF;

            IF NOT COALESCE(v_is_authorized, FALSE) THEN
                RAISE EXCEPTION 'UNAUTHORIZED: Only an authorized Administrator or the assigned Cohort Lead Facilitator can verify training completion';
            END IF;

            NEW.completion_verified_by := v_user_id;
        END IF;

        IF NEW.completion_verified_at IS NULL THEN
            NEW.completion_verified_at := NOW();
        END IF;
        IF NEW.completion_date IS NULL THEN
            NEW.completion_date := CURRENT_DATE;
        END IF;
        NEW.status := 'COMPLETED';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_completion_verifier() FROM PUBLIC, authenticated, anon;

DROP TRIGGER IF EXISTS trg_validate_completion_verifier ON public.enrolments;
CREATE TRIGGER trg_validate_completion_verifier
BEFORE UPDATE OF completion_status, completion_verified_by ON public.enrolments
FOR EACH ROW
EXECUTE FUNCTION public.validate_completion_verifier();

-- 5. Validate certificate eligibility before issuance
CREATE OR REPLACE FUNCTION public.validate_certificate_eligibility_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_enrolment RECORD;
    v_active_exists BOOLEAN;
BEGIN
    -- 1. Fetch referenced authoritative enrolment
    SELECT * INTO v_enrolment
    FROM public.enrolments
    WHERE id = NEW.enrolment_id AND tenant_id = NEW.tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ENROLMENT_NOT_FOUND: Referenced enrolment % does not exist in tenant %', NEW.enrolment_id, NEW.tenant_id;
    END IF;

    -- 2. Verify completion requirement
    IF v_enrolment.status != 'COMPLETED' OR v_enrolment.completion_status != 'VERIFIED' THEN
        RAISE EXCEPTION 'INELIGIBLE_CERTIFICATE_ISSUANCE: Cannot issue certificate for enrolment that is not completed and verified (status: %, completion_status: %)', v_enrolment.status, v_enrolment.completion_status;
    END IF;

    -- 3. Verify integrity of student, programme, and cohort
    IF NEW.student_id != v_enrolment.student_id THEN
        RAISE EXCEPTION 'STUDENT_MISMATCH: Certificate student % does not match enrolment student %', NEW.student_id, v_enrolment.student_id;
    END IF;

    IF NEW.programme_id != v_enrolment.programme_id THEN
        RAISE EXCEPTION 'PROGRAMME_MISMATCH: Certificate programme % does not match enrolment programme %', NEW.programme_id, v_enrolment.programme_id;
    END IF;

    IF NEW.cohort_id != v_enrolment.cohort_id THEN
        RAISE EXCEPTION 'COHORT_MISMATCH: Certificate cohort % does not match enrolment cohort %', NEW.cohort_id, v_enrolment.cohort_id;
    END IF;

    -- 4. Duplicate active certificate check
    IF NEW.status = 'ISSUED' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.certificates
            WHERE tenant_id = NEW.tenant_id
              AND enrolment_id = NEW.enrolment_id
              AND status = 'ISSUED'
              AND id != NEW.id
        ) INTO v_active_exists;

        IF v_active_exists THEN
            RAISE EXCEPTION 'DUPLICATE_ACTIVE_CERTIFICATE: An active certificate has already been issued for enrolment %', NEW.enrolment_id;
        END IF;

        -- 5. Synchronize denormalized summary fields on enrolments
        UPDATE public.enrolments
        SET certificate_issued = true,
            certificate_number = NEW.certificate_number,
            certificate_issued_at = NOW(),
            updated_at = NOW()
        WHERE id = NEW.enrolment_id AND tenant_id = NEW.tenant_id;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_certificate_eligibility_before_insert() FROM PUBLIC, authenticated, anon;

DROP TRIGGER IF EXISTS trg_validate_certificate_eligibility ON public.certificates;
CREATE TRIGGER trg_validate_certificate_eligibility
BEFORE INSERT ON public.certificates
FOR EACH ROW
EXECUTE FUNCTION public.validate_certificate_eligibility_before_insert();

-- 6. Prevent mutation of issued certificates and enforce controlled revocation
CREATE OR REPLACE FUNCTION public.prevent_certificate_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Cannot mutate revoked certificates
    IF OLD.status = 'REVOKED' THEN
        RAISE EXCEPTION 'CANNOT_MUTATE_REVOKED_CERTIFICATE: Revoked certificates cannot be modified or re-activated';
    END IF;

    -- Allow revocation transition from ISSUED -> REVOKED
    IF OLD.status = 'ISSUED' AND NEW.status = 'REVOKED' THEN
        IF NEW.revocation_reason IS NULL OR LENGTH(TRIM(NEW.revocation_reason)) = 0 THEN
            RAISE EXCEPTION 'REVOCATION_REASON_REQUIRED: Certificate revocation strictly requires a documented justification reason';
        END IF;

        IF NEW.revoked_at IS NULL THEN
            NEW.revoked_at := NOW();
        END IF;

        -- Synchronize denormalized summary field on enrolments
        UPDATE public.enrolments
        SET certificate_issued = false,
            updated_at = NOW()
        WHERE id = NEW.enrolment_id AND tenant_id = NEW.tenant_id;

        RETURN NEW;
    END IF;

    -- If already issued, core credentials cannot be modified
    IF OLD.status = 'ISSUED' THEN
        IF NEW.certificate_number IS DISTINCT FROM OLD.certificate_number
           OR NEW.student_id IS DISTINCT FROM OLD.student_id
           OR NEW.enrolment_id IS DISTINCT FROM OLD.enrolment_id
           OR NEW.programme_id IS DISTINCT FROM OLD.programme_id
           OR NEW.cohort_id IS DISTINCT FROM OLD.cohort_id
           OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
           OR NEW.completion_date IS DISTINCT FROM OLD.completion_date
           OR NEW.verification_token IS DISTINCT FROM OLD.verification_token
           OR NEW.student_name_snapshot IS DISTINCT FROM OLD.student_name_snapshot
           OR NEW.programme_name_snapshot IS DISTINCT FROM OLD.programme_name_snapshot
           OR NEW.cohort_name_snapshot IS DISTINCT FROM OLD.cohort_name_snapshot THEN
            RAISE EXCEPTION 'CANNOT_MUTATE_ISSUED_CERTIFICATE: Core certificate credentials and historical snapshots are immutable';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_certificate_mutation() FROM PUBLIC, authenticated, anon;

DROP TRIGGER IF EXISTS trg_prevent_certificate_mutation ON public.certificates;
CREATE TRIGGER trg_prevent_certificate_mutation
BEFORE UPDATE ON public.certificates
FOR EACH ROW
EXECUTE FUNCTION public.prevent_certificate_mutation();

-- 7. Safe Public Certificate Verification RPC
CREATE OR REPLACE FUNCTION public.verify_certificate_public(
    p_cert_number TEXT,
    p_token TEXT DEFAULT NULL
)
RETURNS TABLE (
    certificate_number TEXT,
    student_name TEXT,
    programme_name TEXT,
    programme_code TEXT,
    issue_date DATE,
    completion_date DATE,
    status TEXT,
    is_valid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.certificate_number,
        c.student_name_snapshot AS student_name,
        c.programme_name_snapshot AS programme_name,
        c.programme_code_snapshot AS programme_code,
        c.issue_date,
        c.completion_date,
        c.status,
        (c.status = 'ISSUED') AS is_valid
    FROM public.certificates c
    WHERE (c.certificate_number = TRIM(p_cert_number) OR (p_token IS NOT NULL AND c.verification_token = TRIM(p_token)))
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_certificate_public(TEXT, TEXT) TO anon, authenticated;

-- =============================================================================
-- PHASE 11 — SECURE RPC DATABASE FUNCTIONS
-- =============================================================================

-- 1. Create Invoice with Items
CREATE OR REPLACE FUNCTION public.create_invoice_with_items(
    p_invoice JSONB,
    p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
    v_invoice_seq INT;
    v_invoice_id TEXT;
    v_display_no TEXT;
    v_item JSONB;
BEGIN
    v_tenant_id := public.get_auth_tenant_id();
    v_user_id := auth.uid();
    
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User does not belong to an active tenant.';
    END IF;

    -- Sequence generator
    INSERT INTO public.finance_counters (id, tenant_id, invoice_seq, receipt_seq)
    VALUES ('counter_' || v_tenant_id::text, v_tenant_id, 101, 100)
    ON CONFLICT (tenant_id) DO UPDATE 
    SET invoice_seq = public.finance_counters.invoice_seq + 1, updated_at = NOW()
    RETURNING invoice_seq INTO v_invoice_seq;

    v_invoice_id := COALESCE(NULLIF(p_invoice->>'id', ''), 'inv_' || gen_random_uuid()::text);
    v_display_no := 'INV-' || v_invoice_seq;

    INSERT INTO public.invoices (
        id, tenant_id, invoice_no, invoice_display_no, programme_id, customer_id,
        student_name, student_email, student_phone, invoice_date, due_date,
        payment_plan, installments_count, base_price, discount_pct, discount_amount,
        total_amount, income_category, status, installment_details, created_by
    ) VALUES (
        v_invoice_id,
        v_tenant_id,
        v_invoice_seq,
        v_display_no,
        p_invoice->>'programme_id',
        p_invoice->>'customer_id',
        p_invoice->>'student_name',
        p_invoice->>'student_email',
        p_invoice->>'student_phone',
        (p_invoice->>'invoice_date')::DATE,
        (p_invoice->>'due_date')::DATE,
        COALESCE(p_invoice->>'payment_plan', 'full'),
        COALESCE((p_invoice->>'installments_count')::INT, 1),
        (p_invoice->>'base_price')::NUMERIC,
        COALESCE((p_invoice->>'discount_pct')::NUMERIC, 0),
        COALESCE((p_invoice->>'discount_amount')::NUMERIC, 0),
        (p_invoice->>'total_amount')::NUMERIC,
        COALESCE(p_invoice->>'income_category', 'Student Tuition'),
        'unpaid',
        p_invoice->'installment_details',
        v_user_id
    );

    -- Insert line items
    IF jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            INSERT INTO public.invoice_items (
                tenant_id, invoice_id, item_description, quantity, unit_price, discount_amount, line_total
            ) VALUES (
                v_tenant_id,
                v_invoice_id,
                v_item->>'item_description',
                COALESCE((v_item->>'quantity')::NUMERIC, 1),
                (v_item->>'unit_price')::NUMERIC,
                COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
                (v_item->>'line_total')::NUMERIC
            );
        END LOOP;
    END IF;

    -- Audit Log
    INSERT INTO public.finance_audit_log (
        id, tenant_id, action, entity_type, entity_id, entity_name, new_state, actor_id, actor_role
    ) VALUES (
        'aud_' || gen_random_uuid(),
        v_tenant_id,
        'CREATE_INVOICE',
        'invoice',
        v_invoice_id,
        v_display_no || ' (' || (p_invoice->>'student_name') || ')',
        p_invoice,
        v_user_id,
        public.get_auth_user_role()
    );

    RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id, 'invoice_display_no', v_display_no);
END;
$$;

-- 2. Fully Atomic Payment Transaction RPC (Concurrency-Safe with FOR UPDATE)
CREATE OR REPLACE FUNCTION public.execute_payment_transaction(
    p_invoice_id TEXT,
    p_amount NUMERIC,
    p_method TEXT,
    p_reference TEXT,
    p_payment_date DATE,
    p_notes TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
    v_role TEXT;
    v_invoice RECORD;
    v_total_paid NUMERIC;
    v_balance NUMERIC;
    v_receipt_seq INT;
    v_receipt_id TEXT;
    v_display_no TEXT;
    v_new_status TEXT;
    v_cust_id TEXT;
    v_existing_key RECORD;
BEGIN
    v_tenant_id := public.get_auth_tenant_id();
    v_user_id := auth.uid();
    v_role := public.get_auth_user_role();

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User does not belong to an active tenant.';
    END IF;

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        SELECT * INTO v_existing_key 
        FROM public.idempotency_keys 
        WHERE tenant_id = v_tenant_id AND idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'resource_id', v_existing_key.resource_id,
                'message', 'Transaction already executed (Idempotent response).'
            );
        END IF;
    END IF;

    -- Validate and Lock invoice for Concurrency Protection
    SELECT * INTO v_invoice 
    FROM public.invoices 
    WHERE id = p_invoice_id AND tenant_id = v_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVOICE NOT FOUND: Invoice ID % does not exist in this tenant.', p_invoice_id;
    END IF;

    IF v_invoice.status = 'voided' OR v_invoice.status = 'cancelled' THEN
        RAISE EXCEPTION 'INVALID INVOICE STATE: Cannot record payment against a % invoice.', v_invoice.status;
    END IF;

    -- Validate amount
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid 
    FROM public.payments 
    WHERE invoice_id = p_invoice_id AND tenant_id = v_tenant_id;
    
    v_balance := v_invoice.total_amount - v_total_paid;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID AMOUNT: Payment amount must be strictly positive.';
    END IF;
    IF p_amount > v_balance THEN
        RAISE EXCEPTION 'OVERPAYMENT REJECTED: Amount % exceeds remaining invoice balance of %.', p_amount, v_balance;
    END IF;

    -- Sequence
    INSERT INTO public.finance_counters (id, tenant_id, invoice_seq, receipt_seq)
    VALUES ('counter_' || v_tenant_id::text, v_tenant_id, 100, 101)
    ON CONFLICT (tenant_id) DO UPDATE 
    SET receipt_seq = public.finance_counters.receipt_seq + 1, updated_at = NOW()
    RETURNING receipt_seq INTO v_receipt_seq;

    v_receipt_id := 'pay_' || gen_random_uuid()::text;
    v_display_no := 'REC-' || v_receipt_seq;

    -- Insert Payment
    INSERT INTO public.payments (
        id, tenant_id, receipt_no, receipt_display_no, invoice_id, amount,
        payment_method, reference, payment_date, notes, created_by
    ) VALUES (
        v_receipt_id, v_tenant_id, v_receipt_seq, v_display_no, p_invoice_id,
        p_amount, p_method, p_reference, p_payment_date, p_notes, v_user_id
    );

    IF (v_total_paid + p_amount) >= v_invoice.total_amount THEN
        v_new_status := 'paid';
    ELSE
        v_new_status := 'partial';
    END IF;

    -- Update Invoice
    UPDATE public.invoices 
    SET status = v_new_status, updated_at = NOW() 
    WHERE id = p_invoice_id AND tenant_id = v_tenant_id;

    -- Sync to Customer Master if customer exists
    SELECT id INTO v_cust_id FROM public.customers 
    WHERE tenant_id = v_tenant_id 
      AND (id = v_invoice.customer_id OR email = v_invoice.student_email OR name = v_invoice.student_name)
    LIMIT 1;

    IF v_cust_id IS NOT NULL THEN
        UPDATE public.customers
        SET total_paid = total_paid + p_amount,
            outstanding_balance = GREATEST(0, outstanding_balance - p_amount),
            updated_at = NOW()
        WHERE id = v_cust_id AND tenant_id = v_tenant_id;

        -- Insert Activity Timeline
        INSERT INTO public.customer_timeline (
            id, tenant_id, customer_id, event_type, title, description,
            contact_method, reference_id, actor_name
        ) VALUES (
            'tl_' || gen_random_uuid(), v_tenant_id, v_cust_id, 'PAYMENT_RECEIVED',
            'Payment Received: ' || v_display_no,
            'Received ₦' || TO_CHAR(p_amount, 'FM999,999,999.00') || ' via ' || p_method || ' for ' || v_invoice.invoice_display_no,
            p_method, v_receipt_id, COALESCE(v_role, 'System')
        );
    END IF;

    -- Record Idempotency Key
    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        INSERT INTO public.idempotency_keys (
            id, tenant_id, idempotency_key, resource_type, resource_id
        ) VALUES (
            'idemp_' || gen_random_uuid(), v_tenant_id, p_idempotency_key, 'payment', v_receipt_id
        );
    END IF;

    -- Audit Log (Immutable)
    INSERT INTO public.finance_audit_log (
        id, tenant_id, action, entity_type, entity_id, entity_name, new_state, actor_id, actor_role
    ) VALUES (
        'aud_' || gen_random_uuid(), v_tenant_id, 'RECORD_PAYMENT', 'payment',
        v_receipt_id, v_display_no || ' for ' || v_invoice.invoice_display_no,
        jsonb_build_object('amount', p_amount, 'method', p_method, 'reference', p_reference, 'invoice_status', v_new_status),
        v_user_id, COALESCE(v_role, 'SYSTEM')
    );

    RETURN jsonb_build_object(
        'success', true,
        'receipt_id', v_receipt_id,
        'receipt_display_no', v_display_no,
        'invoice_status', v_new_status,
        'amount', p_amount,
        'new_balance', GREATEST(0, v_balance - p_amount)
    );
END;
$$;

-- Legacy alias for compatibility
CREATE OR REPLACE FUNCTION public.record_payment(
    p_invoice_id TEXT,
    p_amount NUMERIC,
    p_method TEXT,
    p_reference TEXT,
    p_payment_date DATE,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.execute_payment_transaction(p_invoice_id, p_amount, p_method, p_reference, p_payment_date, p_notes, NULL);
END;
$$;

-- 3. Record Expense RPC (With Threshold Interception)
CREATE OR REPLACE FUNCTION public.record_expense(
    p_expense JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
    v_role TEXT;
    v_threshold NUMERIC;
    v_amount NUMERIC;
    v_status TEXT;
    v_expense_id TEXT;
BEGIN
    v_tenant_id := public.get_auth_tenant_id();
    v_user_id := auth.uid();
    v_role := public.get_auth_user_role();
    v_amount := (p_expense->>'amount')::NUMERIC;
    v_expense_id := COALESCE(NULLIF(p_expense->>'id', ''), 'exp_' || gen_random_uuid()::text);

    SELECT threshold_amount INTO v_threshold FROM public.finance_approval_settings WHERE tenant_id = v_tenant_id;
    IF v_threshold IS NULL THEN v_threshold := 500000; END IF;

    IF v_amount >= v_threshold AND v_role = 'STAFF' THEN
        v_status := 'pending_approval';
    ELSE
        v_status := 'recorded';
    END IF;

    INSERT INTO public.expenses (
        id, tenant_id, category_group, sub_category, amount, expense_date,
        description, beneficiary, payment_method, reference, programme_id,
        status, created_by
    ) VALUES (
        v_expense_id, v_tenant_id, p_expense->>'category_group', p_expense->>'sub_category',
        v_amount, (p_expense->>'expense_date')::DATE, p_expense->>'description',
        p_expense->>'beneficiary', p_expense->>'payment_method', p_expense->>'reference',
        p_expense->>'programme_id', v_status, v_user_id
    );

    -- Audit
    INSERT INTO public.finance_audit_log (
        id, tenant_id, action, entity_type, entity_id, entity_name, new_state, actor_id, actor_role
    ) VALUES (
        'aud_' || gen_random_uuid(), v_tenant_id, 'RECORD_EXPENSE', 'expense',
        v_expense_id, p_expense->>'description', p_expense, v_user_id, v_role
    );

    RETURN jsonb_build_object('success', true, 'expense_id', v_expense_id, 'status', v_status);
END;
$$;

-- 4. Approve Expense RPC
CREATE OR REPLACE FUNCTION public.approve_expense(
    p_expense_id TEXT,
    p_decision TEXT, -- 'approved' or 'rejected'
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
    v_role TEXT;
BEGIN
    v_tenant_id := public.get_auth_tenant_id();
    v_user_id := auth.uid();
    v_role := public.get_auth_user_role();

    IF v_role NOT IN ('SUPER_ADMIN', 'FINANCE_MANAGER') THEN
        RAISE EXCEPTION 'AUTHORIZATION VIOLATION: Role % is not authorized to approve expenses.', v_role;
    END IF;

    IF p_decision = 'approved' THEN
        UPDATE public.expenses 
        SET status = 'approved', approved_by = v_user_id, approved_at = NOW(), rejection_reason = NULL
        WHERE id = p_expense_id AND tenant_id = v_tenant_id;
    ELSIF p_decision = 'rejected' THEN
        UPDATE public.expenses 
        SET status = 'rejected', approved_by = v_user_id, approved_at = NOW(), rejection_reason = p_reason
        WHERE id = p_expense_id AND tenant_id = v_tenant_id;
    ELSE
        RAISE EXCEPTION 'INVALID DECISION: Decision must be approved or rejected.';
    END IF;

    -- Audit
    INSERT INTO public.finance_audit_log (
        id, tenant_id, action, entity_type, entity_id, entity_name, reason, actor_id, actor_role
    ) VALUES (
        'aud_' || gen_random_uuid(), v_tenant_id, UPPER(p_decision) || '_EXPENSE',
        'expense', p_expense_id, 'Expense Approval Workflow', p_reason, v_user_id, v_role
    );

    RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id, 'status', p_decision);
END;
$$;

-- 5. Void Financial Record RPC
CREATE OR REPLACE FUNCTION public.void_financial_record(
    p_entity_type TEXT, -- 'expense' or 'direct_income'
    p_entity_id TEXT,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
    v_role TEXT;
BEGIN
    v_tenant_id := public.get_auth_tenant_id();
    v_user_id := auth.uid();
    v_role := public.get_auth_user_role();

    IF v_role NOT IN ('SUPER_ADMIN', 'FINANCE_MANAGER') THEN
        RAISE EXCEPTION 'AUTHORIZATION VIOLATION: Role % is not permitted to void records.', v_role;
    END IF;
    IF COALESCE(TRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Mandatory justification reason is required to void records.';
    END IF;

    IF p_entity_type = 'expense' THEN
        UPDATE public.expenses
        SET status = 'voided', cancelled_reason = p_reason, cancelled_at = NOW(), cancelled_by = v_user_id
        WHERE id = p_entity_id AND tenant_id = v_tenant_id;
    ELSIF p_entity_type = 'direct_income' THEN
        UPDATE public.direct_income
        SET status = 'voided', cancelled_reason = p_reason, cancelled_at = NOW(), cancelled_by = v_user_id
        WHERE id = p_entity_id AND tenant_id = v_tenant_id;
    ELSE
        RAISE EXCEPTION 'INVALID ENTITY TYPE: Only expense and direct_income can be voided via this function.';
    END IF;

    -- Audit
    INSERT INTO public.finance_audit_log (
        id, tenant_id, action, entity_type, entity_id, entity_name, reason, actor_id, actor_role
    ) VALUES (
        'aud_' || gen_random_uuid(), v_tenant_id, 'VOID_' || UPPER(p_entity_type),
        p_entity_type, p_entity_id, 'Non-destructive Voiding', p_reason, v_user_id, v_role
    );

    RETURN jsonb_build_object('success', true, 'entity_id', p_entity_id, 'status', 'voided');
END;
$$;

-- 6. Reopen Financial Period RPC (SUPER_ADMIN Only)
CREATE OR REPLACE FUNCTION public.reopen_financial_period(
    p_period TEXT,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
    v_role TEXT;
BEGIN
    v_tenant_id := public.get_auth_tenant_id();
    v_user_id := auth.uid();
    v_role := public.get_auth_user_role();

    IF v_role != 'SUPER_ADMIN' THEN
        RAISE EXCEPTION 'SECURITY RESTRICTION: Only SUPER_ADMIN can reopen locked financial periods.';
    END IF;
    IF COALESCE(TRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Justification reason is required to reopen locked periods.';
    END IF;

    UPDATE public.finance_periods
    SET status = 'open', notes = COALESCE(notes, '') || ' | Reopened: ' || p_reason, updated_at = NOW()
    WHERE tenant_id = v_tenant_id AND period = p_period;

    -- Audit
    INSERT INTO public.finance_audit_log (
        id, tenant_id, action, entity_type, entity_id, entity_name, reason, actor_id, actor_role
    ) VALUES (
        'aud_' || gen_random_uuid(), v_tenant_id, 'REOPEN_FINANCIAL_PERIOD',
        'financial_period', p_period, 'Period Unlocking', p_reason, v_user_id, v_role
    );

    RETURN jsonb_build_object('success', true, 'period', p_period, 'status', 'open');
END;
$$;

-- 7. Complete Reconciliation RPC
CREATE OR REPLACE FUNCTION public.complete_reconciliation(
    p_rec_id TEXT,
    p_actual_balance NUMERIC,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
    v_role TEXT;
    v_rec RECORD;
    v_variance NUMERIC;
    v_status TEXT;
BEGIN
    v_tenant_id := public.get_auth_tenant_id();
    v_user_id := auth.uid();
    v_role := public.get_auth_user_role();

    IF v_role NOT IN ('SUPER_ADMIN', 'FINANCE_MANAGER') THEN
        RAISE EXCEPTION 'AUTHORIZATION VIOLATION: Role % is not authorized to complete reconciliations.', v_role;
    END IF;

    SELECT * INTO v_rec FROM public.reconciliations WHERE id = p_rec_id AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'RECONCILIATION NOT FOUND: ID % does not exist.', p_rec_id;
    END IF;

    v_variance := p_actual_balance - v_rec.expected_balance;
    IF v_variance = 0 THEN
        v_status := 'reconciled';
    ELSE
        v_status := 'discrepancy';
    END IF;

    UPDATE public.reconciliations
    SET actual_balance = p_actual_balance,
        variance = v_variance,
        status = v_status,
        notes = p_notes,
        reconciled_at = NOW(),
        reconciled_by = v_user_id
    WHERE id = p_rec_id AND tenant_id = v_tenant_id;

    -- Audit
    INSERT INTO public.finance_audit_log (
        id, tenant_id, action, entity_type, entity_id, entity_name, reason, actor_id, actor_role
    ) VALUES (
        'aud_' || gen_random_uuid(), v_tenant_id, 'COMPLETE_RECONCILIATION',
        'reconciliation', p_rec_id, 'Reconciliation: ' || v_rec.account_name || ' (' || v_rec.period || ')',
        p_notes, v_user_id, v_role
    );

    RETURN jsonb_build_object('success', true, 'reconciliation_id', p_rec_id, 'variance', v_variance, 'status', v_status);
END;
$$;

-- =============================================================================
-- PHASE 12 — ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- 1. Enable RLS on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_approval_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilitator_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilitator_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flow_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_migration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_recovery_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.month_end_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_control_checks ENABLE ROW LEVEL SECURITY;

-- 2. Core Identity Policies
CREATE POLICY "tenants_auth_read" ON public.tenants
FOR SELECT TO authenticated
USING (id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND status = 'active'));

CREATE POLICY "profiles_own_read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_own_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "memberships_tenant_read" ON public.tenant_memberships FOR SELECT TO authenticated
USING (tenant_id = public.get_auth_tenant_id());

-- 3. Master Data Policies
CREATE POLICY "income_cats_tenant_select" ON public.income_categories FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "income_cats_admin_write" ON public.income_categories FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "expense_cats_tenant_select" ON public.expense_categories FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "expense_cats_admin_write" ON public.expense_categories FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "programmes_tenant_select" ON public.programmes FOR SELECT TO authenticated 
USING (
    tenant_id = public.get_auth_tenant_id()
    AND (
        public.is_staff()
        OR public.can_manage_finance()
        OR public.is_facilitator()
        OR id IN (SELECT programme_id FROM public.enrolments WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()))
    )
);
CREATE POLICY "programmes_admin_insert" ON public.programmes FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "programmes_admin_update" ON public.programmes FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "programmes_admin_delete" ON public.programmes FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

-- Cohorts Policies
CREATE POLICY "cohorts_tenant_select" ON public.cohorts FOR SELECT TO authenticated
USING (
    tenant_id = public.get_auth_tenant_id()
    AND (
        public.is_staff()
        OR public.can_manage_finance()
        OR lead_facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id())
        OR id IN (SELECT cohort_id FROM public.enrolments WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()))
    )
);
CREATE POLICY "cohorts_admin_insert" ON public.cohorts FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "cohorts_admin_update" ON public.cohorts FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "cohorts_admin_delete" ON public.cohorts FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

CREATE POLICY "settings_tenant_select" ON public.finance_approval_settings FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "settings_admin_write" ON public.finance_approval_settings FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

CREATE POLICY "periods_tenant_select" ON public.finance_periods FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "periods_admin_write" ON public.finance_periods FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

CREATE POLICY "budgets_tenant_select" ON public.budgets FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());
CREATE POLICY "budgets_manager_write" ON public.budgets FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

-- 4. Financial Transaction Policies
CREATE POLICY "invoices_tenant_select" ON public.invoices FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());
CREATE POLICY "invoices_staff_insert" ON public.invoices FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());
CREATE POLICY "invoices_manager_update" ON public.invoices FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "invoices_admin_delete" ON public.invoices FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

CREATE POLICY "invoice_items_tenant_select" ON public.invoice_items FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());
CREATE POLICY "invoice_items_staff_insert" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());

CREATE POLICY "payments_tenant_select" ON public.payments FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());
CREATE POLICY "payments_staff_insert" ON public.payments FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());
CREATE POLICY "payments_manager_update" ON public.payments FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "receipts_tenant_select" ON public.receipts FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());
CREATE POLICY "receipts_manager_write" ON public.receipts FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "expenses_tenant_select" ON public.expenses FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND (public.is_finance_staff() OR created_by = auth.uid()));
CREATE POLICY "expenses_staff_insert" ON public.expenses FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_staff());
CREATE POLICY "expenses_manager_update" ON public.expenses FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND (public.can_manage_finance() OR (created_by = auth.uid() AND status = 'recorded')));

CREATE POLICY "direct_income_tenant_select" ON public.direct_income FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());
CREATE POLICY "direct_income_staff_insert" ON public.direct_income FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());
CREATE POLICY "direct_income_manager_update" ON public.direct_income FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "reconciliations_manager_select" ON public.reconciliations FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "reconciliations_manager_write" ON public.reconciliations FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "collection_notes_staff_select" ON public.collection_notes FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());
CREATE POLICY "collection_notes_staff_insert" ON public.collection_notes FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());

CREATE POLICY "reminders_staff_select" ON public.payment_reminders FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());
CREATE POLICY "reminders_staff_insert" ON public.payment_reminders FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());

CREATE POLICY "recurring_expenses_manager_all" ON public.recurring_expenses FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "recurring_invoices_manager_all" ON public.recurring_invoices FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "audit_log_manager_select" ON public.finance_audit_log FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

-- 5. HR, Personnel & CRM Policies
CREATE POLICY "personnel_tenant_select" ON public.personnel FOR SELECT TO authenticated 
USING (tenant_id = public.get_auth_tenant_id() AND (public.can_manage_people() OR user_id = auth.uid()));

CREATE POLICY "personnel_manager_write" ON public.personnel FOR ALL TO authenticated 
USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_people());

CREATE POLICY "payslips_manager_select" ON public.payslips FOR SELECT TO authenticated 
USING (tenant_id = public.get_auth_tenant_id() AND public.can_view_own_payslip(id));

CREATE POLICY "payslips_manager_mutate" ON public.payslips FOR ALL TO authenticated 
USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "finance_settings_tenant_read" ON public.finance_settings FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "finance_settings_admin_write" ON public.finance_settings FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

CREATE POLICY "payment_accounts_tenant_read" ON public.payment_accounts FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "payment_accounts_manager_write" ON public.payment_accounts FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "enquiries_tenant_select" ON public.enquiries FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
CREATE POLICY "enquiries_tenant_insert" ON public.enquiries FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
CREATE POLICY "enquiries_tenant_update" ON public.enquiries FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
CREATE POLICY "enquiries_admin_delete" ON public.enquiries FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

CREATE POLICY "enrolments_tenant_select" ON public.enrolments FOR SELECT TO authenticated 
USING (
    tenant_id = public.get_auth_tenant_id() 
    AND (
        public.is_staff() 
        OR public.can_manage_finance()
        OR cohort_id IN (SELECT id FROM public.cohorts WHERE lead_facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()))
        OR student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id())
    )
);
CREATE POLICY "enrolments_tenant_insert" ON public.enrolments FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
CREATE POLICY "enrolments_tenant_update" ON public.enrolments FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
CREATE POLICY "enrolments_admin_delete" ON public.enrolments FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

-- Training Sessions RLS Policies
CREATE POLICY "training_sessions_tenant_select" ON public.training_sessions FOR SELECT TO authenticated
USING (
    tenant_id = public.get_auth_tenant_id()
    AND (
        public.is_staff()
        OR public.can_manage_finance()
        OR facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id())
        OR cohort_id IN (SELECT id FROM public.cohorts WHERE lead_facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()))
        OR cohort_id IN (SELECT cohort_id FROM public.enrolments WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()))
    )
);
CREATE POLICY "training_sessions_staff_insert" ON public.training_sessions FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_people()));
CREATE POLICY "training_sessions_staff_update" ON public.training_sessions FOR UPDATE TO authenticated
USING (
    tenant_id = public.get_auth_tenant_id()
    AND (
        public.is_staff()
        OR public.can_manage_people()
        OR facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id())
    )
);
CREATE POLICY "training_sessions_admin_delete" ON public.training_sessions FOR DELETE TO authenticated
USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

-- Attendance RLS Policies
CREATE POLICY "attendance_tenant_select" ON public.attendance FOR SELECT TO authenticated
USING (
    tenant_id = public.get_auth_tenant_id()
    AND (
        public.is_staff()
        OR public.can_manage_finance()
        OR cohort_id IN (SELECT id FROM public.cohorts WHERE lead_facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()))
        OR session_id IN (SELECT id FROM public.training_sessions WHERE facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()))
        OR enrolment_id IN (SELECT id FROM public.enrolments WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()))
    )
);
CREATE POLICY "attendance_staff_insert" ON public.attendance FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = public.get_auth_tenant_id()
    AND (
        public.is_staff()
        OR session_id IN (SELECT id FROM public.training_sessions WHERE facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()))
        OR cohort_id IN (SELECT id FROM public.cohorts WHERE lead_facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()))
    )
);
CREATE POLICY "attendance_staff_update" ON public.attendance FOR UPDATE TO authenticated
USING (
    tenant_id = public.get_auth_tenant_id()
    AND (
        public.is_staff()
        OR session_id IN (SELECT id FROM public.training_sessions WHERE facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()))
        OR cohort_id IN (SELECT id FROM public.cohorts WHERE lead_facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()))
    )
);
CREATE POLICY "attendance_admin_delete" ON public.attendance FOR DELETE TO authenticated
USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

-- Facilitator Reports RLS Policies
CREATE POLICY "facilitator_reports_tenant_select" ON public.facilitator_reports FOR SELECT TO authenticated
USING (
    tenant_id = public.get_auth_tenant_id()
    AND (
        public.is_staff()
        OR public.can_manage_finance()
        OR facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id())
    )
);
CREATE POLICY "facilitator_reports_facilitator_insert" ON public.facilitator_reports FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = public.get_auth_tenant_id()
    AND (
        public.is_staff()
        OR facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id())
    )
);
CREATE POLICY "facilitator_reports_facilitator_update" ON public.facilitator_reports FOR UPDATE TO authenticated
USING (
    tenant_id = public.get_auth_tenant_id()
    AND (
        public.is_staff()
        OR (facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id()) AND status = 'DRAFT')
    )
);
CREATE POLICY "facilitator_reports_admin_delete" ON public.facilitator_reports FOR DELETE TO authenticated
USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

-- Certificates Table RLS Policies
CREATE POLICY "certificates_tenant_select" ON public.certificates FOR SELECT TO authenticated
USING (
    tenant_id = public.get_auth_tenant_id()
    AND (
        public.is_staff()
        OR public.can_manage_finance()
        OR public.is_facilitator()
        OR student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid() AND tenant_id = public.get_auth_tenant_id())
    )
);

CREATE POLICY "certificates_admin_insert" ON public.certificates FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = public.get_auth_tenant_id()
    AND public.is_staff()
);

CREATE POLICY "certificates_admin_update" ON public.certificates FOR UPDATE TO authenticated
USING (
    tenant_id = public.get_auth_tenant_id()
    AND public.is_staff()
)
WITH CHECK (
    tenant_id = public.get_auth_tenant_id()
    AND public.is_staff()
);

CREATE POLICY "certificates_admin_delete" ON public.certificates FOR DELETE TO authenticated
USING (
    tenant_id = public.get_auth_tenant_id()
    AND public.is_super_admin()
);

CREATE POLICY "customers_tenant_select" ON public.customers FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
CREATE POLICY "customers_tenant_insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
CREATE POLICY "customers_tenant_update" ON public.customers FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
CREATE POLICY "customers_admin_delete" ON public.customers FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

-- Students Table RLS Policies
CREATE POLICY "students_tenant_select" ON public.students FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance() OR public.is_facilitator()));
CREATE POLICY "students_tenant_insert" ON public.students FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
CREATE POLICY "students_tenant_update" ON public.students FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance())) WITH CHECK (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
CREATE POLICY "students_admin_delete" ON public.students FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());


-- 6. Operations Policies
CREATE POLICY "sessions_tenant_select" ON public.facilitator_sessions FOR SELECT TO authenticated 
USING (tenant_id = public.get_auth_tenant_id() AND (
    public.can_manage_finance()
    OR facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid())
));

CREATE POLICY "sessions_manager_mutate" ON public.facilitator_sessions FOR ALL TO authenticated 
USING (tenant_id = public.get_auth_tenant_id() AND (
    public.can_manage_finance()
    OR (facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid()) AND status = 'pending_approval')
));

CREATE POLICY "timeline_tenant_select" ON public.customer_timeline FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
CREATE POLICY "timeline_tenant_insert" ON public.customer_timeline FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));

-- 7. Control, Intelligence & Recovery Policies
CREATE POLICY "schema_versions_select" ON public.schema_versions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "idempotency_tenant_all" ON public.idempotency_keys FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_staff());
CREATE POLICY "alerts_tenant_all" ON public.management_alerts FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND (public.can_manage_finance() OR assigned_role = public.get_auth_user_role()));
CREATE POLICY "crm_history_tenant_all" ON public.crm_stage_history FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_staff());
CREATE POLICY "bank_reconciliations_manager_all" ON public.bank_reconciliations FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "bank_reconciliation_items_manager_all" ON public.bank_reconciliation_items FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "expense_history_tenant_all" ON public.expense_status_history FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_staff());
CREATE POLICY "adjustments_manager_all" ON public.financial_adjustments FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "budgets_manager_all" ON public.financial_budgets FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "budget_lines_manager_all" ON public.budget_lines FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "management_metrics_manager_all" ON public.management_metrics FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "cash_flow_manager_all" ON public.cash_flow_forecasts FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "customer_segments_staff_all" ON public.customer_segments FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND (public.is_staff() OR public.can_manage_finance()));
CREATE POLICY "collection_actions_staff_all" ON public.collection_actions FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_finance_staff());
CREATE POLICY "approval_thresholds_admin_all" ON public.approval_thresholds FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());
CREATE POLICY "recommendations_manager_all" ON public.management_recommendations FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "report_snapshots_manager_all" ON public.report_snapshots FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "system_diagnostics_admin_select" ON public.system_diagnostics FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "system_diagnostics_admin_insert" ON public.system_diagnostics FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "system_diagnostics_admin_delete" ON public.system_diagnostics FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "migration_runs_manage_select" ON public.production_migration_runs FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "migration_runs_manage_insert" ON public.production_migration_runs FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "migration_runs_manage_update" ON public.production_migration_runs FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "recovery_queue_manager_select" ON public.transaction_recovery_queue FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "recovery_queue_manager_insert" ON public.transaction_recovery_queue FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "recovery_queue_manager_update" ON public.transaction_recovery_queue FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "recovery_queue_manager_delete" ON public.transaction_recovery_queue FOR DELETE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.is_super_admin());

CREATE POLICY "reconciliation_runs_manager_select" ON public.production_reconciliation_runs FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "reconciliation_runs_manager_insert" ON public.production_reconciliation_runs FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "reconciliation_exceptions_manager_select" ON public.production_reconciliation_exceptions FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "reconciliation_exceptions_manager_insert" ON public.production_reconciliation_exceptions FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "reconciliation_exceptions_manager_update" ON public.production_reconciliation_exceptions FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "month_end_closures_manager_select" ON public.month_end_closures FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "month_end_closures_manager_insert" ON public.month_end_closures FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "month_end_closures_manager_update" ON public.month_end_closures FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

CREATE POLICY "financial_control_checks_manager_select" ON public.financial_control_checks FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());
CREATE POLICY "financial_control_checks_manager_insert" ON public.financial_control_checks FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id() AND public.can_manage_finance());

-- =============================================================================
-- PHASE 13 — PERFORMANCE & COMPOSITE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_date ON public.invoices(tenant_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status ON public.invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_duedate ON public.invoices(tenant_id, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_cust ON public.invoices(tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_date ON public.payments(tenant_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON public.expenses(tenant_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_direct_income_tenant_date ON public.direct_income(tenant_id, income_date);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_date ON public.finance_audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_periods_lookup ON public.finance_periods(tenant_id, period);

CREATE INDEX IF NOT EXISTS idx_personnel_tenant_type ON public.personnel(tenant_id, employee_type);
CREATE INDEX IF NOT EXISTS idx_payslips_tenant_period ON public.payslips(tenant_id, pay_period);
CREATE INDEX IF NOT EXISTS idx_payslips_personnel ON public.payslips(personnel_id);

CREATE INDEX IF NOT EXISTS idx_enquiries_tenant_stage ON public.enquiries(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_facilitator ON public.facilitator_sessions(tenant_id, facilitator_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_period ON public.facilitator_sessions(tenant_id, payroll_period);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.facilitator_sessions(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_timeline_customer ON public.customer_timeline(tenant_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_severity ON public.management_alerts(tenant_id, severity, status);
CREATE INDEX IF NOT EXISTS idx_crm_history_tenant_enquiry ON public.crm_stage_history(tenant_id, enquiry_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_tenant_period ON public.bank_reconciliations(tenant_id, reconciliation_period);
CREATE INDEX IF NOT EXISTS idx_idempotency_tenant_key ON public.idempotency_keys(tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_budgets_tenant_period ON public.financial_budgets(tenant_id, financial_year, period_key);
CREATE INDEX IF NOT EXISTS idx_budget_lines_tenant_month ON public.budget_lines(tenant_id, month_key, category);
CREATE INDEX IF NOT EXISTS idx_forecasts_tenant_date ON public.cash_flow_forecasts(tenant_id, forecast_date, horizon_days);
CREATE INDEX IF NOT EXISTS idx_segments_tenant_cust ON public.customer_segments(tenant_id, customer_id, segment);
CREATE INDEX IF NOT EXISTS idx_collection_tenant_priority ON public.collection_actions(tenant_id, priority, customer_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_tenant_priority ON public.management_recommendations(tenant_id, priority, status);
CREATE INDEX IF NOT EXISTS idx_reports_tenant_period ON public.report_snapshots(tenant_id, report_type, financial_period);
CREATE INDEX IF NOT EXISTS idx_system_diagnostics_probe ON public.system_diagnostics(probe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_migration_runs_tenant_status ON public.production_migration_runs(tenant_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_queue_status ON public.transaction_recovery_queue(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconcil_runs_tenant ON public.production_reconciliation_runs(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconcil_exceptions_status ON public.production_reconciliation_exceptions(tenant_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_month_end_closures_period ON public.month_end_closures(tenant_id, period_key);
CREATE INDEX IF NOT EXISTS idx_financial_control_period ON public.financial_control_checks(tenant_id, check_period, check_type);

-- =============================================================================
-- PHASE 14 — PERMISSIONS & VERSION REGISTRATION
-- =============================================================================

INSERT INTO public.schema_versions (version, description, compatible)
VALUES ('14.0.0', 'Phase 14.0.0 Programme, Cohort & Authoritative Enrolment Architecture with Closed Composite Tenant Perimeter', TRUE)
ON CONFLICT (version) DO UPDATE SET applied_at = NOW(), compatible = TRUE;

-- =============================================================================
-- PHASE 5.1 — PROFESSIONAL CRM INTAKE & APPLICANT MANAGEMENT
-- =============================================================================

-- 39. CRM Intake Counters Table (Concurrency-Safe Atomic Application Numbering)
CREATE TABLE IF NOT EXISTS public.crm_intake_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    application_seq INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_intake_counters_tenant ON public.crm_intake_counters(tenant_id);

-- 40. Authoritative CRM Intake Applications
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
    
    -- Immutable Raw Submission Snapshot
    applicant_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_intake_apps_tenant_number UNIQUE (tenant_id, application_number),
    CONSTRAINT uq_intake_apps_idempotency UNIQUE (tenant_id, source, source_submission_id)
);

CREATE INDEX IF NOT EXISTS idx_intake_apps_tenant_status ON public.crm_intake_applications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_intake_apps_tenant_prog ON public.crm_intake_applications(tenant_id, programme_id);
CREATE INDEX IF NOT EXISTS idx_intake_apps_tenant_student ON public.crm_intake_applications(tenant_id, matched_student_id);
CREATE INDEX IF NOT EXISTS idx_intake_apps_tenant_submitted ON public.crm_intake_applications(tenant_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_apps_email ON public.crm_intake_applications(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_intake_apps_phone ON public.crm_intake_applications(tenant_id, phone);

-- Concurrency-Safe Atomic Application Numbering
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

    v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    INSERT INTO public.crm_intake_counters (tenant_id, application_seq, updated_at)
    VALUES (p_tenant_id, 2, NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET 
        application_seq = public.crm_intake_counters.application_seq + 1,
        updated_at = NOW()
    RETURNING application_seq - 1 INTO v_seq;

    RETURN 'APP-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_next_application_number(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_application_number(UUID) TO authenticated, anon;

-- RLS for Phase 5.1 Intake
ALTER TABLE public.crm_intake_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_intake_counters ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.crm_intake_applications FROM anon, public;
REVOKE INSERT, UPDATE, DELETE ON public.crm_intake_counters FROM anon, public;

CREATE POLICY intake_apps_select_admin_staff ON public.crm_intake_applications
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id() AND
        (public.is_staff() OR public.is_super_admin() OR public.get_auth_user_role() IN ('admin', 'staff', 'super admin'))
    );

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

CREATE POLICY intake_apps_modify_admin ON public.crm_intake_applications
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id = public.get_auth_tenant_id() AND
        (public.is_staff() OR public.is_super_admin() OR public.get_auth_user_role() IN ('admin', 'staff', 'super admin'))
    )
    WITH CHECK (
        tenant_id = public.get_auth_tenant_id() AND
        (public.is_staff() OR public.is_super_admin() OR public.get_auth_user_role() IN ('admin', 'staff', 'super admin'))
    );

-- =============================================================================
-- HARDENED RPC PRIVILEGE CONTROL (FAIL-CLOSED SECURITY DEFINER EXECUTE MODEL)
-- =============================================================================

-- 1. Explicitly Revoke Unintended PUBLIC / Anon Execution on Privileged RPCs
REVOKE EXECUTE ON FUNCTION public.create_invoice_with_items(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_with_items(JSONB, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.execute_payment_transaction(TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_payment_transaction(TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_payment(TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_payment(TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_expense(NUMERIC, TEXT, TEXT, DATE, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_expense(NUMERIC, TEXT, TEXT, DATE, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.approve_expense(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_expense(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.void_financial_record(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_financial_record(TEXT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reopen_financial_period(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_financial_period(TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_reconciliation(TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_reconciliation(TEXT, NUMERIC, TEXT) TO authenticated;

-- 2. Strictly Governed Public Verification Endpoint (Only verify_certificate_public is granted to anon)
REVOKE EXECUTE ON FUNCTION public.verify_certificate_public(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate_public(TEXT, TEXT, UUID) TO authenticated, anon;

-- =============================================================================
-- END OF CLASPTEK PRODUCTION SCHEMA VERSION 14.0.0
-- =============================================================================

