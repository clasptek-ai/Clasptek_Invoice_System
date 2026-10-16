/**
 * scripts/test_phase2_production_guard_offline.js
 *
 * Clasptek Phase 2AI-C43 — Production Guard Boundary Certification Suite
 * Mode: STRICTLY OFFLINE — ZERO network calls, ZERO database connections.
 *
 * Covers all required boundary and isolation tests:
 * 1. Trusted Production + production ref: accepted.
 * 2. Preview + production ref: rejected with SUPABASE_QUARANTINE_VIOLATION.
 * 3. Conflicting Production and Preview markers: rejected with SUPABASE_CONFIG_CONFLICT.
 * 4. Verified Preview + staging ref: accepted.
 * 5. Staging mode + production ref: rejected with SUPABASE_QUARANTINE_VIOLATION.
 * 6. Unknown environment + production ref: rejected with SUPABASE_QUARANTINE_VIOLATION.
 * 7. NODE_ENV=production alone + production ref: rejected with SUPABASE_QUARANTINE_VIOLATION.
 * 8. Browser hostname 'app.clasptek.org' alone + production ref: must NOT authorize production.
 * 9. Missing, malformed URL and unexpected project refs: rejected with SUPABASE_CONFIG_ERROR.
 * 10. Production configured to use staging: rejected with SUPABASE_CONFIG_CONFLICT.
 * 11. Existing independent staging migration guard still rejects production independently.
 * 12. Browser bundle contains no service-role credentials.
 * 13. Normal server-side Production validation accepts authoritative production project without relying on browser hostname.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');

process.env.NODE_ENV = 'test';
process.env.CLASPTEK_TEST_MODE = 'true';

function loadTsModule(relPath) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(__dirname, '..', relPath);
  const code = fs.readFileSync(fullPath, 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };

  const customRequire = (id) => {
    if (id.startsWith('@/')) {
      const candidate = path.join(__dirname, '..', id.slice(2));
      return loadTsModule(candidate.endsWith('.ts') ? candidate : candidate + '.ts');
    }
    if (id.startsWith('../') || id.startsWith('./')) {
      const candidate = path.resolve(path.dirname(fullPath), id);
      if (fs.existsSync(candidate + '.ts')) return loadTsModule(candidate + '.ts');
      if (fs.existsSync(candidate + '.js')) return require(candidate + '.js');
      if (fs.existsSync(candidate)) return require(candidate);
    }
    return require(id);
  };

  const fn = new Function('require', 'module', 'exports', 'process', '__dirname', 'globalThis', js);
  fn(customRequire, mod, mod.exports, process, path.dirname(fullPath), globalThis);
  return mod.exports;
}

const {
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
  getQuarantinedProjectRef,
  extractProjectRef,
  validateSupabaseProjectRef,
  validateSupabaseBrowserProjectRef,
  resolveValidatedSupabaseUrl,
  resolveValidatedServiceKey,
  resolveValidatedAnonKey,
  isVerifiedProductionEnvironment,
  isPreviewOrStagingEnvironment,
  hasConflictingEnvironmentMarkers,
  isVerifiedBrowserProductionEnvironment,
  isBrowserPreviewOrStagingEnvironment,
  hasConflictingBrowserEnvironmentMarkers,
} = loadTsModule('lib/supabase/project-guard.ts');

const { createSupabaseBrowserClient, getSupabaseBrowserClient } = loadTsModule('lib/supabase/client.ts');

const stagingGuard = require('./staging_connection_guard');

function evaluateNextConfig(envOverrides = {}) {
  const configPath = path.join(__dirname, '..', 'next.config.mjs');
  const code = fs.readFileSync(configPath, 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  return withIsolatedEnv(envOverrides, () => {
    const fn = new Function('module', 'exports', 'process', js);
    fn(mod, mod.exports, process);
    return mod.exports.default || mod.exports;
  });
}

function withBrowserEnv(overrides, fn) {
  // Simulate Next.js client bundle where server-only vars are stripped (undefined)
  return withIsolatedEnv({
    VERCEL_ENV: undefined,
    CLASPTEK_ENV: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_SECRET_KEY: undefined,
    SUPABASE_URL: undefined,
    SUPABASE_ANON_KEY: undefined,
    ...overrides,
  }, fn);
}

function withIsolatedEnv(overrides, fn) {
  const orig = {};
  for (const k of Object.keys(overrides)) {
    orig[k] = process.env[k];
    if (overrides[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = overrides[k];
    }
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(orig)) {
      if (orig[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = orig[k];
      }
    }
  }
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('CLASPTEK PHASE 2AI-C43: PRODUCTION GUARD BOUNDARY CERTIFICATION');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Test 1: Trusted Production + production ref: accepted
// -----------------------------------------------------------------------------
runTest('1.1: Trusted server-side VERCEL_ENV=production accepts authoritative production ref', () => {
  withIsolatedEnv({
    VERCEL_ENV: 'production',
    CLASPTEK_ENV: undefined,
    NEXT_PUBLIC_VERCEL_ENV: undefined,
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
  }, () => {
    assert.strictEqual(isVerifiedProductionEnvironment(), true);
    assert.strictEqual(isPreviewOrStagingEnvironment(), false);
    assert.strictEqual(hasConflictingEnvironmentMarkers(), false);

    const url = validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co', 'SUPABASE_URL');
    assert.strictEqual(url, 'https://logaawoigfxnisimfatf.supabase.co');

    const resolved = resolveValidatedSupabaseUrl(
      'https://logaawoigfxnisimfatf.supabase.co',
      'https://logaawoigfxnisimfatf.supabase.co'
    );
    assert.strictEqual(resolved, 'https://logaawoigfxnisimfatf.supabase.co');
  });
});

runTest('1.2: Trusted server-side CLASPTEK_ENV=production accepts authoritative production ref', () => {
  withIsolatedEnv({
    VERCEL_ENV: undefined,
    CLASPTEK_ENV: 'production',
    NEXT_PUBLIC_VERCEL_ENV: undefined,
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
  }, () => {
    assert.strictEqual(isVerifiedProductionEnvironment(), true);
    const url = validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co', 'SUPABASE_URL');
    assert.strictEqual(url, 'https://logaawoigfxnisimfatf.supabase.co');
  });
});

// -----------------------------------------------------------------------------
// Test 2: Preview + production ref: rejected
// -----------------------------------------------------------------------------
runTest('2.1: Vercel Preview (VERCEL_ENV=preview) rejects production ref with SUPABASE_QUARANTINE_VIOLATION', () => {
  withIsolatedEnv({ VERCEL_ENV: 'preview', CLASPTEK_ENV: undefined }, () => {
    assert.strictEqual(isPreviewOrStagingEnvironment(), true);
    assert.strictEqual(isVerifiedProductionEnvironment(), false);

    assert.throws(
      () => validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co', 'SUPABASE_URL'),
      (err) => {
        assert(err.message.includes('SUPABASE_QUARANTINE_VIOLATION'), 'Must throw SUPABASE_QUARANTINE_VIOLATION');
        return true;
      }
    );
  });
});

runTest('2.2: CLASPTEK_ENV=preview rejects production ref with SUPABASE_QUARANTINE_VIOLATION', () => {
  withIsolatedEnv({ VERCEL_ENV: undefined, CLASPTEK_ENV: 'preview' }, () => {
    assert.strictEqual(isPreviewOrStagingEnvironment(), true);
    assert.throws(
      () => validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co', 'SUPABASE_URL'),
      /SUPABASE_QUARANTINE_VIOLATION/
    );
  });
});

// -----------------------------------------------------------------------------
// Test 3: Conflicting Production and Preview markers: rejected
// -----------------------------------------------------------------------------
runTest('3.1: Conflicting markers (VERCEL_ENV=production + CLASPTEK_ENV=preview) fail closed with SUPABASE_CONFIG_CONFLICT', () => {
  withIsolatedEnv({ VERCEL_ENV: 'production', CLASPTEK_ENV: 'preview' }, () => {
    assert.strictEqual(hasConflictingEnvironmentMarkers(), true);
    assert.strictEqual(isVerifiedProductionEnvironment(), false);

    assert.throws(
      () => validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co', 'SUPABASE_URL'),
      /SUPABASE_CONFIG_CONFLICT/
    );
  });
});

runTest('3.2: Conflicting markers (VERCEL_ENV=production + NEXT_PUBLIC_VERCEL_ENV=preview) fail closed', () => {
  withIsolatedEnv({ VERCEL_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: 'preview' }, () => {
    assert.strictEqual(hasConflictingEnvironmentMarkers(), true);
    assert.strictEqual(isVerifiedProductionEnvironment(), false);

    assert.throws(
      () => validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co', 'SUPABASE_URL'),
      /SUPABASE_CONFIG_CONFLICT/
    );
  });
});

// -----------------------------------------------------------------------------
// Test 4: Verified Preview + staging ref: accepted
// -----------------------------------------------------------------------------
runTest('4.1: Verified Preview accepts designated staging project ref', () => {
  withIsolatedEnv({ VERCEL_ENV: 'preview', CLASPTEK_ENV: undefined }, () => {
    assert.strictEqual(isPreviewOrStagingEnvironment(), true);
    const url = validateSupabaseProjectRef('https://dwhjoiebzwnjdpcvcwvs.supabase.co', 'SUPABASE_URL');
    assert.strictEqual(url, 'https://dwhjoiebzwnjdpcvcwvs.supabase.co');
  });
});

// -----------------------------------------------------------------------------
// Test 5: Staging mode + production ref: rejected
// -----------------------------------------------------------------------------
runTest('5.1: Staging mode (CLASPTEK_ENV=staging) rejects production project ref', () => {
  withIsolatedEnv({ VERCEL_ENV: undefined, CLASPTEK_ENV: 'staging' }, () => {
    assert.strictEqual(isPreviewOrStagingEnvironment(), true);
    assert.throws(
      () => validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co', 'SUPABASE_URL'),
      /SUPABASE_QUARANTINE_VIOLATION/
    );
  });
});

// -----------------------------------------------------------------------------
// Test 6: Unknown environment + production ref: rejected
// -----------------------------------------------------------------------------
runTest('6.1: Unknown or unconfigured environment rejects production project ref (fails closed)', () => {
  withIsolatedEnv({
    VERCEL_ENV: undefined,
    CLASPTEK_ENV: undefined,
    NEXT_PUBLIC_VERCEL_ENV: undefined,
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
  }, () => {
    assert.strictEqual(isVerifiedProductionEnvironment(), false);
    assert.throws(
      () => validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co', 'SUPABASE_URL'),
      /SUPABASE_QUARANTINE_VIOLATION/
    );
  });
});

// -----------------------------------------------------------------------------
// Test 7: NODE_ENV=production alone + production ref: rejected
// -----------------------------------------------------------------------------
runTest('7.1: NODE_ENV=production alone is NOT sufficient to authorize production project', () => {
  withIsolatedEnv({
    NODE_ENV: 'production',
    VERCEL_ENV: undefined,
    CLASPTEK_ENV: undefined,
    NEXT_PUBLIC_VERCEL_ENV: undefined,
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
  }, () => {
    assert.strictEqual(isVerifiedProductionEnvironment(), false);
    assert.throws(
      () => validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co', 'SUPABASE_URL'),
      /SUPABASE_QUARANTINE_VIOLATION/
    );
  });
});

// -----------------------------------------------------------------------------
// Test 8: Browser hostname 'app.clasptek.org' alone + production ref: must NOT authorize
// -----------------------------------------------------------------------------
runTest('8.1: Browser hostname app.clasptek.org alone must NOT authorize production project', () => {
  const origWindow = global.window;
  try {
    global.window = {
      location: { hostname: 'app.clasptek.org' }
    };

    withIsolatedEnv({
      VERCEL_ENV: undefined,
      CLASPTEK_ENV: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
      NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    }, () => {
      assert.strictEqual(isVerifiedProductionEnvironment(), false, 'Browser hostname alone must return false');
      assert.throws(
        () => validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co', 'SUPABASE_URL'),
        /SUPABASE_QUARANTINE_VIOLATION/,
        'Browser hostname alone must fail closed with SUPABASE_QUARANTINE_VIOLATION'
      );
    });
  } finally {
    if (origWindow === undefined) {
      delete global.window;
    } else {
      global.window = origWindow;
    }
  }
});

// -----------------------------------------------------------------------------
// Test 9: Missing, malformed URL and unexpected project refs: rejected
// -----------------------------------------------------------------------------
runTest('9.1: Missing, empty, or whitespace URL throws SUPABASE_CONFIG_ERROR', () => {
  assert.throws(() => validateSupabaseProjectRef('', 'TEST'), /SUPABASE_CONFIG_ERROR/);
  assert.throws(() => validateSupabaseProjectRef('   ', 'TEST'), /SUPABASE_CONFIG_ERROR/);
  assert.throws(() => validateSupabaseProjectRef(null, 'TEST'), /SUPABASE_CONFIG_ERROR/);
});

runTest('9.2: Non-HTTPS scheme throws SUPABASE_CONFIG_ERROR', () => {
  assert.throws(() => validateSupabaseProjectRef('http://dwhjoiebzwnjdpcvcwvs.supabase.co', 'TEST'), /SUPABASE_CONFIG_ERROR/);
  assert.throws(() => validateSupabaseProjectRef('ftp://dwhjoiebzwnjdpcvcwvs.supabase.co', 'TEST'), /SUPABASE_CONFIG_ERROR/);
  assert.throws(() => validateSupabaseProjectRef('javascript:alert(1)', 'TEST'), /SUPABASE_CONFIG_ERROR/);
});

runTest('9.3: Custom ports and embedded credentials throw SUPABASE_CONFIG_ERROR', () => {
  assert.throws(() => validateSupabaseProjectRef('https://dwhjoiebzwnjdpcvcwvs.supabase.co:5432', 'TEST'), /SUPABASE_CONFIG_ERROR/);
  assert.throws(() => validateSupabaseProjectRef('https://user:pass@dwhjoiebzwnjdpcvcwvs.supabase.co', 'TEST'), /SUPABASE_CONFIG_ERROR/);
});

runTest('9.4: Unexpected or arbitrary project ref throws SUPABASE_CONFIG_ERROR in all contexts', () => {
  withIsolatedEnv({ VERCEL_ENV: 'production' }, () => {
    assert.throws(
      () => validateSupabaseProjectRef('https://evilattacker12345.supabase.co', 'TEST'),
      /SUPABASE_CONFIG_ERROR/
    );
  });
  withIsolatedEnv({ VERCEL_ENV: 'preview' }, () => {
    assert.throws(
      () => validateSupabaseProjectRef('https://evilattacker12345.supabase.co', 'TEST'),
      /SUPABASE_CONFIG_ERROR/
    );
  });
});

// -----------------------------------------------------------------------------
// Test 10: Production configured to use staging: rejected
// -----------------------------------------------------------------------------
runTest('10.1: Production environment targeting staging project ref throws SUPABASE_CONFIG_CONFLICT', () => {
  withIsolatedEnv({ VERCEL_ENV: 'production', CLASPTEK_ENV: undefined }, () => {
    assert.throws(
      () => validateSupabaseProjectRef('https://dwhjoiebzwnjdpcvcwvs.supabase.co', 'SUPABASE_URL'),
      /SUPABASE_CONFIG_CONFLICT/
    );
  });
});

// -----------------------------------------------------------------------------
// Test 11: Existing independent staging migration guard still rejects production
// -----------------------------------------------------------------------------
runTest('11.1: scripts/staging_connection_guard.js rejects production ref independently', () => {
  assert.throws(
    () => stagingGuard.validateStagingDatabaseUrl('postgresql://postgres:secret@db.logaawoigfxnisimfatf.supabase.co:5432/postgres'),
    /QUARANTINE_VIOLATION/
  );
});

// -----------------------------------------------------------------------------
// Test 12: Browser bundle contains no service-role credentials
// -----------------------------------------------------------------------------
runTest('12.1: resolveValidatedServiceKey fails closed on diverging aliases without echoing secrets', () => {
  assert.throws(
    () => resolveValidatedServiceKey('secret_token_alpha', 'secret_token_beta', 'KEY_A', 'KEY_B'),
    (err) => {
      assert(err.message.includes('SUPABASE_CONFIG_CONFLICT'));
      assert(!err.message.includes('secret_token_alpha') && !err.message.includes('secret_token_beta'), 'Secrets must never be leaked');
      return true;
    }
  );
});

runTest('12.2: resolveValidatedAnonKey fails closed on diverging aliases without echoing secrets', () => {
  assert.throws(
    () => resolveValidatedAnonKey('anon_alpha', 'anon_beta', 'KEY_A', 'KEY_B'),
    (err) => {
      assert(err.message.includes('SUPABASE_CONFIG_CONFLICT'));
      assert(!err.message.includes('anon_alpha') && !err.message.includes('anon_beta'), 'Keys must never be leaked');
      return true;
    }
  );
});

// -----------------------------------------------------------------------------
// Test 13: Normal server-side Production validation accepts authoritative production project
// -----------------------------------------------------------------------------
runTest('13.1: Server-side Production accepts production project without relying on browser hostname', () => {
  assert.strictEqual(typeof window, 'undefined', 'Test must run purely server-side');
  withIsolatedEnv({ VERCEL_ENV: 'production', CLASPTEK_ENV: undefined }, () => {
    const rawUrl = 'https://logaawoigfxnisimfatf.supabase.co';
    const ref = extractProjectRef(rawUrl);
    assert.strictEqual(ref, PRODUCTION_PROJECT_REF);
    assert.strictEqual(ref, 'logaawoigfxnisimfatf');

    const validated = validateSupabaseProjectRef(rawUrl, 'SUPABASE_URL');
    assert.strictEqual(validated, 'https://logaawoigfxnisimfatf.supabase.co');

    const resolved = resolveValidatedSupabaseUrl(rawUrl, rawUrl);
    assert.strictEqual(resolved, 'https://logaawoigfxnisimfatf.supabase.co');
  });
});

// -----------------------------------------------------------------------------
// Test 14: Browser Factory (createSupabaseBrowserClient) & Browser Guard Suite
// Mode: Simulates Next.js client-bundle environment (server-only vars stripped)
// -----------------------------------------------------------------------------

// Scenario 1: Explicit production build + production URL -> factory initializes
runTest('14.1: Browser factory: NEXT_PUBLIC_CLASPTEK_ENV=production + production URL initializes', () => {
  withBrowserEnv({
    NEXT_PUBLIC_CLASPTEK_ENV: 'production',
    NEXT_PUBLIC_VERCEL_ENV: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.strictEqual(isVerifiedBrowserProductionEnvironment(), true);
    assert.strictEqual(isBrowserPreviewOrStagingEnvironment(), false);
    assert.strictEqual(hasConflictingBrowserEnvironmentMarkers(), false);

    const client = createSupabaseBrowserClient();
    assert(client, 'Browser client must be created');
  });
});

runTest('14.2: Browser factory: NEXT_PUBLIC_VERCEL_ENV=production + production URL initializes', () => {
  withBrowserEnv({
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    NEXT_PUBLIC_VERCEL_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.strictEqual(isVerifiedBrowserProductionEnvironment(), true);
    const client = createSupabaseBrowserClient();
    assert(client, 'Browser client must be created');
  });
});

// Scenario 2: Explicit production build + staging URL -> rejected
runTest('14.3: Browser factory: Production build + staging URL rejected with SUPABASE_CONFIG_CONFLICT', () => {
  withBrowserEnv({
    NEXT_PUBLIC_CLASPTEK_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dwhjoiebzwnjdpcvcwvs.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.throws(
      () => createSupabaseBrowserClient(),
      /SUPABASE_CONFIG_CONFLICT/
    );
  });
});

// Scenario 3: Preview build + staging URL -> factory initializes
runTest('14.4: Browser factory: NEXT_PUBLIC_VERCEL_ENV=preview + staging URL initializes', () => {
  withBrowserEnv({
    NEXT_PUBLIC_VERCEL_ENV: 'preview',
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://dwhjoiebzwnjdpcvcwvs.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.strictEqual(isBrowserPreviewOrStagingEnvironment(), true);
    assert.strictEqual(isVerifiedBrowserProductionEnvironment(), false);
    const client = createSupabaseBrowserClient();
    assert(client, 'Preview client must initialize with staging URL');
  });
});

runTest('14.5: Browser factory: NEXT_PUBLIC_CLASPTEK_ENV=preview + staging URL initializes', () => {
  withBrowserEnv({
    NEXT_PUBLIC_VERCEL_ENV: undefined,
    NEXT_PUBLIC_CLASPTEK_ENV: 'preview',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dwhjoiebzwnjdpcvcwvs.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.strictEqual(isBrowserPreviewOrStagingEnvironment(), true);
    const client = createSupabaseBrowserClient();
    assert(client, 'Preview client must initialize with staging URL');
  });
});

// Scenario 4: Preview build + production URL -> rejected
runTest('14.6: Browser factory: Preview build + production URL rejected with SUPABASE_QUARANTINE_VIOLATION', () => {
  withBrowserEnv({
    NEXT_PUBLIC_VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.throws(
      () => createSupabaseBrowserClient(),
      /SUPABASE_QUARANTINE_VIOLATION/
    );
  });
});

// Scenario 5: Staging build + staging URL -> factory initializes
runTest('14.7: Browser factory: NEXT_PUBLIC_CLASPTEK_ENV=staging + staging URL initializes', () => {
  withBrowserEnv({
    NEXT_PUBLIC_CLASPTEK_ENV: 'staging',
    NEXT_PUBLIC_VERCEL_ENV: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://dwhjoiebzwnjdpcvcwvs.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.strictEqual(isBrowserPreviewOrStagingEnvironment(), true);
    assert.strictEqual(isVerifiedBrowserProductionEnvironment(), false);
    const client = createSupabaseBrowserClient();
    assert(client, 'Staging client must initialize with staging URL');
  });
});

// Scenario 6: Staging build + production URL -> rejected
runTest('14.8: Browser factory: Staging build + production URL rejected with SUPABASE_QUARANTINE_VIOLATION', () => {
  withBrowserEnv({
    NEXT_PUBLIC_CLASPTEK_ENV: 'staging',
    NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.throws(
      () => createSupabaseBrowserClient(),
      /SUPABASE_QUARANTINE_VIOLATION/
    );
  });
});

// Scenario 7: Local development without production authorization + staging URL -> initializes
runTest('14.9: Browser factory: Local dev (no markers) + staging URL initializes via fallback', () => {
  withBrowserEnv({
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    NEXT_PUBLIC_VERCEL_ENV: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://dwhjoiebzwnjdpcvcwvs.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.strictEqual(isVerifiedBrowserProductionEnvironment(), false);
    const client = createSupabaseBrowserClient();
    assert(client, 'Local dev must initialize with staging URL');
  });
});

// Scenario 8: Local development without production authorization + production URL -> rejected
runTest('14.10: Browser factory: Local dev (no markers) + production URL rejected with SUPABASE_QUARANTINE_VIOLATION', () => {
  withBrowserEnv({
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    NEXT_PUBLIC_VERCEL_ENV: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.throws(
      () => createSupabaseBrowserClient(),
      /SUPABASE_QUARANTINE_VIOLATION/
    );
  });
});

// Scenario 9: Missing deployment marker + production URL -> rejected
runTest('14.11: Browser factory: Missing deployment markers + production URL rejected (fails closed)', () => {
  withBrowserEnv({
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    NEXT_PUBLIC_VERCEL_ENV: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.throws(
      () => createSupabaseBrowserClient(),
      /SUPABASE_QUARANTINE_VIOLATION/
    );
  });
});

// Scenario 10: Unknown deployment marker + production URL -> rejected
runTest('14.12: Browser factory: Unknown deployment marker + production URL rejected (fails closed)', () => {
  withBrowserEnv({
    NEXT_PUBLIC_CLASPTEK_ENV: 'qa_sandbox_unknown',
    NEXT_PUBLIC_VERCEL_ENV: 'ephemeral_branch',
    NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.strictEqual(isVerifiedBrowserProductionEnvironment(), false);
    assert.throws(
      () => createSupabaseBrowserClient(),
      /SUPABASE_QUARANTINE_VIOLATION/
    );
  });
});

// Scenario 11: Conflicting production and preview/staging markers -> rejected
runTest('14.13: Browser factory: Conflicting prod/preview markers fail closed with SUPABASE_CONFIG_CONFLICT', () => {
  withBrowserEnv({
    NEXT_PUBLIC_CLASPTEK_ENV: 'production',
    NEXT_PUBLIC_VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.strictEqual(hasConflictingBrowserEnvironmentMarkers(), true);
    assert.strictEqual(isVerifiedBrowserProductionEnvironment(), false);
    assert.throws(
      () => createSupabaseBrowserClient(),
      /SUPABASE_CONFIG_CONFLICT/
    );
  });
});

runTest('14.14: Browser factory: Conflicting prod/staging markers fail closed with SUPABASE_CONFIG_CONFLICT', () => {
  withBrowserEnv({
    NEXT_PUBLIC_VERCEL_ENV: 'production',
    NEXT_PUBLIC_CLASPTEK_ENV: 'staging',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dwhjoiebzwnjdpcvcwvs.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.strictEqual(hasConflictingBrowserEnvironmentMarkers(), true);
    assert.strictEqual(isVerifiedBrowserProductionEnvironment(), false);
    assert.throws(
      () => createSupabaseBrowserClient(),
      /SUPABASE_CONFIG_CONFLICT/
    );
  });
});

// Scenario 12: Malformed URL, non-HTTPS, unexpected port, embedded credentials, unauthorized project -> rejected
runTest('14.15: Browser factory: Malformed, non-HTTPS, custom port, credentials, or unauthorized project rejected', () => {
  withBrowserEnv({
    NEXT_PUBLIC_CLASPTEK_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    // Malformed URL
    withBrowserEnv({ NEXT_PUBLIC_SUPABASE_URL: 'invalid-url' }, () => {
      assert.throws(() => createSupabaseBrowserClient(), /SUPABASE_CONFIG_ERROR/);
    });

    // Non-HTTPS
    withBrowserEnv({ NEXT_PUBLIC_SUPABASE_URL: 'http://logaawoigfxnisimfatf.supabase.co' }, () => {
      assert.throws(() => createSupabaseBrowserClient(), /SUPABASE_CONFIG_ERROR/);
    });

    // Unexpected custom port
    withBrowserEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co:8443' }, () => {
      assert.throws(() => createSupabaseBrowserClient(), /SUPABASE_CONFIG_ERROR/);
    });

    // Embedded credentials
    withBrowserEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://admin:secret@logaawoigfxnisimfatf.supabase.co' }, () => {
      assert.throws(() => createSupabaseBrowserClient(), /SUPABASE_CONFIG_ERROR/);
    });

    // Unauthorized project hostname
    withBrowserEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://evilprojectunauthorized12.supabase.co' }, () => {
      assert.throws(() => createSupabaseBrowserClient(), /SUPABASE_CONFIG_ERROR/);
    });
  });
});

// Scenario 13: Browser factory uses only public anon key and never requires a service-role key
runTest('14.16: Browser factory uses only public anon key and never requires service-role key', () => {
  withBrowserEnv({
    NEXT_PUBLIC_CLASPTEK_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_SECRET_KEY: undefined,
  }, () => {
    const client = createSupabaseBrowserClient();
    assert(client, 'Browser factory initializes with only anon key');
  });

  // Direct source-level audit: verify lib/supabase/client.ts never imports or references service role keys
  const clientSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'supabase', 'client.ts'), 'utf8');
  assert(!clientSource.includes('SUPABASE_SERVICE_ROLE_KEY'), 'client.ts must not contain SUPABASE_SERVICE_ROLE_KEY');
  assert(!clientSource.includes('SUPABASE_SECRET_KEY'), 'client.ts must not contain SUPABASE_SECRET_KEY');
  assert(!clientSource.includes('service_role'), 'client.ts must not reference service_role');
});

// -----------------------------------------------------------------------------
// Test 15: Build-time next.config.mjs Vercel Environment Mapping & Factory E2E
// -----------------------------------------------------------------------------

// 15.1: next.config.mjs maps VERCEL_ENV=production to NEXT_PUBLIC_VERCEL_ENV=production
runTest('15.1: next.config.mjs maps VERCEL_ENV=production to NEXT_PUBLIC_VERCEL_ENV=production', () => {
  const config = evaluateNextConfig({ VERCEL_ENV: 'production' });
  assert(config.env, 'next.config.mjs must define env object');
  assert.strictEqual(config.env.NEXT_PUBLIC_VERCEL_ENV, 'production');
});

// 15.2: next.config.mjs maps VERCEL_ENV=preview to NEXT_PUBLIC_VERCEL_ENV=preview
runTest('15.2: next.config.mjs maps VERCEL_ENV=preview to NEXT_PUBLIC_VERCEL_ENV=preview', () => {
  const config = evaluateNextConfig({ VERCEL_ENV: 'preview' });
  assert.strictEqual(config.env.NEXT_PUBLIC_VERCEL_ENV, 'preview');
});

// 15.3: next.config.mjs maps unset VERCEL_ENV to NEXT_PUBLIC_VERCEL_ENV=""
runTest('15.3: next.config.mjs maps unset VERCEL_ENV to empty string without hardcoding production', () => {
  const config = evaluateNextConfig({ VERCEL_ENV: undefined });
  assert.strictEqual(config.env.NEXT_PUBLIC_VERCEL_ENV, '');
});

// 15.4: End-to-end: Production build mapping authorizes production URL & rejects staging URL
runTest('15.4: End-to-end: Vercel Production build mapping authorizes production URL and rejects staging', () => {
  const config = evaluateNextConfig({ VERCEL_ENV: 'production' });
  withBrowserEnv({
    NEXT_PUBLIC_VERCEL_ENV: config.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    const client = createSupabaseBrowserClient();
    assert(client, 'Browser client must initialize in Production build');
  });

  withBrowserEnv({
    NEXT_PUBLIC_VERCEL_ENV: config.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://dwhjoiebzwnjdpcvcwvs.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.throws(
      () => createSupabaseBrowserClient(),
      /SUPABASE_CONFIG_CONFLICT/
    );
  });
});

// 15.5: End-to-end: Preview build mapping authorizes staging URL & rejects production URL
runTest('15.5: End-to-end: Vercel Preview build mapping authorizes staging URL and rejects production', () => {
  const config = evaluateNextConfig({ VERCEL_ENV: 'preview' });
  withBrowserEnv({
    NEXT_PUBLIC_VERCEL_ENV: config.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://dwhjoiebzwnjdpcvcwvs.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    const client = createSupabaseBrowserClient();
    assert(client, 'Browser client must initialize in Preview build with staging URL');
  });

  withBrowserEnv({
    NEXT_PUBLIC_VERCEL_ENV: config.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.throws(
      () => createSupabaseBrowserClient(),
      /SUPABASE_QUARANTINE_VIOLATION/
    );
  });
});

// 15.6: End-to-end: Local/Unset build mapping rejects production URL and permits staging fallback
runTest('15.6: End-to-end: Local/unset build mapping rejects production URL (fails closed)', () => {
  const config = evaluateNextConfig({ VERCEL_ENV: undefined });
  withBrowserEnv({
    NEXT_PUBLIC_VERCEL_ENV: config.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    assert.throws(
      () => createSupabaseBrowserClient(),
      /SUPABASE_QUARANTINE_VIOLATION/
    );
  });

  withBrowserEnv({
    NEXT_PUBLIC_VERCEL_ENV: config.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_CLASPTEK_ENV: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'https://dwhjoiebzwnjdpcvcwvs.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    const client = createSupabaseBrowserClient();
    assert(client, 'Local build must initialize staging URL via fallback');
  });
});

// 15.7: Browser client singleton pattern preserves cached instance
runTest('15.7: getSupabaseBrowserClient maintains singleton instance across calls', () => {
  withBrowserEnv({
    NEXT_PUBLIC_CLASPTEK_ENV: 'staging',
    NEXT_PUBLIC_SUPABASE_URL: 'https://dwhjoiebzwnjdpcvcwvs.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-12345',
  }, () => {
    const clientA = getSupabaseBrowserClient();
    const clientB = getSupabaseBrowserClient();
    assert.strictEqual(clientA, clientB, 'Singleton must return identical client instance');
  });
});

console.log('\n================================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
