-- =============================================================================
-- CLASPTEK PORTAL & ENTERPRISE MANAGEMENT SYSTEM — PRODUCTION SUPABASE SCHEMA
-- Phase 8: Production Backend, RLS, Period Locking, Role Matrix & Audit Assurance
-- =============================================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. CORE TENANT & IDENTITY SCHEMA
-- =============================================================================

-- Tenants Table
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profiles Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant Memberships Table (Authoritative Tenant & Role Mapping)
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'STAFF')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'invited')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

-- Helper Security Functions (Run as SECURITY DEFINER to read context safely)
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

-- =============================================================================
-- 2. CONFIGURATION & MASTER DATA TABLES
-- =============================================================================

-- Income Categories
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

-- Expense Categories
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

-- Programmes Table
CREATE TABLE IF NOT EXISTS public.programmes (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    tuition_fee NUMERIC(14,2) NOT NULL CHECK (tuition_fee >= 0),
    max_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (max_discount_pct BETWEEN 0 AND 100),
    allow_installments BOOLEAN NOT NULL DEFAULT true,
    installment_first_pct NUMERIC(5,2) NOT NULL DEFAULT 60 CHECK (installment_first_pct BETWEEN 0 AND 100),
    installment_second_pct NUMERIC(5,2) NOT NULL DEFAULT 40 CHECK (installment_second_pct BETWEEN 0 AND 100),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Finance Approval Settings
CREATE TABLE IF NOT EXISTS public.finance_approval_settings (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    threshold_amount NUMERIC(14,2) NOT NULL DEFAULT 500000 CHECK (threshold_amount >= 0),
    require_super_admin_threshold NUMERIC(14,2) NOT NULL DEFAULT 2000000 CHECK (require_super_admin_threshold >= threshold_amount),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id),
    UNIQUE(tenant_id)
);

-- Financial Periods Table (Month-End Locking)
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

-- Counters Table
CREATE TABLE IF NOT EXISTS public.finance_counters (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    invoice_seq INT NOT NULL DEFAULT 100,
    receipt_seq INT NOT NULL DEFAULT 100,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id)
);

-- Budgets Table
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
-- 3. FINANCIAL TRANSACTION & LEDGER TABLES
-- =============================================================================

-- Invoices Table
CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    invoice_no INT NOT NULL,
    invoice_display_no TEXT NOT NULL,
    programme_id TEXT NOT NULL REFERENCES public.programmes(id) ON DELETE RESTRICT,
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
    UNIQUE(tenant_id, invoice_no)
);

-- Invoice Line Items Table
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

-- Payments Table (Receipts)
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

-- Direct Income Table
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

-- Expenses Table
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

-- Reconciliations Table
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

-- Collection Notes Table
CREATE TABLE IF NOT EXISTS public.collection_notes (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    invoice_id TEXT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    promised_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Payment Reminders Table
CREATE TABLE IF NOT EXISTS public.payment_reminders (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    invoice_id TEXT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('Email', 'WhatsApp', 'SMS')),
    template_type TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_by UUID REFERENCES auth.users(id)
);

-- Recurring Expenses Template
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

-- Recurring Invoices Template
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

-- =============================================================================
-- 4. IMMUTABLE FINANCIAL AUDIT LOG TABLE
-- =============================================================================

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

-- Audit Log Immutability Trigger (Strictly Append-Only)
CREATE OR REPLACE FUNCTION public.enforce_audit_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY VIOLATION: The financial audit log is strictly immutable and append-only. UPDATE and DELETE operations are prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_immutability ON public.finance_audit_log;
CREATE TRIGGER trg_audit_immutability
BEFORE UPDATE OR DELETE ON public.finance_audit_log
FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_immutability();

-- =============================================================================
-- 5. DATABASE-LEVEL PERIOD LOCKING TRIGGER
-- =============================================================================

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
        ELSE v_tx_date := CURRENT_DATE;
        END IF;
    ELSE
        v_tenant_id := NEW.tenant_id;
        IF TG_TABLE_NAME = 'invoices' THEN v_tx_date := NEW.invoice_date;
        ELSIF TG_TABLE_NAME = 'payments' THEN v_tx_date := NEW.payment_date;
        ELSIF TG_TABLE_NAME = 'expenses' THEN v_tx_date := NEW.expense_date;
        ELSIF TG_TABLE_NAME = 'direct_income' THEN v_tx_date := NEW.income_date;
        ELSE v_tx_date := CURRENT_DATE;
        END IF;
    END IF;

    v_period := TO_CHAR(v_tx_date, 'YYYY-MM');

    SELECT status INTO v_period_status
    FROM public.finance_periods
    WHERE tenant_id = v_tenant_id AND period = v_period;

    IF v_period_status = 'locked' THEN
        RAISE EXCEPTION 'PERIOD LOCK VIOLATION: Financial period % is LOCKED. No mutations are permitted.', v_period;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- Apply Period Lock Triggers to Financial Mutation Tables
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

