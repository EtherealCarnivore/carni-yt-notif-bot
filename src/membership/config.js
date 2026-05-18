// Map YouTube membership "levelDisplayName" → Discord role ID.
// The owner gives you the exact tier names from their /join page; fill in the
// role IDs you create in the Discord server.
export const TIER_TO_ROLE = {
  // "Tier 1 Name": "discord_role_id_for_tier_1",
  // "Tier 2 Name": "discord_role_id_for_tier_2",
  // "Tier 3 Name": "discord_role_id_for_tier_3",
};

// Roles the bot is allowed to add/remove during reconcile. Any role on a
// member that is NOT in this set is left alone.
export const MANAGED_ROLES = new Set(Object.values(TIER_TO_ROLE));

export const RECONCILE_INTERVAL_MS =
  Number(process.env.RECONCILE_INTERVAL_MIN || 30) * 60_000;
