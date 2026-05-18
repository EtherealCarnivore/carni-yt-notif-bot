import {
  consumeState,
  exchangeUserCodeAndLink,
} from './discordAuth.js';
import { handleCallback as handleGoogleCallback } from './googleAuth.js';
import { reconcile } from './reconcile.js';

function html(body) {
  return `<!doctype html><meta charset="utf-8"><style>body{font:16px system-ui;padding:2rem;max-width:32rem;margin:auto}</style>${body}`;
}

export function mountMembershipRoutes(app, client) {
  // --- Google (owner) ----------------------------------------------------
  app.get('/oauth/google/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.status(400).send(html(`<h2>Google denied: ${error}</h2>`));
    if (!code || !state) return res.status(400).send(html('<h2>Missing code or state.</h2>'));

    const entry = consumeState(String(state), 'owner');
    if (!entry) return res.status(400).send(html('<h2>Invalid or expired link.</h2><p>Run <code>/admin-relink</code> again in Discord.</p>'));

    try {
      await handleGoogleCallback(String(code));
      res.send(html('<h2>Linked.</h2><p>You can close this tab. Role sync will run within minutes.</p>'));
      reconcile(client).catch(e => console.error('post-relink reconcile failed:', e));
    } catch (e) {
      console.error('❌ Google callback failed:', e.message);
      res.status(500).send(html(`<h2>Failed:</h2><pre>${e.message}</pre>`));
    }
  });

  // --- Discord (member) --------------------------------------------------
  app.get('/oauth/discord/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.status(400).send(html(`<h2>Discord denied: ${error}</h2>`));
    if (!code || !state) return res.status(400).send(html('<h2>Missing code or state.</h2>'));

    const entry = consumeState(String(state), 'user');
    if (!entry) return res.status(400).send(html('<h2>Invalid or expired link.</h2><p>Run <code>/link-youtube</code> in Discord again.</p>'));

    try {
      const result = await exchangeUserCodeAndLink(String(code), entry.discordUserId);
      if (!result.ok && result.reason === 'no_youtube_connection') {
        return res.send(html(
          '<h2>No YouTube connection found.</h2>' +
          '<p>In Discord: <b>User Settings → Connections → Add → YouTube</b>, then run <code>/link-youtube</code> again.</p>'
        ));
      }
      res.send(html('<h2>Linked.</h2><p>Your role will appear within minutes. You can close this tab.</p>'));
      reconcile(client).catch(e => console.error('post-link reconcile failed:', e));
    } catch (e) {
      console.error('❌ Discord callback failed:', e.message);
      res.status(500).send(html(`<h2>Failed:</h2><pre>${e.message}</pre>`));
    }
  });
}