-- =============================================================================
-- 6. SECURE RPC DATABASE FUNCTIONS
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

    v_invoice_id := COALESCE(p_invoice->>'id', 'inv_' || EXTRACT(EPOCH FROM NOW())::BIGINT);
    v_display_no := 'INV-' || v_invoice_seq;

    INSERT INTO public.invoices (
        id, tenant_id, invoice_no, invoice_display_no, programme_id,
        student_name, student_email, student_phone, invoice_date, due_date,
        payment_plan, installments_count, base_price, discount_pct, discount_amount,
        total_amount, income_category, status, installment_details, created_by
    ) VALUES (
        v_invoice_id,
        v_tenant_id,
        v_invoice_seq,
        v_display_no,
        p_invoice->>'programme_id',
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

-- 2. Record Payment RPC
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
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
    v_invoice RECORD;
    v_total_paid NUMERIC;
    v_balance NUMERIC;
    v_receipt_seq INT;
    v_receipt_id TEXT;
    v_display_no TEXT;
    v_new_status TEXT;
BEGIN
    v_tenant_id := public.get_auth_tenant_id();
    v_user_id := auth.uid();

    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVOICE NOT FOUND: Invoice ID % does not exist.', p_invoice_id;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid FROM public.payments WHERE invoice_id = p_invoice_id AND tenant_id = v_tenant_id;
    v_balance := v_invoice.total_amount - v_total_paid;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID AMOUNT: Payment amount must be positive.';
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

    v_receipt_id := 'pay_' || EXTRACT(EPOCH FROM NOW())::BIGINT;
    v_display_no := 'REC-' || v_receipt_seq;

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

    UPDATE public.invoices SET status = v_new_status, updated_at = NOW() WHERE id = p_invoice_id;

    -- Audit
    INSERT INTO public.finance_audit_log (
        id, tenant_id, action, entity_type, entity_id, entity_name, new_state, actor_id, actor_role
    ) VALUES (
        'aud_' || gen_random_uuid(), v_tenant_id, 'RECORD_PAYMENT', 'payment',
        v_receipt_id, v_display_no || ' for ' || v_invoice.invoice_display_no,
        jsonb_build_object('amount', p_amount, 'method', p_method, 'reference', p_reference),
        v_user_id, public.get_auth_user_role()
    );

    RETURN jsonb_build_object('success', true, 'receipt_id', v_receipt_id, 'receipt_display_no', v_display_no, 'invoice_status', v_new_status);
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
    v_expense_id := COALESCE(p_expense->>'id', 'exp_' || EXTRACT(EPOCH FROM NOW())::BIGINT);

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
-- 7. ROW LEVEL SECURITY (RLS) POLICIES — ZERO ANONYMOUS ACCESS
-- =============================================================================

-- Enable RLS across all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_approval_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit_log ENABLE ROW LEVEL SECURITY;

-- Tenants Policies
CREATE POLICY "tenants_auth_read" ON public.tenants
FOR SELECT TO authenticated
USING (id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND status = 'active'));

-- Profiles Policies
CREATE POLICY "profiles_own_read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_own_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- Tenant Memberships Policies
CREATE POLICY "memberships_tenant_read" ON public.tenant_memberships FOR SELECT TO authenticated
USING (tenant_id = public.get_auth_tenant_id());

-- Standard Tenant Isolation Policy Macro for Financial Master & Transaction Tables
-- 1. Programmes
CREATE POLICY "programmes_tenant_select" ON public.programmes FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "programmes_tenant_insert" ON public.programmes FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "programmes_tenant_update" ON public.programmes FOR UPDATE TO authenticated USING (tenant_id = public.get_auth_tenant_id());

-- 2. Invoices & Items
CREATE POLICY "invoices_tenant_select" ON public.invoices FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "invoice_items_tenant_select" ON public.invoice_items FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());

-- 3. Payments
CREATE POLICY "payments_tenant_select" ON public.payments FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());

-- 4. Expenses & Direct Income
CREATE POLICY "expenses_tenant_select" ON public.expenses FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "direct_income_tenant_select" ON public.direct_income FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());

-- 5. Categories & Budgets
CREATE POLICY "income_cats_tenant_select" ON public.income_categories FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "expense_cats_tenant_select" ON public.expense_categories FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "budgets_tenant_select" ON public.budgets FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());

-- 6. Audit Log (Strictly Read-Only for Authenticated Users)
CREATE POLICY "audit_log_tenant_select" ON public.finance_audit_log FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());

-- 7. Periods & Settings
CREATE POLICY "periods_tenant_select" ON public.finance_periods FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "settings_tenant_select" ON public.finance_approval_settings FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());

-- 8. Reconciliations & Notes
CREATE POLICY "reconciliations_tenant_select" ON public.reconciliations FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "collection_notes_tenant_all" ON public.collection_notes FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "reminders_tenant_all" ON public.payment_reminders FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());

-- =============================================================================
-- 8. PERFORMANCE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_date ON public.invoices(tenant_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_date ON public.payments(tenant_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON public.expenses(tenant_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_direct_income_tenant_date ON public.direct_income(tenant_id, income_date);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_date ON public.finance_audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_periods_lookup ON public.finance_periods(tenant_id, period);
