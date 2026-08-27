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
-- 9. PHASE 8 & 9: HR, PAYROLL, ADMISSIONS & CRM SCHEMAS
-- =============================================================================

-- Personnel Directory (Staff & Facilitators)
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
    UNIQUE(tenant_id, employee_id)
);

-- Payslips & Compensation Statements
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

-- Company Legal & Finance Settings
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

-- Corporate Settlement Bank Accounts
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

-- Admissions Enquiries (CRM Leads)
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Student Enrolments
CREATE TABLE IF NOT EXISTS public.enrolments (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    enquiry_id TEXT REFERENCES public.enquiries(id),
    student_name TEXT NOT NULL,
    student_email TEXT,
    student_phone TEXT,
    programme_id TEXT NOT NULL REFERENCES public.programmes(id),
    cohort TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'DEFERRED', 'WITHDRAWN')),
    enrolment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customer Registry (Derived/Cached Student Profiles)
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for New Tables
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Personnel RLS: Management vs Self
CREATE POLICY "personnel_tenant_select" ON public.personnel FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "personnel_manager_all" ON public.personnel FOR ALL TO authenticated 
USING (tenant_id = public.get_auth_tenant_id() AND public.get_auth_user_role() IN ('SUPER_ADMIN', 'FINANCE_MANAGER'));

-- Payslips RLS: Strict Role Isolation
CREATE POLICY "payslips_manager_select" ON public.payslips FOR SELECT TO authenticated 
USING (tenant_id = public.get_auth_tenant_id() AND (
    public.get_auth_user_role() IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF')
    OR personnel_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid())
));

CREATE POLICY "payslips_manager_mutate" ON public.payslips FOR ALL TO authenticated 
USING (tenant_id = public.get_auth_tenant_id() AND public.get_auth_user_role() IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF'));

-- Settings & Accounts RLS
CREATE POLICY "settings_tenant_read" ON public.finance_settings FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "settings_admin_write" ON public.finance_settings FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.get_auth_user_role() = 'SUPER_ADMIN');

CREATE POLICY "accounts_tenant_read" ON public.payment_accounts FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "accounts_manager_write" ON public.payment_accounts FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id() AND public.get_auth_user_role() IN ('SUPER_ADMIN', 'FINANCE_MANAGER'));

-- Admissions & CRM RLS
CREATE POLICY "enquiries_tenant_all" ON public.enquiries FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "enrolments_tenant_all" ON public.enrolments FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "customers_tenant_all" ON public.customers FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());

-- =============================================================================
-- 10. PERFORMANCE INDEXES
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
CREATE INDEX IF NOT EXISTS idx_personnel_tenant_type ON public.personnel(tenant_id, employee_type);
CREATE INDEX IF NOT EXISTS idx_payslips_tenant_period ON public.payslips(tenant_id, pay_period);
CREATE INDEX IF NOT EXISTS idx_payslips_personnel ON public.payslips(personnel_id);

-- =============================================================================
-- 11. PHASE 9: OPERATIONAL INTEGRATION — SESSIONS & TIMELINE
-- =============================================================================

-- Facilitator Operational Sessions Table
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

-- Customer Dynamic Activity Timeline Table
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

-- Enable RLS
ALTER TABLE public.facilitator_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_timeline ENABLE ROW LEVEL SECURITY;

-- Facilitator Sessions RLS: Management vs Self
CREATE POLICY "sessions_tenant_select" ON public.facilitator_sessions FOR SELECT TO authenticated 
USING (tenant_id = public.get_auth_tenant_id() AND (
    public.get_auth_user_role() IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF')
    OR facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid())
));

CREATE POLICY "sessions_manager_mutate" ON public.facilitator_sessions FOR ALL TO authenticated 
USING (tenant_id = public.get_auth_tenant_id() AND (
    public.get_auth_user_role() IN ('SUPER_ADMIN', 'FINANCE_MANAGER', 'FINANCE_STAFF')
    OR (facilitator_id IN (SELECT id FROM public.personnel WHERE user_id = auth.uid()) AND status = 'pending_approval')
));

-- Customer Timeline RLS
CREATE POLICY "timeline_tenant_all" ON public.customer_timeline FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());

