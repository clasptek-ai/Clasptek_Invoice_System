/**
 * CLASPTEK ENTERPRISE PLATFORM — CENTRAL GOOGLE DRIVE REPOSITORY CERTIFICATION SUITE
 * File: scripts/test_google_drive_central_repository.js
 * 
 * Comprehensive Test Coverage:
 * 1. Database Schema & Migration Verification (20260917_google_drive_central_repository.sql)
 * 2. Scope & Security Audit (Strict drive.file enforcement, zero token leakage)
 * 3. Connection Type Separation (TENANT_CENTRAL vs USER_PERSONAL) & RBAC Gating
 * 4. Authoritative Root Folder Resolution (DB -> Env bootstrap -> App-Provisioned)
 * 5. Privileged Repository Verification (POST /api/auth/google/verify-repository)
 * 6. Meeting Recording Upload Lifecycle (POST /api/meetings/upload-recording)
 * 7. Tenant Isolation & RBAC Security Verification
 * 8. Zero Fake Success Invariant (Recording marked STORED ONLY on verified Drive upload)
 * 9. Production Distribution Parity (100% SHA-256 match across all 4 targets)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

// Set test environment flags
process.env.NODE_ENV = 'test';
process.env.CLASPTEK_TEST_MODE = 'true';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

// Mock HTTP response helper
function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(code, hdrs = {}) {
      this.statusCode = code;
      Object.entries(hdrs).forEach(([k, v]) => this.headers[k.toLowerCase()] = v);
    },
    end(data = '') { this.body = data; }
  };
}

async function runCentralRepositoryCertification() {
  console.log('================================================================================');
  console.log(' CLASPTEK CENTRAL GOOGLE DRIVE REPOSITORY & RECORDING UPLOAD SUITE');
  console.log('================================================================================\n');

  const oauthConfig = require('../api/auth/google/google-oauth-config');
  const verifyRepoHandler = require('../api/auth/google/verify-repository');
  const uploadRecordingHandler = require('../api/meetings/upload-recording');
  const startHandler = require('../api/auth/google/start');
  const statusHandler = require('../api/auth/google/status');

  // --- SECTION 1: Migration & File Architecture ---
  console.log('--- SECTION 1: Migration & File Architecture ---');

  runTest('1.1: Migration file exists on disk', () => {
    const p = path.join(process.cwd(), 'migrations', '20260917_google_drive_central_repository.sql');
    assert(fs.existsSync(p), 'migrations/20260917_google_drive_central_repository.sql must exist');
    const sql = fs.readFileSync(p, 'utf8');
    assert(sql.includes('connection_type'), 'Must add connection_type column');
    assert(sql.includes('TENANT_CENTRAL'), 'Must reference TENANT_CENTRAL');
    assert(sql.includes('root_folder_id'), 'Must add root_folder_id column');
    assert(sql.includes('uq_tenant_central_gdrive'), 'Must create unique partial index for tenant central connection');
  });

  runTest('1.2: All required API handlers exist on disk', () => {
    assert(fs.existsSync(path.join(process.cwd(), 'api/auth/google/verify-repository.js')), 'verify-repository.js must exist');
    assert(fs.existsSync(path.join(process.cwd(), 'api/meetings/upload-recording.js')), 'upload-recording.js must exist');
    assert(fs.existsSync(path.join(process.cwd(), 'api/auth/google/google-oauth-config.js')), 'google-oauth-config.js must exist');
  });

  // --- SECTION 2: Scope & Security Invariants ---
  console.log('\n--- SECTION 2: Scope & Security Invariants ---');

  runTest('2.1: Authoritative OAuth scope strictly enforces drive.file and userInfo.email only', () => {
    const scopes = oauthConfig.GOOGLE_SCOPES;
    assert(Array.isArray(scopes), 'GOOGLE_SCOPES must be an array');
    assert(scopes.includes('https://www.googleapis.com/auth/drive.file'), 'Must include drive.file scope');
    assert(scopes.includes('https://www.googleapis.com/auth/userinfo.email'), 'Must include userinfo.email scope');
    assert(!scopes.includes('https://www.googleapis.com/auth/drive'), 'CRITICAL: Must NEVER upgrade to full drive scope');
    assert(!scopes.includes('https://www.googleapis.com/auth/drive.readonly'), 'Must not use drive.readonly');
  });

  runTest('2.2: OAuth Start produces URL containing strict drive.file scope', () => {
    const url = oauthConfig.getAuthorizationUrl('test_state_123');
    assert(url.includes('scope='), 'URL must include scope parameter');
    assert(url.includes('drive.file'), 'URL scope parameter must contain drive.file');
    assert(!url.includes('auth%2Fdrive+'), 'URL scope parameter must not contain full drive');
    assert(url.includes('access_type=offline'), 'Must request offline access for refresh token');
    assert(url.includes('prompt=consent'), 'Must include prompt=consent to ensure refresh token issue');
  });

  // --- SECTION 3: Connection Types & RBAC Gating ---
  console.log('\n--- SECTION 3: Connection Types & RBAC Gating ---');

  await runAsyncTest('3.1: Non-admin caller is rejected with 403 when requesting TENANT_CENTRAL connection', async () => {
    const req = {
      method: 'POST',
      url: '/api/auth/google/start',
      headers: { 'content-type': 'application/json' },
      body: {
        connectionType: 'TENANT_CENTRAL',
        redirectTarget: '/#meetings'
      },
      // In test mode: simulate authenticated non-admin user
      __testUser: {
        id: 'usr_student_01',
        email: 'student@clasptek.org',
        role: 'student',
        tenantId: 'tenant-cert-test'
      }
    };
    const res = createMockResponse();
    await startHandler(req, res);
    assert.strictEqual(res.statusCode, 403, `Expected 403 for student initiating central connection, got ${res.statusCode}`);
    const data = JSON.parse(res.body);
    assert.strictEqual(data.error, 'FORBIDDEN');
  });

  await runAsyncTest('3.2: Administrator can initiate TENANT_CENTRAL connection', async () => {
    const req = {
      method: 'POST',
      url: '/api/auth/google/start',
      headers: { 'content-type': 'application/json' },
      body: {
        connectionType: 'TENANT_CENTRAL',
        redirectTarget: '/#meetings'
      },
      __testUser: {
        id: 'usr_admin_01',
        email: 'admin@clasptek.org',
        role: 'super_admin',
        tenantId: 'tenant-cert-test'
      }
    };
    const res = createMockResponse();
    await startHandler(req, res);
    assert.strictEqual(res.statusCode, 200, `Expected 200 for admin initiating central connection, got ${res.statusCode}`);
    const data = JSON.parse(res.body);
    assert(data.authUrl || data.url, 'Must return authUrl');
    assert.strictEqual(data.connectionType, 'TENANT_CENTRAL');
  });

  // --- SECTION 4: Authoritative Folder Resolution ---
  console.log('\n--- SECTION 4: Authoritative Folder Resolution ---');

  await runAsyncTest('4.1: Resolves root folder from existing verified central connection', async () => {
    const tenantId = 'tenant_resolve_test_1';
    const fakeConn = {
      tenant_id: tenantId,
      connection_type: 'TENANT_CENTRAL',
      root_folder_id: 'folder_db_existing_123',
      root_folder_name: 'Clasptek Meeting Recordings',
      access_token: 'fake_access_token'
    };

    const result = await oauthConfig.resolveAuthoritativeRootFolder({
      tenantId,
      accessToken: 'fake_access_token',
      centralConnection: fakeConn
    });

    assert.strictEqual(result.folderId, 'folder_db_existing_123');
    assert.strictEqual(result.folderName, 'Clasptek Meeting Recordings');
    assert.strictEqual(result.source, 'DB_AUTHORITATIVE');
  });

  await runAsyncTest('4.2: Resolves root folder from GOOGLE_DRIVE_ROOT_FOLDER_ID environment bootstrap if valid', async () => {
    const tenantId = 'tenant_resolve_test_2';
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = 'folder_env_bootstrap_456';
    const fakeConn = {
      tenant_id: tenantId,
      connection_type: 'TENANT_CENTRAL',
      access_token: 'fake_access_token'
    };

    const result = await oauthConfig.resolveAuthoritativeRootFolder({
      tenantId,
      accessToken: 'fake_access_token',
      centralConnection: fakeConn
    });

    assert.strictEqual(result.folderId, 'folder_env_bootstrap_456');
    assert.strictEqual(result.source, 'BOOTSTRAP_VERIFIED');
    delete process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  });

  await runAsyncTest('4.3: Provisions application-owned folder when neither DB nor Env is set', async () => {
    const tenantId = 'tenant_resolve_test_3';
    delete process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    const fakeConn = {
      tenant_id: tenantId,
      connection_type: 'TENANT_CENTRAL',
      access_token: 'fake_access_token'
    };

    const result = await oauthConfig.resolveAuthoritativeRootFolder({
      tenantId,
      accessToken: 'fake_access_token',
      centralConnection: fakeConn
    });

    assert(result.folderId, 'Must return a provisioned folder ID');
    assert.strictEqual(result.folderName, 'Clasptek Meeting Recordings');
    assert.strictEqual(result.source, 'APP_PROVISIONED');
  });

  // --- SECTION 5: Privileged Repository Verification Endpoint ---
  console.log('\n--- SECTION 5: Privileged Repository Verification Endpoint ---');

  await runAsyncTest('5.1: verify-repository rejects unauthenticated callers with 401', async () => {
    const req = {
      method: 'POST',
      url: '/api/auth/google/verify-repository',
      headers: {},
      __testUnauthenticated: true
    };
    const res = createMockResponse();
    await verifyRepoHandler(req, res);
    assert.strictEqual(res.statusCode, 401);
  });

  await runAsyncTest('5.2: verify-repository rejects non-admin users with 403', async () => {
    const req = {
      method: 'POST',
      url: '/api/auth/google/verify-repository',
      headers: { 'content-type': 'application/json' },
      __testUser: {
        id: 'usr_fac_01',
        email: 'fac@clasptek.org',
        role: 'facilitator',
        tenantId: 'tenant-cert-test'
      }
    };
    const res = createMockResponse();
    await verifyRepoHandler(req, res);
    assert.strictEqual(res.statusCode, 403);
    const data = JSON.parse(res.body);
    assert.strictEqual(data.error, 'FORBIDDEN');
  });

  await runAsyncTest('5.3: verify-repository succeeds for Admin and updates lastVerifiedAt', async () => {
    const tenantId = 'tenant_admin_verify_test';
    // Bootstrap central connection
    await oauthConfig.upsertGoogleDriveConnection({
      tenantId,
      userId: 'usr_admin_org',
      connectionType: 'TENANT_CENTRAL',
      googleEmail: 'organization@clasptek.org',
      tokens: {
        access_token: 'fake_access_token_verify',
        refresh_token: 'fake_refresh_token_verify',
        expiry_date: Date.now() + 3600000
      },
      rootFolderId: 'folder_cert_verified_789',
      rootFolderName: 'Clasptek Meeting Recordings'
    });

    const req = {
      method: 'POST',
      url: '/api/auth/google/verify-repository',
      headers: { 'content-type': 'application/json' },
      __testUser: {
        id: 'usr_admin_02',
        email: 'admin@clasptek.org',
        role: 'admin',
        tenantId
      }
    };
    const res = createMockResponse();
    await verifyRepoHandler(req, res);
    assert.strictEqual(res.statusCode, 200, `Expected 200 from verify-repository, got ${res.statusCode}: ${res.body}`);
    const data = JSON.parse(res.body);
    assert.strictEqual(data.success, true);
    assert(data.lastVerifiedAt, 'Must include lastVerifiedAt ISO string');
    assert.strictEqual(data.folderId, 'folder_cert_verified_789');
  });

  // --- SECTION 6: Meeting Recording Upload & Tenant Isolation ---
  console.log('\n--- SECTION 6: Meeting Recording Upload & Tenant Isolation ---');

  const testTenantA = 'tenant_recording_test_A';
  const testTenantB = 'tenant_recording_test_B';
  const testMeetingIdA = 'mtg_rec_cert_test_A';

  // Seed meeting in memory store
  oauthConfig.seedTestMeeting({
    id: testMeetingIdA,
    tenantId: testTenantA,
    title: 'Data Science Cohort 12 — Machine Learning 101',
    status: 'ENDED',
    recording_status: 'PROCESSING'
  });

  // Seed central connection for Tenant A
  await oauthConfig.upsertGoogleDriveConnection({
    tenantId: testTenantA,
    userId: 'usr_admin_org_A',
    connectionType: 'TENANT_CENTRAL',
    googleEmail: 'tenant-a@clasptek.org',
    tokens: {
      access_token: 'fake_token_tenant_a',
      refresh_token: 'fake_refresh_tenant_a',
      expiry_date: Date.now() + 3600000
    },
    rootFolderId: 'folder_tenant_a_root',
    rootFolderName: 'Clasptek Meeting Recordings'
  });

  await runAsyncTest('6.1: upload-recording rejects unauthenticated requests with 401', async () => {
    const req = {
      method: 'POST',
      url: '/api/meetings/upload-recording',
      headers: {},
      __testUnauthenticated: true
    };
    const res = createMockResponse();
    await uploadRecordingHandler(req, res);
    assert.strictEqual(res.statusCode, 401);
  });

  await runAsyncTest('6.2: Tenant Isolation: Tenant B caller CANNOT upload to Tenant A meeting (403)', async () => {
    const boundary = '----WebKitFormBoundaryTenantIso';
    const fakeWebm = Buffer.from('FAKE_WEBM_VIDEO_DATA_FOR_CERTIFICATION');
    const bodyBuffer = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="meetingId"\r\n\r\n${testMeetingIdA}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="recording"; filename="rec.webm"\r\nContent-Type: video/webm\r\n\r\n`),
      fakeWebm,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const req = {
      method: 'POST',
      url: '/api/meetings/upload-recording',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': String(bodyBuffer.length)
      },
      __testBodyBuffer: bodyBuffer,
      __testUser: {
        id: 'usr_tenant_b_user',
        email: 'intruder@tenant-b.org',
        role: 'super_admin',
        tenantId: testTenantB // Cross-tenant violation
      }
    };
    const res = createMockResponse();
    await uploadRecordingHandler(req, res);
    const data = JSON.parse(res.body);
    assert(['TENANT_MISMATCH', 'FORBIDDEN'].includes(data.error), `Expected TENANT_MISMATCH or FORBIDDEN, got ${data.error}`);
  });

  await runAsyncTest('6.3: Rejects upload if Tenant has NO central Drive connection (400 NO_CENTRAL_DRIVE_CONNECTION)', async () => {
    const testMeetingNoConn = 'mtg_no_conn_test';
    oauthConfig.seedTestMeeting({
      id: testMeetingNoConn,
      tenantId: 'tenant_with_no_gdrive',
      title: 'Session Without GDrive',
      status: 'ENDED'
    });

    const boundary = '----WebKitFormBoundaryNoConn';
    const fakeWebm = Buffer.from('FAKE_WEBM_VIDEO_DATA');
    const bodyBuffer = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="meetingId"\r\n\r\n${testMeetingNoConn}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="recording"; filename="rec.webm"\r\nContent-Type: video/webm\r\n\r\n`),
      fakeWebm,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const req = {
      method: 'POST',
      url: '/api/meetings/upload-recording',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': String(bodyBuffer.length)
      },
      __testBodyBuffer: bodyBuffer,
      __testUser: {
        id: 'usr_no_conn',
        email: 'user@noconn.org',
        role: 'admin',
        tenantId: 'tenant_with_no_gdrive'
      }
    };
    const res = createMockResponse();
    await uploadRecordingHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    const data = JSON.parse(res.body);
    assert.strictEqual(data.error, 'NO_CENTRAL_DRIVE_CONNECTION');
  });

  // --- SECTION 7: Zero Fake Success Invariant & Verified Upload ---
  console.log('\n--- SECTION 7: Zero Fake Success Invariant & Verified Upload ---');

  await runAsyncTest('7.1: Zero Fake Success: Upload failure NEVER marks recording as STORED', async () => {
    const testMeetingFail = 'mtg_rec_fail_test';
    oauthConfig.seedTestMeeting({
      id: testMeetingFail,
      tenantId: testTenantA,
      title: 'Failing Upload Session',
      status: 'ENDED',
      recording_status: 'PENDING'
    });

    // Mock an upload failure
    oauthConfig.setTestUploadFailure(true, 'Simulated Google Drive 500 Network Timeout');

    const boundary = '----WebKitFormBoundaryFail';
    const fakeWebm = Buffer.from('FAKE_WEBM_VIDEO_DATA');
    const bodyBuffer = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="meetingId"\r\n\r\n${testMeetingFail}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="recording"; filename="rec.webm"\r\nContent-Type: video/webm\r\n\r\n`),
      fakeWebm,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const req = {
      method: 'POST',
      url: '/api/meetings/upload-recording',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': String(bodyBuffer.length)
      },
      __testBodyBuffer: bodyBuffer,
      __testUser: {
        id: 'usr_tenant_a_user',
        email: 'admin@tenant-a.org',
        role: 'admin',
        tenantId: testTenantA
      }
    };
    const res = createMockResponse();
    await uploadRecordingHandler(req, res);
    assert.strictEqual(res.statusCode, 502, `Expected 502 for failed Google Drive upload, got ${res.statusCode}`);

    // Verify DB meeting status: MUST NOT be STORED
    const updatedMeeting = oauthConfig.getTestMeeting(testMeetingFail);
    assert.strictEqual(updatedMeeting.recording_status, 'FAILED', 'On upload failure, recording_status must be FAILED');
    assert.notStrictEqual(updatedMeeting.recording_status, 'STORED', 'CRITICAL: Must NEVER mark STORED on failure');
    assert.strictEqual(updatedMeeting.recording_metadata.upload_status, 'FAILED');

    oauthConfig.setTestUploadFailure(false);
  });

  await runAsyncTest('7.2: Verified Upload: Successful upload places file in root folder, returns file ID and sets STORED', async () => {
    const boundary = '----WebKitFormBoundarySuccess';
    const fakeWebm = Buffer.from('VALID_WEBM_MEETING_VIDEO_PAYLOAD_FOR_GOOGLE_DRIVE');
    const bodyBuffer = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="meetingId"\r\n\r\n${testMeetingIdA}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="recordingDurationSeconds"\r\n\r\n3600\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="recording"; filename="data_science_session_12.webm"\r\nContent-Type: video/webm\r\n\r\n`),
      fakeWebm,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const req = {
      method: 'POST',
      url: '/api/meetings/upload-recording',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': String(bodyBuffer.length)
      },
      __testBodyBuffer: bodyBuffer,
      __testUser: {
        id: 'usr_tenant_a_user',
        email: 'admin@tenant-a.org',
        role: 'admin',
        tenantId: testTenantA
      }
    };
    const res = createMockResponse();
    await uploadRecordingHandler(req, res);
    assert.strictEqual(res.statusCode, 200, `Expected 200 for successful upload, got ${res.statusCode}: ${res.body}`);
    const data = JSON.parse(res.body);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.recordingStatus, 'STORED');
    assert(data.fileId, 'Response must contain Google Drive fileId');
    assert.strictEqual(data.folderId, 'folder_tenant_a_root', 'File parent must be the authoritative tenant central root folder');
    assert(data.googleDriveUrl, 'Response must contain googleDriveUrl');

    // Verify DB meeting record
    const updatedMeeting = oauthConfig.getTestMeeting(testMeetingIdA);
    assert.strictEqual(updatedMeeting.recording_status, 'STORED');
    assert.strictEqual(updatedMeeting.recording_metadata.google_drive_file_id, data.fileId);
    assert.strictEqual(updatedMeeting.recording_metadata.google_drive_folder_id, 'folder_tenant_a_root');
    assert.strictEqual(updatedMeeting.recording_metadata.upload_status, 'STORED');
    assert.strictEqual(updatedMeeting.recording_metadata.file_size_bytes, fakeWebm.length);
  });

  // --- SECTION 8: Security Audit — Zero Token Leakage ---
  console.log('\n--- SECTION 8: Security Audit — Zero Token Leakage ---');

  await runAsyncTest('8.1: Status endpoint never leaks access_token, refresh_token, or client_secret', async () => {
    const req = {
      method: 'GET',
      url: `/api/auth/google/status?type=TENANT_CENTRAL&tenantId=${testTenantA}`,
      headers: {},
      __testUser: {
        id: 'usr_tenant_a_user',
        email: 'admin@tenant-a.org',
        role: 'admin',
        tenantId: testTenantA
      }
    };
    const res = createMockResponse();
    await statusHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const bodyStr = res.body;
    assert(!bodyStr.includes('access_token'), 'Status endpoint must never return access_token');
    assert(!bodyStr.includes('refresh_token'), 'Status endpoint must never return refresh_token');
    assert(!bodyStr.includes('client_secret'), 'Status endpoint must never return client_secret');
  });

  // --- SECTION 9: Distribution Parity ---
  console.log('\n--- SECTION 9: Distribution Parity (100% SHA-256 Match) ---');

  runTest('9.1: All 4 production distribution targets match 100% SHA-256 byte parity', () => {
    const targets = [
      path.join(process.cwd(), 'clasptek_invoice_system.html'),
      path.join(process.cwd(), 'index.html'),
      path.join(process.cwd(), 'public', 'clasptek_invoice_system.html'),
      path.join(process.cwd(), 'public', 'index.html')
    ];

    const hashes = targets.map(t => {
      assert(fs.existsSync(t), `Target ${t} must exist`);
      const buf = fs.readFileSync(t);
      return crypto.createHash('sha256').update(buf).digest('hex');
    });

    const baseHash = hashes[0];
    for (let i = 1; i < hashes.length; i++) {
      assert.strictEqual(hashes[i], baseHash, `Hash mismatch between ${targets[0]} and ${targets[i]}`);
    }
    console.log(`     Authoritative SHA-256: ${baseHash}`);
  });

  // --- FINAL RESULTS ---
  console.log('\n================================================================================');
  console.log(` CERTIFICATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log('================================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runCentralRepositoryCertification().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
