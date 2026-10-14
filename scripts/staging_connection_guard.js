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
function validateStagingDatabaseUrl(rawUrl) {
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

  // 10. Build discrete, validated, frozen client options
  const discreteOptions = Object.freeze({
    host: hostname,
    port: port,
    database: pathname,
    user: decodedUsername,
    password: decodedPassword,
    ssl: Object.freeze({
      rejectUnauthorized: true, // Strict certificate verification enforced
      servername: hostname,     // Strict SNI validation
    }),
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
    query_timeout: 10000,
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
  validateStagingDatabaseUrl,
  createStagingClient,
  redactCredentials,
  safeDecode,
  sanitizeError,
};
