// Verification gate. New joiners get @Unverified (one channel visible). They
// click a button to swap to @Verified. Optional captcha (Cloudflare Turnstile)
// inserts itself between the button click and the role swap.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  MessageFlags,
} from 'discord.js';
import { issueCaptchaState } from './captcha.js';

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

// Idempotent role swap. Called from both the button-direct path and the
// captcha-callback path. Returns { ok, reason }.
export async function assignVerifiedRole(client, discordUserId) {
  const unverifiedRoleId = process.env.DISCORD_UNVERIFIED_ROLE_ID;
  const verifiedRoleId = process.env.DISCORD_VERIFIED_ROLE_ID;
  if (!verifiedRoleId) return { ok: false, reason: 'not_configured' };

  const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID).catch(() => null);
  if (!guild) return { ok: false, reason: 'no_guild' };

  const member = await guild.members.fetch(discordUserId).catch(() => null);
  if (!member) return { ok: false, reason: 'not_in_guild' };

  if (member.roles.cache.has(verifiedRoleId)) {
    return { ok: true, reason: 'already_verified' };
  }

  try {
    if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
      await member.roles.remove(unverifiedRoleId, 'Verified');
    }
    await member.roles.add(verifiedRoleId, 'Verified');
    console.log(`✅ Verified ${member.user.tag}`);
    return { ok: true };
  } catch (e) {
    console.error('❌ assignVerifiedRole failed:', e.message);
    return { ok: false, reason: e.message };
  }
}

export async function handleVerifyButton(interaction) {
  if (!process.env.DISCORD_VERIFIED_ROLE_ID) {
    await interaction.reply({ content: 'Verification is not configured. Ping a mod.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Account-age check (cheap pre-filter; happens before captcha so we don't
  // waste a Turnstile load on accounts that can't proceed anyway).
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
  if (member?.roles?.cache?.has(process.env.DISCORD_VERIFIED_ROLE_ID)) {
    await interaction.reply({ content: 'You are already verified.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Branch: Turnstile if configured, else direct role swap.
  if (process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY && process.env.PUBLIC_BASE_URL) {
    const state = issueCaptchaState(interaction.user.id);
    const url = `${process.env.PUBLIC_BASE_URL}/verify/captcha?state=${state}`;
    await interaction.reply({
      content:
        `One more step: click here to complete the human check → <${url}>\n` +
        `Link expires in 10 minutes.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const result = await assignVerifiedRole(interaction.client, interaction.user.id);
  if (result.ok) {
    await interaction.reply({ content: '✅ Verified. Welcome in.', flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content: `Failed to verify: ${result.reason}`, flags: MessageFlags.Ephemeral });
  }
}
