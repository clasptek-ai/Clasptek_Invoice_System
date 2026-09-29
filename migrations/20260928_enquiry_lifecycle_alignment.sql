-- =============================================================================
-- Migration: 20260928_enquiry_lifecycle_alignment.sql
-- Description: Align public.enquiries Status Check Constraint and Migrate Legacy
--              Statuses (APPLIED -> INVOICE_REQUESTED, OFFERED -> INVOICE_ISSUED)
--              to Reflect the Authentic Clasptek Training Centre Lifecycle.
--
-- Task ID: CLASPTEK-REAL-DATA-READINESS-FIX-001
-- Target Lifecycle:
--   NEW -> CONTACTED -> INTERESTED -> INVOICE_REQUESTED -> INVOICE_ISSUED -> ENROLLED -> LOST
-- =============================================================================

BEGIN;

-- 1. Drop existing check constraint if present
ALTER TABLE public.enquiries
    DROP CONSTRAINT IF EXISTS enquiries_status_check;

-- 2. Migrate existing historical / test records to canonical lifecycle stages
UPDATE public.enquiries
SET status = 'INVOICE_REQUESTED',
    updated_at = NOW()
WHERE status = 'APPLIED';

UPDATE public.enquiries
SET status = 'INVOICE_ISSUED',
    updated_at = NOW()
WHERE status = 'OFFERED';

-- 3. Re-apply check constraint with authoritative operational lifecycle
ALTER TABLE public.enquiries
    ADD CONSTRAINT enquiries_status_check
    CHECK (status IN (
        'NEW',
        'CONTACTED',
        'INTERESTED',
        'INVOICE_REQUESTED',
        'INVOICE_ISSUED',
        'ENROLLED',
        'LOST'
    ));

-- 4. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
