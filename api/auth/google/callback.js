/**
 * CLASPTEK ENTERPRISE PLATFORM — GOOGLE OAUTH CALLBACK ENDPOINT
 * Route: GET /api/auth/google/callback
 * 
 * Production URL: https://app.clasptek.org/api/auth/google/callback
 * Local Development: http://localhost:3000/api/auth/google/callback
 * 
 * Strictly Enforced Specification:
 * 1. Accepts GET requests.
 * 2. Reads code, state, and error from URL query.
 * 3. Handles user cancellation (error=access_denied) -> /?google_drive=access_denied#meetings.
 * 4. Validates state against public.oauth_states (must match, unexpired, and used_at IS NULL).
 * 5. Atomically consumes state (used_at = NOW()) to block callback replay attacks.
 * 6. Rejects missing, expired, invalid, or replayed states -> /?google_drive=invalid_state#meetings.
 * 7. Exchanges authorization code with https://oauth2.googleapis.com/token using server-side secrets.
 * 8. Fetches Google account email via Google user-info endpoint.
 * 9. Upserts connection into public.google_drive_connections associated with tenant_id & user_id.
 * 10. STRICT SECURITY: Never exposes access token, refresh token, or client secret to browser.
 * 11. On success, redirects to: /?google_drive=connected#meetings.
 */

const {
  resolveGoogleOAuthConfig,
  validateAndConsumeOAuthState,
  exchangeAuthorizationCode,
  fetchGoogleUserInfo,
  resolveAuthoritativeRootFolder,
  upsertGoogleDriveConnection,
  getTenantCentralDriveConnection,
  validateReturnUrl,
  appendQueryParams
} = require('../../_lib/google-oauth-config');

