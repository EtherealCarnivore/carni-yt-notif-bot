import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { issueUserLinkState, buildUserAuthUrl } from './discordAuth.js';
import { TIER_TO_ROLE, TIER_TO_CHANNEL } from './config.js';

export const LINK_YT_BUTTON_ID = 'link_yt';

function channelUrl() {
  return process.env.YOUTUBE_CHANNEL_URL || 'https://www.youtube.com/@Iva_m1';
}

export function buildLinkYouTubeRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(LINK_YT_BUTTON_ID)
      .setLabel('Link YouTube')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Primary),
  );
}

// Row for new-video notifications: Subscribe + All Videos (link buttons),
// plus the Link YouTube interaction button when membership sync is on.
export function buildVideoNotificationRow(includeLinkButton) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Subscribe')
      .setEmoji('🔔')
      .setStyle(ButtonStyle.Link)
      .setURL(`${channelUrl()}?sub_confirmation=1`),
    new ButtonBuilder()
      .setLabel('All Videos')
      .setEmoji('📺')
      .setStyle(ButtonStyle.Link)
      .setURL(`${channelUrl()}/videos`),
  );
  if (includeLinkButton) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(LINK_YT_BUTTON_ID)
        .setLabel('Link YouTube')
        .setEmoji('🔗')
        .setStyle(ButtonStyle.Primary),
    );
  }
  return row;
}

export function buildLinkYouTubeEmbed() {
  return new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('Got a YouTube membership for Iva Markova?')
    .setDescription(
      'Click the button below to link your YouTube account and **automatically get your member role** in this server.\n\n' +
      '**Before you click:** make sure your YouTube account is connected to Discord.\n' +
      'In Discord: **User Settings → Connections → Add → YouTube** — and sign in with the YouTube account that has the membership.\n\n' +
      'Channel: https://www.youtube.com/@Iva_m1'
    )
    .setFooter({ text: 'Roles sync automatically when your tier changes or expires.' });
}

export async function handleLinkYouTubeButton(interaction) {
  const state = issueUserLinkState(interaction.user.id);
  const url = buildUserAuthUrl(state);
  await interaction.reply({
    content:
      `Click here to authorize: <${url}>\n\n` +
      `If Discord says "No YouTube connection found", add it under **User Settings → Connections → YouTube** first, then click the button again.`,
    flags: MessageFlags.Ephemeral,
  });
}

// Perks board — lists each tier and the channel it unlocks, ordered from the
// config (lowest tier first). Tier names come from TIER_TO_ROLE so it stays
// in sync; channel links come from TIER_TO_CHANNEL (optional per tier).
export function buildPerksEmbed() {
  const tiers = Object.keys(TIER_TO_ROLE);
  const medals = ['🥉', '🥈', '🥇'];
  const lines = tiers.length
    ? tiers.map((tier, i) => {
        const medal = medals[i] || '💎';
        const channelId = TIER_TO_CHANNEL[tier];
        const channelPart = channelId ? ` → <#${channelId}>` : '';
        return `${medal} **${tier}**${channelPart}`;
      })
    : ['*(no tiers configured yet)*'];

  return new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('🔓 Membership Perks')
    .setDescription(
      'Become a channel member to unlock these exclusive channels:\n\n' +
      lines.join('\n') +
      '\n\nHigher tiers include everything in the tiers below them.\n\n' +
      '**How to unlock:**\n' +
      '1. Get a membership — tap **Get Membership** below.\n' +
      '2. Connect YouTube to Discord (User Settings → Connections → YouTube).\n' +
      '3. Tap **Link YouTube** to claim your role.'
    )
    .setFooter({ text: 'Roles sync automatically — upgrades, downgrades, and cancellations all update.' });
}

export function buildPerksRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Get Membership')
      .setEmoji('🔔')
      .setStyle(ButtonStyle.Link)
      .setURL(`${channelUrl()}/join`),
    new ButtonBuilder()
      .setCustomId(LINK_YT_BUTTON_ID)
      .setLabel('Link YouTube')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Primary),
  );
}
