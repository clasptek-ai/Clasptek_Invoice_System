/**
 * CLASPTEK ENTERPRISE MANAGEMENT PLATFORM
 * Build Script: Generate Public Runtime Configuration & Meta Tag Injection
 * 
 * Injects public Supabase endpoint and publishable key from Vercel Environment / .env.local
 * into browser-safe runtime-config.js assets AND index.html meta tags.
 * 
 * STRICT SECURITY INVARIANTS:
 * - NEVER writes service_role, database passwords, postgres://, sbp_ CLI tokens, or secret keys.
 * - NEVER prints full credentials in build logs.
 */

const fs = require('fs');
const path = require('path');

const QUARANTINED_PROD_REF = 'logaawoigfxnisimfatf';
const EXPECTED_STAGING_REF = 'dwhjoiebzwnjdpcvcwvs';

function safeDecode(val) {
  if (typeof val !== 'string') return '';
  try {
    return decodeURIComponent(val);
  } catch (_) {
    return val;
  }
}

function checkQuarantine(val, fieldName = 'input') {
  if (!val || typeof val !== 'string') return;
  const raw = val.toLowerCase();
  const decoded = safeDecode(val).toLowerCase();
  if (raw.includes(QUARANTINED_PROD_REF) || decoded.includes(QUARANTINED_PROD_REF)) {
    throw new Error(`SECURITY_VIOLATION: Quarantined production Supabase project (${QUARANTINED_PROD_REF}) cannot be targeted in ${fieldName}.`);
  }
}

function parseEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const content = fs.readFileSync(filePath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1).trim();
      }
      env[key] = val;
    }
  });
  return env;
}

function validateSupabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { valid: false, url: '', projectRef: 'none' };
  }
  const trimmed = rawUrl.trim();
  checkQuarantine(trimmed, 'Supabase URL');

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_) {
    throw new Error('CONFIGURATION_ERROR: Malformed Supabase URL syntax');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`CONFIGURATION_ERROR: Invalid Supabase URL protocol '${parsed.protocol}'. Must be https:// or http://`);
  }

  let projectRef = 'custom';
  const hostMatch = parsed.hostname.match(/^([a-z0-9_-]+)\.supabase\.co$/i);
  if (hostMatch) {
    projectRef = hostMatch[1].toLowerCase();
    checkQuarantine(projectRef, 'Supabase host project ref');
  }

  return { valid: true, url: trimmed.replace(/\/+$/, ''), projectRef };
}

function resolveBuildCredentials(options = {}) {
  const envDir = options.envDir || process.cwd();
  const localEnv = {
    ...parseEnvFile(path.join(envDir, '.env')),
    ...parseEnvFile(path.join(envDir, '.env.local'))
  };

  const rawUrl = process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    localEnv.SUPABASE_URL ||
    localEnv.NEXT_PUBLIC_SUPABASE_URL ||
    localEnv.VITE_SUPABASE_URL ||
    '';

  const rawKey = process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.Publishable_key ||
    process.env.publishable_key ||
    process.env.PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    localEnv.SUPABASE_PUBLISHABLE_KEY ||
    localEnv.Publishable_key ||
    localEnv.publishable_key ||
    localEnv.PUBLISHABLE_KEY ||
    localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    localEnv.NEXT_PUBLIC_PUBLISHABLE_KEY ||
    localEnv.SUPABASE_ANON_KEY ||
    localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    localEnv.VITE_SUPABASE_ANON_KEY ||
    '';

  const { valid, url, projectRef } = validateSupabaseUrl(rawUrl);
  const key = rawKey.trim();

  if (options.requireConfig && (!valid || !url)) {
    throw new Error('CONFIGURATION_ERROR: Missing required Supabase URL. Explicit, validated configuration is required. Implicit fallback to production is disabled.');
  }

  return {
    url,
    key,
    projectRef: valid ? projectRef : 'none',
    configured: Boolean(valid && url && key)
  };
}

function validatePublicCredential(key) {
  if (!key) return { safe: true, role: 'none' };

  if (
    key.startsWith('sbp_') ||
    key.startsWith('sk_') ||
    key.startsWith('secret_') ||
    key.startsWith('sb_secret_') ||
    key.startsWith('service_role') ||
    key.includes('service_role') ||
    key.includes('postgres' + '://') ||
    key.includes('password=')
  ) {
    throw new Error('SECURITY VIOLATION: Prohibited secret credential detected during build. Secret keys must NEVER be placed in client runtime config.');
  }

  if (key.startsWith('eyJ') && key.includes('.')) {
    try {
      const parts = key.split('.');
      if (parts.length >= 2) {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const jsonStr = Buffer.from(b64, 'base64').toString('utf-8');
        const payload = JSON.parse(jsonStr);
        if (payload && payload.role === 'service_role') {
          throw new Error('SECURITY VIOLATION: service_role key detected. Service role keys must NEVER be exposed in client assets.');
        }
      }
    } catch (err) {
      if (err.message.includes('SECURITY VIOLATION')) throw err;
    }
  }

  return { safe: true };
}