module.exports = async function handler(req, res) {
  // 1. Only accept GET requests
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Allow', 'GET');
    return res.end(JSON.stringify({ error: 'Method not allowed. OAuth callback requires GET.' }));
  }

  // Parse query parameters
  const reqUrl = new URL(req.url, 'http://localhost');
  const code = reqUrl.searchParams.get('code');
  const state = reqUrl.searchParams.get('state');
  const error = reqUrl.searchParams.get('error');
  const errorDescription = reqUrl.searchParams.get('error_description');

  // Helper: Perform safe HTTP 302 redirect with meta-refresh fallback
  const safeRedirect = (destinationUrl, message = '') => {
    res.writeHead(302, {
      Location: destinationUrl,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=${destinationUrl}">
  <title>Redirecting to Clasptek Portal...</title>
</head>
<body style="font-family:sans-serif; text-align:center; padding:50px; background:#0F172A; color:#F8FAFC;">
  <h2>${message || 'Redirecting to Clasptek Enterprise Portal...'}</h2>
  <p>If you are not redirected automatically, <a href="${destinationUrl}" style="color:#38BDF8;">click here to continue</a>.</p>
</body>
</html>`);
  };

  let returnUrl = '/meetings';

  try {
    // 2. Handle Google-returned errors (e.g. user denied permission)
    if (error) {
      if (state) {
        try {
          const stateCheck = await validateAndConsumeOAuthState(state);
          if (stateCheck && stateCheck.stateRecord) {
            returnUrl = validateReturnUrl(stateCheck.stateRecord.redirect_target, '/meetings');
          }
        } catch (_) {}
      }
      const isDenied = error === 'access_denied';
      const destination = appendQueryParams(returnUrl, {
        google_connect: isDenied ? 'denied' : 'error',
        google_drive: isDenied ? 'access_denied' : 'error',
        reason: isDenied ? 'access_denied' : 'denied'
      });
      return safeRedirect(destination, isDenied ? 'Google connection was cancelled.' : 'Google authorization was cancelled or denied.');
    }

    // 3. Reject missing code or state parameters
    if (!code || !state) {
      return safeRedirect('/meetings?google_connect=invalid_state&google_drive=invalid_state', 'Google authorization could not be verified. Missing required OAuth parameters.');
    }

    // 4. Validate and atomically consume OAuth state
    // Enforces: matching state, used_at IS NULL, expires_at > NOW()
    const stateCheck = await validateAndConsumeOAuthState(state);
    if (!stateCheck.valid) {
      // Rejects invalid, expired, or replayed state
      return safeRedirect('/meetings?google_connect=invalid_state&google_drive=invalid_state', 'Google authorization could not be verified. State token is invalid, expired, or has already been used.');
    }

    const { stateRecord } = stateCheck;
    const tenantId = stateRecord.tenant_id;
    const userId = stateRecord.user_id;
    const connectionType = stateRecord.connection_type || 'USER_PERSONAL';
    returnUrl = validateReturnUrl(stateRecord.redirect_target, '/meetings');

    // 5. Resolve canonical redirect URI (must match exact URI sent in start request)
    const config = resolveGoogleOAuthConfig(req);

    // 6. Exchange authorization code with https://oauth2.googleapis.com/token
    let tokenResult;
    try {
      tokenResult = await exchangeAuthorizationCode({
        code,
        redirectUri: config.redirectUri
      });
    } catch (tokenErr) {
      const destination = appendQueryParams(returnUrl, {
        google_connect: 'error',
        google_drive: 'error',
        reason: 'token_exchange_failed'
      });
      return safeRedirect(destination, 'Failed to exchange authorization code with Google. Please try again.');
    }

    const tokens = tokenResult.tokens;
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    const expiresIn = tokens.expires_in;
    const grantedScope = tokens.scope;

    // 7. Fetch authenticated Google user's email
    let userInfo;
    try {
      userInfo = await fetchGoogleUserInfo(accessToken);
    } catch (userErr) {
      const destination = appendQueryParams(returnUrl, {
        google_connect: 'error',
        google_drive: 'error',
        reason: 'userinfo_failed'
      });
      return safeRedirect(destination, 'Connected to Google Drive, but failed to retrieve account email.');
    }

    const googleEmail = userInfo.email || 'unknown@gmail.com';
    const googleUserId = userInfo.id || null;

    // 8. Handle Root Folder Provisioning for TENANT_CENTRAL repository
    let rootFolderId = null;
    let rootFolderName = 'Clasptek Meeting Recordings';

    let existingConnection = null;
    if (connectionType === 'TENANT_CENTRAL') {
      try {
        existingConnection = await getTenantCentralDriveConnection(tenantId);
      } catch (_) {}
    }
    const effectiveRefreshToken = refreshToken || (existingConnection && existingConnection.refresh_token) || null;

    if (connectionType === 'TENANT_CENTRAL') {
      try {
        const resolvedFolder = await resolveAuthoritativeRootFolder({
          tenantId,
          accessToken,
          centralConnection: {
            tenant_id: tenantId,
            connection_type: 'TENANT_CENTRAL',
            access_token: accessToken,
            refresh_token: effectiveRefreshToken,
            root_folder_id: existingConnection && existingConnection.root_folder_id,
            root_folder_name: existingConnection && existingConnection.root_folder_name
          }
        });
        rootFolderId = resolvedFolder.folderId;
        rootFolderName = resolvedFolder.folderName;
      } catch (folderErr) {
        console.error('[OAuth Callback] Root folder provisioning note:', folderErr.message);
      }
    }

    // 9. Upsert connection into public.google_drive_connections associated with tenant_id & connection_type
    try {
      await upsertGoogleDriveConnection({
        tenantId,
        userId,
        connectionType,
        googleUserId,
        googleEmail,
        accessToken,
        refreshToken: effectiveRefreshToken,
        rootFolderId: rootFolderId || (existingConnection && existingConnection.root_folder_id),
        rootFolderName: rootFolderName || (existingConnection && existingConnection.root_folder_name),
        scope: grantedScope,
        expiresIn
      });
    } catch (persistErr) {
      console.error('[OAuth Callback] Connection persistence failure:', persistErr.message);
      const destination = appendQueryParams(returnUrl, {
        google_connect: 'error',
        google_drive: 'error',
        reason: 'persistence_failed'
      });
      return safeRedirect(destination, 'Google authorization succeeded, but failed to save connection.');
    }

    // 10. On success, determine granted Calendar scope and redirect to Meetings view preserving context
    const grantedScopesStr = String(grantedScope || '');
    const hasCalScope =
      grantedScopesStr.includes('calendar.events') ||
      grantedScopesStr.includes('calendar');

    const destination = appendQueryParams(returnUrl, {
      google_connect: 'connected',
      google_drive: 'connected',
      type: connectionType === 'TENANT_CENTRAL' ? 'central' : 'personal',
      calendar_scope: hasCalScope ? 'granted' : 'missing'
    });

    return safeRedirect(
      destination,
      connectionType === 'TENANT_CENTRAL'
        ? 'Central Google organization account connected successfully!'
        : 'Personal Google Drive connected successfully!'
    );
  } catch (err) {
    const destination = appendQueryParams(returnUrl || '/meetings', {
      google_connect: 'error',
      google_drive: 'error',
      reason: 'internal_error'
    });
    return safeRedirect(destination, 'An unexpected error occurred while connecting Google.');
  }
};
