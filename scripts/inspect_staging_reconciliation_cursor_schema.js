/**
 * CLASPTEK STAGING SCHEMA INSPECTION: RECONCILIATION ROTATION CURSOR
 * 
 * Safely performs strictly read-only inspection queries against the staging Session pooler.
 * STRICT SAFETY RULES:
 * 1. Zero DDL/DML, zero RPC calls, zero data mutations.
 * 2. Absolute quarantine against production ref logaawoigfxnisimfatf.
 * 3. Never prints credentials, connection strings, or secrets.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const {
  validateStagingDatabaseUrl,
  createStagingClient,
  redactCredentials,
  PROD_REF,
  EXPECTED_STAGING_REF,
} = require('./staging_connection_guard');

/**
 * Safely loads STAGING_DATABASE_URL following standard precedence:
 * 1. process.env.STAGING_DATABASE_URL (environment takes precedence)
 * 2. .env.staging.local (if file exists)
 * Never reads .env.local or global production credential files.
 */
function loadStagingDatabaseUrl() {
  const envVal = process.env.STAGING_DATABASE_URL;
  if (envVal !== undefined && envVal !== '') {
    return envVal;
  }

  const stagingEnvFile = path.join(__dirname, '..', '.env.staging.local');
  if (fs.existsSync(stagingEnvFile)) {
    try {
      const content = fs.readFileSync(stagingEnvFile, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.startsWith('STAGING_DATABASE_URL=')) {
          const idx = trimmed.indexOf('=');
          const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (val) return val;
        }
      }
    } catch (err) {
      const safeMsg = err && err.message ? redactCredentials(err.message) : 'Read error';
      console.error('Failed to read .env.staging.local:', safeMsg);
    }
  }

  return '';
}

