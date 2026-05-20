// Self-service role picker. One pinned message with toggle buttons; clicking
// adds the role if absent, removes it if present. Only renders buttons for
// roles that are actually configured via env vars.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { LINK_YT_BUTTON_ID } from './membership/linkButton.js';

export const ROLE_BUTTON_IDS = {
  video: 'role_video',
  poe1: 'role_poe1',
  poe2: 'role_poe2',
};

function roleIdFor(buttonId) {
  switch (buttonId) {
    case ROLE_BUTTON_IDS.video: return process.env.DISCORD_ROLE_ID;
    case ROLE_BUTTON_IDS.poe1: return process.env.POE1_PING_ROLE_ID;
    case ROLE_BUTTON_IDS.poe2: return process.env.POE2_PING_ROLE_ID;
    default: return null;
  }
}

export function isRoleToggleButton(customId) {
  return Object.values(ROLE_BUTTON_IDS).includes(customId);
}

export function buildRolePickerEmbed() {
  const lines = [];
  if (process.env.DISCORD_ROLE_ID) lines.push('🔔 **Video Pings** — new YouTube uploads');
  if (process.env.POE1_PING_ROLE_ID) lines.push('⚔️ **PoE 1 Pings** — Path of Exile patch notes');
  if (process.env.POE2_PING_ROLE_ID) lines.push('🔮 **PoE 2 Pings** — Path of Exile 2 patch notes');
  lines.push('💎 **Link YouTube** — claim your channel-membership role');

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Pick your notifications')
    .setDescription(
      'Tap a button to toggle a role on or off. Tap again to remove it.\n\n' +
      lines.join('\n')
    )
    .setFooter({ text: 'Your choices are private — only you see the confirmation.' });
}

export function buildRolePickerRow() {
  const row = new ActionRowBuilder();
  if (process.env.DISCORD_ROLE_ID) {
    row.addComponents(new ButtonBuilder().setCustomId(ROLE_BUTTON_IDS.video).setLabel('Video Pings').setEmoji('🔔').setStyle(ButtonStyle.Secondary));
  }
  if (process.env.POE1_PING_ROLE_ID) {
    row.addComponents(new ButtonBuilder().setCustomId(ROLE_BUTTON_IDS.poe1).setLabel('PoE 1 Pings').setEmoji('⚔️').setStyle(ButtonStyle.Secondary));
  }
  if (process.env.POE2_PING_ROLE_ID) {
    row.addComponents(new ButtonBuilder().setCustomId(ROLE_BUTTON_IDS.poe2).setLabel('PoE 2 Pings').setEmoji('🔮').setStyle(ButtonStyle.Secondary));
  }
  row.addComponents(new ButtonBuilder().setCustomId(LINK_YT_BUTTON_ID).setLabel('Link YouTube').setEmoji('🔗').setStyle(ButtonStyle.Primary));
  return row;
}

export async function handleRoleToggleButton(interaction) {
  const roleId = roleIdFor(interaction.customId);
  if (!roleId) {
    await interaction.reply({ content: "That role isn't configured.", flags: MessageFlags.Ephemeral });
    return;
  }
  const member = interaction.member;
  if (!member) {
    await interaction.reply({ content: 'Could not resolve your membership.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    const noPing = { parse: [] };
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, 'Self-service role toggle');
      await interaction.reply({ content: `Removed <@&${roleId}>.`, flags: MessageFlags.Ephemeral, allowedMentions: noPing });
    } else {
      await member.roles.add(roleId, 'Self-service role toggle');
      await interaction.reply({ content: `Added <@&${roleId}>.`, flags: MessageFlags.Ephemeral, allowedMentions: noPing });
    }
  } catch (e) {
    await interaction.reply({ content: `Failed: ${e.message}`, flags: MessageFlags.Ephemeral });
  }
}
