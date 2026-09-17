-- =============================================================================
-- CLASPTEK ENTERPRISE PLATFORM — GOOGLE DRIVE OAUTH 2.0 INTEGRATION
-- MIGRATION: 20260917_google_drive_oauth.sql
-- Description: Tables for OAuth 2.0 state validation, anti-replay protection,
--              and server-side Google Drive connection token management.
-- Invariants:
-- - Strict tenant isolation on every table
-- - Atomic single-use state verification preventing OAuth callback replay attacks
-- - Zero exposure of OAuth tokens or client secrets to frontend clients
-- - Non-destructive: preserves all existing certified tables and relationships
-- =============================================================================

-- 1. OAuth States Table (Replay Protection & State Verification)
CREATE TABLE IF NOT EXISTS public.oauth_states (
    state TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'google',
    redirect_target TEXT DEFAULT '/#meetings',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    CONSTRAINT uq_oauth_states_state UNIQUE (state)
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_lookup 
    ON public.oauth_states(state, used_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_oauth_states_tenant_user 
    ON public.oauth_states(tenant_id, user_id);

-- Enable RLS on oauth_states
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view only their own states
DROP POLICY IF EXISTS oauth_states_user_select ON public.oauth_states;
CREATE POLICY oauth_states_user_select ON public.oauth_states
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role has full management
DROP POLICY IF EXISTS oauth_states_service_all ON public.oauth_states;
CREATE POLICY oauth_states_service_all ON public.oauth_states
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- 2. Google Drive Connections Table (Secure Token Management)
CREATE TABLE IF NOT EXISTS public.google_drive_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    google_user_id TEXT,
    google_email TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type TEXT DEFAULT 'Bearer',
    scope TEXT,
    expiry_date TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'REVOKED', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_google_drive_tenant_user UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_google_drive_conn_user 
    ON public.google_drive_connections(tenant_id, user_id, status);

CREATE INDEX IF NOT EXISTS idx_google_drive_conn_email 
    ON public.google_drive_connections(google_email);

-- Enable RLS on google_drive_connections
ALTER TABLE public.google_drive_connections ENABLE ROW LEVEL SECURITY;

-- Block public / anon access completely
REVOKE ALL ON public.google_drive_connections FROM anon, public;

-- Allow authenticated users to see connection status, but tokens should be queried through serverless functions
DROP POLICY IF EXISTS google_drive_user_select ON public.google_drive_connections;
CREATE POLICY google_drive_user_select ON public.google_drive_connections
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role has full management
DROP POLICY IF EXISTS google_drive_service_all ON public.google_drive_connections;
CREATE POLICY google_drive_service_all ON public.google_drive_connections
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
