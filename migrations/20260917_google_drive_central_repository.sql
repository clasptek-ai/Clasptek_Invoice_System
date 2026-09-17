-- =============================================================================
-- CLASPTEK ENTERPRISE PLATFORM — GOOGLE DRIVE CENTRAL REPOSITORY MIGRATION
-- MIGRATION: 20260917_google_drive_central_repository.sql
-- Description: Tenant-level central Google Drive repository for meeting recordings.
-- Constraints:
-- - Explicit separation between TENANT_CENTRAL and USER_PERSONAL connections
-- - Enforces unique TENANT_CENTRAL connection per tenant
-- - Tracks authoritative Clasptek root folder ID and last verification timestamp
-- - Non-destructive to existing user-personal connections
-- =============================================================================

ALTER TABLE public.google_drive_connections
ADD COLUMN IF NOT EXISTS connection_type TEXT NOT NULL DEFAULT 'USER_PERSONAL'
CHECK (connection_type IN ('TENANT_CENTRAL', 'USER_PERSONAL'));

ALTER TABLE public.google_drive_connections
ADD COLUMN IF NOT EXISTS root_folder_id TEXT;

ALTER TABLE public.google_drive_connections
ADD COLUMN IF NOT EXISTS root_folder_name TEXT DEFAULT 'Clasptek Meeting Recordings';

ALTER TABLE public.google_drive_connections
ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

-- Ensure only one TENANT_CENTRAL connection exists per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_central_gdrive
ON public.google_drive_connections (tenant_id)
WHERE connection_type = 'TENANT_CENTRAL';

CREATE INDEX IF NOT EXISTS idx_gdrive_connections_lookup
ON public.google_drive_connections (tenant_id, connection_type, status);
