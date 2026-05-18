import { google } from 'googleapis';

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
