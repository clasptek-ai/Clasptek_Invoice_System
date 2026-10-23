-- =============================================================================
-- CLASPTEK MEETINGS SYSTEM: GOOGLE MEET CALENDAR METADATA EXTENSION
-- MIGRATION: 20261023_meetings_google_meet_calendar_fields.sql
-- Description: Adds dedicated optional columns for Google Calendar event and
--              conference identifiers to public.meetings.
-- Mode: REVIEWABLE OFFLINE MIGRATION — DO NOT EXECUTE OR APPLY DIRECTLY.
-- Preserves: All existing tenant isolation, foreign keys, and RLS policies.
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'meetings'
          AND column_name = 'calendar_event_id'
    ) THEN
        ALTER TABLE public.meetings ADD COLUMN calendar_event_id TEXT;
        COMMENT ON COLUMN public.meetings.calendar_event_id IS 'External Google Calendar event identifier for Google Meet meetings';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'meetings'
          AND column_name = 'calendar_conference_id'
    ) THEN
        ALTER TABLE public.meetings ADD COLUMN calendar_conference_id TEXT;
        COMMENT ON COLUMN public.meetings.calendar_conference_id IS 'External Google Meet conference identifier';
    END IF;
END $$;