import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { issueUserLinkState, buildUserAuthUrl } from './discordAuth.js';
import { TIER_TO_ROLE, TIER_TO_CHANNEL } from './config.js';
import { LINK_YOUTUBE, VIDEO, PERKS } from '../copy.js';

export const LINK_YT_BUTTON_ID = 'link_yt';

function channelUrl() {
  return process.env.YOUTUBE_CHANNEL_URL || 'https://www.youtube.com/@Iva_m1';
}

export function buildLinkYouTubeRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(LINK_YT_BUTTON_ID)
      .setLabel(LINK_YOUTUBE.buttonLabel)
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Primary),
  );
}

// Row for new-video notifications: Subscribe + All Videos (link buttons),
// plus the Link YouTube interaction button when membership sync is on.
export function buildVideoNotificationRow(includeLinkButton) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(VIDEO.subscribeLabel)
      .setEmoji('🔔')
      .setStyle(ButtonStyle.Link)
      .setURL(`${channelUrl()}?sub_confirmation=1`),
    new ButtonBuilder()
      .setLabel(VIDEO.allVideosLabel)
      .setEmoji('📺')
      .setStyle(ButtonStyle.Link)
      .setURL(`${channelUrl()}/videos`),
  );
  if (includeLinkButton) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(LINK_YT_BUTTON_ID)
        .setLabel(LINK_YOUTUBE.buttonLabel)
        .setEmoji('🔗')
        .setStyle(ButtonStyle.Primary),
    );
  }
  return row;
}

export function buildLinkYouTubeEmbed() {
  return new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle(LINK_YOUTUBE.embedTitle)
    .setDescription(LINK_YOUTUBE.embedDescription)
    .setFooter({ text: LINK_YOUTUBE.embedFooter });
}

export async function handleLinkYouTubeButton(interaction) {
  const state = issueUserLinkState(interaction.user.id);
  const url = buildUserAuthUrl(state);
  await interaction.reply({
    content: LINK_YOUTUBE.authorizeReply(url),
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
    : [PERKS.noTiers];

  return new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle(PERKS.title)
    .setDescription(
      `${PERKS.intro}\n\n` +
      lines.join('\n') +
      `\n\n${PERKS.cascadeNote}\n\n` +
      PERKS.howTo
    )
    .setFooter({ text: PERKS.footer });
}

export function buildPerksRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(PERKS.getMembershipLabel)
      .setEmoji('🔔')
      .setStyle(ButtonStyle.Link)
      .setURL(`${channelUrl()}/join`),
    new ButtonBuilder()
      .setCustomId(LINK_YT_BUTTON_ID)
      .setLabel(LINK_YOUTUBE.buttonLabel)
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Primary),
  );
}
