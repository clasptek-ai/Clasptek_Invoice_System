/**
 * lib/supabase/project-guard.ts — Supabase Project Isolation Guard
 *
 * Extracts the Supabase project reference from a URL and rejects the
 * permanently quarantined production project (logaawoigfxnisimfatf).
 *
 * This guard MUST be called before any Supabase client is created.
 * It fails closed: missing, malformed, or quarantined URLs all throw.
 *
 * SECURITY INVARIANTS:
 * - The quarantined production project must NEVER be used under any circumstances.
 * - Every Supabase client creation path must call validateSupabaseProjectRef().
 * - Strict URL policy:
 *     - Protocol must be https:
 *     - No embedded credentials (username/password in URL)
 *     - No custom ports (must be standard HTTPS / port 443)
 *     - Hostname must strictly match <project-ref>.supabase.co
 * - Alias conflict resolution:
 *     - If multiple aliases (e.g. SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL) are
 *       provided, they must resolve to the identical project reference. Divergent
 *       aliases fail closed with SUPABASE_CONFIG_CONFLICT.
 * - Zero secret disclosure: error messages never echo credentials or secret keys.
 */

/** Canonical production Supabase project reference. */
export const PRODUCTION_PROJECT_REF = 'logaawoigfxnisimfatf';

/** Canonical isolated staging Supabase project reference. */
export const STAGING_PROJECT_REF = 'dwhjoiebzwnjdpcvcwvs';

/** Quarantined production project reference (maintained for backward compatibility). */
const QUARANTINED_PROJECT_REF = PRODUCTION_PROJECT_REF;

/**
 * Evaluates whether any Preview or Staging environment marker is present.
 */
export function isPreviewOrStagingEnvironment(): boolean {
  if (
    process.env.VERCEL_ENV === 'preview' ||
    process.env.CLASPTEK_ENV === 'preview' ||
    process.env.CLASPTEK_ENV === 'staging' ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' ||
    process.env.NEXT_PUBLIC_CLASPTEK_ENV === 'preview' ||
    process.env.NEXT_PUBLIC_CLASPTEK_ENV === 'staging'
  ) {
    return true;
  }
  return false;
}

/**
 * Detects whether contradictory or conflicting environment markers exist.
 * (e.g. an environment marker claiming Production while another claims Preview or Staging).
 */
export function hasConflictingEnvironmentMarkers(): boolean {
  const hasProdMarker =
    process.env.VERCEL_ENV === 'production' ||
    process.env.CLASPTEK_ENV === 'production';

  const hasPreviewOrStagingMarker = isPreviewOrStagingEnvironment();

  return Boolean(hasProdMarker && hasPreviewOrStagingMarker);
}

/**
 * Evaluates whether the current execution context is positively verified as trusted Production.
 *
 * SECURITY INVARIANTS:
 * 1. NODE_ENV=production alone is NEVER sufficient to authorize production.
 * 2. Browser hostnames (e.g. window.location.hostname === 'app.clasptek.org') or client-editable
 *    values are NEVER used to authorize the production database project.
 * 3. The absence of NEXT_PUBLIC_VERCEL_ENV=preview is NEVER treated as proof of production.
 * 4. Conflicting or contradictory environment markers fail closed immediately.
 * 5. Production authorization requires positive, trusted server-side deployment context
 *    (VERCEL_ENV === 'production' or CLASPTEK_ENV === 'production') with zero preview/staging markers.
 */
export function isVerifiedProductionEnvironment(): boolean {
  // Contradictory or conflicting markers immediately fail closed
  if (hasConflictingEnvironmentMarkers()) {
    return false;
  }

  // Any preview or staging marker immediately prevents production authorization
  if (isPreviewOrStagingEnvironment()) {
    return false;
  }

  // Authorize ONLY via trusted server-side deployment context
  // NOTE: NODE_ENV=production alone is explicitly rejected as an authorization boundary
  if (process.env.VERCEL_ENV === 'production' || process.env.CLASPTEK_ENV === 'production') {
    return true;
  }

  return false;
}

/**
 * Evaluates whether any client-accessible Preview or Staging environment marker is present.
 * Uses only NEXT_PUBLIC_* markers that are available in browser bundles.
 */
export function isBrowserPreviewOrStagingEnvironment(): boolean {
  if (
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' ||
    process.env.NEXT_PUBLIC_CLASPTEK_ENV === 'preview' ||
    process.env.NEXT_PUBLIC_CLASPTEK_ENV === 'staging'
  ) {
    return true;
  }
  return false;
}

/**
 * Detects whether contradictory or conflicting environment markers exist in client-accessible variables.
 * (e.g. an explicit production public marker along with a preview or staging public marker).
 */
