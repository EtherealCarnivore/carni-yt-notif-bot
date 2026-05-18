// StreamElements relay: SE's OAuth project is on YouTube's allowlist for the
// members.list endpoint, ours isn't. We fetch a short-lived YouTube access
// token through SE on every reconcile and use it to call YouTube directly.

const SE_ME_URL = 'https://api.streamelements.com/kappa/v2/channels/me';

function findYouTubeAccessToken(body) {
  return (
    body?.providers?.youtube?.accessToken ||
    body?.providers?.youtube?.access_token ||
    body?.youtube?.accessToken ||
    body?.accessToken ||
    null
  );
}

export async function getYouTubeAccessToken() {
  const jwt = process.env.SE_JWT;
  if (!jwt) {
    const err = new Error('SE_JWT not set');
    err.code = 'SE_JWT_MISSING';
    throw err;
  }

  const res = await fetch(SE_ME_URL, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`SE /channels/me failed: ${res.status} ${text.slice(0, 200)}`);
    err.code = res.status === 401 ? 'SE_JWT_INVALID' : 'SE_REQUEST_FAILED';
    throw err;
  }

  const body = await res.json();
  const token = findYouTubeAccessToken(body);
  if (!token) {
    const err = new Error('SE response did not contain a YouTube access token. Re-link YouTube in StreamElements.');
    err.code = 'SE_NO_YT_TOKEN';
    throw err;
  }
  return token;
}
