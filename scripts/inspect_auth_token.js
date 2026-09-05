const https = require('https');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
let key = '';
env.split('\n').forEach(l => {
  if (l.startsWith('SUPABASE_PUBLISHABLE_KEY=')) key = l.split('=')[1].trim().replace(/['"]/g, '');
});

const req = https.request('https://logaawoigfxnisimfatf.supabase.co/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: { 'apikey': key, 'Content-Type': 'application/json' }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const data = JSON.parse(body);
    console.log('USER METADATA:', JSON.stringify(data.user?.user_metadata, null, 2));
    console.log('APP METADATA:', JSON.stringify(data.user?.app_metadata, null, 2));
    const token = data.access_token;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    console.log('JWT PAYLOAD CLAIMS:', JSON.stringify(payload, null, 2));
  });
});
req.write(JSON.stringify({ email: 'admin@clasptek.org', password: 'AdminSecure2026!' }));
req.end();