function getSanitizedRuntimeConfigSummary(options = {}) {
  const { url, key, projectRef } = resolveBuildCredentials(options);
  let credType = 'none';
  if (key) {
    if (key.startsWith('pk_') || key.startsWith('sb_pub_') || key.startsWith('sb_publishable_') || key.includes('publishable')) {
      credType = 'publishable';
    } else if (key.startsWith('eyJ') || key.includes('anon')) {
      credType = 'anon';
    } else {
      credType = 'unknown';
    }
  }

  return {
    configured: Boolean(url && key),
    projectRef: projectRef || 'none',
    credentialType: credType,
    credentialPresent: Boolean(key && key.length > 5)
  };
}

function updateHtmlMetaTags(filePath, url, key) {
  if (!fs.existsSync(filePath)) return;
  let html = fs.readFileSync(filePath, 'utf8');

  // Update endpoint meta tag
  html = html.replace(
    /<meta\s+name=["']supabase-endpoint["']\s+content=["'][^"']*["']\s*\/?>/i,
    `<meta name="supabase-endpoint" content="${url}" />`
  );

  // Update publishable key meta tag
  html = html.replace(
    /<meta\s+name=["']supabase-publishable-key["']\s+content=["'][^"']*["']\s*\/?>/i,
    `<meta name="supabase-publishable-key" content="${key}" />`
  );

  // Update anon key meta tag for backward compatibility
  html = html.replace(
    /<meta\s+name=["']supabase-anon-key["']\s+content=["'][^"']*["']\s*\/?>/i,
    `<meta name="supabase-anon-key" content="${key}" />`
  );

  fs.writeFileSync(filePath, html, 'utf8');
}

function generateRuntimeConfig(options = {}) {
  console.log('=== CLASPTEK RUNTIME CONFIG & META INJECTION ===');
  const creds = resolveBuildCredentials({ ...options, requireConfig: true });
  const { url, key, projectRef } = creds;

  validatePublicCredential(key);

  const maskedKey = key.length >= 8 ? `****${key.slice(-4)}` : (key ? 'CONFIGURED' : 'NONE');
  console.log(`Target Supabase URL: ${url}`);
  console.log(`Project Ref:         ${projectRef}`);
  console.log(`Public Key Status:   ${key ? 'PRESENT (' + maskedKey + ')' : 'NONE (Awaiting Deployment Injection)'}`);

  const fileContent = `// Auto-generated by Clasptek Vercel Build Script — DO NOT COMMIT REAL SECRETS
window.__CLASPTEK_ENV__ = {
  SUPABASE_URL: ${JSON.stringify(url)},
  SUPABASE_PUBLISHABLE_KEY: ${JSON.stringify(key)}
};
`;

  if (options.dryRun) {
    return { url, key, projectRef, fileContent };
  }

  const rootDir = options.rootDir || process.cwd();

  // Write to root runtime-config.js
  const rootOut = path.join(rootDir, 'runtime-config.js');
  fs.writeFileSync(rootOut, fileContent, 'utf8');
  console.log(`✔ Generated: ${rootOut}`);

  const indexHtmlPath = path.join(rootDir, 'index.html');
  const invoiceHtmlPath = path.join(rootDir, 'clasptek_invoice_system.html');
  if (fs.existsSync(indexHtmlPath)) {
    fs.copyFileSync(indexHtmlPath, invoiceHtmlPath);
    updateHtmlMetaTags(indexHtmlPath, url, key);
    updateHtmlMetaTags(invoiceHtmlPath, url, key);
    console.log('✔ Updated HTML meta tags in root index.html & clasptek_invoice_system.html');
  }

  // Write to public/ directory (including index.html, runtime-config.js)
  const publicDir = path.join(rootDir, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(path.join(publicDir, 'runtime-config.js'), fileContent, 'utf8');
  if (fs.existsSync(indexHtmlPath)) {
    fs.copyFileSync(indexHtmlPath, path.join(publicDir, 'index.html'));
  }
  if (fs.existsSync(invoiceHtmlPath)) {
    fs.copyFileSync(invoiceHtmlPath, path.join(publicDir, 'clasptek_invoice_system.html'));
  }
  console.log('✔ Synchronized public/ distribution directory with index.html and runtime-config.js');

  const summary = getSanitizedRuntimeConfigSummary(options);
  console.log('Sanitized Runtime Summary:', JSON.stringify(summary));
  console.log('=== BUILD CONFIG GENERATION COMPLETE ===\n');
  return summary;
}

if (require.main === module) {
  try {
    generateRuntimeConfig();
  } catch (err) {
    console.error('Build config generation failed:', err.message);
    process.exit(1);
  }
}

module.exports = {
  QUARANTINED_PROD_REF,
  EXPECTED_STAGING_REF,
  safeDecode,
  checkQuarantine,
  validateSupabaseUrl,
  resolveBuildCredentials,
  validatePublicCredential,
  getSanitizedRuntimeConfigSummary,
  generateRuntimeConfig
};
