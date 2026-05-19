// Raw fetch against YouTube Data API v3 members.list. We use a relayed access
// token (obtained via StreamElements) rather than a Google OAuth client.

const MEMBERS_URL = 'https://www.googleapis.com/youtube/v3/members';

export async function fetchAllMembers(accessToken) {
  const out = [];
  let pageToken;
  do {
    const url = new URL(MEMBERS_URL);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('maxResults', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`members.list failed: ${res.status} ${text.slice(0, 400)}`);
      err.status = res.status;
      try { err.body = JSON.parse(text); } catch { err.body = text; }
      throw err;
    }

    const data = await res.json();
    for (const m of data.items ?? []) {
      const channelId = m?.snippet?.memberDetails?.channelId;
      const tierName = m?.snippet?.membershipsDetails?.highestAccessibleLevelDisplayName;
      const displayName = m?.snippet?.memberDetails?.displayName;
      const durationMonths = m?.snippet?.membershipsDetails?.membershipsDuration?.memberTotalDurationMonths;
      if (channelId && tierName) out.push({ channelId, tierName, displayName, durationMonths });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}
