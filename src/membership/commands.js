import {
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { issueUserLinkState, buildUserAuthUrl } from './discordAuth.js';
import { reconcile } from './reconcile.js';
import {
  LINK_YT_BUTTON_ID,
  buildLinkYouTubeRow,
  buildLinkYouTubeEmbed,
  handleLinkYouTubeButton,
  buildPerksEmbed,
  buildPerksRow,
} from './linkButton.js';
import {
  VERIFY_BUTTON_ID,
  buildVerifyEmbed,
  buildVerifyRow,
  handleVerifyButton,
} from '../verify.js';
import { applyLockdown, liftLockdown } from '../lockdown.js';
import {
  isRoleToggleButton,
  isRoleMenuOpen,
  handleRoleToggleButton,
  handleRoleMenuOpen,
  buildRolePickerEmbed,
  buildRolePickerRow,
} from '../rolePicker.js';

const COMMANDS = [
  new SlashCommandBuilder()
    .setName('link-youtube')
    .setDescription('Link your YouTube account to sync your membership role.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('admin-sync')
    .setDescription('(Admin) Force a membership reconcile now.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('admin-post-link-message')
    .setDescription('(Admin) Post the "Link YouTube" button in this channel.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('admin-post-verify-message')
    .setDescription('(Admin) Post the "Verify I am human" button in this channel.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('admin-post-perks')
    .setDescription('(Admin) Post the membership perks board in this channel.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('admin-post-roles')
    .setDescription('(Admin) Post the self-service notification role picker in this channel.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('emergency')
    .setDescription('(Admin) Emergency server lockdown controls.')
    .addSubcommand(s => s
      .setName('mute')
      .setDescription('Deny Send Messages for the verified role across all text channels.'))
    .addSubcommand(s => s
      .setName('quarantine')
      .setDescription('Deny View Channel for the verified role across all text channels (nuclear).'))
    .addSubcommand(s => s
      .setName('unlock')
      .setDescription('Restore permissions previously changed by mute or quarantine.'))
    .toJSON(),
];

export async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const appId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!appId || !guildId) {
    console.warn('⚠️ Skipping slash command registration (missing DISCORD_CLIENT_ID or DISCORD_GUILD_ID)');
    return;
  }
  await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: COMMANDS });
  console.log(`✅ Registered ${COMMANDS.length} slash commands in guild ${guildId}`);
}

function isAdmin(interaction) {
  if (interaction.user.id === process.env.DISCORD_OWNER_USER_ID) return true;
  const perms = interaction.member?.permissions;
  return !!(perms && typeof perms.has === 'function' && perms.has(PermissionFlagsBits.ManageGuild));
}

async function denyIfNotAdmin(interaction) {
  if (isAdmin(interaction)) return false;
  await interaction.reply({ content: 'Not authorized. Requires Manage Server permission.', flags: MessageFlags.Ephemeral });
  return true;
}

export function attachInteractionHandler(client) {
  client.on('interactionCreate', async (interaction) => {
    try {
      // ---- Button clicks ----
      if (interaction.isButton && interaction.isButton()) {
        if (interaction.customId === LINK_YT_BUTTON_ID) {
          await handleLinkYouTubeButton(interaction);
        } else if (interaction.customId === VERIFY_BUTTON_ID) {
          await handleVerifyButton(interaction);
        } else if (isRoleMenuOpen(interaction.customId)) {
          await handleRoleMenuOpen(interaction);
        } else if (isRoleToggleButton(interaction.customId)) {
          await handleRoleToggleButton(interaction);
        }
        return;
      }

      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === 'link-youtube') {
        const state = issueUserLinkState(interaction.user.id);
        const url = buildUserAuthUrl(state);
        await interaction.reply({
          content:
            `Click to link your YouTube account: <${url}>\n` +
            `If you don't have YouTube connected in Discord yet: ` +
            `**User Settings → Connections → Add → YouTube** first.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.commandName === 'admin-sync') {
        if (await denyIfNotAdmin(interaction)) return;
        await interaction.reply({ content: 'Reconciling…', flags: MessageFlags.Ephemeral });
        reconcile(interaction.client)
          .then(() => interaction.followUp({ content: 'Done.', flags: MessageFlags.Ephemeral }).catch(() => {}))
          .catch(e => interaction.followUp({ content: `Failed: ${e.message}`, flags: MessageFlags.Ephemeral }).catch(() => {}));
        return;
      }

      if (interaction.commandName === 'admin-post-link-message') {
        if (await denyIfNotAdmin(interaction)) return;
        await interaction.channel.send({
          embeds: [buildLinkYouTubeEmbed()],
          components: [buildLinkYouTubeRow()],
        });
        await interaction.reply({ content: 'Posted. Pin the message so it stays visible.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.commandName === 'admin-post-verify-message') {
        if (await denyIfNotAdmin(interaction)) return;
        await interaction.channel.send({
          embeds: [buildVerifyEmbed()],
          components: [buildVerifyRow()],
        });
        await interaction.reply({ content: 'Posted. Pin the message so it stays visible.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.commandName === 'admin-post-perks') {
        if (await denyIfNotAdmin(interaction)) return;
        await interaction.channel.send({
          embeds: [buildPerksEmbed()],
          components: [buildPerksRow()],
        });
        await interaction.reply({ content: 'Posted. Pin it. Re-run after editing tiers/channels to refresh (delete the old one).', flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.commandName === 'admin-post-roles') {
        if (await denyIfNotAdmin(interaction)) return;
        await interaction.channel.send({
          embeds: [buildRolePickerEmbed()],
          components: [buildRolePickerRow()],
        });
        await interaction.reply({ content: 'Posted. Pin the message so it stays visible.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.commandName === 'emergency') {
        if (await denyIfNotAdmin(interaction)) return;
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          if (sub === 'mute' || sub === 'quarantine') {
            const { lockedCount } = await applyLockdown(interaction.guild, sub);
            await interaction.editReply(`🚨 Lockdown **${sub}** applied across ${lockedCount} channel(s). Run \`/emergency unlock\` to restore.`);
          } else if (sub === 'unlock') {
            const { unlockedCount, alreadyUnlocked } = await liftLockdown(interaction.guild);
            if (alreadyUnlocked) {
              await interaction.editReply('Nothing to unlock — no active lockdown recorded.');
            } else {
              await interaction.editReply(`🔓 Restored permissions on ${unlockedCount} channel(s).`);
            }
          }
        } catch (e) {
          await interaction.editReply(`Failed: ${e.message}`);
        }
        return;
      }
    } catch (e) {
      console.error('❌ interaction handler error:', e.message);
      if (interaction.deferred || interaction.replied) return;
      try { await interaction.reply({ content: `Error: ${e.message}`, flags: MessageFlags.Ephemeral }); } catch {}
    }
  });
}
