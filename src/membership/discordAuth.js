import crypto from 'crypto';
import { store } from './store.js';

const STATE_TTL_MS = 10 * 60_000;

const pending = new Map(); // state → { discordUserId, expiresAt }

function gc() {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expiresAt < now) pending.delete(k);
}

export function issueUserLinkState(discordUserId) {
  gc();
  const state = crypto.randomBytes(16).toString('hex');
  pending.set(state, { discordUserId, expiresAt: Date.now() + STATE_TTL_MS });
  return state;
}

export function consumeUserLinkState(state) {
  gc();
  const entry = pending.get(state);
  if (!entry || entry.expiresAt < Date.now()) return null;
  pending.delete(state);
  return entry;
}

export function buildUserAuthUrl(state) {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${process.env.PUBLIC_BASE_URL}/oauth/discord/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify connections');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

export async function exchangeUserCodeAndLink(code, discordUserId) {
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.PUBLIC_BASE_URL}/oauth/discord/callback`,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Discord token exchange failed: ${tokenRes.status}`);
  const tokens = await tokenRes.json();

  const connRes = await fetch('https://discord.com/api/users/@me/connections', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!connRes.ok) throw new Error(`Discord connections fetch failed: ${connRes.status}`);
  const connections = await connRes.json();

  const yt = connections.find(c => c.type === 'youtube');
  if (!yt) return { ok: false, reason: 'no_youtube_connection' };

  await store.update(s => {
    s.links[discordUserId] = { youtubeChannelId: yt.id, linkedAt: Date.now() };
  });
  return { ok: true, youtubeChannelId: yt.id };
}
