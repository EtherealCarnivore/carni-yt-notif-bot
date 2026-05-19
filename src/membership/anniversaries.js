import { store } from './store.js';
import { MEMBERSHIP_MILESTONES } from './config.js';

// Detects milestone crossings since the last reconcile snapshot and posts a
// shoutout per crossing. First-run is silent (no snapshot baseline) so we
// don't dump every existing member's full history at once.
export async function checkAnniversaries(client, members) {
  const channelId = process.env.DISCORD_ANNIVERSARY_CHANNEL_ID;
  if (!channelId) return;

  const state = await store.read();
  const prior = state.memberDurationSnapshots || {};
  const firstRun = Object.keys(prior).length === 0;

  // Invert links so we can mention the Discord user if they're linked.
  const ytToDiscord = new Map();
  for (const [discordUserId, link] of Object.entries(state.links || {})) {
    if (link?.youtubeChannelId) ytToDiscord.set(link.youtubeChannelId, discordUserId);
  }

  const toPost = [];
  const nextSnapshots = {};

  for (const m of members) {
    const { channelId: ytId, tierName, displayName, durationMonths } = m;
    if (durationMonths == null) {
      nextSnapshots[ytId] = prior[ytId] || { lastSeenMonths: null, lastSeenTier: tierName };
      continue;
    }
    const last = prior[ytId];

    if (!firstRun && last && typeof last.lastSeenMonths === 'number') {
      for (const milestone of MEMBERSHIP_MILESTONES) {
        if (durationMonths >= milestone && last.lastSeenMonths < milestone) {
          toPost.push({ ytId, displayName, tierName, milestone });
        }
      }
    }
    nextSnapshots[ytId] = { lastSeenMonths: durationMonths, lastSeenTier: tierName };
  }

  await store.update(s => { s.memberDurationSnapshots = nextSnapshots; });

  if (firstRun) {
    console.log('🎂 anniversary: baseline snapshot stored, no shoutouts on first run');
    return;
  }
  if (toPost.length === 0) return;

  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (e) {
    console.error('🎂 anniversary: could not fetch channel:', e.message);
    return;
  }

  for (const e of toPost) {
    const discordId = ytToDiscord.get(e.ytId);
    const mention = discordId ? `<@${discordId}>` : `**${e.displayName || 'A member'}**`;
    const monthLabel = e.milestone === 1 ? '1 month' : `${e.milestone} months`;
    const msg = `🎉 ${mention} just hit **${monthLabel}** on **${e.tierName}** — thanks for the support!`;
    try {
      await channel.send({ content: msg, allowedMentions: { users: discordId ? [discordId] : [] } });
      console.log(`🎂 anniversary: posted for ${e.displayName} at ${e.milestone}mo`);
    } catch (err) {
      console.error('🎂 anniversary: post failed:', err.message);
    }
  }
}
