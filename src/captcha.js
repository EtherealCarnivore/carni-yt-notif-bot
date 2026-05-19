// Cloudflare Turnstile captcha for the verification gate.
// Disabled unless TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY are set.

import crypto from 'crypto';
import { assignVerifiedRole } from './verify.js';

const STATE_TTL_MS = 10 * 60_000;
const pending = new Map(); // state → { discordUserId, expiresAt }

function gc() {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expiresAt < now) pending.delete(k);
}

export function issueCaptchaState(discordUserId) {
  gc();
  const state = crypto.randomBytes(32).toString('hex');
  pending.set(state, { discordUserId, expiresAt: Date.now() + STATE_TTL_MS });
  return state;
}

export function consumeCaptchaState(state) {
  gc();
  const entry = pending.get(state);
  if (!entry || entry.expiresAt < Date.now()) return null;
  pending.delete(state);
  return entry;
}

export async function validateTurnstileToken(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new Error('TURNSTILE_SECRET_KEY not set');
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) return { success: false, errors: [`http_${res.status}`] };
  const data = await res.json();
  return { success: !!data.success, errors: data['error-codes'] || [] };
}

// Tiny CSP-friendly page template. We render the Turnstile widget and POST
// the resulting token back to the same URL. No template engine needed.
function pageHtml(siteKey, state) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Verify</title>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <style>
    body { font: 16px/1.4 system-ui, sans-serif; padding: 2rem; max-width: 28rem; margin: auto; text-align: center; color: #1f2937; }
    h1 { margin: 0 0 .5rem; font-size: 1.4rem; }
    p { color: #4b5563; }
    .widget { margin: 1.5rem 0; display: flex; justify-content: center; }
    .status { margin-top: 1.5rem; padding: 1rem; border-radius: 8px; font-weight: 500; }
    .ok { background: #d1fae5; color: #065f46; }
    .fail { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <h1>One quick check</h1>
  <p>Tap the box below to confirm you're human. Usually finishes automatically.</p>
  <div class="widget">
    <div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="onComplete" data-theme="auto"></div>
  </div>
  <div id="status"></div>
  <script>
    function onComplete(token) {
      document.getElementById('status').innerHTML = '<div class="status">Checking...</div>';
      fetch(location.pathname + location.search, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, state: ${JSON.stringify(state)} })
      })
        .then(r => r.text().then(t => ({ ok: r.ok, body: t })))
        .then(({ ok, body }) => {
          document.getElementById('status').innerHTML =
            '<div class="status ' + (ok ? 'ok' : 'fail') + '">' + body + '</div>';
        })
        .catch(e => {
          document.getElementById('status').innerHTML =
            '<div class="status fail">Network error: ' + e.message + '</div>';
        });
    }
  </script>
</body>
</html>`;
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

export function mountCaptchaRoutes(app, client) {
  const enabled = !!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
  if (!enabled) {
    console.log('🔒 Captcha disabled (TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY not set)');
    return;
  }

  // We need to parse JSON bodies for the POST. Mount it locally so we don't
  // affect other routes.
  const jsonParser = (req, res, next) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 4096) req.destroy(); });
    req.on('end', () => {
      try { req.body = raw ? JSON.parse(raw) : {}; next(); }
      catch { res.status(400).send('Invalid JSON'); }
    });
    req.on('error', () => res.status(400).end());
  };

  app.get('/verify/captcha', (req, res) => {
    const state = String(req.query.state || '');
    if (!state) return res.status(400).send('Missing state — open the verify button again in Discord.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(pageHtml(process.env.TURNSTILE_SITE_KEY, state));
  });

  app.post('/verify/captcha', jsonParser, async (req, res) => {
    const state = String(req.query.state || req.body?.state || '');
    const token = String(req.body?.token || '');
    if (!state || !token) return res.status(400).send('Missing state or token.');

    const entry = consumeCaptchaState(state);
    if (!entry) return res.status(400).send('Link expired. Click the verify button in Discord again.');

    let result;
    try {
      result = await validateTurnstileToken(token, clientIp(req));
    } catch (e) {
      console.error('captcha: turnstile validate threw:', e.message);
      return res.status(500).send('Verification service error. Try again in a moment.');
    }
    if (!result.success) {
      console.warn('captcha: turnstile rejected:', result.errors);
      return res.status(400).send('Captcha failed. Refresh and try again.');
    }

    const swap = await assignVerifiedRole(client, entry.discordUserId);
    if (!swap.ok) {
      console.error('captcha: role swap failed:', swap.reason);
      return res.status(500).send(`Could not assign role: ${swap.reason}. DM a mod.`);
    }
    res.send('✅ Verified. You can close this tab and head back to Discord.');
  });

  console.log('🔒 Captcha routes mounted at /verify/captcha');
}
