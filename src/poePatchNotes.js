// PoE update poster (hybrid sources):
//   - PoE1: the official news RSS (announcements + patch-note previews).
//   - PoE2: Steam's public News API, which carries content updates GGG posts
//     as community announcements. Chosen because the forum (where the granular
//     numbered notes live) is Cloudflare-protected and unreachable for a bot.
//
// For complete numbered patch notes + hotfixes, run PatchBot alongside — those
// only exist on the Cloudflare-gated forum and no public feed has them.
//
// Seen-IDs persist in the store so a restart/redeploy never silently swallows
// an update that dropped while the bot was down.

import Parser from 'rss-parser';
import { EmbedBuilder } from 'discord.js';
import { POE } from './copy.js';
import { store } from './membership/store.js';

const parser = new Parser();
const NEWS_FEED = process.env.POE_NEWS_RSS_URL || 'https://www.pathofexile.com/news/rss';
const STEAM_POE2_APPID = process.env.POE2_STEAM_APPID || '2694490';
const INTERVAL_MS = Number(process.env.POE_CHECK_INTERVAL_MIN || 10) * 60_000;
const SEEN_CAP = 200;

let running = false;

function classifyGame(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('path of exile 2') || t.includes('poe 2') || t.includes('poe2') || /\b0\.\d+/.test(title)) return 'poe2';
  if (/\b3\.\d+/.test(title) || t.includes('path of exile')) return 'poe1';
  return null;
}

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
function stripSteam(s) {
  // Steam contents use BBCode plus occasional HTML.
  return (s || '').replace(/\[\/?[^\]]+\]/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// PoE1 candidates from the news RSS (only PoE1-classified items).
async function fetchPoe1Items() {
  const feed = await parser.parseURL(NEWS_FEED);
  const out = [];
  for (const it of feed.items || []) {
    if (classifyGame(it.title) !== 'poe1') continue;
    out.push({
      id: `rss_${it.guid || it.link}`,
      game: 'poe1',
      title: it.title || 'Update',
      link: it.link || null,
      date: it.isoDate ? new Date(it.isoDate) : new Date(),
      desc: stripHtml(it.contentSnippet || it.content || ''),
    });
  }
  return out;
}

// PoE2 candidates from Steam, GGG community announcements only (drops press).
async function fetchPoe2Items() {
  const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${STEAM_POE2_APPID}&count=20&maxlength=600`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Steam news ${res.status}`);
  const data = await res.json();
  const out = [];
  for (const it of data.appnews?.newsitems || []) {
    if (it.feedname !== 'steam_community_announcements') continue;
    out.push({
      id: `steam_${it.gid}`,
      game: 'poe2',
      title: it.title || 'Update',
      link: it.url || null,
      date: new Date((it.date || 0) * 1000),
      desc: stripSteam(it.contents),
    });
  }
  return out;
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

async function postItem(client, item) {
  const channelId = channelFor(item.game);
  if (!channelId) return false;

  const gameLabel = item.game === 'poe2' ? POE.game2Label : POE.game1Label;
  const embed = new EmbedBuilder()
    .setColor(item.game === 'poe2' ? 0x8B0000 : 0xC79A6B)
    .setAuthor({ name: gameLabel })
    .setTitle((item.title || 'Update').slice(0, 250))
    .setURL(item.link || null)
    .setDescription((item.desc || '').slice(0, 500) || '​')
    .setTimestamp(item.date || new Date());

  const thumb = thumbFor(item.game);
  if (thumb) embed.setThumbnail(thumb);

  const ping = pingFor(item.game);
  const channel = await client.channels.fetch(channelId);
  await channel.send({
    content: ping ? `<@&${ping}>` : undefined,
    embeds: [embed],
    allowedMentions: ping ? { roles: [ping] } : undefined,
  });
  console.log(`🎮 Posted ${gameLabel}: ${item.title}`);
  return true;
}

async function gatherItems() {
  const items = [];
  try { items.push(...await fetchPoe1Items()); }
  catch (e) { console.error('🎮 PoE1 news RSS failed:', e.message); }
  try { items.push(...await fetchPoe2Items()); }
  catch (e) { console.error('🎮 PoE2 Steam API failed:', e.message); }
  return items;
}

async function poll(client) {
  if (running) return;
  running = true;
  try {
    const items = await gatherItems();
    if (items.length === 0) return;

    const state = await store.read();

    // First-ever run: baseline silently so we don't dump history.
    if (!state.poeBaselined) {
      await store.update(s => {
        s.poeSeenIds = items.map(i => i.id).slice(-SEEN_CAP);
        s.poeBaselined = true;
      });
      console.log(`🎮 PoE poller baselined (${items.length} items, no posts on first run)`);
      return;
    }

    const seen = new Set(state.poeSeenIds || []);
    const fresh = items
      .filter(i => !seen.has(i.id))
      .sort((a, b) => a.date - b.date); // oldest first → chronological posts

    if (fresh.length === 0) return;

    const newlySeen = [];
    for (const item of fresh) {
      try { await postItem(client, item); }
      catch (e) { console.error('🎮 post failed:', e.message); }
      newlySeen.push(item.id); // mark seen regardless, so we don't retry/backlog
    }

    await store.update(s => {
      const merged = [...(s.poeSeenIds || []), ...newlySeen];
      s.poeSeenIds = merged.slice(-SEEN_CAP);
    });
  } finally {
    running = false;
  }
}

// Force-post the latest item per game, bypassing the seen-set. For /test-poe.
export async function postLatestForTest(client) {
  const results = [];
  for (const [game, fetcher] of [['poe1', fetchPoe1Items], ['poe2', fetchPoe2Items]]) {
    if (!channelFor(game)) { results.push({ game, skipped: 'no channel configured' }); continue; }
    let items;
    try { items = await fetcher(); }
    catch (e) { results.push({ game, error: e.message }); continue; }
    if (!items.length) { results.push({ game, skipped: 'no items found in source' }); continue; }
    const latest = [...items].sort((a, b) => b.date - a.date)[0];
    try { await postItem(client, latest); results.push({ game, posted: latest.title }); }
    catch (e) { results.push({ game, error: e.message }); }
  }
  return { results };
}

export function startPoePatchPoller(client) {
  const enabled = !!(process.env.POE1_PATCH_CHANNEL_ID || process.env.POE2_PATCH_CHANNEL_ID);
  if (!enabled) {
    console.log('🎮 PoE updates disabled (no POE1_PATCH_CHANNEL_ID / POE2_PATCH_CHANNEL_ID set)');
    return;
  }
  console.log(`🎮 Starting PoE update poller (PoE1=news RSS, PoE2=Steam; every ${INTERVAL_MS / 60000} min)`);
  setInterval(() => poll(client).catch(e => console.error('🎮 PoE poll error:', e.message)), INTERVAL_MS);
  poll(client).catch(e => console.error('🎮 PoE initial poll error:', e.message));
}
