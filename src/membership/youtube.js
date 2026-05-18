import { google } from 'googleapis';

export async function fetchAuthedChannel(authClient) {
  const yt = google.youtube({ version: 'v3', auth: authClient });
  const { data } = await yt.channels.list({ part: 'snippet,statistics', mine: true });
  return (data.items ?? []).map(c => ({
    id: c.id,
    title: c?.snippet?.title,
    customUrl: c?.snippet?.customUrl,
    subscriberCount: c?.statistics?.subscriberCount,
  }));
}

export async function fetchAllMembers(authClient) {
  const yt = google.youtube({ version: 'v3', auth: authClient });
  const out = [];
  let pageToken;
  do {
    const { data } = await yt.members.list({
      part: 'snippet',
      maxResults: 1000,
      pageToken,
    });
    for (const m of data.items ?? []) {
      const channelId = m?.snippet?.memberDetails?.channelId;
      const tierName = m?.snippet?.membershipsDetails?.highestAccessibleLevelDisplayName;
      if (channelId && tierName) out.push({ channelId, tierName });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}
