// ============================================================================
// CLASPTEK PLATFORM SECURITY QUARANTINE: PRODUCTION EXECUTION PROHIBITED
// Project logaawoigfxnisimfatf is permanently quarantined.
// This script is archived for forensic reference only and cannot be executed.
// ============================================================================
throw new Error(
  'FATAL SAFETY HALT: Direct execution of quarantined production script (query_tenants_and_memberships.js) is disabled. ' +
  'No network clients or requests may be created against production.'
);

const https = require('https');
const fs = require('fs');

const url = 'QUARANTINED_ENDPOINT_DISABLED';

function queryEndpoint(path) {
  return new Promise((resolve) => {
    const req = https.request(url + path, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Prefer': 'count=exact'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          path,
          status: res.statusCode,
          contentRange: res.headers['content-range'],
          data: data ? JSON.parse(data) : null
        });
      });
    });
    req.on('error', (e) => resolve({ path, error: e.message }));
    req.end();
  });
}

(async () => {
  const tenants = await queryEndpoint('/rest/v1/tenants?select=*');
  console.log('--- TENANTS ---');
  console.log('Status:', tenants.status, 'Range:', tenants.contentRange);
  console.log('Data:', JSON.stringify(tenants.data, null, 2));

  const memberships = await queryEndpoint('/rest/v1/tenant_memberships?select=*');
  console.log('\n--- TENANT MEMBERSHIPS ---');
  console.log('Status:', memberships.status, 'Range:', memberships.contentRange);
  console.log('Data:', JSON.stringify(memberships.data, null, 2));

  const profiles = await queryEndpoint('/rest/v1/profiles?select=*');
  console.log('\n--- PROFILES ---');
  console.log('Status:', profiles.status, 'Range:', profiles.contentRange);
  console.log('Data:', JSON.stringify(profiles.data, null, 2));
})();
