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

async function inspectStagingSchema() {
  console.log('========================================================================================');
  console.log(' CLASPTEK STAGING READ-ONLY SCHEMA INSPECTION: RECONCILIATION CURSOR');
  console.log(' Target Project Ref:', EXPECTED_STAGING_REF);
  console.log(' Mode: READ-ONLY INSPECTION (Queries 1-7, and Query 8 iff table exists)');
  console.log('========================================================================================\n');

  // 1. Load config
  const databaseUrl = loadStagingDatabaseUrl();
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
  const client = createStagingClient(validatedClientConfig, (opts) => new Client(opts));

  const inspectionReport = {
    tableExists: false,
    tableDetails: null,
    columns: [],
    constraints: [],
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

      // Query 3: Inspect constraints
      console.log('\n--- Executing Query 3: Inspect Constraints ---');
      const q3 = await client.query(`
        SELECT conname, contype, pg_get_constraintdef(c.oid) AS constraint_definition 
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
          pg_get_function_arguments(p.oid) AS argument_signature
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
      console.log(`    - Signature: ${q6.rows[0].argument_signature}`);
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
  } finally {
    await client.end();
    console.log('✔ Database connection closed cleanly in finally block.');
  }
}

if (require.main === module) {
  inspectStagingSchema().catch(err => {
    const safeMsg = err && err.message ? redactCredentials(err.message) : 'Unknown inspection failure';
    console.error('\n❌ INSPECTION FAILED:', safeMsg);
    process.exit(1);
  });
}

module.exports = {
  inspectStagingSchema,
  loadStagingDatabaseUrl,
};
