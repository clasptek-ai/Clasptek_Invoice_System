const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
let key = '';
env.split('\n').forEach(l => {
  if (l.startsWith('SUPABASE_PUBLISHABLE_KEY=')) key = l.split('=')[1].trim().replace(/['"]/g, '');
});

async function main() {
  const authRes = await fetch('https://logaawoigfxnisimfatf.supabase.co/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'apikey': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@clasptek.org', password: 'AdminSecure2026!' })
  });
  const authData = await authRes.json();
  console.log('auth status:', authRes.status);
  console.log('User app_metadata:', authData.user?.app_metadata);
  console.log('User user_metadata:', authData.user?.user_metadata);

  const memRes = await fetch('https://logaawoigfxnisimfatf.supabase.co/rest/v1/tenant_memberships?select=*', {
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + authData.access_token
    }
  });
  console.log('tenant_memberships status:', memRes.status);
  const memData = await memRes.json();
  console.log('tenant_memberships data:', memData);
}
main().catch(err => console.error(err));
