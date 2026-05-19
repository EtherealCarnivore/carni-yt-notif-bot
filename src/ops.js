// Operator alerts — posts to a private #bot-status channel.
// Each alert has a key; same-key alerts within COOLDOWN_MS are suppressed to
// avoid spam when something fails on every reconcile cycle.

const COOLDOWN_MS = 30 * 60_000;
const cooldowns = new Map();

export async function notifyOps(client, key, message) {
  const channelId = process.env.BOT_STATUS_CHANNEL_ID;
  if (!channelId) return;

  const now = Date.now();
  const last = cooldowns.get(key);
  if (last && now - last < COOLDOWN_MS) return;
  cooldowns.set(key, now);

  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send(message);
  } catch (e) {
    console.error('notifyOps failed:', e.message);
  }
}

export function clearOpsCooldown(key) {
  cooldowns.delete(key);
}
