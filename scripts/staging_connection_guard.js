/**
 * scripts/staging_connection_guard.js
 * 
 * CLASPTEK PLATFORM SECURITY — STAGING DATABASE CONNECTION GUARD
 * 
 * Shared validator and client factory for staging database runners.
 * STRICT SAFETY RULES:
 * 1. Zero tolerance for production reference 'logaawoigfxnisimfatf'.
 * 2. Strict non-substring validation for staging hosts and connection profiles.
 * 3. Enforces strict TLS certificate verification (rejectUnauthorized: true, SNI).
 * 4. Never passes unvalidated raw connection strings to PostgreSQL clients.
 * 5. Passes validated discrete parameters with bounded timeouts.
 * 6. Redacts passwords and credentials from all validation errors and logs.
 * 7. Safely validates percent-encoded components against production quarantine.
 */

const { URL } = require('url');
const { Client } = require('pg');

const PROD_REF = 'logaawoigfxnisimfatf';
const EXPECTED_STAGING_REF = 'dwhjoiebzwnjdpcvcwvs';

const APPROVED_PROFILES = Object.freeze({
  DIRECT: {
    host: `db.${EXPECTED_STAGING_REF}.supabase.co`,
    ports: [5432],
    username: 'postgres',
    database: 'postgres',
  },
  POOLER: {
    // Note: Pending independent non-secret confirmation of exact AWS region (e.g. eu-west-1),
    // strictly validates aws-0 pooler domain structure.
    hostPattern: /^aws-0-[a-z0-9-]+\.pooler\.supabase\.com$/,
    ports: [5432, 6543], // 5432 (Session mode), 6543 (Transaction mode)
    username: `postgres.${EXPECTED_STAGING_REF}`,
    database: 'postgres',
  },
});

const APPROVED_TIMEOUT_PROFILES = Object.freeze({
  PREFLIGHT: Object.freeze({
    statement_timeout: 10000,          // 10,000ms (10s) PostgreSQL server-side statement timeout
    query_timeout: 10000,              // 10,000ms (10s) client-side driver query timeout
    connectionTimeoutMillis: 10000,    // 10,000ms (10s) TCP/TLS connection handshake timeout
    overallDeadlineMs: 30000,          // 30,000ms (30s) whole-operation deadline
  }),
  MIGRATION: Object.freeze({
    statement_timeout: 180000,         // 180,000ms (180s / 3m) PostgreSQL server-side statement timeout
    query_timeout: 180000,             // 180,000ms (180s / 3m) client-side driver query timeout
    connectionTimeoutMillis: 30000,    // 30,000ms (30s) TCP/TLS connection handshake timeout
    overallDeadlineMs: 600000,         // 600,000ms (10m) whole-operation migration deadline
  }),
});

const TIMEOUT_BOUNDS = Object.freeze({
  MIN_STATEMENT_TIMEOUT_MS: 10000,    // 10s minimum permitted threshold
  MAX_STATEMENT_TIMEOUT_MS: 600000,   // 600s (10m) maximum permitted threshold
});

/**
 * Strictly validates a PEM-encoded CA certificate string or Buffer.
 * Never logs or echoes the certificate contents.
 */
function validatePemCertificate(ca) {
  if (ca === undefined || ca === null) {
    return null;
  }
  let pemStr;
  if (typeof ca === 'string') {
    pemStr = ca.trim();
  } else if (Buffer.isBuffer(ca)) {
    pemStr = ca.toString('utf8').trim();
  } else {
    throw new Error('CONFIG_ERROR: CA certificate must be a PEM string or Buffer.');
  }

  if (!pemStr) {
    throw new Error('CONFIG_ERROR: CA certificate is empty.');
  }

  // Quarantine check: CA must never contain production reference
  if (pemStr.toLowerCase().includes(PROD_REF)) {
    throw new Error(`QUARANTINE_VIOLATION: Production reference '${PROD_REF}' detected in CA certificate!`);
  }

  // Validate PEM header and footer boundaries
  const beginMarker = '-----BEGIN CERTIFICATE-----';
  const endMarker = '-----END CERTIFICATE-----';

  if (!pemStr.startsWith(beginMarker) || !pemStr.endsWith(endMarker)) {
    throw new Error(
      'CONFIG_ERROR: Malformed CA certificate format. Expected standard PEM format with -----BEGIN CERTIFICATE----- and -----END CERTIFICATE-----.'
    );
  }

  // Extract body between headers and validate Base64 character set
  const body = pemStr
    .slice(beginMarker.length, pemStr.length - endMarker.length)
    .replace(/[\r\n\s]+/g, '');

  if (body.length < 32 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
    throw new Error('CONFIG_ERROR: Malformed Base64 payload in PEM CA certificate.');
  }

  return pemStr;
}

