const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'supabase_schema.sql');
const sql = fs.readFileSync(schemaPath, 'utf8');

const CANONICAL_27_PRODUCTION_TABLES = [
  'finance_settings',
  'payment_accounts',
  'programmes',
  'personnel',
  'customers',
  'enquiries',
  'enrolments',
  'invoices',
  'invoice_items',
  'payments',
  'receipts',
  'expenses',
  'direct_income',
  'budgets',
  'budget_lines',
  'payslips',
  'facilitator_sessions',
  'customer_timeline',
  'collection_actions',
  'finance_audit_log',
  'management_alerts',
  'approval_thresholds',
  'financial_adjustments',
  'report_snapshots',
  'management_metrics',
  'cash_flow_forecasts',
  'customer_segments'
];

// Helper to extract tables
const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\n\);/gi;
const tables = {};
let match;

while ((match = tableRegex.exec(sql)) !== null) {
  const tableName = match[1].toLowerCase();
  const body = match[2];
  
  // Extract columns
  const lines = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('--'));
  const columns = [];
  const constraints = [];
  let primaryKey = null;
  let hasTenantId = false;

  lines.forEach(line => {
    if (line.toUpperCase().startsWith('CONSTRAINT') || line.toUpperCase().startsWith('PRIMARY KEY') || line.toUpperCase().startsWith('UNIQUE') || line.toUpperCase().startsWith('FOREIGN KEY')) {
      constraints.push(line);
      if (line.toUpperCase().includes('PRIMARY KEY')) {
        const pkMatch = line.match(/PRIMARY\s+KEY\s*\(([^\)]+)\)/i);
        if (pkMatch) primaryKey = pkMatch[1].trim();
      }
    } else {
      const parts = line.split(/\s+/);
      const colName = parts[0].replace(/[",]/g, '');
      const colType = parts[1] || '';
      columns.push({ name: colName, type: colType, raw: line });
      if (colName.toLowerCase() === 'tenant_id') hasTenantId = true;
      if (line.toUpperCase().includes('PRIMARY KEY')) primaryKey = colName;
    }
  });

  tables[tableName] = {
    name: tableName,
    isCanonical27: CANONICAL_27_PRODUCTION_TABLES.includes(tableName),
    primaryKey,
    hasTenantId,
    columnCount: columns.length,
    columns,
    constraints
  };
}

// Extract RLS statements
const rlsRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/gi;
const rlsEnabledTables = [];
while ((match = rlsRegex.exec(sql)) !== null) {
  const tbl = match[1].toLowerCase();
  rlsEnabledTables.push(tbl);
  if (tables[tbl]) tables[tbl].rlsEnabled = true;
}

// Extract policies
const policyRegex = /CREATE\s+POLICY\s+["']?([^"'\n]+)["']?\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)([\s\S]*?);/gi;
const policies = [];
while ((match = policyRegex.exec(sql)) !== null) {
  const policyName = match[1].trim();
  const tableName = match[2].toLowerCase();
  const policyBody = match[3].trim();
  policies.push({ name: policyName, table: tableName, body: policyBody });
  if (tables[tableName]) {
    if (!tables[tableName].policies) tables[tableName].policies = [];
    tables[tableName].policies.push(policyName);
  }
}

// Extract functions
const funcRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*RETURNS\s+([a-zA-Z0-9_]+)/gi;
const functions = [];
while ((match = funcRegex.exec(sql)) !== null) {
  functions.push({ name: match[1], params: match[2].trim(), returns: match[3].trim() });
}

// Extract indexes
const indexRegex = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([^\)]+)\);/gi;
const indexes = [];
while ((match = indexRegex.exec(sql)) !== null) {
  indexes.push({ name: match[1], table: match[2].toLowerCase(), columns: match[3].trim() });
}

// Build final inventory
const inventory = {
  sourceFile: 'supabase_schema.sql',
  inspectedAt: new Date().toISOString(),
  targetProjectRef: 'logaawoigfxnisimfatf',
  targetUrl: 'https://logaawoigfxnisimfatf.supabase.co',
  summary: {
    totalTablesDefined: Object.keys(tables).length,
    canonical27PresentInSql: CANONICAL_27_PRODUCTION_TABLES.filter(t => !!tables[t]).length,
    canonical27MissingInSql: CANONICAL_27_PRODUCTION_TABLES.filter(t => !tables[t]),
    totalRlsEnabled: rlsEnabledTables.length,
    totalPoliciesDefined: policies.length,
    totalFunctionsDefined: functions.length,
    totalIndexesDefined: indexes.length
  },
  canonical27Tables: CANONICAL_27_PRODUCTION_TABLES.map(name => {
    const t = tables[name];
    return {
      table: name,
      defined: !!t,
      primaryKey: t ? t.primaryKey : null,
      hasTenantId: t ? t.hasTenantId : false,
      rlsEnabled: t ? !!t.rlsEnabled : false,
      policyCount: (t && t.policies) ? t.policies.length : 0,
      columnCount: t ? t.columnCount : 0
    };
  }),
  allTables: tables,
  policies,
  functions,
  indexes
};

const outPath = path.join(__dirname, '..', 'schema_inventory.json');
fs.writeFileSync(outPath, JSON.stringify(inventory, null, 2));
console.log('✔ Schema inventory generated at schema_inventory.json');
console.log('Summary:', JSON.stringify(inventory.summary, null, 2));
