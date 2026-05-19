import { store } from './store.js';
import { getYouTubeAccessToken } from './streamElements.js';
import { fetchAllMembers, fetchChannelStats } from './youtube.js';
import { TIER_TO_ROLE, MANAGED_ROLES } from './config.js';
import { checkAnniversaries } from './anniversaries.js';
import { notifyOps } from '../ops.js';

let running = false;
let lastOwnerDmAt = 0;
const OWNER_DM_COOLDOWN_MS = 6 * 60 * 60_000;

let consecutiveMembersFailures = 0;
const MEMBERS_FAIL_ALERT_THRESHOLD = 3;

let lastYtMemberCount = null;
let lastSubscriberCount = null;
export function getLastYtMemberCount() { return lastYtMemberCount; }
export function getLastSubscriberCount() { return lastSubscriberCount; }

async function dmOwner(client, message) {
  const now = Date.now();
  if (now - lastOwnerDmAt < OWNER_DM_COOLDOWN_MS) return;
  lastOwnerDmAt = now;

  const ownerId = process.env.DISCORD_OWNER_USER_ID;
  if (!ownerId) return;
  try {
    const user = await client.users.fetch(ownerId);
    await user.send(message);
    console.log('📨 Owner DM sent');
  } catch (e) {
    console.error('❌ Could not DM owner:', e.message);
  }
}

export async function reconcile(client) {
  if (running) {
    console.log('⏭️  reconcile: already running, skipping');
    return;
  }
  if (Object.keys(TIER_TO_ROLE).length === 0) {
    console.log('⏭️  reconcile: TIER_TO_ROLE is empty, skipping');
    return;
  }
  running = true;
  try {
    let accessToken;
    try {
      accessToken = await getYouTubeAccessToken();
    } catch (e) {
      console.error('❌ reconcile: could not get YT token via StreamElements:', e.message);
      if (e.code === 'SE_JWT_INVALID' || e.code === 'SE_JWT_MISSING') {
        await dmOwner(client,
          '⚠️ StreamElements JWT is missing or invalid. The membership-tier role sync is paused. ' +
          'Update the `SE_JWT` env var on Railway with a fresh token from streamelements.com → Account → Show secrets.'
        );
        await notifyOps(client, 'se_jwt_invalid', `🚨 **SE_JWT invalid or missing** — membership sync paused. Owner has been DM'd.`);
      } else if (e.code === 'SE_NO_YT_TOKEN') {
        await dmOwner(client,
          '⚠️ StreamElements returned no YouTube access token. Re-link your YouTube channel in StreamElements account settings.'
        );
        await notifyOps(client, 'se_no_yt_token', `🚨 **SE returned no YouTube token** — owner needs to re-link YT in StreamElements.`);
      } else {
        await notifyOps(client, 'se_request_failed', `⚠️ SE relay request failed: \`${e.message}\``);
      }
      return;
    }

    let members;
    try {
      members = await fetchAllMembers(accessToken);
      consecutiveMembersFailures = 0;
    } catch (e) {
      console.error('❌ reconcile: members.list failed:', e.message);
      if (e.body) {
        try { console.error('   API error detail:', JSON.stringify(e.body)); }
        catch { console.error('   API error detail (unstringifiable):', e.body); }
      }
      consecutiveMembersFailures++;
      if (consecutiveMembersFailures >= MEMBERS_FAIL_ALERT_THRESHOLD) {
        await notifyOps(client, 'members_list_failed',
          `🚨 **members.list failed ${consecutiveMembersFailures}× in a row.** Last error: \`${e.message}\``);
      }
      return;
    }

    const tierByChannel = new Map(members.map(m => [m.channelId, m.tierName]));
    lastYtMemberCount = members.length;
    console.log(`🔁 reconcile: ${members.length} active members fetched`);

    try {
      const stats = await fetchChannelStats(accessToken);
      if (stats?.subscriberCount != null) {
        lastSubscriberCount = stats.subscriberCount;
        console.log(`🔁 reconcile: subscriber count = ${stats.subscriberCount}`);
      }
    } catch (e) {
      console.warn('⚠️ reconcile: channels.list failed (subscriber count won\'t update this cycle):', e.message);
    }

    const { links } = await store.read();
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);

    let added = 0, removed = 0, skipped = 0;
    for (const [discordUserId, link] of Object.entries(links)) {
      const member = await guild.members.fetch(discordUserId).catch(() => null);
      if (!member) { skipped++; continue; }

      const tier = tierByChannel.get(link.youtubeChannelId);
      const targetRoleId = tier ? TIER_TO_ROLE[tier] : null;
      if (tier && !targetRoleId) {
        console.warn(`⚠️ Unknown YouTube tier "${tier}" — add it to TIER_TO_ROLE`);
      }

      const currentManaged = member.roles.cache.filter(r => MANAGED_ROLES.has(r.id));
      const toRemove = currentManaged.filter(r => r.id !== targetRoleId).map(r => r.id);
      const needsAdd = targetRoleId && !currentManaged.has(targetRoleId);

      for (const id of toRemove) {
        try { await member.roles.remove(id, 'YouTube membership sync'); removed++; }
        catch (e) { console.error(`❌ remove role failed for ${discordUserId}:`, e.message); }
      }
      if (needsAdd) {
        try { await member.roles.add(targetRoleId, 'YouTube membership sync'); added++; }
        catch (e) { console.error(`❌ add role failed for ${discordUserId}:`, e.message); }
      }
    }
    console.log(`✅ reconcile done — added:${added} removed:${removed} skipped:${skipped}`);

    try {
      await checkAnniversaries(client, members);
    } catch (e) {
      console.error('🎂 anniversary check failed:', e.message);
    }
  } finally {
    running = false;
  }
}
