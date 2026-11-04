/**
 * Clasptek Staging Target Identity Guard
 *
 * Hardened validation utility to ensure remote operations can ONLY target
 * designated staging Supabase instance and NEVER production or unapproved targets.
 *
 * Invariant Rules:
 * 1. Hard-blocks production project reference: logaawoigfxnisimfatf
 * 2. Requires exact designated staging reference: dwhjoiebzwnjdpcvcwvs
 * 3. Enforces exact allowlisted hostnames and pooler patterns
 * 4. Zero secret leakage: passwords and tokens are redacted from all return structures and logs
 */

export const DESIGNATED_STAGING_PROJECT_REF = 'dwhjoiebzwnjdpcvcwvs';
export const PROTECTED_PRODUCTION_PROJECT_REF = 'logaawoigfxnisimfatf';

export interface TargetValidationSuccess {
  valid: true;
  projectRef: string;
  connectionType: 'direct' | 'pooler';
  sanitizedHost: string;
  port: number;
  database: string;
  username: string;
}

export interface TargetValidationFailure {
  valid: false;
  error: string;
  code:
    | 'MISSING_METADATA'
    | 'MALFORMED_URL'
    | 'PRODUCTION_TARGET_DETECTED'
    | 'UNAPPROVED_HOST'
    | 'UNKNOWN_PROJECT_REF'
    | 'UNTRUSTED_SUBSTRING'
    | 'INVALID_POOLER_USER'
    | 'FALLBACK_ATTEMPT_REJECTED';
}

export type TargetValidationResult = TargetValidationSuccess | TargetValidationFailure;

/**
 * Validate a connection string or URL against strict staging identity invariants.
 */
export function validateStagingTarget(connectionUrl?: string | null): TargetValidationResult {
  if (!connectionUrl || typeof connectionUrl !== 'string' || !connectionUrl.trim()) {
    return {
      valid: false,
      code: 'MISSING_METADATA',
      error: 'Target validation rejected: connection URL is empty or undefined.',
    };
  }

  const trimmed = connectionUrl.trim();

  // Explicitly check for fallback attempt or production reference anywhere in the string
  if (trimmed.includes(PROTECTED_PRODUCTION_PROJECT_REF)) {
    return {
      valid: false,
      code: 'PRODUCTION_TARGET_DETECTED',
      error: `CRITICAL SECURITY VIOLATION: Production project reference [${PROTECTED_PRODUCTION_PROJECT_REF}] detected in connection metadata! Operation halted immediately.`,
    };
  }

  // Parse URL
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      code: 'MALFORMED_URL',
      error: 'Target validation rejected: connection string is not a valid URL.',
    };
  }

  // Protocol check: must be postgres: or postgresql:
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    return {
      valid: false,
      code: 'MALFORMED_URL',
      error: `Target validation rejected: protocol "${parsed.protocol}" is not an approved postgres connection protocol.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const username = decodeURIComponent(parsed.username || '');
  const database = (parsed.pathname || '').replace(/^\//, '');
  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;

  if (!hostname) {
    return {
      valid: false,
      code: 'MALFORMED_URL',
      error: 'Target validation rejected: missing hostname in connection string.',
    };
  }

  // Check 1: Direct Supabase Database Connection
  // Format: db.<project-ref>.supabase.co
  const directMatch = hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (directMatch) {
    const projectRef = directMatch[1];
    if (projectRef === PROTECTED_PRODUCTION_PROJECT_REF) {
      return {
        valid: false,
        code: 'PRODUCTION_TARGET_DETECTED',
        error: 'CRITICAL SECURITY VIOLATION: Direct connection targets production project reference.',
      };
    }
    if (projectRef !== DESIGNATED_STAGING_PROJECT_REF) {
      return {
        valid: false,
        code: 'UNKNOWN_PROJECT_REF',
        error: `Target validation rejected: direct host project "${projectRef}" does not match designated staging reference "${DESIGNATED_STAGING_PROJECT_REF}".`,
      };
    }

    return {
      valid: true,
      projectRef,
      connectionType: 'direct',
      sanitizedHost: hostname,
      port,
      database,
      username: username || 'postgres',
    };
  }

  // Check 2: Approved Supabase Pooler Connection (Supavisor)
  // Host format: aws-0-<region>.pooler.supabase.com or [pooler-prefix].pooler.supabase.com
  const poolerHostMatch = hostname.match(/^[a-z0-9-]+\.pooler\.supabase\.com$/);
  if (poolerHostMatch) {
    if (!username) {
      return {
        valid: false,
        code: 'INVALID_POOLER_USER',
        error: 'Target validation rejected: pooler connection requires project-scoped username (e.g. postgres.<project-ref>).',
      };
    }

    // Pooler username must end with .<project-ref> or equal postgres.<project-ref>
    const userParts = username.split('.');
    if (userParts.length < 2) {
      return {
        valid: false,
        code: 'INVALID_POOLER_USER',
        error: `Target validation rejected: pooler username "${username}" is not project-scoped. Expected format: postgres.${DESIGNATED_STAGING_PROJECT_REF}`,
      };
    }

    const userProjectRef = userParts[userParts.length - 1];
    if (userProjectRef === PROTECTED_PRODUCTION_PROJECT_REF) {
      return {
        valid: false,
        code: 'PRODUCTION_TARGET_DETECTED',
        error: 'CRITICAL SECURITY VIOLATION: Pooler username targets production project reference.',
      };
    }

    if (userProjectRef !== DESIGNATED_STAGING_PROJECT_REF) {
      return {
        valid: false,
        code: 'UNKNOWN_PROJECT_REF',
        error: `Target validation rejected: pooler user project "${userProjectRef}" does not match designated staging reference "${DESIGNATED_STAGING_PROJECT_REF}".`,
      };
    }

    return {
      valid: true,
      projectRef: userProjectRef,
      connectionType: 'pooler',
      sanitizedHost: hostname,
      port,
      database,
      username,
    };
  }

  // Check 3: Untrusted domain trying to use staging ref as substring
  if (hostname.includes(DESIGNATED_STAGING_PROJECT_REF)) {
    return {
      valid: false,
      code: 'UNTRUSTED_SUBSTRING',
      error: `Target validation rejected: hostname "${hostname}" contains staging reference as an untrusted substring and is not an approved Supabase domain.`,
    };
  }

  // Default: unapproved host
  return {
    valid: false,
    code: 'UNAPPROVED_HOST',
    error: `Target validation rejected: host "${hostname}" is not an allowlisted Supabase staging host.`,
  };
}

/**
 * Redact connection string for safe operational logging (zero secret leakage).
 */
export function sanitizeConnectionString(rawUrl?: string | null): string {
  if (!rawUrl) return '[EMPTY]';
  try {
    const url = new URL(rawUrl);
    if (url.password) {
      url.password = 'REDACTED';
    }
    return url.toString().replace(/:REDACTED@/, ':[REDACTED]@');
  } catch {
    return '[MALFORMED_CONNECTION_STRING]';
  }
}
