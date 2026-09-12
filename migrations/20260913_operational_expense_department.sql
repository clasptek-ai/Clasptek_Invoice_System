-- ====================================================================
-- CLASPTEK ENTERPRISE PLATFORM — PRODUCTION FINANCIAL GOVERNANCE
-- Migration: 20260913_operational_expense_department.sql
-- Table: public.expenses
-- Purpose: Add non-destructive department column for organizational expense allocation
-- Safety: Fully non-destructive. Zero column/table/constraint drops.
-- ====================================================================

-- 1. Add department column if not already present
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS department TEXT;

-- 2. Set safe default for organizational allocation
ALTER TABLE public.expenses
ALTER COLUMN department SET DEFAULT 'Operations';

-- 3. Add comment for PostgreSQL documentation
COMMENT ON COLUMN public.expenses.department IS 
'Organizational department responsible for this operational expense (Operations, Academics, Marketing, Administration, Technology, Management, Finance, General / Shared).';

-- 4. Verification Query:
-- Run this query after execution to confirm the column exists:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'department';

-- 5. Safe Rollback Strategy:
-- If rollback is ever required, drop the default without destroying data:
-- ALTER TABLE public.expenses ALTER COLUMN department DROP DEFAULT;
-- If strictly required to remove column:
-- ALTER TABLE public.expenses DROP COLUMN IF EXISTS department;
