-- =============================================================================
-- CLASPTEK MEETINGS SYSTEM: GOOGLE MEET PROVIDER EXTENSION
-- MIGRATION: 20261010_meetings_google_meet_provider.sql
-- Description: Extends the meetings provider constraint to allow 'GOOGLE_MEET'
--              in addition to 'LIVEKIT', 'DAILY', and 'MOCK'.
-- Preserves: All existing tenant isolation, foreign keys, and RLS policies.
-- =============================================================================

-- 1. Safely update provider CHECK constraint on public.meetings
DO $$
BEGIN
    -- Check if constraint exists and alter it
    IF EXISTS (
        SELECT 1
        FROM information_schema.constraint_column_usage
        WHERE table_schema = 'public'
          AND table_name = 'meetings'
          AND column_name = 'provider'
    ) THEN
        ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_provider_check;
        ALTER TABLE public.meetings ADD CONSTRAINT meetings_provider_check
            CHECK (provider IN ('LIVEKIT', 'DAILY', 'MOCK', 'GOOGLE_MEET'));
    END IF;
END $$;

-- 2. Verify provider_room_url column exists and is indexed for lookups
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'meetings'
          AND column_name = 'provider_room_url'
    ) THEN
        ALTER TABLE public.meetings ADD COLUMN provider_room_url TEXT;
    END IF;
END $$;

-- Index for meetings by provider
CREATE INDEX IF NOT EXISTS idx_meetings_tenant_provider
    ON public.meetings(tenant_id, provider)
    WHERE deleted_at IS NULL;
