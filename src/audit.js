// Audit log — posts to BOT_AUDIT_CHANNEL_ID. Captures the things Discord's
// built-in audit log doesn't surface (deleted/edited messages) plus a
// human-readable trail of joins/leaves/bans for moderator visibility.
//
// Requires the MessageContent and GuildMessages intents on the client.

import { EmbedBuilder, Events, AuditLogEvent } from 'discord.js';

const MAX_CACHE = 5000;
const cache = new Map(); // messageId → { authorId, authorTag, channelId, content, attachments, createdAt }

function cacheMessage(msg) {
  if (!msg || msg.author?.bot) return;
  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(msg.id, {
    authorId: msg.author?.id,
    authorTag: msg.author?.tag,
    channelId: msg.channelId,
    content: msg.content ?? '',
    attachments: [...(msg.attachments?.values() || [])].map(a => a.url),
    createdAt: msg.createdTimestamp,
  });
}

function clip(s, n = 1000) {
  if (!s) return '*(empty)*';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

async function post(client, embed) {
  const channelId = process.env.BOT_AUDIT_CHANNEL_ID;
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('audit: post failed:', e.message);
  }
}

// Partial messages don't always resolve `.guild`, but they carry `.guildId`.
function inGuild(obj) {
  const gid = obj?.guildId || obj?.guild?.id;
  return gid === process.env.DISCORD_GUILD_ID;
}

export function attachAuditHandlers(client) {
  // Cache messages we see so we can show "before" content on edit/delete.
  client.on(Events.MessageCreate, (msg) => {
    if (!inGuild(msg)) return;
    cacheMessage(msg);
  });

  client.on(Events.MessageDelete, async (msg) => {
    if (!inGuild(msg)) return;
    const cached = cache.get(msg.id);
    const author = msg.author ?? (cached ? { id: cached.authorId, tag: cached.authorTag } : null);
    if (author?.bot) return;

    // Cross-reference the native audit log to find a moderator deletion.
    // Discord does NOT log self-deletions, so if nothing matches it was almost
    // certainly the author removing their own message.
    let deletedBy = null;
    try {
      const guild = msg.guild || client.guilds.cache.get(msg.guildId);
      if (guild) {
        const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 5 });
        const now = Date.now();
        const entry = logs.entries.find(e =>
          (now - e.createdTimestamp) < 10000 &&
          e.extra?.channel?.id === msg.channelId &&
          (!author?.id || e.target?.id === author.id)
        );
        if (entry) deletedBy = entry.executor;
      }
    } catch {
      // bot lacks View Audit Log, or fetch failed
    }

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🗑️ Message deleted')
      .addFields(
        { name: 'Author', value: author ? `<@${author.id}> (${author.tag || author.id})` : 'Unknown', inline: true },
        { name: 'Channel', value: `<#${msg.channelId}>`, inline: true },
        { name: 'Deleted by', value: deletedBy ? `<@${deletedBy.id}> (${deletedBy.tag})` : '*Self or untracked — Discord only logs deletions by others*', inline: true },
        { name: 'Content', value: clip(msg.content ?? cached?.content ?? '*(not cached)*') },
      )
      .setTimestamp(new Date());

    const attachments = cached?.attachments?.length ? cached.attachments.join('\n') : null;
    if (attachments) embed.addFields({ name: 'Attachments (urls expire)', value: clip(attachments) });

    cache.delete(msg.id);
    await post(client, embed);
  });

  client.on(Events.MessageBulkDelete, async (messages) => {
    const first = messages.first();
    if (!inGuild(first)) return;
    const lines = [];
    for (const m of messages.values()) {
      const c = cache.get(m.id);
      const author = m.author ?? (c ? { tag: c.authorTag } : null);
      lines.push(`**${author?.tag || 'Unknown'}**: ${clip(m.content ?? c?.content ?? '*(not cached)*', 200)}`);
      cache.delete(m.id);
    }
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle(`🗑️ Bulk delete (${messages.size} messages)`)
      .setDescription(clip(lines.join('\n'), 3500))
      .addFields({ name: 'Channel', value: `<#${first.channelId}>`, inline: true })
      .setTimestamp(new Date());
    await post(client, embed);
  });

  client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
    if (!inGuild(newMsg)) return;
    // Resolve a partial so we have author/content for the "after" side.
    if (newMsg.partial) {
      try { newMsg = await newMsg.fetch(); } catch { return; }
    }
    if (newMsg.author?.bot) return;
    // Sometimes "update" fires for pin/embed changes — skip if content didn't change.
    const before = oldMsg?.content ?? cache.get(newMsg.id)?.content ?? null;
    const after = newMsg.content ?? '';
    if (before === after) {
      cacheMessage(newMsg);
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('✏️ Message edited')
      .addFields(
        { name: 'Author', value: `<@${newMsg.author.id}> (${newMsg.author.tag})`, inline: true },
        { name: 'Channel', value: `<#${newMsg.channelId}>`, inline: true },
        { name: 'Before', value: clip(before ?? '*(not cached)*') },
        { name: 'After', value: clip(after) },
        { name: 'Jump', value: `[click](${newMsg.url})` },
      )
      .setTimestamp(new Date());
    cacheMessage(newMsg);
    await post(client, embed);
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.guild.id !== process.env.DISCORD_GUILD_ID) return;
    const ageDays = Math.floor((Date.now() - member.user.createdAt.getTime()) / (24 * 60 * 60_000));
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('📥 Member joined')
      .setDescription(`<@${member.id}> (${member.user.tag})`)
      .addFields(
        { name: 'Account age', value: `${ageDays} day${ageDays === 1 ? '' : 's'}`, inline: true },
        { name: 'Account created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      )
      .setTimestamp(new Date());
    await post(client, embed);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    if (member.guild.id !== process.env.DISCORD_GUILD_ID) return;

    // Cross-reference the native audit log to see if this was a kick.
    let kick = null;
    try {
      const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 5 });
      const entry = logs.entries.find(e =>
        e.target?.id === member.id && (Date.now() - e.createdTimestamp) < 8000
      );
      if (entry) kick = { executor: entry.executor, reason: entry.reason };
    } catch {
      // Bot lacks View Audit Log permission, or the fetch failed — fall back
      // to a plain "left" entry.
    }

    const embed = new EmbedBuilder().setTimestamp(new Date());
    if (kick) {
      embed
        .setColor(0xED4245)
        .setTitle('👢 Member kicked')
        .setDescription(`<@${member.id}> (${member.user.tag})`)
        .addFields(
          { name: 'Kicked by', value: kick.executor ? `<@${kick.executor.id}> (${kick.executor.tag})` : 'Unknown', inline: true },
          { name: 'Reason', value: kick.reason || '*(none)*' },
        );
    } else {
      embed
        .setColor(0x747F8D)
        .setTitle('📤 Member left')
        .setDescription(`<@${member.id}> (${member.user.tag})`);
    }
    await post(client, embed);
  });

  client.on(Events.GuildBanAdd, async (ban) => {
    if (ban.guild.id !== process.env.DISCORD_GUILD_ID) return;
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🔨 Member banned')
      .setDescription(`<@${ban.user.id}> (${ban.user.tag})`)
      .addFields({ name: 'Reason', value: ban.reason || '*(none)*' })
      .setTimestamp(new Date());
    await post(client, embed);
  });

  client.on(Events.GuildBanRemove, async (ban) => {
    if (ban.guild.id !== process.env.DISCORD_GUILD_ID) return;
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🔓 Ban removed')
      .setDescription(`<@${ban.user.id}> (${ban.user.tag})`)
      .setTimestamp(new Date());
    await post(client, embed);
  });
}
