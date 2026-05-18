import { store } from './store.js';
import { getAuthedClient, isExpiredAuthError } from './googleAuth.js';
import { fetchAllMembers } from './youtube.js';
import { TIER_TO_ROLE, MANAGED_ROLES } from './config.js';
import { issueOwnerLinkState } from './discordAuth.js';
import { buildConsentUrl } from './googleAuth.js';

let running = false;
let lastOwnerDmAt = 0;
const OWNER_DM_COOLDOWN_MS = 6 * 60 * 60_000;

async function dmOwnerRelink(client) {
  const now = Date.now();
  if (now - lastOwnerDmAt < OWNER_DM_COOLDOWN_MS) return;
  lastOwnerDmAt = now;

  const ownerId = process.env.DISCORD_OWNER_USER_ID;
  if (!ownerId) return;
  try {
    const state = issueOwnerLinkState(ownerId);
    const url = buildConsentUrl(state);
    const user = await client.users.fetch(ownerId);
    await user.send(
      `🔑 YouTube membership link expired (Google testing-mode token TTL).\n` +
      `Tap to re-authorize so role sync keeps working:\n${url}`
    );
    console.log('📨 Owner DM sent: re-auth required');
  } catch (e) {
    console.error('❌ Could not DM owner for re-auth:', e.message);
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
    let authClient;
    try {
      authClient = await getAuthedClient();
    } catch (e) {
      if (isExpiredAuthError(e)) {
        console.warn('⚠️ reconcile: Google auth needs re-link');
        await dmOwnerRelink(client);
        return;
      }
      throw e;
    }

    let members;
    try {
      members = await fetchAllMembers(authClient);
    } catch (e) {
      if (isExpiredAuthError(e)) {
        console.warn('⚠️ reconcile: refresh token rejected, needs re-link');
        await dmOwnerRelink(client);
        return;
      }
      console.error('❌ reconcile: members.list failed:', e.message);
      return;
    }

    const tierByChannel = new Map(members.map(m => [m.channelId, m.tierName]));
    console.log(`🔁 reconcile: ${members.length} active members fetched`);

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
  } finally {
    running = false;
  }
}
