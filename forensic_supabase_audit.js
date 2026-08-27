const fs = require('fs');

const content = fs.readFileSync('clasptek_invoice_system.html', 'utf8');

console.log('=== CLASPTEK PERSISTENCE & SUPABASE FORENSIC AUDIT ===\n');

// 1. Check storage functions (safeGet, safeSet, localStorage, etc.)
const storageFuncMatches = [];
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('safeGet') || line.includes('safeSet') || line.includes('localStorage') || line.includes('window.storage')) {
    storageFuncMatches.push({ lineNo: idx + 1, text: line.trim() });
  }
});

console.log(`Found ${storageFuncMatches.length} lines referencing safeGet/safeSet/localStorage/storage.`);
console.log('Sample storage lines:');
storageFuncMatches.slice(0, 15).forEach(m => console.log(`  L${m.lineNo}: ${m.text}`));

// 2. Check Supabase client, queries, REST/RPC calls
const supabaseMatches = [];
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('supabase') || line.includes('.from(') || line.includes('.rpc(') || line.includes('.insert(') || line.includes('.upsert(')) {
    supabaseMatches.push({ lineNo: idx + 1, text: line.trim() });
  }
});

console.log(`\nFound ${supabaseMatches.length} lines referencing Supabase/from/rpc/insert/upsert.`);
console.log('Sample Supabase lines:');
supabaseMatches.slice(0, 20).forEach(m => console.log(`  L${m.lineNo}: ${m.text}`));

// 3. Inspect initState / state loading
const initStateLines = [];
let capture = false;
lines.forEach((line, idx) => {
  if (line.includes('async function initState') || line.includes('function initState') || line.includes('async function load') || line.includes('function loadAllState')) {
    capture = true;
  }
  if (capture) {
    initStateLines.push(`L${idx + 1}: ${line}`);
    if (initStateLines.length > 80) capture = false;
  }
});

console.log('\n--- State Initialization Code Snippet ---');
console.log(initStateLines.slice(0, 50).join('\n'));
