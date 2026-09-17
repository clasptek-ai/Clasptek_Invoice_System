/**
 * CLASPTEK ENTERPRISE PLATFORM — CONSOLIDATED GOOGLE OAUTH & DRIVE OPERATIONS
 * File: api/auth/google/auth.js
 * 
 * Endpoints Dispatched:
 * 1. POST/GET /api/auth/google/start (action: 'start')
 * 2. GET /api/auth/google/status (action: 'status')
 * 3. POST /api/auth/google/disconnect (action: 'disconnect')
 * 4. POST /api/auth/google/verify-repository (action: 'verify-repository' or 'verify')
 * 
 * STRICT INVARIANTS:
 * - Canonical callback GET /api/auth/google/callback remains in api/auth/google/callback.js
 * - Meeting recordings strictly target TENANT_CENTRAL
 * - Scopes remain drive.file + userinfo.email
 * - Tokens never returned to client
 */

const {
  resolveGoogleOAuthConfig,
  authenticateCaller,
  createOAuthState,
  parseRequestBody,
  getGoogleDriveConnectionStatus,
  disconnectGoogleDriveConnection,
  getTenantCentralDriveConnection,
  refreshAccessToken,
  resolveAuthoritativeRootFolder,
  verifyGoogleDriveFolder,
  updateCentralRootFolder
} = require('../../_lib/google-oauth-config');

/**
 * -------------------------------------------------------------
 * ACTION 1: START (OAuth Initiation)
 * -------------------------------------------------------------
 */
async function handleStart(req, res, reqUrl, body) {
  const authResult = await authenticateCaller(req);
  if (!authResult.authenticated) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'UNAUTHORIZED',
      message: authResult.message || 'Authentication required to connect Google Drive.'
    }));
  }

  const redirectTarget = body.redirectTarget || reqUrl.searchParams.get('redirect_target') || '/#meetings';

  const rawConnectionType = (
    body.connection_type ||
    body.connectionType ||
    reqUrl.searchParams.get('connection_type') ||
    reqUrl.searchParams.get('connectionType') ||
    'USER_PERSONAL'
  ).toUpperCase();

  const connectionType = rawConnectionType === 'TENANT_CENTRAL' ? 'TENANT_CENTRAL' : 'USER_PERSONAL';

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
    url: authUrl.toString(),
    state,
    connectionType,
    redirectUri: config.redirectUri,
    expiresAt
  }));
}

/**
 * -------------------------------------------------------------
 * ACTION 2: STATUS (Connection Status Query)
 * -------------------------------------------------------------
 */
async function handleStatus(req, res, reqUrl) {
  const authResult = await authenticateCaller(req);
  if (!authResult.authenticated) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'UNAUTHORIZED',
      message: authResult.message || 'Authentication required'
    }));
  }

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
    ...status,
    email: status.googleEmail || status.email,
    googleEmail: status.googleEmail || status.email,
    tenantId: authResult.tenantId
  }));
}

/**
 * -------------------------------------------------------------
 * ACTION 3: DISCONNECT (Revocation)
 * -------------------------------------------------------------
 */
async function handleDisconnect(req, res, reqUrl, body) {
  const authResult = await authenticateCaller(req);
  if (!authResult.authenticated) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'UNAUTHORIZED',
      message: authResult.message || 'Authentication required'
    }));
  }

  const hasExplicitType = Boolean(
    body.connection_type ||
    body.connectionType ||
    reqUrl.searchParams.get('connection_type') ||
    reqUrl.searchParams.get('type')
  );

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
    const userStatus = await getGoogleDriveConnectionStatus({
      tenantId: authResult.tenantId,
      userId: authResult.user.id,
      connectionType: 'USER_PERSONAL'
    });
    const centralStatus = await getGoogleDriveConnectionStatus({
      tenantId: authResult.tenantId,
      userId: authResult.user.id,
      connectionType: 'TENANT_CENTRAL'
    });
    if (userStatus.connected && !centralStatus.connected) {
      connectionType = 'USER_PERSONAL';
    }
  }

  if (connectionType === 'TENANT_CENTRAL') {
    const userRole = String(authResult.role || '').toLowerCase();
    const isAuthorizedAdmin = ['super_admin', 'super admin', 'admin', 'finance_manager'].includes(userRole);
    if (!isAuthorizedAdmin) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'FORBIDDEN',
        message: 'Only authorized administrators may disconnect the central repository.'
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
}

/**
 * -------------------------------------------------------------
 * ACTION 4: VERIFY REPOSITORY
 * -------------------------------------------------------------
 */
async function handleVerifyRepository(req, res, reqUrl, body) {
  const authResult = await authenticateCaller(req);
  if (!authResult.authenticated) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'UNAUTHORIZED',
      message: authResult.message || 'Authentication required'
    }));
  }

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

  try {
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
      statusCode = 403;
    }

    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: errorCode,
      message: msg
    }));
  }
}

/**
 * -------------------------------------------------------------
 * MAIN DISPATCHER
 * -------------------------------------------------------------
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  const reqUrl = new URL(req.url, 'http://localhost');
  const pathname = reqUrl.pathname;
  let action = reqUrl.searchParams.get('action');

  let body = {};
  if (req.method === 'POST') {
    body = await parseRequestBody(req).catch(() => ({}));
  }

  if (!action) {
    if (pathname.includes('start')) action = 'start';
    else if (pathname.includes('status')) action = 'status';
    else if (pathname.includes('disconnect')) action = 'disconnect';
    else if (pathname.includes('verify-repository') || pathname.includes('verify')) action = 'verify-repository';
    else if (body.action) action = body.action;
    else if (req.method === 'GET') action = 'status';
  }

  try {
    if (action === 'start') {
      return await handleStart(req, res, reqUrl, body);
    }
    if (action === 'status') {
      return await handleStatus(req, res, reqUrl);
    }
    if (action === 'disconnect') {
      return await handleDisconnect(req, res, reqUrl, body);
    }
    if (action === 'verify-repository' || action === 'verify') {
      return await handleVerifyRepository(req, res, reqUrl, body);
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: 'NOT_FOUND',
      message: `Unknown Google Drive action "${action || pathname}". Supported: start, status, disconnect, verify-repository.`
    }));
  } catch (err) {
    console.error('[API /api/auth/google/auth Error]', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'INTERNAL_SERVER_ERROR', message: err.message }));
  }
};
