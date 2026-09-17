/**
 * CLASPTEK ENTERPRISE PLATFORM — GOOGLE DRIVE CONNECTION STATUS ENDPOINT
 * Route: GET /api/auth/google/status
 * 
 * Secure Serverless Function on Vercel
 * Invariants:
 * - Requires authenticated user via Supabase JWT
 * - Resolves caller user and authoritative tenant
 * - Returns sanitized connection status
 * - STRICT INVARIANT: NEVER returns access_token, refresh_token, or client_secret
 */

const {
  authenticateCaller,
  getGoogleDriveConnectionStatus
} = require('./google-oauth-config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const authResult = await authenticateCaller(req);
    if (!authResult.authenticated) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'UNAUTHORIZED',
        message: authResult.message || 'Authentication required'
      }));
    }

    const reqUrl = new URL(req.url, 'http://localhost');
    const hasExplicitType = reqUrl.searchParams.has('connection_type') || reqUrl.searchParams.has('type');
    const requestedType = (
      reqUrl.searchParams.get('connection_type') ||
      reqUrl.searchParams.get('type') ||
      'TENANT_CENTRAL'
    ).toUpperCase();

    let connectionType = requestedType === 'USER_PERSONAL' ? 'USER_PERSONAL' : 'TENANT_CENTRAL';

    let status = await getGoogleDriveConnectionStatus({
      tenantId: authResult.tenantId,
      userId: authResult.user.id,
      connectionType
    });

    if (!hasExplicitType && status.status === 'NOT_CONNECTED') {
      const personalStatus = await getGoogleDriveConnectionStatus({
        tenantId: authResult.tenantId,
        userId: authResult.user.id,
        connectionType: 'USER_PERSONAL'
      });
      if (personalStatus.status !== 'NOT_CONNECTED') {
        status = personalStatus;
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.end(JSON.stringify({
      success: true,
      ...status
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Failed to retrieve Google Drive status'
    }));
  }
};