-- Indexes for Phase 9 tables
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_facilitator ON public.facilitator_sessions(tenant_id, facilitator_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_period ON public.facilitator_sessions(tenant_id, payroll_period);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.facilitator_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_timeline_customer ON public.customer_timeline(tenant_id, customer_id, created_at DESC);

-- =============================================================================
-- SECTION 12: PHASE 10 OPERATIONAL INTELLIGENCE, MANAGEMENT CONTROLS & RECONCILIATION
-- =============================================================================

-- Schema Version Tracking
CREATE TABLE IF NOT EXISTS public.schema_versions (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    description TEXT NOT NULL,
    compatible BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO public.schema_versions (version, description, compatible)
VALUES ('10.0.0', 'Phase 10 Operational Intelligence, Management Controls & Reconciliation', TRUE)
ON CONFLICT (version) DO NOTHING;

-- Database-Level Idempotency Keys Table
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL UNIQUE,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Management Attention & Alert Dispatcher Table
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

-- CRM Pipeline Stage Transition History
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

-- Bank Reconciliation Control Table
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

-- Bank Reconciliation Line Items
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

-- Expense Lifecycle Status Transition History
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

-- Financial Reversals and Adjustments Table (Closed Period Controls)
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

-- Enable RLS on Phase 10 Tables
ALTER TABLE public.schema_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_adjustments ENABLE ROW LEVEL SECURITY;

-- Phase 10 RLS Policies
CREATE POLICY "schema_versions_select" ON public.schema_versions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "idempotency_tenant_all" ON public.idempotency_keys FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "alerts_tenant_all" ON public.management_alerts FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "crm_history_tenant_all" ON public.crm_stage_history FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "reconciliations_tenant_all" ON public.bank_reconciliations FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "reconciliation_items_tenant_all" ON public.bank_reconciliation_items FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "expense_history_tenant_all" ON public.expense_status_history FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "adjustments_tenant_all" ON public.financial_adjustments FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());

-- Performance Composite Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status ON public.invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_duedate ON public.invoices(tenant_id, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_cust ON public.invoices(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_tenant_stage ON public.enquiries(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_payslips_tenant_period ON public.payslips(tenant_id, payroll_period);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_period ON public.expenses(tenant_id, financial_period);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_severity ON public.management_alerts(tenant_id, severity, status);
CREATE INDEX IF NOT EXISTS idx_crm_history_tenant_enquiry ON public.crm_stage_history(tenant_id, enquiry_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_tenant_period ON public.bank_reconciliations(tenant_id, reconciliation_period);
CREATE INDEX IF NOT EXISTS idx_idempotency_tenant_key ON public.idempotency_keys(tenant_id, idempotency_key);

-- ====================================================================
-- SECTION 13: PHASE 11 FINANCIAL GOVERNANCE, BUSINESS INTELLIGENCE & EXECUTIVE DECISION SUPPORT
-- ====================================================================

-- 1. Financial Budgets (Annual/Quarterly Envelopes by Department)
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

-- 2. Budget Lines (Line-item allocations by category and sub-category)
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

-- 3. Management Metrics (Historical Snapshot Cache of Periodic Executive KPIs)
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

-- 4. Cash Flow Forecasts (7, 30, 60, 90-day Cash Runway Projections)
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

-- 5. Customer Revenue Segments
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

-- 6. Collection Follow-up Actions Log
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

-- 7. Configurable Financial Approval Thresholds
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

-- 8. Executive Management Recommendations
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

-- 9. Management Report Snapshots (Immutable Download Archive)
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

-- Enable RLS on Section 13 Tables
ALTER TABLE public.financial_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flow_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;

-- Section 13 Tenant RLS Policies
CREATE POLICY "budgets_tenant_all" ON public.financial_budgets FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "budget_lines_tenant_all" ON public.budget_lines FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "management_metrics_tenant_all" ON public.management_metrics FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "cash_flow_tenant_all" ON public.cash_flow_forecasts FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "customer_segments_tenant_all" ON public.customer_segments FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "collection_actions_tenant_all" ON public.collection_actions FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "approval_thresholds_tenant_all" ON public.approval_thresholds FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "recommendations_tenant_all" ON public.management_recommendations FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "report_snapshots_tenant_all" ON public.report_snapshots FOR ALL TO authenticated USING (tenant_id = public.get_auth_tenant_id());

-- Section 13 Performance Composite Indexes
CREATE INDEX IF NOT EXISTS idx_budgets_tenant_period ON public.financial_budgets(tenant_id, financial_year, period_key);
CREATE INDEX IF NOT EXISTS idx_budget_lines_tenant_month ON public.budget_lines(tenant_id, month_key, category);
CREATE INDEX IF NOT EXISTS idx_forecasts_tenant_date ON public.cash_flow_forecasts(tenant_id, forecast_date, horizon_days);
CREATE INDEX IF NOT EXISTS idx_segments_tenant_cust ON public.customer_segments(tenant_id, customer_id, segment);
CREATE INDEX IF NOT EXISTS idx_collection_tenant_priority ON public.collection_actions(tenant_id, priority, customer_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_tenant_priority ON public.management_recommendations(tenant_id, priority, status);
CREATE INDEX IF NOT EXISTS idx_reports_tenant_period ON public.report_snapshots(tenant_id, report_type, financial_period);
