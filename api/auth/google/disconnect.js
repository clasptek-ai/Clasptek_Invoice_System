/**
 * CLASPTEK ENTERPRISE PLATFORM — GOOGLE DRIVE DISCONNECT ENDPOINT
 * Route: POST /api/auth/google/disconnect
 * 
 * Secure Serverless Function on Vercel
 * Invariants:
 * - Requires authenticated user via Supabase JWT
 * - Revokes connection status and marks connection REVOKED in database
 */

const {
  authenticateCaller,
  parseRequestBody,
  disconnectGoogleDriveConnection
} = require('./google-oauth-config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== 'POST') {
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
    const body = await parseRequestBody(req).catch(() => ({}));
    const hasExplicitType = Boolean(body.connection_type || body.connectionType || reqUrl.searchParams.get('connection_type') || reqUrl.searchParams.get('type'));
    let connectionType = 'TENANT_CENTRAL';

    if (hasExplicitType) {
      const rawType = (
        body.connection_type ||
        body.connectionType ||
        reqUrl.searchParams.get('connection_type') ||
        reqUrl.searchParams.get('type')
      ).toUpperCase();
      connectionType = rawType === 'USER_PERSONAL' ? 'USER_PERSONAL' : 'TENANT_CENTRAL';
    } else {
      // If not explicitly specified, check which connection is active
      const userStatus = await require('./google-oauth-config').getGoogleDriveConnectionStatus({
        tenantId: authResult.tenantId,
        userId: authResult.user.id,
        connectionType: 'USER_PERSONAL'
      });
      const centralStatus = await require('./google-oauth-config').getGoogleDriveConnectionStatus({
        tenantId: authResult.tenantId,
        userId: authResult.user.id,
        connectionType: 'TENANT_CENTRAL'
      });
      if (userStatus.connected && !centralStatus.connected) {
        connectionType = 'USER_PERSONAL';
      }
    }

    // Gate: Disconnecting central repository requires administrator permission
    if (connectionType === 'TENANT_CENTRAL') {
      const userRole = String(authResult.role || '').toLowerCase();
      const isAuthorizedAdmin = ['super_admin', 'super admin', 'admin', 'finance_manager'].includes(userRole);
      if (!isAuthorizedAdmin) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          error: 'FORBIDDEN',
          message: 'Only authorized tenant administrators may disconnect the central Google Drive repository.'
        }));
      }
    }

    const result = await disconnectGoogleDriveConnection({
      tenantId: authResult.tenantId,
      userId: authResult.user.id,
      connectionType
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.end(JSON.stringify(result));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Failed to disconnect Google Drive'
    }));
  }
};
