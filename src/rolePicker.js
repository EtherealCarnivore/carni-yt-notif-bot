// Self-service role picker. The pinned message has a "Manage Notifications"
// button; clicking it opens a per-user ephemeral panel whose buttons are
// colored to that user's current roles (green ✓ = has it). Toggling re-renders
// the ephemeral in place. Per-user colors aren't possible on the shared pinned
// message, which is why the real controls live in the ephemeral.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { LINK_YT_BUTTON_ID } from './membership/linkButton.js';
import { ROLE_PICKER } from './copy.js';

export const ROLE_MENU_OPEN_ID = 'roles_open';
export const ROLE_BUTTON_IDS = {
  poe1: 'role_poe1',
  poe2: 'role_poe2',
};

const META = {
  [ROLE_BUTTON_IDS.poe1]: { label: ROLE_PICKER.poe1Label, emoji: '⚔️', env: 'POE1_PING_ROLE_ID' },
  [ROLE_BUTTON_IDS.poe2]: { label: ROLE_PICKER.poe2Label, emoji: '🔮', env: 'POE2_PING_ROLE_ID' },
};

function roleIdFor(buttonId) {
  const meta = META[buttonId];
  return meta ? process.env[meta.env] : null;
}

export function isRoleToggleButton(customId) {
  return Object.prototype.hasOwnProperty.call(META, customId);
}
export function isRoleMenuOpen(customId) {
  return customId === ROLE_MENU_OPEN_ID;
}

// ---- Pinned (shared) message ----
export function buildRolePickerEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(ROLE_PICKER.embedTitle)
    .setDescription(ROLE_PICKER.embedDescription);
}

export function buildRolePickerRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(ROLE_MENU_OPEN_ID).setLabel(ROLE_PICKER.manageButtonLabel).setEmoji('🔔').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(LINK_YT_BUTTON_ID).setLabel(ROLE_PICKER.linkYouTubeLabel).setEmoji('🔗').setStyle(ButtonStyle.Secondary),
  );
}

// ---- Per-user ephemeral panel ----
function buildManageComponents(member) {
  const row = new ActionRowBuilder();
  let any = false;
  for (const buttonId of Object.keys(META)) {
    const roleId = roleIdFor(buttonId);
    if (!roleId) continue;
    any = true;
    const has = member.roles.cache.has(roleId);
    const meta = META[buttonId];
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(buttonId)
        .setLabel(has ? `${meta.label} ✓` : meta.label)
        .setEmoji(meta.emoji)
        .setStyle(has ? ButtonStyle.Success : ButtonStyle.Secondary),
    );
  }
  return any ? [row] : [];
}

const MANAGE_TEXT = ROLE_PICKER.manageText;

export async function handleRoleMenuOpen(interaction) {
  const components = buildManageComponents(interaction.member);
  if (components.length === 0) {
    await interaction.reply({ content: ROLE_PICKER.noneConfigured, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ content: MANAGE_TEXT, components, flags: MessageFlags.Ephemeral });
}

export async function handleRoleToggleButton(interaction) {
  const roleId = roleIdFor(interaction.customId);
  if (!roleId) {
    await interaction.reply({ content: "That role isn't configured.", flags: MessageFlags.Ephemeral });
    return;
  }
  const member = interaction.member;
  try {
    const updated = member.roles.cache.has(roleId)
      ? await member.roles.remove(roleId, 'Self-service role toggle')
      : await member.roles.add(roleId, 'Self-service role toggle');
    await interaction.update({ content: MANAGE_TEXT, components: buildManageComponents(updated) });
  } catch (e) {
    await interaction.reply({ content: `Failed: ${e.message}`, flags: MessageFlags.Ephemeral });
  }
}
