// Emergency lockdown — strips Send Messages (mute) or View Channel
// (quarantine) from @Verified across all text channels. Records affected
// channel IDs so unlock can reverse exactly what we did, even after a restart.

import { ChannelType } from 'discord.js';
import { store } from './membership/store.js';

function targetChannels(guild) {
  return [...guild.channels.cache.values()].filter(c =>
    c.type === ChannelType.GuildText ||
    c.type === ChannelType.GuildAnnouncement ||
    c.type === ChannelType.GuildForum
  );
}

export async function applyLockdown(guild, mode) {
  const verifiedRoleId = process.env.DISCORD_VERIFIED_ROLE_ID;
  if (!verifiedRoleId) throw new Error('DISCORD_VERIFIED_ROLE_ID not set');
  if (mode !== 'mute' && mode !== 'quarantine') throw new Error(`Unknown mode "${mode}"`);

  const permKey = mode === 'quarantine' ? 'ViewChannel' : 'SendMessages';
  const lockedIds = [];

  for (const channel of targetChannels(guild)) {
    try {
      await channel.permissionOverwrites.edit(
        verifiedRoleId,
        { [permKey]: false },
        { reason: `Emergency lockdown (${mode})` },
      );
      lockedIds.push(channel.id);
    } catch (e) {
      console.error(`lockdown: failed to lock ${channel.name} (${channel.id}):`, e.message);
    }
  }

  await store.update(s => {
    s.lockdownState = { mode, channelIds: lockedIds, startedAt: Date.now() };
  });
  return { lockedCount: lockedIds.length };
}

export async function liftLockdown(guild) {
  const verifiedRoleId = process.env.DISCORD_VERIFIED_ROLE_ID;
  if (!verifiedRoleId) throw new Error('DISCORD_VERIFIED_ROLE_ID not set');

  const state = (await store.read()).lockdownState;
  if (!state) return { unlockedCount: 0, alreadyUnlocked: true };

  const permKey = state.mode === 'quarantine' ? 'ViewChannel' : 'SendMessages';
  let unlocked = 0;

  for (const id of state.channelIds) {
    const channel = guild.channels.cache.get(id);
    if (!channel) continue;
    try {
      await channel.permissionOverwrites.edit(
        verifiedRoleId,
        { [permKey]: null }, // null = "neutral / inherit"
        { reason: 'Emergency lockdown lifted' },
      );
      unlocked++;
    } catch (e) {
      console.error(`lockdown: failed to unlock ${channel.name} (${id}):`, e.message);
    }
  }

  await store.update(s => { s.lockdownState = null; });
  return { unlockedCount: unlocked, alreadyUnlocked: false };
}
