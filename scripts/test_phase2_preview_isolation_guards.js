/**
 * scripts/test_phase2_preview_isolation_guards.js
 *
 * Automated Offline Certification Suite for Phase 2AI-C19: Preview Isolation Guards & Remediation.
 * Mode: STRICTLY OFFLINE — ZERO external network calls, ZERO database connections.
 *
 * Covers:
 *   Gate 2: OAuth Preview Isolation & Dedicated Staging Configuration
 *   Gate 3: Google Drive Destination Containment & Parent Enforcement
 *   Gate 4: LiveKit Provider Isolation, Token Issuance, & Room Creation
 *   Gate 5: Supabase Quarantine Regression
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');

process.env.NODE_ENV = 'test';
process.env.CLASPTEK_TEST_MODE = 'true';

const moduleCache = new Map();

function loadTsModule(relPath) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(__dirname, '..', relPath);
  if (moduleCache.has(fullPath)) return moduleCache.get(fullPath);

  const code = fs.readFileSync(fullPath, 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };

  const customRequire = (id) => {
    if (id.includes('supabase/server')) {
      return {
        createServerClient: async () => ({
          from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
        }),
        createSupabaseServiceClient: () => ({
          from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
        }),
      };
    }
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
  moduleCache.set(fullPath, mod.exports);
  return mod.exports;
}

const oauthConfig = require('../api/_lib/google-oauth-config');
const sfuAdapter = require('../api/_lib/sfu-adapter');
const sfuServiceMod = loadTsModule('lib/meetings/sfu.ts');
const googleMeetMod = loadTsModule('lib/meetings/google-meet.ts');
const joinHandler = require('../api/meetings/join');

const {
  validateSupabaseProjectRef,
  resolveValidatedSupabaseUrl,
  extractProjectRef,
  getQuarantinedProjectRef
} = loadTsModule('lib/supabase/project-guard.ts');

const {
  callLiveKitEgressRpc,
  callLiveKitRoomRpc,
  resolveCloudStorageConfig,
  RecordingServiceError
} = loadTsModule('lib/meetings/recording-service.ts');

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

async function withIsolatedEnvAsync(overrides, fn) {
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
    return await fn();
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

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Error: ${err.message}`);
    throw err;
  }
}

(async () => {
  console.log('\n============================================================');
  console.log('CLASPTEK PHASE 2AI-C19 — PREVIEW ISOLATION REMEDIATION SUITE');
  console.log('============================================================\n');

  // -------------------------------------------------------------
  // GATE 2: OAuth Preview Isolation & Staging Configuration Tests
  // -------------------------------------------------------------
  console.log('--- GATE 2: Google OAuth Preview Isolation ---');

  runTest('2.1: isPreviewEnvironment accurately detects preview variables and host headers', () => {
    withIsolatedEnv({ VERCEL_ENV: 'preview', CLASPTEK_ENV: undefined }, () => {
      assert.strictEqual(oauthConfig.isPreviewEnvironment(), true);
    });

    withIsolatedEnv({ VERCEL_ENV: undefined, CLASPTEK_ENV: undefined }, () => {
      assert.strictEqual(oauthConfig.isPreviewEnvironment({ headers: { host: 'preview.clasptek.vercel.app' } }), true);
      assert.strictEqual(oauthConfig.isPreviewEnvironment({ headers: { host: 'app.clasptek.org' } }), false);
    });
  });

  runTest('2.2: Preview denies OAuth initiation by default (HTTP 503 GOOGLE_OAUTH_PREVIEW_DISABLED)', () => {
    withIsolatedEnv({ VERCEL_ENV: 'preview', STAGING_GOOGLE_OAUTH_ENABLED: undefined }, () => {
      assert.throws(
        () => oauthConfig.assertOAuthInitiationAllowed(),
        (err) => {
          assert.strictEqual(err.code, 'GOOGLE_OAUTH_PREVIEW_DISABLED');
          assert.strictEqual(err.statusCode, 503);
          return true;
        }
      );
    });
  });

  runTest('2.3: getAuthorizationUrl throws in Preview and never returns app.clasptek.org callback URL', () => {
    withIsolatedEnv({ VERCEL_ENV: 'preview', STAGING_GOOGLE_OAUTH_ENABLED: undefined }, () => {
      assert.throws(
        () => oauthConfig.getAuthorizationUrl('state_nonce_123'),
        /GOOGLE_OAUTH_PREVIEW_DISABLED/
      );
    });
  });

  runTest('2.4: resolveGoogleOAuthConfig throws in Preview when staging is not approved', () => {
    withIsolatedEnv({ VERCEL_ENV: 'preview', STAGING_GOOGLE_OAUTH_ENABLED: undefined }, () => {
      assert.throws(
        () => oauthConfig.resolveGoogleOAuthConfig(),
        /CONFIGURATION_ERROR: Google OAuth is disabled in Preview/
      );
    });
  });

  runTest('2.5: Staging enabled with valid dedicated credentials uses only staging client ID and redirect URI', () => {
    withIsolatedEnv({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_OAUTH_ENABLED: 'true',
      STAGING_GOOGLE_CLIENT_ID: 'staging-client-123.apps.googleusercontent.com',
      STAGING_GOOGLE_CLIENT_SECRET: 'staging-secret-xyz',
      STAGING_GOOGLE_REDIRECT_URI: 'https://staging.clasptek.org/api/auth/google/callback',
      GOOGLE_CLIENT_ID: 'production-client-should-be-ignored',
      GOOGLE_REDIRECT_URI: 'https://app.clasptek.org/api/auth/google/callback'
    }, () => {
      assert.doesNotThrow(() => oauthConfig.assertOAuthInitiationAllowed());

      const config = oauthConfig.resolveGoogleOAuthConfig();
      assert.strictEqual(config.clientId, 'staging-client-123.apps.googleusercontent.com');
      assert.strictEqual(config.clientSecret, 'staging-secret-xyz');
      assert.strictEqual(config.redirectUri, 'https://staging.clasptek.org/api/auth/google/callback');
      assert(!config.redirectUri.includes('app.clasptek.org'));

      const authUrl = oauthConfig.getAuthorizationUrl('state_nonce_456');
      assert(authUrl.includes('client_id=staging-client-123'));
      assert(authUrl.includes('redirect_uri=https%3A%2F%2Fstaging.clasptek.org%2Fapi%2Fauth%2Fgoogle%2Fcallback'));
      assert(!authUrl.includes('app.clasptek.org'));
      assert(!authUrl.includes('production-client'));
    });
  });

  runTest('2.6: Missing staging client ID fails closed even if production GOOGLE_CLIENT_ID exists', () => {
    withIsolatedEnv({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_OAUTH_ENABLED: 'true',
      STAGING_GOOGLE_CLIENT_ID: undefined,
      STAGING_GOOGLE_REDIRECT_URI: 'https://staging.clasptek.org/api/auth/google/callback',
      GOOGLE_CLIENT_ID: 'production-client-456'
    }, () => {
      assert.throws(
        () => oauthConfig.assertOAuthInitiationAllowed(),
        /GOOGLE_OAUTH_PREVIEW_CONFIG_ERROR/
      );
      assert.throws(
        () => oauthConfig.resolveGoogleOAuthConfig(),
        /CONFIGURATION_ERROR: STAGING_GOOGLE_CLIENT_ID/
      );
    });
  });

  runTest('2.7: Missing staging redirect URI fails closed even if production GOOGLE_REDIRECT_URI exists', () => {
    withIsolatedEnv({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_OAUTH_ENABLED: 'true',
      STAGING_GOOGLE_CLIENT_ID: 'staging-client-789',
      STAGING_GOOGLE_REDIRECT_URI: undefined,
      GOOGLE_REDIRECT_URI: 'https://app.clasptek.org/api/auth/google/callback'
    }, () => {
      assert.throws(
        () => oauthConfig.assertOAuthInitiationAllowed(),
        /GOOGLE_OAUTH_PREVIEW_CONFIG_ERROR/
      );
      assert.throws(
        () => oauthConfig.resolveGoogleOAuthConfig(),
        /CONFIGURATION_ERROR: STAGING_GOOGLE_REDIRECT_URI/
      );
    });
  });

  runTest('2.8: Staging redirect URI targeting production app.clasptek.org fails closed', () => {
    withIsolatedEnv({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_OAUTH_ENABLED: 'true',
      STAGING_GOOGLE_CLIENT_ID: 'staging-client-789',
      STAGING_GOOGLE_REDIRECT_URI: 'https://app.clasptek.org/api/auth/google/callback'
    }, () => {
      assert.throws(
        () => oauthConfig.assertOAuthInitiationAllowed(),
        /GOOGLE_OAUTH_PREVIEW_CONFIG_ERROR/
      );
      assert.throws(
        () => oauthConfig.resolveGoogleOAuthConfig(),
        /CONFIGURATION_ERROR/
      );
    });
  });

  runTest('2.9: Production mode permits OAuth initiation normally with production callback', () => {
    withIsolatedEnv({ VERCEL_ENV: 'production', GOOGLE_REDIRECT_URI: undefined }, () => {
      assert.doesNotThrow(() => oauthConfig.assertOAuthInitiationAllowed());
      const config = oauthConfig.resolveGoogleOAuthConfig();
      assert.strictEqual(config.redirectUri, 'https://app.clasptek.org/api/auth/google/callback');
    });
  });

  runTest('2.10: Localhost development permits OAuth initiation normally', () => {
    withIsolatedEnv({ VERCEL_ENV: undefined, CLASPTEK_ENV: undefined, GOOGLE_REDIRECT_URI: undefined }, () => {
      const req = { headers: { host: 'localhost:3000' } };
      assert.doesNotThrow(() => oauthConfig.assertOAuthInitiationAllowed(req));
      const config = oauthConfig.resolveGoogleOAuthConfig(req);
      assert.strictEqual(config.redirectUri, 'http://localhost:3000/api/auth/google/callback');
    });
  });

  // -------------------------------------------------------------
  // GATE 3: Google Drive Destination Containment Tests
  // -------------------------------------------------------------
  console.log('\n--- GATE 3: Google Drive Destination Containment ---');

  runTest('3.1: Missing staging destination in Preview throws DRIVE_STAGING_DESTINATION_REQUIRED (HTTP 422)', () => {
    withIsolatedEnv({ VERCEL_ENV: 'preview', STAGING_GOOGLE_DRIVE_ROOT_FOLDER_ID: undefined }, () => {
      assert.throws(
        () => oauthConfig.assertDriveDestinationAllowed('any_folder_target', { isWriteOperation: true }),
        (err) => {
          assert.strictEqual(err.code, 'DRIVE_STAGING_DESTINATION_REQUIRED');
          assert.strictEqual(err.statusCode, 422);
          return true;
        }
      );
    });
  });

  await runAsyncTest('3.2: Missing, null, or empty parent folder in Preview throws DRIVE_UNPARENTED_FOLDER_REJECTED (422)', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_DRIVE_ROOT_FOLDER_ID: 'staging_root_folder_123'
    }, async () => {
      await assert.rejects(
        async () => {
          await oauthConfig.createGoogleDriveFolder({ accessToken: 'mock_token', parentFolderId: null });
        },
        (err) => {
          assert.strictEqual(err.code, 'DRIVE_UNPARENTED_FOLDER_REJECTED');
          assert.strictEqual(err.statusCode, 422);
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await oauthConfig.createGoogleDriveFolder({ accessToken: 'mock_token', parentFolderId: '' });
        },
        /DRIVE_UNPARENTED_FOLDER_REJECTED/
      );
    });
  });

  await runAsyncTest('3.3: Attempted creation of unparented root via resolveAuthoritativeRootFolder in Preview fails closed', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_DRIVE_ROOT_FOLDER_ID: undefined
    }, async () => {
      await assert.rejects(
        async () => {
          await oauthConfig.resolveAuthoritativeRootFolder({
            tenantId: 't1',
            accessToken: 'mock_token',
            centralConnection: { root_folder_id: null }
          });
        },
        (err) => {
          assert.strictEqual(err.code, 'DRIVE_STAGING_DESTINATION_REQUIRED');
          assert.strictEqual(err.statusCode, 422);
          return true;
        }
      );
    });
  });

  await runAsyncTest('3.4: Creation of folder under configured staging root succeeds', async () => {
    const stagingRoot = 'staging_root_folder_123';
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_DRIVE_ROOT_FOLDER_ID: stagingRoot
    }, async () => {
      oauthConfig.resetStagingCreatedFolders();

      const created = await oauthConfig.createGoogleDriveFolder({
        name: 'Cohort 2026 Recordings',
        accessToken: 'mock_token',
        parentFolderId: stagingRoot
      });

      assert(created.folderId);
      assert.strictEqual(oauthConfig._stagingCreatedFolders.has(created.folderId), true);
      oauthConfig.resetStagingCreatedFolders();
    });
  });

  runTest('3.5: Arbitrary non-quarantined folder ID write attempt fails closed with DRIVE_DESTINATION_CONTAINMENT_FAILED', () => {
    withIsolatedEnv({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_DRIVE_ROOT_FOLDER_ID: 'staging_root_folder_123'
    }, () => {
      oauthConfig.resetStagingCreatedFolders();

      assert.throws(
        () => oauthConfig.assertDriveDestinationAllowed('arbitrary_unverified_folder_999', { isWriteOperation: true }),
        (err) => {
          assert.strictEqual(err.code, 'DRIVE_DESTINATION_CONTAINMENT_FAILED');
          assert.strictEqual(err.statusCode, 403);
          assert(!err.message.includes('arbitrary_unverified_folder_999'));
          return true;
        }
      );
    });
  });

  runTest('3.6: Known production destination in Preview throws DRIVE_QUARANTINE_VIOLATION (HTTP 403)', () => {
    const prodFolderId = '1prod_folder_secret_abc123';
    withIsolatedEnv({
      VERCEL_ENV: 'preview',
      PRODUCTION_GOOGLE_DRIVE_ROOT_FOLDER_ID: prodFolderId,
      STAGING_GOOGLE_DRIVE_ROOT_FOLDER_ID: 'valid_staging_folder_xyz789'
    }, () => {
      assert.throws(
        () => oauthConfig.assertDriveDestinationAllowed(prodFolderId, { isWriteOperation: true }),
        (err) => {
          assert.strictEqual(err.code, 'DRIVE_QUARANTINE_VIOLATION');
          assert.strictEqual(err.statusCode, 403);
          assert(!err.message.includes(prodFolderId));
          return true;
        }
      );
    });
  });

  runTest('3.7: In-memory folder registry alone fails closed for writes across invocations (DRIVE_DESTINATION_CONTAINMENT_FAILED 403)', () => {
    withIsolatedEnv({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_DRIVE_ROOT_FOLDER_ID: 'staging_root_folder_123',
      STAGING_GOOGLE_DRIVE_CONTAINMENT_MAP: undefined
    }, () => {
      oauthConfig.resetStagingCreatedFolders();
      // Simulate folder created in prior invocation
      oauthConfig._stagingCreatedFolders.add('child_folder_created_in_memory');

      assert.throws(
        () => oauthConfig.assertDriveDestinationAllowed('child_folder_created_in_memory', { isWriteOperation: true }),
        (err) => {
          assert.strictEqual(err.code, 'DRIVE_DESTINATION_CONTAINMENT_FAILED');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
      oauthConfig.resetStagingCreatedFolders();
    });
  });

  runTest('3.8: Unverified allowlist child without durable containment fails closed (DRIVE_DESTINATION_CONTAINMENT_FAILED 403)', () => {
    withIsolatedEnv({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_DRIVE_ROOT_FOLDER_ID: 'staging_root_folder_123',
      STAGING_GOOGLE_DRIVE_CHILD_FOLDER_ALLOWLIST: 'unverified_child_999',
      STAGING_GOOGLE_DRIVE_CONTAINMENT_MAP: undefined
    }, () => {
      assert.throws(
        () => oauthConfig.assertDriveDestinationAllowed('unverified_child_999', { isWriteOperation: true }),
        (err) => {
          assert.strictEqual(err.code, 'DRIVE_DESTINATION_CONTAINMENT_FAILED');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  runTest('3.9: Preview write destination permits exact staging root only; child destination is rejected even with containment map', () => {
    const stagingRoot = 'staging_root_folder_123';
    const verifiedChild = 'verified_staging_child_abc';
    withIsolatedEnv({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_DRIVE_ROOT_FOLDER_ID: stagingRoot,
      STAGING_GOOGLE_DRIVE_CONTAINMENT_MAP: JSON.stringify({ [verifiedChild]: stagingRoot })
    }, () => {
      // 1. Root destination accepted directly
      assert.doesNotThrow(() => {
        oauthConfig.assertDriveDestinationAllowed(stagingRoot, { isWriteOperation: true });
      });

      // 2. Child destination is rejected even if mapped to staging root
      assert.throws(
        () => oauthConfig.assertDriveDestinationAllowed(verifiedChild, { isWriteOperation: true }),
        (err) => {
          assert.strictEqual(err.code, 'DRIVE_DESTINATION_CONTAINMENT_FAILED');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  runTest('3.10: resolveGoogleDriveRootFolderConfig never falls back to production folder in Preview', () => {
    withIsolatedEnv({
      VERCEL_ENV: 'preview',
      GOOGLE_DRIVE_ROOT_FOLDER_ID: 'prod_root_folder_should_not_leak',
      STAGING_GOOGLE_DRIVE_ROOT_FOLDER_ID: undefined
    }, () => {
      const res = oauthConfig.resolveGoogleDriveRootFolderConfig();
      assert.strictEqual(res.folderId, null);
      assert.strictEqual(Object.isFrozen(res), true);
    });
  });

  await runAsyncTest('3.11: Every rejected write leaves mocked Drive network-call counter at zero', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      STAGING_GOOGLE_DRIVE_ROOT_FOLDER_ID: 'staging_root_folder_123'
    }, async () => {
      let networkCalls = 0;
      const origHttpsRequest = oauthConfig.httpsRequest;
      oauthConfig.httpsRequest = async () => {
        networkCalls++;
        return { status: 200, body: {} };
      };

      try {
        await assert.rejects(
          async () => {
            await oauthConfig.uploadFileToGoogleDrive({
              fileName: 'test.mp4',
              folderId: 'unverified_arbitrary_child',
              accessToken: 'mock_token',
              fileBuffer: Buffer.from('test')
            });
          },
          /DRIVE_DESTINATION_CONTAINMENT_FAILED/
        );

        assert.strictEqual(networkCalls, 0, 'Drive network calls must remain 0 for rejected writes');
      } finally {
        oauthConfig.httpsRequest = origHttpsRequest;
      }
    });
  });

  // -------------------------------------------------------------
  // GATE 4: LiveKit Provider, Token, and RPC Isolation Tests
  // -------------------------------------------------------------
  console.log('\n--- GATE 4: LiveKit Provider Isolation ---');

  await runAsyncTest('4.1: Real LiveKit token issuance via LiveKitAdapter denied in Preview by default (LIVEKIT_PREVIEW_DENIED 503)', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      LIVEKIT_MOCK_ENABLED: undefined,
      STAGING_LIVEKIT_ALLOW_LIVE: undefined
    }, async () => {
      const adapter = new sfuAdapter.LiveKitAdapter({
        url: 'wss://livekit.clasptek.org',
        apiKey: 'prod_key',
        apiSecret: 'prod_secret'
      });

      await assert.rejects(
        async () => {
          await adapter.generateParticipantToken({
            roomId: 'room_123',
            participantId: 'p_123',
            participantName: 'Participant 123'
          });
        },
        (err) => {
          assert.strictEqual(err.code, 'LIVEKIT_PREVIEW_DENIED');
          assert.strictEqual(err.statusCode, 503);
          return true;
        }
      );
    });
  });

  await runAsyncTest('4.2: Real LiveKit room creation via LiveKitAdapter denied in Preview by default', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      LIVEKIT_MOCK_ENABLED: undefined,
      STAGING_LIVEKIT_ALLOW_LIVE: undefined
    }, async () => {
      const adapter = new sfuAdapter.LiveKitAdapter({
        url: 'wss://livekit.clasptek.org',
        apiKey: 'prod_key',
        apiSecret: 'prod_secret'
      });

      await assert.rejects(
        async () => {
          await adapter.createRoom({ roomId: 'room_123', roomTitle: 'Title 123' });
        },
        (err) => {
          assert.strictEqual(err.code, 'LIVEKIT_PREVIEW_DENIED');
          assert.strictEqual(err.statusCode, 503);
          return true;
        }
      );
    });
  });

  await runAsyncTest('4.3: Real LiveKit token issuance via LiveKitService in lib/meetings/sfu.ts denied in Preview by default', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      LIVEKIT_MOCK_ENABLED: undefined,
      STAGING_LIVEKIT_ALLOW_LIVE: undefined
    }, async () => {
      const service = new sfuServiceMod.LiveKitService({
        url: 'wss://livekit.clasptek.org',
        apiKey: 'prod_key',
        apiSecret: 'prod_secret'
      });

      await assert.rejects(
        async () => {
          await service.generateParticipantToken({
            roomId: 'room_abc',
            participantId: 'p_abc',
            participantName: 'Test Participant'
          });
        },
        /LIVEKIT_PREVIEW_DENIED/
      );
    });
  });

  await runAsyncTest('4.4: callLiveKitEgressRpc in Preview throws LIVEKIT_PREVIEW_DENIED (HTTP 503) without mock', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      LIVEKIT_URL: 'https://livekit.production.clasptek.org',
      STAGING_LIVEKIT_ALLOW_LIVE: undefined,
      LIVEKIT_MOCK_EGRESS: undefined
    }, async () => {
      await assert.rejects(
        async () => {
          await callLiveKitEgressRpc('StartRoomCompositeEgress', { roomName: 'test-room' });
        },
        (err) => {
          assert.strictEqual(err.code, 'LIVEKIT_PREVIEW_DENIED');
          assert.strictEqual(err.statusCode, 503);
          return true;
        }
      );
    });
  });

  await runAsyncTest('4.5: callLiveKitRoomRpc in Preview throws LIVEKIT_PREVIEW_DENIED (HTTP 503) without mock', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      LIVEKIT_URL: 'https://livekit.production.clasptek.org',
      NODE_ENV: 'preview',
      STAGING_LIVEKIT_ALLOW_LIVE: undefined,
      LIVEKIT_MOCK_ROOM: undefined,
      LIVEKIT_MOCK_EGRESS: undefined
    }, async () => {
      await assert.rejects(
        async () => {
          await callLiveKitRoomRpc('UpdateParticipant', { identity: 'user_123', permission: {} });
        },
        (err) => {
          assert.strictEqual(err.code, 'LIVEKIT_PREVIEW_DENIED');
          assert.strictEqual(err.statusCode, 503);
          return true;
        }
      );
    });
  });

  await runAsyncTest('4.6: Mock mode invokes genuine local mock without calling real LiveKit network endpoints or signing real secrets', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      LIVEKIT_MOCK_ENABLED: 'true'
    }, async () => {
      const adapter = new sfuAdapter.LiveKitAdapter();
      const tokenRes = await adapter.generateParticipantToken({
        roomId: 'preview_room_1',
        participantId: 'user_mock',
        participantName: 'Mock User'
      });

      assert(tokenRes.token.startsWith('mock_preview_jwt_'));
      assert.strictEqual(tokenRes.serverUrl, 'wss://mock-preview-livekit.local');
      assert.strictEqual(tokenRes.mock, true);

      const roomRes = await adapter.createRoom({ roomId: 'preview_room_1', roomTitle: 'Preview Title' });
      assert.strictEqual(roomRes.provider, 'mock');
      assert.strictEqual(roomRes.mock, true);
    });
  });

  await runAsyncTest('4.7: Explicit staging-live configuration fails closed when any isolation requirement is missing or contradictory', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      STAGING_LIVEKIT_ALLOW_LIVE: 'true',
      LIVEKIT_MOCK_ENABLED: undefined,
      STAGING_LIVEKIT_URL: undefined,
      STAGING_LIVEKIT_API_KEY: undefined,
      STAGING_LIVEKIT_API_SECRET: undefined,
      LIVEKIT_URL: undefined
    }, async () => {
      // 1. Missing credentials fails closed
      assert.throws(
        () => new sfuAdapter.LiveKitAdapter(),
        /LIVEKIT_PREVIEW_CONFIG_ERROR: STAGING_LIVEKIT_ALLOW_LIVE requires explicit STAGING_LIVEKIT_URL/
      );

      // 2. Matching production URL fails closed
      process.env.LIVEKIT_URL = 'wss://livekit.clasptek.org';
      process.env.STAGING_LIVEKIT_URL = 'wss://livekit.clasptek.org';
      process.env.STAGING_LIVEKIT_API_KEY = 'staging_key';
      process.env.STAGING_LIVEKIT_API_SECRET = 'staging_secret';

      assert.throws(
        () => new sfuAdapter.LiveKitAdapter(),
        /LIVEKIT_PREVIEW_CONFIG_ERROR: STAGING_LIVEKIT_URL cannot match production LIVEKIT_URL/
      );

      // 3. Staging URL not on allowlist fails closed
      process.env.STAGING_LIVEKIT_URL = 'wss://evil.thirdparty.com';
      assert.throws(
        () => new sfuAdapter.LiveKitAdapter(),
        /LIVEKIT_PREVIEW_CONFIG_ERROR: STAGING_LIVEKIT_URL host 'evil.thirdparty.com' is not on the certified staging endpoint allowlist/
      );

      // 4. Approved staging host succeeds
      process.env.STAGING_LIVEKIT_URL = 'wss://staging-livekit.clasptek.local';
      assert.doesNotThrow(() => new sfuAdapter.LiveKitAdapter());
    });
  });

  runTest('4.8: resolveCloudStorageConfig fails closed in Preview without certified staging storage', () => {
    withIsolatedEnv({
      VERCEL_ENV: 'preview',
      LIVEKIT_EGRESS_S3_BUCKET: 'production-s3-bucket-should-not-activate',
      STAGING_EGRESS_STORAGE_CERTIFIED: undefined
    }, () => {
      const res = resolveCloudStorageConfig();
      assert.strictEqual(res.hasStorage, false);
      assert.strictEqual(res.code, 'LIVEKIT_EGRESS_STORAGE_REQUIRED');
      assert.strictEqual(res.state, 'STAGING_EGRESS_UNCERTIFIED');
    });
  });

  await runAsyncTest('4.9: Preview with production-like DAILY_API_KEY is denied (DAILY_PREVIEW_DENIED 503)', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      DAILY_API_KEY: 'prod_daily_key_should_be_denied',
      SFU_PROVIDER: 'daily'
    }, async () => {
      const adapter = new sfuAdapter.DailyAdapter();
      await assert.rejects(
        async () => {
          await adapter.createRoom({ roomId: 'room_daily_1', roomTitle: 'Daily Room' });
        },
        (err) => {
          assert.strictEqual(err.code, 'DAILY_PREVIEW_DENIED');
          assert.strictEqual(err.statusCode, 503);
          return true;
        }
      );
    });
  });

  await runAsyncTest('4.10: DailyAdapter room creation in Preview is denied without making network requests', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      DAILY_API_KEY: 'mock_key'
    }, async () => {
      const https = require('https');
      const origHttpsRequest = https.request;
      let dailyNetworkCalls = 0;
      https.request = function(...args) {
        dailyNetworkCalls++;
        return origHttpsRequest.apply(this, args);
      };

      try {
        const adapter = new sfuAdapter.DailyAdapter();
        await assert.rejects(
          async () => {
            await adapter.createRoom({ roomId: 'test_daily_room', roomTitle: 'Title' });
          },
          /DAILY_PREVIEW_DENIED/
        );
        assert.strictEqual(dailyNetworkCalls, 0, 'Daily network calls must remain 0');
      } finally {
        https.request = origHttpsRequest;
      }
    });
  });

  await runAsyncTest('4.11: DailyAdapter participant-token generation in Preview is denied without making network requests', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      DAILY_API_KEY: 'mock_key'
    }, async () => {
      const https = require('https');
      const origHttpsRequest = https.request;
      let dailyNetworkCalls = 0;
      https.request = function(...args) {
        dailyNetworkCalls++;
        return origHttpsRequest.apply(this, args);
      };

      try {
        const adapter = new sfuAdapter.DailyAdapter();
        await assert.rejects(
          async () => {
            await adapter.generateParticipantToken({
              roomId: 'test_daily_room',
              participantId: 'p_daily',
              participantName: 'Daily User'
            });
          },
          /DAILY_PREVIEW_DENIED/
        );
        assert.strictEqual(dailyNetworkCalls, 0, 'Daily network calls must remain 0');
      } finally {
        https.request = origHttpsRequest;
      }
    });
  });

  await runAsyncTest('4.12: Direct invocation of shared Daily request boundary (_request) in Preview is denied', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      DAILY_API_KEY: 'mock_key'
    }, async () => {
      const https = require('https');
      const origHttpsRequest = https.request;
      let dailyNetworkCalls = 0;
      https.request = function(...args) {
        dailyNetworkCalls++;
        return origHttpsRequest.apply(this, args);
      };

      try {
        const adapter = new sfuAdapter.DailyAdapter();
        await assert.rejects(
          async () => {
            await adapter._request('/rooms', 'POST', { name: 'test' });
          },
          /DAILY_PREVIEW_DENIED/
        );
        assert.strictEqual(dailyNetworkCalls, 0, 'Direct Daily request must not invoke https.request');
      } finally {
        https.request = origHttpsRequest;
      }
    });
  });

  await runAsyncTest('4.13: api/meetings/join handler returns HTTP 503 DAILY_PREVIEW_DENIED for Daily meetings in Preview', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      DAILY_API_KEY: 'mock_key'
    }, async () => {
      let statusCode = null;
      let jsonBody = null;
      const mockReq = {
        method: 'POST',
        headers: {},
        body: {
          user: { id: 'usr_test', name: 'Test User', role: 'student' },
          meeting: { id: 'm1', publicId: 'pub1', sfuProvider: 'daily', status: 'SCHEDULED' }
        }
      };
      const mockRes = {
        setHeader() {},
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          jsonBody = data;
          return this;
        }
      };

      await joinHandler(mockReq, mockRes);
      assert.strictEqual(statusCode, 503);
      assert.strictEqual(jsonBody.error, 'DAILY_PREVIEW_DENIED');
      assert(jsonBody.message.includes('DAILY_PREVIEW_DENIED'));
    });
  });

  await runAsyncTest('4.14: Daily test mock mode outside Preview functions locally without network calls', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: undefined,
      CLASPTEK_ENV: undefined,
      DAILY_API_KEY: undefined
    }, async () => {
      const adapter = new sfuAdapter.DailyAdapter();
      const roomRes = await adapter.createRoom({ roomId: 'local_room', roomTitle: 'Local Room' });
      assert.strictEqual(roomRes.provider, 'daily');

      const tokenRes = await adapter.generateParticipantToken({
        roomId: 'local_room',
        participantId: 'p_local',
        participantName: 'Local User'
      });
      assert(tokenRes.token.startsWith('mock_daily_token_'));
    });
  });

  await runAsyncTest('4.15: Automated Google Meet conference generation fails closed globally (PROVIDER_UNSUPPORTED 400)', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview'
    }, async () => {
      let calendarNetworkCalls = 0;
      const origOAuthHttpsRequest = oauthConfig.httpsRequest;
      oauthConfig.httpsRequest = async () => {
        calendarNetworkCalls++;
        return { status: 200, body: {} };
      };

      try {
        await assert.rejects(
          async () => {
            await googleMeetMod.createOrValidateGoogleMeet({
              tenantId: 'tenant_1',
              title: 'Test Google Meet',
              scheduledStart: new Date().toISOString(),
              scheduledEnd: new Date(Date.now() + 3600000).toISOString()
            });
          },
          (err) => {
            assert.strictEqual(err.code, 'PROVIDER_UNSUPPORTED');
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
        assert.strictEqual(calendarNetworkCalls, 0, 'Google Calendar network calls must remain 0');
      } finally {
        oauthConfig.httpsRequest = origOAuthHttpsRequest;
      }
    });
  });

  await runAsyncTest('4.16: Direct call to createOrValidateGoogleMeet cannot bypass global denial in production (PROVIDER_UNSUPPORTED 400)', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'production',
      NODE_ENV: 'production'
    }, async () => {
      let calendarNetworkCalls = 0;
      const origOAuthHttpsRequest = oauthConfig.httpsRequest;
      oauthConfig.httpsRequest = async () => {
        calendarNetworkCalls++;
        return { status: 200, body: {} };
      };

      try {
        await assert.rejects(
          async () => {
            await googleMeetMod.createOrValidateGoogleMeet({
              tenantId: 'tenant_bypass',
              title: 'Bypass Attempt',
              scheduledStart: '2026-10-15T15:00:00Z',
              scheduledEnd: '2026-10-15T16:00:00Z',
              customGoogleMeetUrl: 'https://meet.google.com/abc-defg-hij'
            });
          },
          (err) => {
            assert.strictEqual(err.code, 'PROVIDER_UNSUPPORTED');
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
        assert.strictEqual(calendarNetworkCalls, 0);
      } finally {
        oauthConfig.httpsRequest = origOAuthHttpsRequest;
      }
    });
  });

  await runAsyncTest('4.17: LiveKit meeting creation is not denied merely because Google Meet is disabled in Preview', async () => {
    await withIsolatedEnvAsync({
      VERCEL_ENV: 'preview',
      LIVEKIT_MOCK_ENABLED: 'true'
    }, async () => {
      const sfu = new sfuServiceMod.LiveKitService();
      const room = await sfu.createRoom({
        roomId: 'lk_room_valid',
        roomTitle: 'LiveKit Standup'
      });
      assert.strictEqual(room.success, true);
      assert.strictEqual(room.provider, 'mock');

      const token = await sfu.generateParticipantToken({
        roomId: 'lk_room_valid',
        participantId: 'p_lk',
        participantName: 'LK User'
      });
      assert(token.token.startsWith('mock_preview_jwt_'));
    });
  });

  await runAsyncTest('4.18: Joining meeting with sfuProvider "google_meet" via joinHandler fails closed with PROVIDER_UNSUPPORTED (400)', async () => {
    const mockReq = {
      method: 'POST',
      body: {
        meeting: {
          id: 'mtg_legacy_meet',
          publicId: 'mtg-legacy-001',
          sfuProvider: 'google_meet',
          providerRoomUrl: 'https://meet.google.com/abc-defg-hij',
          status: 'SCHEDULED'
        },
        user: { id: 'u_test', role: 'Student' }
      }
    };
    let statusCode = null;
    let responseData = null;
    const mockRes = {
      setHeader() {},
      status(c) { statusCode = c; return this; },
      json(d) { responseData = d; return this; }
    };
    await joinHandler(mockReq, mockRes);
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(responseData.error, 'PROVIDER_UNSUPPORTED');
    assert.strictEqual(responseData.token, undefined);
  });

  runTest('4.19: Staging root conflicting with quarantined production root throws DRIVE_QUARANTINE_VIOLATION (403)', () => {
    const prodFolderId = '1prod_quarantined_root_abc';
    withIsolatedEnv({
      VERCEL_ENV: 'preview',
      PRODUCTION_GOOGLE_DRIVE_ROOT_FOLDER_ID: prodFolderId,
      STAGING_GOOGLE_DRIVE_ROOT_FOLDER_ID: prodFolderId
    }, () => {
      assert.throws(
        () => oauthConfig.assertDriveDestinationAllowed(prodFolderId, { isWriteOperation: true }),
        (err) => {
          assert.strictEqual(err.code, 'DRIVE_QUARANTINE_VIOLATION');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------
  // GATE 5: Supabase Quarantine Regression Tests
  // -------------------------------------------------------------
  console.log('\n--- GATE 5: Supabase Quarantine Regression ---');

  runTest('5.1: extractProjectRef correctly identifies production quarantined ref', () => {
    const ref = extractProjectRef('https://logaawoigfxnisimfatf.supabase.co');
    assert.strictEqual(ref, 'logaawoigfxnisimfatf');
    assert.strictEqual(getQuarantinedProjectRef(), 'logaawoigfxnisimfatf');
  });

  runTest('5.2: validateSupabaseProjectRef rejects production quarantined project URL synchronously', () => {
    assert.throws(
      () => validateSupabaseProjectRef('https://logaawoigfxnisimfatf.supabase.co', 'TEST_URL'),
      (err) => {
        assert(err.message.includes('SUPABASE_QUARANTINE_VIOLATION'));
        return true;
      }
    );
  });

  runTest('5.3: resolveValidatedSupabaseUrl rejects quarantined production URL even as secondary alias', () => {
    assert.throws(
      () => resolveValidatedSupabaseUrl('https://dwhjoiebzwnjdpcvcwvs.supabase.co', 'https://logaawoigfxnisimfatf.supabase.co'),
      (err) => {
        assert(err.message.includes('SUPABASE_QUARANTINE_VIOLATION') || err.message.includes('SUPABASE_CONFIG_CONFLICT'));
        return true;
      }
    );
  });

  runTest('5.4: validateSupabaseProjectRef accepts valid staging project URL', () => {
    const validated = validateSupabaseProjectRef('https://dwhjoiebzwnjdpcvcwvs.supabase.co', 'STAGING_URL');
    assert.strictEqual(validated, 'https://dwhjoiebzwnjdpcvcwvs.supabase.co');
  });

  runTest('5.5: Legacy OAuth config helper resolveSupabaseConfig rejects quarantined production ref', () => {
    withIsolatedEnv({
      SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co',
      NEXT_PUBLIC_SUPABASE_URL: 'https://logaawoigfxnisimfatf.supabase.co'
    }, () => {
      assert.throws(
        () => oauthConfig.resolveSupabaseConfig(),
        /SUPABASE_QUARANTINE_VIOLATION/
      );
    });
  });

  console.log('\n============================================================');
  console.log(`ALL ISOLATION TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log('============================================================\n');
})();
