import { Events } from 'discord.js';
import { buildLinkYouTubeRow, buildLinkYouTubeEmbed } from './linkButton.js';
import { WELCOME } from '../copy.js';

export function attachWelcomeDmHandler(client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;
    if (member.guild.id !== process.env.DISCORD_GUILD_ID) return;
    try {
      await member.send({
        content: WELCOME.joinDmGreeting(member.guild.name),
        embeds: [buildLinkYouTubeEmbed()],
        components: [buildLinkYouTubeRow()],
      });
      console.log(`📨 Welcome DM sent to ${member.user.tag}`);
    } catch (e) {
      // Most common cause: user has server-DMs disabled. Not actionable on our side.
      console.log(`ℹ️ Could not DM ${member.user.tag} (likely DMs closed): ${e.message}`);
    }
  });
}
