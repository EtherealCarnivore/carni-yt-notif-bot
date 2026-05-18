// Standalone diagnostic. Verifies the StreamElements -> YouTube members.list relay.
//
// Usage (PowerShell):
//   $env:SE_JWT="eyJ..."; $env:SE_CHANNEL_ID="5fa1b2..."; node scripts/test-se-relay.js
//
// What it does:
//   1. Calls SE /kappa/v2/channels/me with the JWT to fetch the channel record
//      (which includes a YouTube access token relayed via SE's allowlisted project).
//   2. Tries to extract the YouTube access token from the response.
//   3. Calls YouTube Data API members.list with that token.
//   4. Reports the outcome plainly.

const SE_JWT = process.env.SE_JWT;
const SE_CHANNEL_ID = process.env.SE_CHANNEL_ID;

if (!SE_JWT) {
  console.error('Missing SE_JWT env var.');
  process.exit(1);
}

const seHeaders = { Authorization: `Bearer ${SE_JWT}`, Accept: 'application/json' };

function pruneSecrets(obj) {
  // Avoid printing the full access token in logs.
  const clone = JSON.parse(JSON.stringify(obj));
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      if (typeof o[k] === 'string' && /token|secret|jwt/i.test(k) && o[k].length > 12) {
        o[k] = o[k].slice(0, 8) + '...REDACTED(' + o[k].length + ' chars)';
      } else {
        walk(o[k]);
      }
    }
  };
  walk(clone);
  return clone;
}

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, ok: r.ok, body };
}

async function main() {
  console.log('▶ Step 1 — fetch SE channel record via /kappa/v2/channels/me');
  const me = await fetchJson('https://api.streamelements.com/kappa/v2/channels/me', { headers: seHeaders });
  console.log('  status:', me.status);
  if (!me.ok) {
    console.error('  body:', me.body);
    console.error('✖ /me failed — JWT may be invalid or expired. Stopping.');
    process.exit(2);
  }
  console.log('  body (redacted):', JSON.stringify(pruneSecrets(me.body), null, 2));

  // Different SE endpoints may surface the YT access token under different keys.
  // Try common paths.
  const candidates = [
    me.body?.providers?.youtube?.accessToken,
    me.body?.providers?.youtube?.access_token,
    me.body?.youtube?.accessToken,
    me.body?.accessToken,
  ].filter(Boolean);

  let ytAccessToken = candidates[0];

  // If not on /me, sometimes it's on a per-channel endpoint:
  if (!ytAccessToken && SE_CHANNEL_ID) {
    console.log('\n▶ Step 1b — try /kappa/v2/channels/<id>');
    const chan = await fetchJson(`https://api.streamelements.com/kappa/v2/channels/${SE_CHANNEL_ID}`, { headers: seHeaders });
    console.log('  status:', chan.status);
    console.log('  body (redacted):', JSON.stringify(pruneSecrets(chan.body), null, 2));
    ytAccessToken =
      chan.body?.providers?.youtube?.accessToken ||
      chan.body?.providers?.youtube?.access_token ||
      chan.body?.youtube?.accessToken ||
      chan.body?.accessToken;
  }

  if (!ytAccessToken) {
    console.error('\n✖ Could not find a YouTube access token in the SE responses above.');
    console.error('  Check the redacted JSON dumps — look for any key matching "accessToken"');
    console.error('  or "youtube". The script may need a path tweak. Paste the dump back.');
    process.exit(3);
  }

  console.log('\n✓ Got YouTube access token via SE relay.');

  console.log('\n▶ Step 2 — call YouTube Data API members.list with the relayed token');
  const members = await fetchJson(
    'https://www.googleapis.com/youtube/v3/members?part=snippet&maxResults=10',
    { headers: { Authorization: `Bearer ${ytAccessToken}`, Accept: 'application/json' } }
  );
  console.log('  status:', members.status);
  console.log('  body:', JSON.stringify(members.body, null, 2));

  if (members.ok) {
    const count = (members.body?.items || []).length;
    console.log(`\n✅ SUCCESS — members.list returned ${count} member(s). The relay works.`);
    process.exit(0);
  } else {
    console.log('\n✖ members.list still failed via the SE relay. See body above for the reason.');
    process.exit(4);
  }
}

main().catch(e => { console.error('Unexpected error:', e); process.exit(99); });