/**
 * Resolves and validates discrete timeout parameters within strict safety bounds.
 */
function resolveTimeoutConfig(options = {}) {
  // If a named timeout profile is requested
  if (options.timeoutProfile !== undefined) {
    if (typeof options.timeoutProfile !== 'string') {
      throw new Error('CONFIG_ERROR: timeoutProfile must be a string.');
    }
    const profileKey = options.timeoutProfile.toUpperCase().trim();
    if (!APPROVED_TIMEOUT_PROFILES[profileKey]) {
      throw new Error(
        `CONFIG_ERROR: Unknown timeout profile '${options.timeoutProfile}'. Approved profiles: ${Object.keys(APPROVED_TIMEOUT_PROFILES).join(', ')}.`
      );
    }
    return APPROVED_TIMEOUT_PROFILES[profileKey];
  }

  // If an explicit statement timeout is requested
  const hasStatementTimeout = ('statementTimeoutMs' in options) || ('timeoutMs' in options);
  if (hasStatementTimeout) {
    const customTimeout = options.statementTimeoutMs !== undefined ? options.statementTimeoutMs : options.timeoutMs;
    if (typeof customTimeout !== 'number' || !Number.isFinite(customTimeout) || !Number.isInteger(customTimeout)) {
      throw new Error('CONFIG_ERROR: Timeout value must be a finite integer in milliseconds.');
    }
    if (customTimeout < TIMEOUT_BOUNDS.MIN_STATEMENT_TIMEOUT_MS) {
      throw new Error(
        `CONFIG_ERROR: Timeout ${customTimeout}ms is below minimum permitted threshold (${TIMEOUT_BOUNDS.MIN_STATEMENT_TIMEOUT_MS}ms).`
      );
    }
    if (customTimeout > TIMEOUT_BOUNDS.MAX_STATEMENT_TIMEOUT_MS) {
      throw new Error(
        `CONFIG_ERROR: Timeout ${customTimeout}ms exceeds maximum permitted threshold (${TIMEOUT_BOUNDS.MAX_STATEMENT_TIMEOUT_MS}ms).`
      );
    }

    return Object.freeze({
      statement_timeout: customTimeout,
      query_timeout: customTimeout,
      connectionTimeoutMillis: Math.min(customTimeout, 30000),
      overallDeadlineMs: Math.min(customTimeout * 2, 600000),
    });
  }

  // Default to conservative preflight profile
  return APPROVED_TIMEOUT_PROFILES.PREFLIGHT;
}

/**
 * Redacts credentials from URL or error strings safely.
 */
function redactCredentials(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/:\/\/([^:]+):([^@]+)@/g, '://$1:***@')
    .replace(/:\/\/([^:]+)@/g, '://***@');
}

/**
 * Safely decodes a percent-encoded string component.
 * Throws a sanitized Error without echoing input if encoding is malformed.
 */
function safeDecode(val) {
  if (typeof val !== 'string' || !val) return '';
  try {
    return decodeURIComponent(val);
  } catch (_) {
    throw new Error('CONFIG_ERROR: Malformed percent-encoding in database configuration.');
  }
}

/**
 * Sanitizes an error so it never leaks credentials or raw connection strings.
 */
function sanitizeError(err) {
  const msg = err && err.message ? redactCredentials(err.message) : 'Unknown error';
  const cleanErr = new Error(msg);
  cleanErr.name = err && err.name ? err.name : 'SecurityError';
  return cleanErr;
}

