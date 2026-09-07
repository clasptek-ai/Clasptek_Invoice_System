/**
 * CLASPTEK ENTERPRISE PLATFORM — PHASE 5.1 REAL STAGING SUPABASE CERTIFICATION HARNESS
 * 
 * Executes live empirical testing against a disposable Supabase staging instance.
 * STRICT SAFETY RULE: NEVER connects to or modifies production project logaawoigfxnisimfatf.
 */

const https = require('https');
const { URL } = require('url');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROD_REF = 'logaawoigfxnisimfatf';

async function main() {
  console.log('========================================================================================');
  console.log(' CLASPTEK ENTERPRISE PLATFORM — PHASE 5.1 REAL STAGING SUPABASE CERTIFICATION');
  console.log('========================================================================================\n');

  // 1. Verify Environment Variables
  const stagingUrl = process.env.STAGING_SUPABASE_URL ? process.env.STAGING_SUPABASE_URL.trim() : '';
  const anonKey = process.env.STAGING_SUPABASE_ANON_KEY ? process.env.STAGING_SUPABASE_ANON_KEY.trim() : '';
  const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ? process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY.trim() : '';
  const dbUrl = process.env.STAGING_DATABASE_URL ? process.env.STAGING_DATABASE_URL.trim() : '';

  console.log('--- Pre-Flight Staging Connection Audit ---');
  console.log(`STAGING_SUPABASE_URL:             ${stagingUrl ? 'PRESENT' : 'MISSING'}`);
  console.log(`STAGING_SUPABASE_ANON_KEY:        ${anonKey ? 'PRESENT (' + anonKey.length + ' chars)' : 'MISSING'}`);
  console.log(`STAGING_SUPABASE_SERVICE_ROLE_KEY:${serviceKey ? 'PRESENT (' + serviceKey.length + ' chars)' : 'MISSING'}`);
  console.log(`STAGING_DATABASE_URL:             ${dbUrl ? 'PRESENT' : 'NOT SUPPLIED (Using PostgREST)'}`);

  if (!stagingUrl || !anonKey || !serviceKey) {
    console.log('\n❌ CERTIFICATION BLOCKED: Missing required staging environment variables.');
    console.log('Required: STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, STAGING_SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(2);
  }

  // Absolute Production Safety Gate Guard
  if (stagingUrl.includes(PROD_REF) || anonKey.includes(PROD_REF) || serviceKey.includes(PROD_REF) || dbUrl.includes(PROD_REF)) {
    console.error('\n🚨 FATAL ERROR: Production project reference detected in staging variables!');
    console.error('Certification immediately terminated to protect production logaawoigfxnisimfatf.');
    process.exit(1);
  }

  console.log('✔ Staging project confirmed distinct from production logaawoigfxnisimfatf.\n');

  function request(endpoint, options = {}, payload = null, useServiceKey = false) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(stagingUrl + endpoint);
      const key = useServiceKey ? serviceKey : anonKey;
      const headers = {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };

      const req = https.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(body); } catch (e) { parsed = body; }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      });

      req.on('error', err => reject(err));
      if (payload) {
        req.write(typeof payload === 'string' ? payload : JSON.stringify(payload));
      }
      req.end();
    });
  }

  // 2. Health check
  console.log('--- Checking Staging Connectivity ---');
  try {
    const ping = await request('/rest/v1/', {}, null, true);
    console.log(`Staging Gateway Response: HTTP ${ping.status}`);
    if (ping.status !== 200) {
      console.error('❌ Staging gateway returned unexpected status. Connectivity failed.');
      process.exit(2);
    }
    console.log('✔ Live Staging Supabase Gateway Connected.\n');
  } catch (err) {
    console.error('❌ Failed to connect to Staging Supabase:', err.message);
    process.exit(2);
  }

  console.log('Staging certification harness ready. Executing test suites...');
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal harness exception:', err);
    process.exit(1);
  });
}

module.exports = { main };
