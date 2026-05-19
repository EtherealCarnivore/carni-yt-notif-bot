// Auto-updating voice channels that serve as live stats labels in the sidebar.
// Discord rate-limits channel renames to ~2 per 10 min per channel, so update
// no more often than every 15 minutes.

import { getLastYtMemberCount, getLastSubscriberCount } from './membership/reconcile.js';

function formatCount(n) {
  if (n == null) return null;
  // Discord channel names have a 100-char limit; large numbers stay readable
  // as raw ints. No comma formatting since the channel name will get truncated
  // unpredictably across locales otherwise.
  return String(n);
}

const STATS_INTERVAL_MS = 15 * 60_000;

async function safeRename(client, channelId, newName) {
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel.name === newName) return; // no-op if unchanged
    await channel.setName(newName, 'Stats refresh');
  } catch (e) {
    console.error(`stats: rename ${channelId} failed:`, e.message);
  }
}

async function updateStatsChannels(client) {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return;

  let memberCount = null;
  try {
    const guild = await client.guilds.fetch(guildId);
    memberCount = guild.memberCount;
  } catch (e) {
    console.error('stats: could not fetch guild:', e.message);
  }

  const ytMembers = getLastYtMemberCount();
  const subs = getLastSubscriberCount();

  if (memberCount != null) {
    await safeRename(client, process.env.STATS_MEMBERS_CHANNEL_ID, `👥 Members: ${formatCount(memberCount)}`);
  }
  if (subs != null) {
    await safeRename(client, process.env.STATS_YT_SUBS_CHANNEL_ID, `🎬 YT Subscribers: ${formatCount(subs)}`);
  }
  if (ytMembers != null) {
    await safeRename(client, process.env.STATS_YT_MEMBERS_CHANNEL_ID, `💎 YT Members: ${formatCount(ytMembers)}`);
  }
}

export function startStatsLoop(client) {
  console.log(`📊 Starting stats voice-channel loop (every ${STATS_INTERVAL_MS / 60000} minutes)`);
  setInterval(() => updateStatsChannels(client).catch(e => console.error('stats loop:', e.message)), STATS_INTERVAL_MS);
  // First update — delay a few seconds so reconcile has a chance to populate.
  setTimeout(() => updateStatsChannels(client).catch(e => console.error('stats initial:', e.message)), 10_000);
}
