/**
 * CLASPTEK ENTERPRISE PLATFORM — PERMANENT READ-ONLY SAFETY UTILITY
 * Purpose: Direct PostgREST audit to verify row counts across all 27 canonical PostgreSQL tables.
 * Safety: STRICTLY READ-ONLY (GET requests with count=exact). NEVER performs mutations or data writes.
 */

const https = require('https');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
let key = '';
envFile.split('\n').forEach(l => {
  if (l.startsWith('SUPABASE_PUBLISHABLE_KEY=')) {
    key = l.split('=')[1].trim().replace(/['"]/g, '');
  }
});

const url = 'https://logaawoigfxnisimfatf.supabase.co';
const tables = [
  'finance_settings', 'payment_accounts', 'programmes', 'personnel', 'customers',
  'enquiries', 'enrolments', 'invoices', 'invoice_items', 'payments', 'receipts',
  'expenses', 'direct_income', 'budgets', 'budget_lines', 'payslips', 'facilitator_sessions',
  'customer_timeline', 'collection_actions', 'finance_audit_log', 'management_alerts',
  'approval_thresholds', 'financial_adjustments', 'report_snapshots', 'management_metrics',
  'cash_flow_forecasts', 'customer_segments'
];

async function checkTable(t) {
  return new Promise((resolve) => {
    const req = https.request(url + '/rest/v1/' + t + '?select=id&limit=1', {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Prefer': 'count=exact'
      }
    }, (res) => {
      resolve({ table: t, status: res.statusCode, countRange: res.headers['content-range'] });
    });
    req.on('error', (e) => resolve({ table: t, error: e.message }));
    req.end();
  });
}

(async () => {
  const results = await Promise.all(tables.map(checkTable));
  let nonZero = 0;
  results.forEach(r => {
    console.log(`${r.table.padEnd(23)} : HTTP ${r.status} | Content-Range: ${r.countRange}`);
    if (r.countRange && !r.countRange.endsWith('/0')) nonZero++;
  });
  console.log('Total non-empty tables:', nonZero);
})();
