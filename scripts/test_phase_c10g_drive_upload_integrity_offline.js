/**
 * scripts/test_phase_c10g_drive_upload_integrity_offline.js
 * Phase C10G — Google Drive recording data-flow integrity (offline).
 *
 * Part A: lib/meetings/google-drive.ts can never report a fabricated successful upload.
 * Part B: the genuine upload helper (api/_lib/google-oauth-config.js uploadFileToGoogleDrive) validates the
 *         real Drive response. HTTPS is injected (https.request replaced) — NO network is used, and the
 *         working directory is moved to an empty temp dir so no .env.local is read.
 *
 * These tests use mocks. They do NOT prove that Google Drive storage works end to end.
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const assert = require('assert');
const { EventEmitter } = require('events');
const { ROOT, loadWithMocks } = require('./_c10g_route_harness');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try { await fn(); passed++; console.log(`  PASS: ${name}`); }
  catch (e) { console.error(`  FAIL: ${name}\n     ${e.message}`); process.exitCode = 1; }
}

// Block any real HTTPS attempt for the entire suite; Part B swaps in a scripted responder.
const realRequest = https.request;
let blockedAttempts = 0;
https.request = () => { blockedAttempts++; throw new Error('NETWORK_BLOCKED'); };
const realFetch = global.fetch;
global.fetch = () => { blockedAttempts++; throw new Error('NETWORK_BLOCKED'); };

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) { prev[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  const restore = () => { for (const k of Object.keys(vars)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } };
  return Promise.resolve().then(fn).finally(restore);
}

(async () => {
  console.log('=== C10G Part A: google-drive.ts cannot fabricate an upload ===');
  const drive = loadWithMocks('lib/meetings/google-drive.ts', {});
  const params = { meetingId: 'm1', tenantId: 't1', fileName: 'x.mp4', fileBuffer: Buffer.from('synthetic'), meetingPublicId: 'mtg-1' };
  const FOLDER = 'F'.repeat(30); // obviously synthetic folder id

  const envMatrix = [
    { name: 'NODE_ENV=test, no credentials', vars: { NODE_ENV: 'test', GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, GOOGLE_DRIVE_ROOT_FOLDER_ID: undefined } },
    { name: 'NODE_ENV=test, dummy credentials + folder', vars: { NODE_ENV: 'test', GOOGLE_CLIENT_ID: 'dummy-id', GOOGLE_CLIENT_SECRET: 'dummy-secret', GOOGLE_DRIVE_ROOT_FOLDER_ID: FOLDER } },
    { name: 'NODE_ENV=production, dummy credentials + folder', vars: { NODE_ENV: 'production', GOOGLE_CLIENT_ID: 'dummy-id', GOOGLE_CLIENT_SECRET: 'dummy-secret', GOOGLE_DRIVE_ROOT_FOLDER_ID: FOLDER } },
  ];
  for (const m of envMatrix) {
    await test(`uploadRecordingToDrive never resolves (${m.name})`, async () => {
      await withEnv(m.vars, async () => {
        let result = 'RESOLVED';
        try { result = await drive.uploadRecordingToDrive(params); } catch (e) {
          assert.match(e.message, /GOOGLE_DRIVE_DIRECT_UPLOAD_UNSUPPORTED/);
          result = 'REJECTED';
        }
        assert.strictEqual(result, 'REJECTED', 'must fail closed; fabricated metadata must never be returned');
      });
    });
  }

  await test('uploadRecordingToDrive performs no network activity', async () => {
    const before = blockedAttempts;
    await drive.uploadRecordingToDrive(params).catch(() => {});
    assert.strictEqual(blockedAttempts, before);
  });

  await test('getGoogleDriveStatus never claims connected/verified from environment alone; no fabricated email/timestamp', async () => {
    await withEnv({ GOOGLE_CLIENT_ID: 'dummy-id', GOOGLE_CLIENT_SECRET: 'dummy-secret', GOOGLE_DRIVE_ROOT_FOLDER_ID: FOLDER, GOOGLE_DRIVE_MEETINGS_FOLDER_ID: undefined }, async () => {
      const s = await drive.getGoogleDriveStatus();
      assert.strictEqual(s.connected, false);
      assert.strictEqual(s.status, 'CONFIGURED_UNVERIFIED');
      assert.strictEqual(s.email, undefined);
      assert.strictEqual(s.lastVerified, undefined);
    });
    await withEnv({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, GOOGLE_DRIVE_ROOT_FOLDER_ID: undefined, GOOGLE_DRIVE_MEETINGS_FOLDER_ID: undefined }, async () => {
      const s = await drive.getGoogleDriveStatus();
      assert.strictEqual(s.connected, false);
      assert.strictEqual(s.status, 'DISCONNECTED');
    });
  });

  await test('folder resolution and file naming are unchanged', async () => {
    await withEnv({ GOOGLE_DRIVE_ROOT_FOLDER_ID: FOLDER, GOOGLE_DRIVE_MEETINGS_FOLDER_ID: undefined }, async () => {
      assert.strictEqual(drive.getMeetingsFolderId(), FOLDER);
      assert.strictEqual((await drive.verifyMeetingsFolderAccess()).valid, true);
    });
    assert.strictEqual(
      drive.generateRecordingFileName({ meetingPublicId: 'mtg-1', title: 'My Class!', scheduledStart: '2026-10-20T10:00:00Z' }),
      'CLASPTEK_mtg-1_2026-10-20_My_Class.mp4'
    );
  });

  await test('[static] google-drive.ts contains no ID generation or Drive URL fabrication; uploadRecordingToDrive has no callers', () => {
    const src = read('lib/meetings/google-drive.ts');
    assert.ok(!/randomBytes|gdrive_|drive\.google\.com\/file\/d\/\$\{/.test(src));
    const callers = [];
    ['app', 'lib', 'components', 'api'].forEach(function walk(dir) {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, e.name).replace(/\\/g, '/');
        if (e.isDirectory()) { if (!/node_modules|\.next/.test(e.name)) walk(path.join(dir, e.name)); continue; }
        if (/\.(ts|tsx|js)$/.test(e.name) && rel !== 'lib/meetings/google-drive.ts' && /uploadRecordingToDrive/.test(read(rel))) callers.push(rel);
      }
    });
    assert.deepStrictEqual(callers, []);
  });

  console.log('\n=== C10G Part B: genuine upload helper validates the Drive response (injected HTTPS) ===');
  const cfg = require('../api/_lib/google-oauth-config');
  const DEST = 'D'.repeat(30);

  /** Scripted https.request: records the call and replies with the configured status/body. */
  function scriptedHttps(status, body, opts = {}) {
    const calls = [];
    https.request = (options, cb) => {
      const req = new EventEmitter();
      const chunks = [];
      req.write = (c) => chunks.push(Buffer.from(c));
      req.destroy = () => {};
      req.end = (c) => {
        if (c) chunks.push(Buffer.from(c));
        calls.push({ options, payload: Buffer.concat(chunks).toString('utf8') });
        if (opts.networkError) { setImmediate(() => req.emit('error', new Error(opts.networkError))); return; }
        const res = new EventEmitter();
        res.statusCode = status;
        res.headers = {};
        setImmediate(() => {
          cb(res);
          res.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
          res.emit('end');
        });
      };
      return req;
    };
    return calls;
  }

  /** Run the helper's REAL (non-test-mode) branch with an empty cwd so no .env.local is read. */
  async function realBranch(fn) {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c10g-'));
    const cwd = process.cwd();
    process.chdir(emptyDir);
    try {
      return await withEnv(
        { NODE_ENV: 'production', CLASPTEK_TEST_MODE: undefined, VERCEL_ENV: undefined, CLASPTEK_ENV: undefined },
        fn
      );
    } finally {
      process.chdir(cwd);
      try { fs.rmSync(emptyDir, { recursive: true, force: true }); } catch (_) {}
    }
  }
  const upload = () => cfg.uploadFileToGoogleDrive({
    fileName: 'rec.mp4', mimeType: 'video/mp4', fileBuffer: Buffer.from('synthetic-video-bytes'),
    folderId: DEST, accessToken: 'synthetic-access-token', meetingId: 'm1', tenantId: 't1', recordingId: 'rec_1',
  });

  await test('success: returns the file id and link supplied by Drive (not a generated one); request targets the destination folder', async () => {
    const calls = scriptedHttps(200, { id: 'DriveFileId_ABC123', name: 'rec.mp4', parents: [DEST], size: '21',
      webViewLink: 'https://drive.google.com/file/d/DriveFileId_ABC123/view' });
    const r = await realBranch(upload);
    assert.strictEqual(r.fileId, 'DriveFileId_ABC123');
    assert.strictEqual(r.webViewUrl, 'https://drive.google.com/file/d/DriveFileId_ABC123/view');
    assert.deepStrictEqual(r.parents, [DEST]);
    assert.strictEqual(calls.length, 1);
    assert.match(calls[0].options.path, /^\/upload\/drive\/v3\/files\?uploadType=multipart/);
    assert.strictEqual(calls[0].options.hostname, 'www.googleapis.com');
    assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer synthetic-access-token');
    assert.ok(calls[0].payload.includes(`"parents":["${DEST}"]`));
    assert.ok(calls[0].payload.includes('synthetic-video-bytes'));
  });

  await test('HTTP error from Drive (403) -> GOOGLE_UPLOAD_FAILED, no file id', async () => {
    scriptedHttps(403, { error: { message: 'insufficientPermissions' } });
    await assert.rejects(realBranch(upload), /GOOGLE_UPLOAD_FAILED: insufficientPermissions/);
  });

  await test('HTTP 200 without a file id -> rejected (no success without a real id)', async () => {
    scriptedHttps(200, { name: 'rec.mp4', parents: [DEST] });
    await assert.rejects(realBranch(upload), /GOOGLE_UPLOAD_FAILED/);
  });

  await test('non-JSON / empty success body -> rejected', async () => {
    scriptedHttps(200, 'not json');
    await assert.rejects(realBranch(upload), /GOOGLE_UPLOAD_FAILED/);
  });

  await test('parent folder mismatch in Drive response -> PARENT_FOLDER_MISMATCH', async () => {
    scriptedHttps(200, { id: 'Drv1', name: 'rec.mp4', parents: ['SOME_OTHER_FOLDER'] });
    await assert.rejects(realBranch(upload), /PARENT_FOLDER_MISMATCH/);
  });

  await test('missing parents in Drive response -> rejected', async () => {
    scriptedHttps(200, { id: 'Drv2', name: 'rec.mp4' });
    await assert.rejects(realBranch(upload), /PARENT_FOLDER_MISMATCH/);
  });

  await test('network error -> rejected (never reported as stored)', async () => {
    scriptedHttps(0, {}, { networkError: 'ECONNRESET' });
    await assert.rejects(realBranch(upload), /ECONNRESET/);
  });

  await test('missing destination folder -> MISSING_ROOT_FOLDER_ID', async () => {
    await assert.rejects(cfg.uploadFileToGoogleDrive({ fileName: 'a', fileBuffer: Buffer.from('x'), folderId: '', accessToken: 't' }), /MISSING_ROOT_FOLDER_ID/);
  });

  await test('[static] recording service marks STORED only after a validated upload result (fileId + parent check)', () => {
    const src = read('lib/meetings/recording-service.ts');
    const upload = src.indexOf('uploadResult = await googleConfig.uploadFileToGoogleDrive');
    const idCheck = src.indexOf("Google Drive upload returned invalid or missing file ID", upload);
    const parentCheck = src.indexOf('Uploaded file parent does not match authoritative root folder', upload);
    const stored = src.indexOf("uploadStatus: 'STORED'", upload);
    assert.ok(upload > 0 && idCheck > upload && parentCheck > idCheck && stored > parentCheck);
  });

  https.request = realRequest;
  global.fetch = realFetch;
  console.log(`\nResult: ${passed}/${total} passed`);
  console.log('Limitations: HTTPS responses are scripted mocks; the recording-service STORED gating is a [static] source-order check.');
  console.log('Google Drive storage is NOT verified end to end by this suite.');
  if (passed !== total) process.exitCode = 1;
})();
