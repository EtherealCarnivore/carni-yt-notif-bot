// Path of Exile patch-note poller. PoE publishes one combined news RSS feed
// for both games, so we filter to patch notes / hotfixes and classify each by
// version (PoE1 = 3.x, PoE2 = 0.x) to route to separate channels.

import Parser from 'rss-parser';
import { EmbedBuilder } from 'discord.js';

const parser = new Parser();
const FEED = process.env.POE_NEWS_RSS_URL || 'https://www.pathofexile.com/news/rss';
const INTERVAL_MS = Number(process.env.POE_CHECK_INTERVAL_MIN || 10) * 60_000;

const seen = new Set();
let initialized = false;

function isPatchNote(title) {
  return /patch note|hotfix/i.test(title || '');
}

// Returns 'poe1', 'poe2', or null if we can't tell.
function classifyGame(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('path of exile 2') || t.includes('poe 2') || t.includes('poe2') || /\b0\.\d+/.test(title)) {
    return 'poe2';
  }
  if (/\b3\.\d+/.test(title) || t.includes('path of exile')) {
    return 'poe1';
  }
  return null;
}

function channelFor(game) {
  return game === 'poe2' ? process.env.POE2_PATCH_CHANNEL_ID : process.env.POE1_PATCH_CHANNEL_ID;
}
function pingFor(game) {
  return game === 'poe2' ? process.env.POE2_PING_ROLE_ID : process.env.POE1_PING_ROLE_ID;
}
function thumbFor(game) {
  return game === 'poe2' ? process.env.POE2_THUMBNAIL_URL : process.env.POE1_THUMBNAIL_URL;
}

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function postPatchNote(client, channelId, game, item) {
  const gameLabel = game === 'poe2' ? 'Path of Exile 2' : 'Path of Exile';
  const desc = stripHtml(item.contentSnippet || item.content || item.summary || '').slice(0, 500);

  const embed = new EmbedBuilder()
    .setColor(game === 'poe2' ? 0x8B0000 : 0xC79A6B)
    .setAuthor({ name: gameLabel })
    .setTitle((item.title || 'Patch Notes').slice(0, 250))
    .setURL(item.link || null)
    .setDescription(desc || '​')
    .setTimestamp(item.isoDate ? new Date(item.isoDate) : new Date());

  const thumb = thumbFor(game);
  if (thumb) embed.setThumbnail(thumb);

  const ping = pingFor(game);
  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send({
      content: ping ? `<@&${ping}>` : undefined,
      embeds: [embed],
      allowedMentions: ping ? { roles: [ping] } : undefined,
    });
    console.log(`🎮 Posted ${gameLabel} patch note: ${item.title}`);
  } catch (e) {
    console.error(`🎮 PoE post failed (${gameLabel}):`, e.message);
  }
}

async function poll(client) {
  let feed;
  try {
    feed = await parser.parseURL(FEED);
  } catch (e) {
    console.error('🎮 PoE feed poll failed:', e.message);
    return;
  }

  const patchItems = (feed.items || []).filter(it => isPatchNote(it.title));

  // First run: baseline existing items silently so we don't dump history.
  if (!initialized) {
    for (const it of patchItems) seen.add(it.guid || it.link);
    initialized = true;
    console.log(`🎮 PoE patch poller initialized (${patchItems.length} existing patch notes baselined)`);
    return;
  }

  // Post oldest-first so multiple new notes land in chronological order.
  for (const it of [...patchItems].reverse()) {
    const id = it.guid || it.link;
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const game = classifyGame(it.title);
    if (!game) {
      console.log(`🎮 PoE: could not classify "${it.title}" — skipping`);
      continue;
    }
    const channelId = channelFor(game);
    if (!channelId) continue; // that game's channel isn't configured
    await postPatchNote(client, channelId, game, it);
  }
}

export function startPoePatchPoller(client) {
  const enabled = !!(process.env.POE1_PATCH_CHANNEL_ID || process.env.POE2_PATCH_CHANNEL_ID);
  if (!enabled) {
    console.log('🎮 PoE patch notes disabled (no POE1_PATCH_CHANNEL_ID / POE2_PATCH_CHANNEL_ID set)');
    return;
  }
  console.log(`🎮 Starting PoE patch poller (every ${INTERVAL_MS / 60000} min)`);
  setInterval(() => poll(client).catch(e => console.error('🎮 PoE poll error:', e.message)), INTERVAL_MS);
  poll(client).catch(e => console.error('🎮 PoE initial poll error:', e.message));
}