async function inspectStagingSchema(options = {}) {
  console.log('========================================================================================');
  console.log(' CLASPTEK STAGING READ-ONLY SCHEMA INSPECTION: RECONCILIATION CURSOR');
  console.log(' Target Project Ref:', EXPECTED_STAGING_REF);
  console.log(' Mode: READ-ONLY INSPECTION (Queries 1-7, and Query 8 iff table exists)');
  console.log('========================================================================================\n');

  // 1. Load config
  const databaseUrl = options.databaseUrl || loadStagingDatabaseUrl();
  if (!databaseUrl) {
    throw new Error('STAGING_DATABASE_URL is not configured in environment or .env.staging.local');
  }

  // 2. Quarantine check & discrete options validation via shared staging_connection_guard
  const validatedClientConfig = validateStagingDatabaseUrl(databaseUrl);

  console.log('✔ Staging connection metadata validated safely:');
  console.log(`  - Target Host: ${validatedClientConfig.host}`);
  console.log(`  - Port: ${validatedClientConfig.port}`);
  console.log(`  - Database: ${validatedClientConfig.database}`);
  console.log(`  - User: ${validatedClientConfig.user}`);
  console.log(`  - Staging Project Match: Verified (${EXPECTED_STAGING_REF})`);
  console.log(`  - Production Quarantine: Verified (Zero references to ${PROD_REF})`);
  console.log(`  - TLS Configuration: Strict (rejectUnauthorized: true, servername: ${validatedClientConfig.ssl.servername})\n`);

  // 3. Connect to database using validated discrete options and strict TLS
  const clientFactory = options.clientFactory || ((opts) => new Client(opts));
  const client = createStagingClient(validatedClientConfig, clientFactory);

  const inspectionReport = {
    tableExists: false,
    tableDetails: null,
    columns: [],
    constraints: [],
    conflictingConstraints: [],
    rls: null,
    tableGrants: [],
    functionExists: false,
    functionDetails: null,
    functionGrants: [],
    singletonRow: null,
  };

  try {
    await client.connect();
    console.log('✔ Connected to staging Session pooler.\n');

    // Query 1: Check table existence
    console.log('--- Executing Query 1: Check Table Existence & Owner ---');
    const q1 = await client.query(`
      SELECT schemaname, tablename, tableowner 
      FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public' 
        AND tablename = 'meeting_recording_reconciliation_cursor';
    `);

    if (q1.rows.length > 0) {
      inspectionReport.tableExists = true;
      inspectionReport.tableDetails = q1.rows[0];
      console.log(`  ✔ Table EXISTS: public.${q1.rows[0].tablename} (Owner: ${q1.rows[0].tableowner})`);
    } else {
      console.log('  ℹ Table does NOT exist in staging (public.meeting_recording_reconciliation_cursor).');
    }

    // Queries 2-5 & 8 only if table exists
    if (inspectionReport.tableExists) {
      // Query 2: Inspect columns
      console.log('\n--- Executing Query 2: Inspect Columns ---');
      const q2 = await client.query(`
        SELECT column_name, data_type, character_maximum_length, is_nullable, column_default 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'meeting_recording_reconciliation_cursor'
        ORDER BY ordinal_position;
      `);
      inspectionReport.columns = q2.rows;
      q2.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''} | nullable: ${col.is_nullable} | default: ${col.column_default}`);
      });

      // Query 3: Inspect constraints with relation-scoped catalog metadata and column order
      console.log('\n--- Executing Query 3: Inspect Constraints ---');
      const q3 = await client.query(`
        SELECT
          c.conname,
          c.contype,
          pg_get_constraintdef(c.oid) AS constraint_definition,
          ARRAY(
            SELECT a.attname
            FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
            ORDER BY u.ord
          ) AS conkey_cols
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND t.relname = 'meeting_recording_reconciliation_cursor';
      `);
      inspectionReport.constraints = q3.rows;
      q3.rows.forEach(con => {
        console.log(`  - Constraint ${con.conname} (${con.contype}): ${con.constraint_definition}`);
      });

      // Query 3b: Detect conflicting same-named constraint on other relations
      const q3b = await client.query(`
        SELECT n.nspname, t.relname, c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE c.conname = 'chk_reconciliation_cursor_category_offset'
          AND (n.nspname <> 'public' OR t.relname <> 'meeting_recording_reconciliation_cursor');
      `);
      inspectionReport.conflictingConstraints = q3b.rows;
      if (q3b.rows.length > 0) {
        console.log(`  ⚠ Conflicting constraint found on other relations: ${JSON.stringify(q3b.rows)}`);
      }

      // Query 4: Inspect RLS status
      console.log('\n--- Executing Query 4: Inspect RLS Status ---');
      const q4 = await client.query(`
        SELECT relname, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_enforced 
        FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public' 
          AND c.relname = 'meeting_recording_reconciliation_cursor';
      `);
      inspectionReport.rls = q4.rows[0] || null;
      console.log(`  - RLS Enabled: ${inspectionReport.rls?.rls_enabled} | RLS Enforced: ${inspectionReport.rls?.rls_enforced}`);

      // Query 5: Inspect table grants
      console.log('\n--- Executing Query 5: Inspect Table Grants ---');
      const q5 = await client.query(`
        SELECT grantee, privilege_type 
        FROM information_schema.role_table_grants 
        WHERE table_schema = 'public' 
          AND table_name = 'meeting_recording_reconciliation_cursor';
      `);
      inspectionReport.tableGrants = q5.rows;
      q5.rows.forEach(g => {
        console.log(`  - Grantee ${g.grantee}: ${g.privilege_type}`);
      });

      // Query 8: Inspect current singleton row
      console.log('\n--- Executing Query 8: Inspect Current Singleton Row ---');
      const q8 = await client.query(`
        SELECT id, category_offset, last_advanced_at, advanced_by, created_at, updated_at 
        FROM public.meeting_recording_reconciliation_cursor 
        WHERE id = 'global_cursor';
      `);
      if (q8.rows.length > 0) {
        inspectionReport.singletonRow = q8.rows[0];
        console.log(`  - id: ${q8.rows[0].id}`);
        console.log(`  - category_offset: ${q8.rows[0].category_offset}`);
        console.log(`  - advanced_by: ${q8.rows[0].advanced_by}`);
        console.log(`  - last_advanced_at: ${q8.rows[0].last_advanced_at}`);
      } else {
        console.log('  ℹ No singleton row found (id = "global_cursor" absent).');
      }
    } else {
      console.log('\nℹ Skipping Queries 2, 3, 4, 5, 8 because table does not exist.');
    }

    // Query 6: Check function existence, owner, security definer, search path
    console.log('\n--- Executing Query 6: Check Function Existence & Metadata ---');
    const q6 = await client.query(`
      SELECT 
          p.proname, 
          r.rolname AS function_owner, 
          p.prosecdef AS is_security_definer,
          p.proconfig AS function_search_path,
          p.pronargs AS argument_count,
          pg_get_function_arguments(p.oid) AS argument_signature,
          pg_get_function_identity_arguments(p.oid) AS identity_arguments,
          pg_get_function_result(p.oid) AS return_type
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_roles r ON p.proowner = r.oid
      WHERE n.nspname = 'public' 
        AND p.proname = 'advance_recording_reconciliation_cursor';
    `);

    if (q6.rows.length > 0) {
      inspectionReport.functionExists = true;
      inspectionReport.functionDetails = q6.rows[0];
      console.log(`  ✔ Function EXISTS: public.${q6.rows[0].proname}`);
      console.log(`    - Owner: ${q6.rows[0].function_owner}`);
      console.log(`    - SECURITY DEFINER: ${q6.rows[0].is_security_definer}`);
      console.log(`    - Search Path: ${JSON.stringify(q6.rows[0].function_search_path)}`);
      console.log(`    - Argument Count: ${q6.rows[0].argument_count}`);
      console.log(`    - Signature: ${q6.rows[0].argument_signature}`);
      console.log(`    - Return Type: ${q6.rows[0].return_type}`);
    } else {
      console.log('  ℹ Function does NOT exist in staging (public.advance_recording_reconciliation_cursor).');
    }

    // Query 7: Check function execution grants
    console.log('\n--- Executing Query 7: Check Function Execution Grants ---');
    const q7 = await client.query(`
      SELECT grantee, privilege_type 
      FROM information_schema.routine_privileges 
      WHERE routine_schema = 'public' 
        AND routine_name = 'advance_recording_reconciliation_cursor';
    `);
    inspectionReport.functionGrants = q7.rows;
    if (q7.rows.length > 0) {
      q7.rows.forEach(g => {
        console.log(`  - Grantee ${g.grantee}: ${g.privilege_type}`);
      });
    } else {
      console.log('  ℹ No routine privileges found in information_schema.');
    }

    console.log('\n========================================================================================');
    console.log(' READ-ONLY INSPECTION COMPLETE');
    console.log(' Zero mutations, zero DDL, zero DML executed.');
    console.log('========================================================================================\n');

    console.log('SUMMARY_RESULT:' + JSON.stringify(inspectionReport));
    return inspectionReport;
  } finally {
    await client.end();
    console.log('✔ Database connection closed cleanly in finally block.');
  }
}

/**
 * Normalizes PostgreSQL proconfig array or search_path string into ordered lowercase schema list.
 */
function normalizeSearchPath(searchPath) {
  if (!searchPath) return [];
  const entries = Array.isArray(searchPath) ? searchPath : [searchPath];
  const result = [];
  for (const item of entries) {
    if (typeof item !== 'string') continue;
    let val = item.trim();
    if (val.toLowerCase().startsWith('search_path=')) {
      val = val.slice('search_path='.length);
    }
    const parts = val.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    result.push(...parts);
  }
  return result;
}

function stripOuterParens(str) {
  let s = str.trim();
  while (s.startsWith('(') && s.endsWith(')')) {
    let depth = 0;
    let matching = true;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') depth--;
      if (depth === 0) {
        matching = false;
        break;
      }
    }
    if (matching) {
      s = s.slice(1, -1).trim();
    } else {
      break;
    }
  }
  return s;
}

/**
 * Rigorously checks if category_offset default is strictly integer 0.
 * Rejects substring-matching deceptive values like '10', '100', '0 + 1', 'NULL'.
 */
function isExactZeroDefault(colDefault) {
  if (colDefault === null || colDefault === undefined) return false;
  let str = stripOuterParens(String(colDefault).trim());
  str = str.replace(/::(integer|int4|int)$/i, '').trim();
  str = stripOuterParens(str);
  return str === '0';
}

/**
 * Rigorously checks if timestamp default is strictly now() or CURRENT_TIMESTAMP.
 * Rejects deceptive expressions like 'now() + interval \'1 day\'', 'clock_timestamp()', '2026-01-01'.
 */
function isExactNowDefault(colDefault) {
  if (colDefault === null || colDefault === undefined) return false;
  let str = stripOuterParens(String(colDefault).trim().toLowerCase());
  str = str.replace(/::(timestamp with time zone|timestamptz)$/i, '').trim();
  str = stripOuterParens(str);
  return str === 'now()' || str === 'current_timestamp';
}

/**
 * Validates category_offset check constraint semantics against the exact invariant (0, 1, 2).
 * Rejects constraints allowing extra values (e.g. 3, 4), extra OR branches, or permissive >= 0.
 */
function validateOffsetCheckSemantics(constraintDef) {
  if (typeof constraintDef !== 'string') return false;
  const norm = constraintDef.toLowerCase().replace(/\s+/g, '');
  const validCanonicalForms = [
    'check((category_offset=any(array[0,1,2])))',
    'check(category_offset=any(array[0,1,2]))',
    'check(category_offsetin(0,1,2))',
    'check((category_offsetin(0,1,2)))',
    'check(((category_offset=0)or(category_offset=1)or(category_offset=2)))',
    'check((category_offset=0)or(category_offset=1)or(category_offset=2))',
    'check((category_offset=0)or((category_offset=1)or(category_offset=2)))'
  ];
  if (validCanonicalForms.includes(norm)) {
    return true;
  }

  // Also check if wrapped in outer check parens
  if (norm.startsWith('check(') && norm.endsWith(')')) {
    const inner = norm.slice(6, -1);
    if (validCanonicalForms.map(f => f.slice(6, -1)).includes(inner)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates inspection report against expected schema, constraint, security, and privilege definitions.
 * Returns an array of assertion failure description strings (empty if all pass).
 * Fails closed on missing or incompatible metadata.
 */
function evaluateCertificationAssertions(report) {
  const failures = [];
  if (!report || typeof report !== 'object') {
    failures.push('Invalid or missing inspection report object');
    return failures;
  }

  if (!report.tableExists) {
    failures.push('Table public.meeting_recording_reconciliation_cursor does not exist');
    return failures;
  }

  // 1. Validate metadata presence (fail closed)
  if (!Array.isArray(report.columns) || report.columns.length === 0) {
    failures.push('Insufficient column metadata in inspection report');
    return failures;
  }
  if (!Array.isArray(report.constraints)) {
    failures.push('Insufficient constraint metadata in inspection report');
    return failures;
  }
  if (!report.rls) {
    failures.push('Insufficient RLS metadata in inspection report');
    return failures;
  }
  if (!Array.isArray(report.tableGrants)) {
    failures.push('Insufficient table grants metadata in inspection report');
    return failures;
  }

  // 2. Reject unexpected extra columns (exact schema contract)
  const expectedColNames = ['id', 'category_offset', 'last_advanced_at', 'advanced_by', 'created_at', 'updated_at'];
  const unexpectedCols = report.columns.filter(c => !expectedColNames.includes(c.column_name));
  if (unexpectedCols.length > 0) {
    failures.push(`Table public.meeting_recording_reconciliation_cursor contains unexpected extra columns: ${unexpectedCols.map(c => c.column_name).join(', ')}. Schema contract requires exact 6 columns.`);
  }

  // 3. Exact column types, lengths, nullability, and defaults (rejecting permissive substitutes and deceptive expressions)
  const expectedCols = {
    id: {
      expectedType: 'character varying',
      expectedLen: 32,
      nullable: 'NO',
      defaultType: 'none',
    },
    category_offset: {
      expectedType: 'integer',
      expectedLen: null,
      nullable: 'NO',
      defaultType: 'zero',
    },
    last_advanced_at: {
      expectedType: 'timestamp with time zone',
      expectedLen: null,
      nullable: 'NO',
      defaultType: 'now',
    },
    advanced_by: {
      expectedType: 'character varying',
      expectedLen: 128,
      nullable: 'NO',
      defaultType: 'none',
    },
    created_at: {
      expectedType: 'timestamp with time zone',
      expectedLen: null,
      nullable: 'NO',
      defaultType: 'now',
    },
    updated_at: {
      expectedType: 'timestamp with time zone',
      expectedLen: null,
      nullable: 'NO',
      defaultType: 'now',
    },
  };

  for (const [colName, spec] of Object.entries(expectedCols)) {
    const col = report.columns.find(c => c.column_name === colName);
    if (!col) {
      failures.push(`Missing required column: ${colName}`);
      continue;
    }
    if (col.data_type !== spec.expectedType) {
      failures.push(`Column ${colName} has type '${col.data_type}', expected exact type '${spec.expectedType}' (permissive substitute types rejected)`);
    }
    if (col.is_nullable !== spec.nullable) {
      failures.push(`Column ${colName} is_nullable is '${col.is_nullable}', expected '${spec.nullable}'`);
    }
    if (spec.expectedLen !== null && col.character_maximum_length !== spec.expectedLen) {
      failures.push(`Column ${colName} character length is ${col.character_maximum_length}, expected exact length ${spec.expectedLen}`);
    }
    if (spec.defaultType === 'zero') {
      if (!isExactZeroDefault(col.column_default)) {
        failures.push(`Column ${colName} default '${col.column_default}' does not match required exact 0 default expression`);
      }
    } else if (spec.defaultType === 'now') {
      if (!isExactNowDefault(col.column_default)) {
        failures.push(`Column ${colName} default '${col.column_default}' does not match required exact now() default expression`);
      }
    } else if (spec.defaultType === 'none') {
      if (col.column_default !== null && col.column_default !== undefined) {
        failures.push(`Column ${colName} has unexpected default '${col.column_default}', expected no default expression`);
      }
    }
  }

  // 4. Primary Key: Exactly one relation-scoped constraint strictly on (id)
  const pkConstraints = report.constraints.filter(c => c.contype === 'p');
  if (pkConstraints.length !== 1) {
    failures.push(`Table must have exactly one PRIMARY KEY constraint (found ${pkConstraints.length})`);
  } else {
    const pk = pkConstraints[0];
    if (Array.isArray(pk.conkey_cols)) {
      if (JSON.stringify(pk.conkey_cols) !== JSON.stringify(['id'])) {
        failures.push(`PRIMARY KEY column list [${pk.conkey_cols.join(', ')}] must strictly consist of ['id'] in order`);
      }
    } else if (!pk.constraint_definition || !pk.constraint_definition.includes('(id)') || pk.constraint_definition.includes(',')) {
      failures.push('Table must have exactly one single-column PRIMARY KEY constraint strictly on (id)');
    }
  }

  // 5. Conflicting constraints & check constraint semantics
  if (Array.isArray(report.conflictingConstraints) && report.conflictingConstraints.length > 0) {
    failures.push(`Conflicting constraint chk_reconciliation_cursor_category_offset detected on other relations: ${report.conflictingConstraints.map(c => `${c.nspname}.${c.relname}`).join(', ')}`);
  }

  const chk = report.constraints.find(c => c.conname === 'chk_reconciliation_cursor_category_offset');
  if (!chk) {
    failures.push('Missing CHECK constraint chk_reconciliation_cursor_category_offset on target relation');
  } else {
    if (chk.contype !== 'c') {
      failures.push('Constraint chk_reconciliation_cursor_category_offset is not a CHECK constraint');
    }
    if (Array.isArray(chk.conkey_cols) && JSON.stringify(chk.conkey_cols) !== JSON.stringify(['category_offset'])) {
      failures.push(`CHECK constraint column list [${chk.conkey_cols.join(', ')}] must strictly consist of ['category_offset']`);
    }
    if (!validateOffsetCheckSemantics(chk.constraint_definition)) {
      failures.push(`CHECK constraint chk_reconciliation_cursor_category_offset has invalid semantics: '${chk.constraint_definition}'`);
    }
  }

  // 6. Row Level Security
  if (report.rls.rls_enabled !== true && report.rls.rls_enabled !== 't') {
    failures.push('Row Level Security is not enabled on table');
  }

  // 7. Singleton row & valid offset
  if (!report.singletonRow) {
    failures.push('Required singleton row id="global_cursor" is missing');
  } else {
    if (report.singletonRow.id !== 'global_cursor') {
      failures.push(`Singleton row id is '${report.singletonRow.id}', expected 'global_cursor'`);
    }
    const offsetNum = Number(report.singletonRow.category_offset);
    if (!Number.isInteger(offsetNum) || ![0, 1, 2].includes(offsetNum)) {
      failures.push(`Singleton row category_offset is invalid: ${report.singletonRow.category_offset} (expected 0, 1, or 2)`);
    }
  }

  // 8. Stored function: existence, SECURITY DEFINER, return type, argument count, signature, search path
  if (!report.functionExists) {
    failures.push('Function public.advance_recording_reconciliation_cursor does not exist');
  } else if (!report.functionDetails) {
    failures.push('Missing functionDetails metadata for public.advance_recording_reconciliation_cursor');
  } else {
    const fn = report.functionDetails;
    if (fn.is_security_definer !== true && fn.is_security_definer !== 't') {
      failures.push('Function is not SECURITY DEFINER');
    }
    if (fn.return_type !== 'jsonb') {
      failures.push(`Function return type is '${fn.return_type}', expected exact type 'jsonb'`);
    }

    if (fn.argument_count !== undefined && fn.argument_count !== null && Number(fn.argument_count) !== 1) {
      failures.push(`Function argument count is ${fn.argument_count}, expected exactly 1 argument`);
    }

    const sig = (fn.argument_signature || '').trim();
    const sigRegex = /^p_worker_id\s+(character\s+varying(\(128\))?|varchar(\(128\))?)\s+DEFAULT\s+'system_reconciliation_worker'(::character\s+varying|::varchar)?$/i;
    if (!sigRegex.test(sig)) {
      failures.push(`Function argument signature '${sig}' does not match expected exact definition 'p_worker_id character varying DEFAULT ''system_reconciliation_worker'''`);
    }

    const normalizedPath = normalizeSearchPath(fn.function_search_path);
    if (normalizedPath.length !== 2 || normalizedPath[0] !== 'public' || normalizedPath[1] !== 'pg_temp') {
      failures.push(`Function search path normalized entries [${normalizedPath.join(', ')}] do not strictly match ordered ['public', 'pg_temp']`);
    }
  }

  // 9. Privileges: service_role individual required table privileges and EXECUTE
  const requiredTablePrivs = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  const serviceRoleTableGrants = (report.tableGrants || [])
    .filter(g => g.grantee === 'service_role')
    .map(g => (g.privilege_type || '').toUpperCase());

  const hasAllTablePrivs = serviceRoleTableGrants.includes('ALL');
  const missingTablePrivs = requiredTablePrivs.filter(p => !hasAllTablePrivs && !serviceRoleTableGrants.includes(p));
  if (missingTablePrivs.length > 0) {
    failures.push(`service_role is missing required table privileges: ${missingTablePrivs.join(', ')}`);
  }

  if (report.functionExists) {
    const hasServiceRoleFuncGrant = (report.functionGrants || []).some(g => g.grantee === 'service_role' && (g.privilege_type || '').toUpperCase() === 'EXECUTE');
    if (!hasServiceRoleFuncGrant) {
      failures.push('Missing required EXECUTE grant to service_role on function');
    }
  }

  // 10. Reject unintended privileges to PUBLIC, anon, authenticated
  const unintendedGrantees = ['PUBLIC', 'anon', 'authenticated'];
  const badTableGrants = (report.tableGrants || []).filter(g => unintendedGrantees.includes(g.grantee));
  if (badTableGrants.length > 0) {
    failures.push(`Unintended table grants detected to: ${badTableGrants.map(g => `${g.grantee} (${g.privilege_type})`).join(', ')}`);
  }
  const badFuncGrants = (report.functionGrants || []).filter(g => unintendedGrantees.includes(g.grantee));
  if (badFuncGrants.length > 0) {
    failures.push(`Unintended function grants detected to: ${badFuncGrants.map(g => `${g.grantee} (${g.privilege_type})`).join(', ')}`);
  }

  return failures;
}

if (require.main === module) {
  const isAssertMode = process.argv.includes('--assert-complete');
  inspectStagingSchema()
    .then(report => {
      if (isAssertMode) {
        const failures = evaluateCertificationAssertions(report);
        if (failures.length > 0) {
          console.error('\n❌ SCHEMA CERTIFICATION ASSERTIONS FAILED:');
          failures.forEach(f => console.error(`   - ${f}`));
          process.exitCode = 1;
          return;
        }
        console.log('\n✔ ALL SCHEMA CERTIFICATION ASSERTIONS PASSED.');
      }
    })
    .catch(err => {
      const safeMsg = err && err.message ? redactCredentials(err.message) : 'Unknown inspection failure';
      console.error('\n❌ INSPECTION FAILED:', safeMsg);
      process.exitCode = 1;
    });
}

module.exports = {
  inspectStagingSchema,
  loadStagingDatabaseUrl,
  evaluateCertificationAssertions,
  normalizeSearchPath,
  isExactZeroDefault,
  isExactNowDefault,
  validateOffsetCheckSemantics,
};
