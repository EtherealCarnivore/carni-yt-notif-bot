import {
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import { issueUserLinkState, buildUserAuthUrl } from './discordAuth.js';
import { reconcile } from './reconcile.js';

const COMMANDS = [
  new SlashCommandBuilder()
    .setName('link-youtube')
    .setDescription('Link your YouTube account to sync your membership role.')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('admin-sync')
    .setDescription('(Owner only) Force a membership reconcile now.')
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

export function attachInteractionHandler(client) {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const ownerId = process.env.DISCORD_OWNER_USER_ID;

    try {
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
        if (interaction.user.id !== ownerId) {
          await interaction.reply({ content: 'Not authorized.', flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.reply({ content: 'Reconciling…', flags: MessageFlags.Ephemeral });
        reconcile(client)
          .then(() => interaction.followUp({ content: 'Done.', flags: MessageFlags.Ephemeral }).catch(() => {}))
          .catch(e => interaction.followUp({ content: `Failed: ${e.message}`, flags: MessageFlags.Ephemeral }).catch(() => {}));
        return;
      }
    } catch (e) {
      console.error('❌ interaction handler error:', e.message);
      if (interaction.deferred || interaction.replied) return;
      try { await interaction.reply({ content: `Error: ${e.message}`, flags: MessageFlags.Ephemeral }); } catch {}
    }
  });
}
