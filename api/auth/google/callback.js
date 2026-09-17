/**
 * CLASPTEK ENTERPRISE PLATFORM — GOOGLE OAUTH CALLBACK ENDPOINT
 * Route: GET /api/auth/google/callback
 * 
 * Production URL: https://portal.clasptek.org/api/auth/google/callback
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
  upsertGoogleDriveConnection
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

  try {
    // 2. Handle Google-returned errors (e.g. user denied permission)
    if (error) {
      if (error === 'access_denied') {
        return safeRedirect('/?google_drive=access_denied#meetings', 'Google Drive connection was cancelled.');
      }
      return safeRedirect('/?google_drive=error&reason=denied#meetings', 'Google authorization was cancelled or denied.');
    }

    // 3. Reject missing code or state parameters
    if (!code || !state) {
      return safeRedirect('/?google_drive=invalid_state#meetings', 'Google authorization could not be verified. Missing required OAuth parameters.');
    }

    // 4. Validate and atomically consume OAuth state
    // Enforces: matching state, used_at IS NULL, expires_at > NOW()
    const stateCheck = await validateAndConsumeOAuthState(state);
    if (!stateCheck.valid) {
      // Rejects invalid, expired, or replayed state
      return safeRedirect('/?google_drive=invalid_state#meetings', 'Google authorization could not be verified. State token is invalid, expired, or has already been used.');
    }

    const { stateRecord } = stateCheck;
    const tenantId = stateRecord.tenant_id;
    const userId = stateRecord.user_id;
    const connectionType = stateRecord.connection_type || 'USER_PERSONAL';

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
      return safeRedirect('/?google_drive=error&reason=token_exchange_failed#meetings', 'Failed to exchange authorization code with Google. Please try again.');
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
      return safeRedirect('/?google_drive=error&reason=userinfo_failed#meetings', 'Connected to Google Drive, but failed to retrieve account email.');
    }

    const googleEmail = userInfo.email || 'unknown@gmail.com';
    const googleUserId = userInfo.id || null;

    // 8. Handle Root Folder Provisioning for TENANT_CENTRAL repository
    let rootFolderId = null;
    let rootFolderName = 'Clasptek Meeting Recordings';

    if (connectionType === 'TENANT_CENTRAL') {
      try {
        const resolvedFolder = await resolveAuthoritativeRootFolder({
          tenantId,
          accessToken,
          centralConnection: {
            tenant_id: tenantId,
            connection_type: 'TENANT_CENTRAL',
            access_token: accessToken,
            refresh_token: refreshToken
          }
        });
        rootFolderId = resolvedFolder.folderId;
        rootFolderName = resolvedFolder.folderName;
      } catch (folderErr) {
        console.error('[OAuth Callback] Root folder provisioning note:', folderErr.message);
      }
    }

    // 9. Upsert connection into public.google_drive_connections associated with tenant_id & connection_type
    await upsertGoogleDriveConnection({
      tenantId,
      userId,
      connectionType,
      googleUserId,
      googleEmail,
      accessToken,
      refreshToken,
      rootFolderId,
      rootFolderName,
      scope: grantedScope,
      expiresIn
    });

    // 10. On success, redirect to appropriate portal view
    if (connectionType === 'TENANT_CENTRAL') {
      return safeRedirect('/?google_drive=connected&type=central#meetings', 'Central Google Drive repository connected successfully!');
    }
    return safeRedirect('/?google_drive=connected#meetings', 'Personal Google Drive connected successfully!');
  } catch (err) {
    return safeRedirect('/?google_drive=error&reason=internal_error#meetings', 'An unexpected error occurred while connecting Google Drive.');
  }
};
