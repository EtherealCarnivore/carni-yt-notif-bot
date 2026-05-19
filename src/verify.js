// Verification gate. New joiners get @Unverified (one channel visible). They
// click a button to swap to @Verified. Optional account-age gate filters out
// very-new accounts (bot-friendly heuristic).

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  MessageFlags,
} from 'discord.js';

export const VERIFY_BUTTON_ID = 'verify_human';

function minAgeMs() {
  const days = Number(process.env.MIN_ACCOUNT_AGE_DAYS || 7);
  return days * 24 * 60 * 60_000;
}

export function buildVerifyEmbed() {
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('Verify you are human')
    .setDescription(
      'Welcome! To access the rest of the server, click the button below.\n\n' +
      'This is a quick anti-bot check — no account info is shared, just a click.'
    )
    .setFooter({ text: 'Trouble? DM a moderator.' });
}

export function buildVerifyRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(VERIFY_BUTTON_ID)
      .setLabel('I am human')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
  );
}

export function attachVerifyJoinHandler(client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;
    if (member.guild.id !== process.env.DISCORD_GUILD_ID) return;
    const unverifiedRoleId = process.env.DISCORD_UNVERIFIED_ROLE_ID;
    if (!unverifiedRoleId) return;
    try {
      await member.roles.add(unverifiedRoleId, 'Default unverified role on join');
      console.log(`🛂 Assigned Unverified to ${member.user.tag}`);
    } catch (e) {
      console.error(`❌ Could not assign Unverified to ${member.user.tag}:`, e.message);
    }
  });
}

export async function handleVerifyButton(interaction) {
  const unverifiedRoleId = process.env.DISCORD_UNVERIFIED_ROLE_ID;
  const verifiedRoleId = process.env.DISCORD_VERIFIED_ROLE_ID;
  if (!verifiedRoleId) {
    await interaction.reply({ content: 'Verification is not configured. Ping a mod.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Account-age check
  const accountAgeMs = Date.now() - interaction.user.createdAt.getTime();
  if (accountAgeMs < minAgeMs()) {
    const days = Math.ceil((minAgeMs() - accountAgeMs) / (24 * 60 * 60_000));
    await interaction.reply({
      content:
        `Your Discord account is too new to be verified automatically. ` +
        `Try again in **~${days} day${days === 1 ? '' : 's'}**, or DM a mod for manual review.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = interaction.member;
  if (!member) {
    await interaction.reply({ content: 'Could not resolve your guild membership.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (member.roles.cache.has(verifiedRoleId)) {
    await interaction.reply({ content: 'You are already verified.', flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
      await member.roles.remove(unverifiedRoleId, 'Verified via button');
    }
    await member.roles.add(verifiedRoleId, 'Verified via button');
    await interaction.reply({ content: '✅ Verified. Welcome in.', flags: MessageFlags.Ephemeral });
    console.log(`✅ Verified ${interaction.user.tag}`);
  } catch (e) {
    console.error('❌ verify role swap failed:', e.message);
    await interaction.reply({ content: `Failed to verify: ${e.message}`, flags: MessageFlags.Ephemeral });
  }
}
