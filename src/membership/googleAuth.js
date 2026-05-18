import { google } from 'googleapis';
import { store } from './store.js';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.channel-memberships.creator',
  'https://www.googleapis.com/auth/youtube.readonly',
];

function redirectUri() {
  return `${process.env.PUBLIC_BASE_URL}/oauth/google/callback`;
}

export function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri(),
  );
}

export function buildConsentUrl(state) {
  return makeOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

export async function handleCallback(code) {
  const oauth = makeOAuthClient();
  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('No refresh_token returned. Revoke the app in Google Account permissions and try again.');
  }
  await store.update(s => {
    s.googleRefreshToken = tokens.refresh_token;
    s.googleTokenIssuedAt = Date.now();
  });
}

export async function getAuthedClient() {
  const { googleRefreshToken } = await store.read();
  if (!googleRefreshToken) {
    const err = new Error('NEEDS_RELINK');
    err.code = 'NEEDS_RELINK';
    throw err;
  }
  const oauth = makeOAuthClient();
  oauth.setCredentials({ refresh_token: googleRefreshToken });
  return oauth;
}

export function isExpiredAuthError(err) {
  const msg = err?.message || '';
  const data = err?.response?.data;
  return (
    msg.includes('invalid_grant') ||
    data?.error === 'invalid_grant' ||
    err?.code === 'NEEDS_RELINK'
  );
}
