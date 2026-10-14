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

/** Permanently quarantined production project reference — NEVER connect to this. */
const QUARANTINED_PROJECT_REF = 'logaawoigfxnisimfatf';

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

  if (ref === QUARANTINED_PROJECT_REF) {
    throw new Error(
      `SUPABASE_QUARANTINE_VIOLATION: ${context} points to the permanently quarantined ` +
      `production project. This project must never be used. ` +
      `Configure a valid staging or production-replacement project URL instead.`
    );
  }

  return trimmed;
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
