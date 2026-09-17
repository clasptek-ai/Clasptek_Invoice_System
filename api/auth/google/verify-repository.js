/**
 * CLASPTEK ENTERPRISE PLATFORM — GOOGLE DRIVE REPOSITORY VERIFICATION ENDPOINT
 * Route: POST /api/auth/google/verify-repository
 * 
 * Privileged Administrative Endpoint
 * Invariants:
 * - Requires authenticated Admin or Super Admin
 * - Verifies the tenant's authoritative TENANT_CENTRAL repository folder
 * - Automatically refreshes token if expired
 * - Updates last_verified_at on successful verification
 * - Returns structured error codes on failure (FOLDER_INACCESSIBLE, FOLDER_NOT_FOUND, etc.)
 */

const {
  authenticateCaller,
  getTenantCentralDriveConnection,
  refreshAccessToken,
  resolveAuthoritativeRootFolder,
  verifyGoogleDriveFolder,
  updateCentralRootFolder
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
    // 1. Authenticate caller
    const authResult = await authenticateCaller(req);
    if (!authResult.authenticated) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'UNAUTHORIZED',
        message: authResult.message || 'Authentication required'
      }));
    }

    // 2. Gate: Administrator role verification
    const userRole = String(authResult.role || '').toLowerCase();
    const isAuthorizedAdmin = ['super_admin', 'super admin', 'admin', 'finance_manager'].includes(userRole);
    if (!isAuthorizedAdmin) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'FORBIDDEN',
        message: 'Only authorized tenant administrators may verify the central Google Drive repository.'
      }));
    }

    const tenantId = authResult.tenantId;

    // 3. Retrieve TENANT_CENTRAL connection
    const centralConn = await getTenantCentralDriveConnection(tenantId);
    if (!centralConn || centralConn.status !== 'CONNECTED') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'NOT_CONNECTED',
        message: 'Central Google Drive repository is not connected for this tenant.'
      }));
    }

    // 4. Check token expiration & refresh if needed
    let accessToken = centralConn.access_token;
    const expiryTime = centralConn.expiry_date ? new Date(centralConn.expiry_date).getTime() : 0;
    const now = Date.now();

    if (expiryTime && (expiryTime - now < 300000)) {
      if (!centralConn.refresh_token) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          error: 'GOOGLE_AUTH_REQUIRED',
          message: 'Central Drive token expired and no refresh token is available. Please reconnect the organization account.'
        }));
      }

      try {
        const refreshed = await refreshAccessToken({
          refreshToken: centralConn.refresh_token,
          tenantId,
          connectionType: 'TENANT_CENTRAL'
        });
        accessToken = refreshed.accessToken;
      } catch (refErr) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          error: 'GOOGLE_TOKEN_REFRESH_FAILED',
          message: 'Failed to refresh Google Drive access token: ' + refErr.message
        }));
      }
    }

    // 5. Authoritatively resolve & verify folder
    const resolved = await resolveAuthoritativeRootFolder({
      tenantId,
      accessToken,
      centralConnection: centralConn
    });

    const nowIso = new Date().toISOString();
    await updateCentralRootFolder({
      tenantId,
      folderId: resolved.folderId,
      folderName: resolved.folderName
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.end(JSON.stringify({
      success: true,
      folderId: resolved.folderId,
      folderName: resolved.folderName,
      source: resolved.source,
      lastVerifiedAt: nowIso,
      message: `Repository folder '${resolved.folderName}' verified successfully.`
    }));
  } catch (err) {
    const msg = err.message || '';
    let errorCode = 'VERIFICATION_FAILED';
    let statusCode = 500;

    if (msg.includes('MISSING_ROOT_FOLDER_ID')) {
      errorCode = 'MISSING_ROOT_FOLDER_ID';
      statusCode = 400;
    } else if (msg.includes('FOLDER_NOT_FOUND')) {
      errorCode = 'FOLDER_NOT_FOUND';
      statusCode = 404;
    } else if (msg.includes('FOLDER_INACCESSIBLE')) {
      errorCode = 'FOLDER_INACCESSIBLE';
      statusCode = 422;
    } else if (msg.includes('INVALID_ROOT_FOLDER')) {
      errorCode = 'INVALID_ROOT_FOLDER';
      statusCode = 422;
    } else if (msg.includes('GOOGLE_AUTH_REQUIRED')) {
      errorCode = 'GOOGLE_AUTH_REQUIRED';
      statusCode = 401;
    }

    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: errorCode,
      message: msg
    }));
  }
};