/**
 * Validates a staging database connection URL and returns frozen discrete client options.
 * Throws sanitized errors without raw passwords or connection strings if validation fails.
 */
function validateStagingDatabaseUrl(rawUrl, options = {}) {
  if (options && typeof options !== 'object') {
    throw new Error('CONFIG_ERROR: Options must be an object.');
  }

  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('CONFIG_ERROR: STAGING_DATABASE_URL is missing or empty.');
  }

  // 1. Production quarantine guard across raw input string
  if (rawUrl.toLowerCase().includes(PROD_REF)) {
    throw new Error(`QUARANTINE_VIOLATION: Production reference '${PROD_REF}' detected in database configuration!`);
  }

  // 2. Safe URL parsing with credential redaction on syntax error
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    throw new Error('CONFIG_ERROR: Malformed STAGING_DATABASE_URL syntax.');
  }

  // 3. Safe component decoding & percent-encoded quarantine check
  const decodedUsername = safeDecode(parsed.username);
  const decodedPassword = safeDecode(parsed.password);
  const decodedPath = safeDecode(parsed.pathname);
  const decodedSearch = safeDecode(parsed.search);
  const decodedHash = safeDecode(parsed.hash);
  const hostname = parsed.hostname.toLowerCase();

  if (
    decodedUsername.toLowerCase().includes(PROD_REF) ||
    decodedPassword.toLowerCase().includes(PROD_REF) ||
    decodedPath.toLowerCase().includes(PROD_REF) ||
    decodedSearch.toLowerCase().includes(PROD_REF) ||
    decodedHash.toLowerCase().includes(PROD_REF) ||
    hostname.includes(PROD_REF)
  ) {
    throw new Error(`QUARANTINE_VIOLATION: Production reference '${PROD_REF}' detected in database configuration!`);
  }

  // 4. Protocol validation
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error(`CONFIG_ERROR: Invalid database protocol '${protocol}'. Expected 'postgresql:' or 'postgres:'.`);
  }

  // 5. Hostname validation (Strict exact or regex match, NEVER loose substring)
  const isDirect = (hostname === APPROVED_PROFILES.DIRECT.host);
  const isPooler = APPROVED_PROFILES.POOLER.hostPattern.test(hostname);

  if (!isDirect && !isPooler) {
    throw new Error(
      `CONFIG_ERROR: Unapproved host '${hostname}'. Host does not match approved staging direct ('${APPROVED_PROFILES.DIRECT.host}') or AWS Supavisor pooler patterns.`
    );
  }

  // 6. Port validation
  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  if (isDirect && !APPROVED_PROFILES.DIRECT.ports.includes(port)) {
    throw new Error(`CONFIG_ERROR: Direct connection host requires port 5432, received ${port}.`);
  }
  if (isPooler && !APPROVED_PROFILES.POOLER.ports.includes(port)) {
    throw new Error(`CONFIG_ERROR: Pooler connection requires port 5432 (session) or 6543 (transaction), received ${port}.`);
  }

  // 7. Username validation & pooler tenant semantics (Without echoing supplied username)
  const normalizedUser = decodedUsername.toLowerCase();
  if (isPooler) {
    if (normalizedUser !== APPROVED_PROFILES.POOLER.username) {
      throw new Error(
        `CONFIG_ERROR: Pooler connection requires exact username '${APPROVED_PROFILES.POOLER.username}'. (Note: 'service_role' is an HTTP JWT role, not a pooler database role).`
      );
    }
  } else {
    if (normalizedUser !== APPROVED_PROFILES.DIRECT.username) {
      throw new Error(`CONFIG_ERROR: Direct connection requires username '${APPROVED_PROFILES.DIRECT.username}'.`);
    }
  }

  // 8. Database name validation
  const pathname = decodedPath.replace(/^\//, '');
  if (pathname !== 'postgres') {
    throw new Error(`CONFIG_ERROR: Expected database name 'postgres', received '${pathname}'.`);
  }

  // 9. Query parameter and SSL hardening
  if (parsed.searchParams) {
    const sslMode = parsed.searchParams.get('sslmode');
    if (sslMode && sslMode.toLowerCase() !== 'require' && sslMode.toLowerCase() !== 'verify-full') {
      throw new Error(`CONFIG_ERROR: Insecure or conflicting sslmode parameter detected: '${sslMode}'.`);
    }

    const sslParam = parsed.searchParams.get('ssl');
    if (sslParam && ['false', '0', 'no', 'off', 'disable'].includes(sslParam.toLowerCase())) {
      throw new Error(`CONFIG_ERROR: Insecure ssl parameter detected: '${sslParam}'.`);
    }

    const disallowedSslParams = ['sslrootcert', 'sslcert', 'sslkey'];
    for (const param of disallowedSslParams) {
      if (parsed.searchParams.has(param)) {
        throw new Error(`CONFIG_ERROR: Disallowed SSL parameter '${param}' in database connection string.`);
      }
    }
  }

  // 10. Validate CA certificate if provided
  const validatedCa = validatePemCertificate(options.ca);

  // 11. Resolve and validate bounded timeout configuration
  const timeoutConfig = resolveTimeoutConfig(options);

  // 12. Build discrete, validated, frozen client options
  const sslConfig = {
    rejectUnauthorized: true, // Strict certificate verification enforced
    servername: hostname,     // Strict SNI validation
  };
  if (validatedCa) {
    sslConfig.ca = validatedCa;
  }

  const discreteOptions = Object.freeze({
    host: hostname,
    port: port,
    database: pathname,
    user: decodedUsername,
    password: decodedPassword,
    ssl: Object.freeze(sslConfig),
    connectionTimeoutMillis: timeoutConfig.connectionTimeoutMillis,
    statement_timeout: timeoutConfig.statement_timeout,
    query_timeout: timeoutConfig.query_timeout,
    overallDeadlineMs: timeoutConfig.overallDeadlineMs,
  });

  return discreteOptions;
}

