/**
 * CLASPTEK ENTERPRISE PLATFORM — GOOGLE OAUTH START ENDPOINT
 * Route: POST /api/auth/google/start (also accepts GET for direct navigation)
 * 
 * Secure Serverless Function on Vercel
 * Invariants:
 * - Requires authenticated Clasptek user via Supabase JWT
 * - Generates cryptographically secure 32-byte state
 * - Persists state in public.oauth_states with single-use anti-replay enforcement
 * - Uses exact canonical redirect URI: https://portal.clasptek.org/api/auth/google/callback
 *   (or http://localhost:3000/api/auth/google/callback in local development)
 * - Requests least-privileged scopes: drive.file + userinfo.email
 * - Enforces offline access & prompt=consent so Google issues a refresh token
 */

const {
  resolveGoogleOAuthConfig,
  authenticateCaller,
  createOAuthState,
  parseRequestBody
} = require('./google-oauth-config');

module.exports = async function handler(req, res) {
  // CORS & Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  try {
    const authResult = await authenticateCaller(req);
    if (!authResult.authenticated) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'UNAUTHORIZED',
        message: authResult.message || 'Authentication required to connect Google Drive.'
      }));
    }

    const reqUrl = new URL(req.url, 'http://localhost');
    const body = req.method === 'POST' ? await parseRequestBody(req) : {};
    const redirectTarget = body.redirectTarget || reqUrl.searchParams.get('redirect_target') || '/#meetings';

    // Authoritative Connection Type (TENANT_CENTRAL vs USER_PERSONAL)
    const rawConnectionType = (
      body.connection_type ||
      body.connectionType ||
      reqUrl.searchParams.get('connection_type') ||
      reqUrl.searchParams.get('connectionType') ||
      'USER_PERSONAL'
    ).toUpperCase();

    const connectionType = rawConnectionType === 'TENANT_CENTRAL' ? 'TENANT_CENTRAL' : 'USER_PERSONAL';

    // Gate: Only authorized tenant administrators can establish a TENANT_CENTRAL repository
    if (connectionType === 'TENANT_CENTRAL') {
      const userRole = String(authResult.role || '').toLowerCase();
      const isAuthorizedAdmin = ['super_admin', 'super admin', 'admin', 'finance_manager'].includes(userRole);
      if (!isAuthorizedAdmin) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          error: 'FORBIDDEN',
          message: 'Only authorized tenant administrators may establish the tenant-central Google Drive repository.'
        }));
      }
    }

    // 1. Generate and persist single-use OAuth state with authoritative connectionType
    const { state, expiresAt } = await createOAuthState({
      tenantId: authResult.tenantId,
      userId: authResult.user.id,
      redirectTarget,
      connectionType
    });

    // 2. Resolve Google OAuth configuration & canonical redirect URI
    const config = resolveGoogleOAuthConfig(req);

    // Build Google OAuth authorization URL
    const authUrl = new URL(config.authBaseUrl);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', config.scopes);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    // If query parameter ?redirect=true is passed on GET, perform direct HTTP 302 redirect
    if (req.method === 'GET' && reqUrl.searchParams.get('redirect') === 'true') {
      res.writeHead(302, {
        Location: authUrl.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      return res.end();
    }

    // Default: return JSON containing the authUrl, redirectUri, and connectionType
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.end(JSON.stringify({
      success: true,
      authUrl: authUrl.toString(),
      state,
      connectionType,
      redirectUri: config.redirectUri,
      expiresAt
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Failed to initialize Google Drive connection'
    }));
  }
};