export function hasConflictingBrowserEnvironmentMarkers(): boolean {
  const hasProdMarker =
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ||
    process.env.NEXT_PUBLIC_CLASPTEK_ENV === 'production';

  const hasPreviewOrStagingMarker = isBrowserPreviewOrStagingEnvironment();

  return Boolean(hasProdMarker && hasPreviewOrStagingMarker);
}

/**
 * Evaluates whether the browser environment is positively verified as trusted Production.
 *
 * SECURITY INVARIANTS FOR BROWSER RUNTIME:
 * 1. An absent marker is NEVER treated as proof of production.
 * 2. Browser hostnames (window.location.hostname) or client-editable values are NEVER used to infer production.
 * 3. Conflicting public environment markers fail closed immediately.
 * 4. Any preview or staging public marker prevents production authorization.
 * 5. Production authorization requires positive public build-time marker:
 *    NEXT_PUBLIC_CLASPTEK_ENV === 'production' OR NEXT_PUBLIC_VERCEL_ENV === 'production'.
 * 6. Never depends on server-only variables (VERCEL_ENV, CLASPTEK_ENV) being present in client bundles.
 */
export function isVerifiedBrowserProductionEnvironment(): boolean {
  // Contradictory or conflicting markers fail closed
  if (hasConflictingBrowserEnvironmentMarkers()) {
    return false;
  }

  // Any preview or staging marker prevents production authorization
  if (isBrowserPreviewOrStagingEnvironment()) {
    return false;
  }

  // Positive public build-time marker required
  if (
    process.env.NEXT_PUBLIC_CLASPTEK_ENV === 'production' ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts the Supabase project reference from a URL.
 *
 * Supports canonical format:
 *   - https://<ref>.supabase.co
 *   - https://<ref>.supabase.co/rest/v1/
 *
 * Returns the project reference string, or null if the URL is not a
 * valid Supabase URL adhering to the strict security policy.
 */
export function extractProjectRef(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  // Scheme must be strictly https:
  if (parsed.protocol !== 'https:') return null;

  // Reject embedded credentials (e.g. https://user:pass@ref.supabase.co)
  if (parsed.username || parsed.password) return null;

  // Reject custom ports in Supabase HTTPS API URLs
  if (parsed.port && parsed.port !== '443') return null;

  const hostname = parsed.hostname.toLowerCase();

  // Strict hostname contract: strictly <ref>.supabase.co
  const match = hostname.match(/^([a-z0-9][a-z0-9-]*)\.supabase\.co$/);
  if (!match) return null;

  const ref = match[1];
  // Supabase project refs are 20-character lowercase alphanumeric strings
  if (!ref || ref.length < 10 || !/^[a-z0-9]+$/.test(ref)) return null;

  return ref;
}

/**
 * Validates a Supabase URL and rejects quarantined, malformed, or insecure configurations.
 *
 * @param url - The Supabase URL to validate.
 * @param context - Human-readable context for error messages (e.g. 'NEXT_PUBLIC_SUPABASE_URL').
 * @returns The validated, trimmed URL without trailing slashes.
 * @throws Error if the URL is missing, malformed, or points to a quarantined project.
 */
export function validateSupabaseProjectRef(
  url: string,
  context: string = 'SUPABASE_URL'
): string {
  if (!url || typeof url !== 'string' || !url.trim()) {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: ${context} is missing or empty. ` +
      `A valid Supabase project URL is required. ` +
      `Expected format: https://<project-ref>.supabase.co`
    );
  }

  const trimmed = url.trim().replace(/\/+$/, '');

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: ${context} is not a valid URL syntax. ` +
      `Expected format: https://<project-ref>.supabase.co`
    );
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: ${context} must use the https: scheme. ` +
      `Insecure or unsupported protocols are rejected.`
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: ${context} must not contain embedded credentials in the URL.`
    );
  }

  if (parsed.port && parsed.port !== '443') {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: ${context} must not specify a custom port for Supabase HTTPS API.`
    );
  }

  const ref = extractProjectRef(trimmed);

  if (!ref) {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: ${context} does not match an authorized Supabase domain. ` +
      `Expected format: https://<project-ref>.supabase.co`
    );
  }

  // Reject unexpected or unauthorized project references in all environments
  if (ref !== PRODUCTION_PROJECT_REF && ref !== STAGING_PROJECT_REF) {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: ${context} references unauthorized project '${ref}'. ` +
      `Only authorized Clasptek project references are permitted.`
    );
  }

  // Rule 1: Contradictory environment markers fail closed immediately
  if (hasConflictingEnvironmentMarkers()) {
    throw new Error(
      `SUPABASE_CONFIG_CONFLICT: Conflicting environment markers detected for ${context}. ` +
      `Production and Preview/Staging markers cannot be present simultaneously.`
    );
  }

  // Rule 2: Preview and Staging isolation: Production project is strictly quarantined
  if (isPreviewOrStagingEnvironment()) {
    if (ref === PRODUCTION_PROJECT_REF) {
      throw new Error(
        `SUPABASE_QUARANTINE_VIOLATION: ${context} points to the production project in a Preview or Staging environment. ` +
        `Production database access is strictly prohibited in Preview/Staging. Use staging project (${STAGING_PROJECT_REF}) instead.`
      );
    }
    if (ref !== STAGING_PROJECT_REF) {
      throw new Error(
        `SUPABASE_CONFIG_ERROR: ${context} does not match the designated staging project (${STAGING_PROJECT_REF}).`
      );
    }
    return trimmed;
  }

  // Rule 3: Authoritative Production Environment validation via trusted server-side context
  if (isVerifiedProductionEnvironment()) {
    if (ref === STAGING_PROJECT_REF) {
      throw new Error(
        `SUPABASE_CONFIG_CONFLICT: ${context} points to staging project (${STAGING_PROJECT_REF}) in Production environment. ` +
        `Production environment must use authoritative production project (${PRODUCTION_PROJECT_REF}).`
      );
    }
    if (ref === PRODUCTION_PROJECT_REF) {
      return trimmed;
    }
  }

  // Rule 4: Default / Unverified / Ambiguous Environment: fail closed against production project
  if (ref === PRODUCTION_PROJECT_REF) {
    throw new Error(
      `SUPABASE_QUARANTINE_VIOLATION: ${context} points to the production project in an unverified or non-production environment. ` +
      `Execution environment must be positively verified as Vercel Production via trusted server-side deployment context to access ${PRODUCTION_PROJECT_REF}.`
    );
  }

  // Local development / test fallback with staging project
  if (ref === STAGING_PROJECT_REF) {
    return trimmed;
  }

  throw new Error(
    `SUPABASE_CONFIG_ERROR: ${context} cannot be validated for the current execution context.`
  );
}

/**
 * Dedicated browser-safe Supabase URL validator.
 * Validates a Supabase URL for client-side browser runtime, relying exclusively on
 * public (NEXT_PUBLIC_*) deployment context and strict URL syntax rules.
 * Does NOT depend on server-only variables (VERCEL_ENV, CLASPTEK_ENV).
 *
 * @param url - The Supabase URL to validate.
 * @param context - Human-readable context for error messages (default: 'NEXT_PUBLIC_SUPABASE_URL').
 * @returns The validated, trimmed URL without trailing slashes.
 * @throws Error if the URL is missing, malformed, unauthorized, or violates isolation rules.
 */
export function validateSupabaseBrowserProjectRef(
  url: string,
  context: string = 'NEXT_PUBLIC_SUPABASE_URL'
): string {
  if (!url || typeof url !== 'string' || !url.trim()) {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: ${context} is missing or empty. ` +
      `A valid Supabase project URL is required. ` +
      `Expected format: https://<project-ref>.supabase.co`
    );
  }

  const trimmed = url.trim().replace(/\/+$/, '');

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: ${context} is not a valid URL syntax. ` +
      `Expected format: https://<project-ref>.supabase.co`
    );
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: ${context} must use the https: scheme. ` +
      `Insecure or unsupported protocols are rejected.`
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: ${context} must not contain embedded credentials in the URL.`
    );
  }

  if (parsed.port && parsed.port !== '443') {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: ${context} must not specify a custom port for Supabase HTTPS API.`
    );
  }

  const ref = extractProjectRef(trimmed);

  if (!ref) {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: ${context} does not match an authorized Supabase domain. ` +
      `Expected format: https://<project-ref>.supabase.co`
    );
  }

  // Reject unexpected or unauthorized project references in all browser environments
  if (ref !== PRODUCTION_PROJECT_REF && ref !== STAGING_PROJECT_REF) {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: ${context} references unauthorized project '${ref}'. ` +
      `Only authorized Clasptek project references are permitted.`
    );
  }

  // Rule 1: Contradictory public environment markers fail closed immediately
  if (hasConflictingBrowserEnvironmentMarkers()) {
    throw new Error(
      `SUPABASE_CONFIG_CONFLICT: Conflicting browser environment markers detected for ${context}. ` +
      `Production and Preview/Staging markers cannot be present simultaneously.`
    );
  }

  // Rule 2: Explicit Preview and Staging builds: Production project is strictly quarantined
  if (isBrowserPreviewOrStagingEnvironment()) {
    if (ref === PRODUCTION_PROJECT_REF) {
      throw new Error(
        `SUPABASE_QUARANTINE_VIOLATION: ${context} points to the production project in a Preview or Staging browser build. ` +
        `Production database access is strictly prohibited in Preview/Staging. Use staging project (${STAGING_PROJECT_REF}) instead.`
      );
    }
    if (ref !== STAGING_PROJECT_REF) {
      throw new Error(
        `SUPABASE_CONFIG_ERROR: ${context} does not match the designated staging project (${STAGING_PROJECT_REF}).`
      );
    }
    return trimmed;
  }

  // Rule 3: Explicitly verified Production build: must use authoritative production project
  if (isVerifiedBrowserProductionEnvironment()) {
    if (ref === STAGING_PROJECT_REF) {
      throw new Error(
        `SUPABASE_CONFIG_CONFLICT: ${context} points to staging project (${STAGING_PROJECT_REF}) in Production browser build. ` +
        `Production environment must use authoritative production project (${PRODUCTION_PROJECT_REF}).`
      );
    }
    if (ref === PRODUCTION_PROJECT_REF) {
      return trimmed;
    }
  }

  // Rule 4: Local development / unverified / ambiguous / missing markers: fail closed against production
  if (ref === PRODUCTION_PROJECT_REF) {
    throw new Error(
      `SUPABASE_QUARANTINE_VIOLATION: ${context} points to the production project in an unverified or non-production browser build. ` +
      `Execution environment must be positively verified as Production via public build marker (NEXT_PUBLIC_CLASPTEK_ENV=production or NEXT_PUBLIC_VERCEL_ENV=production) to access ${PRODUCTION_PROJECT_REF}.`
    );
  }

  // Local development fallback with staging project is allowed
  if (ref === STAGING_PROJECT_REF) {
    return trimmed;
  }

  throw new Error(
    `SUPABASE_CONFIG_ERROR: ${context} cannot be validated for the current browser execution context.`
  );
}

/**
 * Resolves Supabase URL between primary and secondary aliases.
 *
 * If both are set and point to different projects, fails closed with
 * SUPABASE_CONFIG_CONFLICT rather than silently picking one.
 */
export function resolveValidatedSupabaseUrl(
  primaryUrl?: string,
  secondaryUrl?: string,
  contextA: string = 'SUPABASE_URL',
  contextB: string = 'NEXT_PUBLIC_SUPABASE_URL'
): string {
  const trimmedA = (primaryUrl || '').trim();
  const trimmedB = (secondaryUrl || '').trim();

  if (!trimmedA && !trimmedB) {
    throw new Error(
      `SUPABASE_CONFIG_ERROR: Neither ${contextA} nor ${contextB} is configured. ` +
      `A valid Supabase URL is required.`
    );
  }

  if (trimmedA && trimmedB) {
    const refA = extractProjectRef(trimmedA);
    const refB = extractProjectRef(trimmedB);

    if (refA && refB && refA !== refB) {
      throw new Error(
        `SUPABASE_CONFIG_CONFLICT: Conflicting Supabase URL aliases detected. ` +
        `${contextA} and ${contextB} resolve to different project references. ` +
        `Align environment configuration to target a single project.`
      );
    }
  }

  const chosenRaw = trimmedA || trimmedB;
  const chosenContext = trimmedA ? contextA : contextB;
  return validateSupabaseProjectRef(chosenRaw, chosenContext);
}

/**
 * Resolves Supabase service key between aliases with divergence detection.
 *
 * Fails closed with SUPABASE_CONFIG_CONFLICT if both aliases are set with different values.
 */
export function resolveValidatedServiceKey(
  primaryKey?: string,
  secondaryKey?: string,
  contextA: string = 'SUPABASE_SERVICE_ROLE_KEY',
  contextB: string = 'SUPABASE_SECRET_KEY'
): string {
  const keyA = (primaryKey || '').trim();
  const keyB = (secondaryKey || '').trim();

  if (keyA && keyB && keyA !== keyB) {
    throw new Error(
      `SUPABASE_CONFIG_CONFLICT: Conflicting Supabase service key aliases detected. ` +
      `${contextA} and ${contextB} have divergent values. Configure identical values or specify a single canonical key.`
    );
  }

  return keyA || keyB;
}

/**
 * Resolves Supabase anon key between aliases with divergence detection.
 */
export function resolveValidatedAnonKey(
  primaryKey?: string,
  secondaryKey?: string,
  contextA: string = 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  contextB: string = 'SUPABASE_ANON_KEY'
): string {
  const keyA = (primaryKey || '').trim();
  const keyB = (secondaryKey || '').trim();

  if (keyA && keyB && keyA !== keyB) {
    throw new Error(
      `SUPABASE_CONFIG_CONFLICT: Conflicting Supabase anon key aliases detected. ` +
      `${contextA} and ${contextB} have divergent values. Configure identical values or specify a single canonical key.`
    );
  }

  return keyA || keyB;
}

/**
 * Returns the quarantined project reference constant for test assertions.
 * Does NOT expose credentials.
 */
export function getQuarantinedProjectRef(): string {
  return QUARANTINED_PROJECT_REF;
}
