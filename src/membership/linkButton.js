import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { issueUserLinkState, buildUserAuthUrl } from './discordAuth.js';

export const LINK_YT_BUTTON_ID = 'link_yt';

export function buildLinkYouTubeRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(LINK_YT_BUTTON_ID)
      .setLabel('Link YouTube')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Primary),
  );
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