/**
 * Safe client construction using discrete validated options.
 * Never passes raw unvalidated connection strings to PostgreSQL clients.
 */
function createStagingClient(validatedOptions, clientFactory = (opts) => new Client(opts)) {
  if (!validatedOptions || typeof validatedOptions !== 'object') {
    throw new Error('SECURITY_ERROR: Missing or invalid database configuration object.');
  }

  if (validatedOptions.connectionString) {
    throw new Error('SECURITY_ERROR: Raw connectionString parameter is strictly prohibited. Discrete options required.');
  }

  if (!validatedOptions.ssl || validatedOptions.ssl.rejectUnauthorized !== true) {
    throw new Error('SECURITY_ERROR: Strict TLS certificate verification (rejectUnauthorized: true) is required.');
  }

  // Strict SNI validation against host
  if (!validatedOptions.ssl.servername || validatedOptions.ssl.servername !== validatedOptions.host) {
    throw new Error('SECURITY_ERROR: Strict SNI servername must match validated host.');
  }

  // If CA is present, verify it is a valid PEM format
  if (validatedOptions.ssl.ca !== undefined) {
    validatePemCertificate(validatedOptions.ssl.ca);
  }

  // Quarantine check on host and user
  if (
    (validatedOptions.host && validatedOptions.host.toLowerCase().includes(PROD_REF)) ||
    (validatedOptions.user && validatedOptions.user.toLowerCase().includes(PROD_REF)) ||
    (validatedOptions.database && validatedOptions.database.toLowerCase().includes(PROD_REF))
  ) {
    throw new Error(`QUARANTINE_VIOLATION: Production reference '${PROD_REF}' detected in client options!`);
  }

  try {
    return clientFactory(validatedOptions);
  } catch (err) {
    throw sanitizeError(err);
  }
}

module.exports = {
  PROD_REF,
  EXPECTED_STAGING_REF,
  APPROVED_PROFILES,
  APPROVED_TIMEOUT_PROFILES,
  TIMEOUT_BOUNDS,
  validateStagingDatabaseUrl,
  createStagingClient,
  validatePemCertificate,
  resolveTimeoutConfig,
  redactCredentials,
  safeDecode,
  sanitizeError,
};
