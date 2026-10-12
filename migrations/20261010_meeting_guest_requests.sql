-- =============================================================================
-- CLASPTEK LIVEKIT MEETINGS: GUEST WAITING ROOM & INVITATION LEDGER
-- MIGRATION: 20261010_meeting_guest_requests.sql
-- Description: Smallest necessary schema addition for external guest requests,
--              facilitator waiting room management, and short-lived guest tokens.
-- Multi-Tenant Isolation & RLS Security Enforced.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.meeting_guest_requests (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    meeting_id VARCHAR(64) NOT NULL,
    meeting_public_id VARCHAR(64) NOT NULL,
    guest_name VARCHAR(128) NOT NULL,
    guest_email VARCHAR(255) NOT NULL,
    guest_organization VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'EXPIRED')),
    request_token VARCHAR(128) NOT NULL UNIQUE,     -- High-entropy session secret for polling
    livekit_token TEXT,                             -- Short-lived room token (populated upon APPROVAL)
    livekit_server_url VARCHAR(255),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '4 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guest_requests_meeting ON public.meeting_guest_requests (meeting_public_id, status);
CREATE INDEX IF NOT EXISTS idx_guest_requests_token ON public.meeting_guest_requests (request_token);
CREATE INDEX IF NOT EXISTS idx_guest_requests_tenant ON public.meeting_guest_requests (tenant_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.meeting_guest_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated tenant personnel can manage guest requests for their tenant
DROP POLICY IF EXISTS "meeting_guest_requests_tenant_isolation" ON public.meeting_guest_requests;
CREATE POLICY "meeting_guest_requests_tenant_isolation"
    ON public.meeting_guest_requests
    FOR ALL
    TO authenticated
    USING (tenant_id = public.get_auth_tenant_id())
    WITH CHECK (tenant_id = public.get_auth_tenant_id());
