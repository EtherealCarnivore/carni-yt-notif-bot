// Map YouTube membership "levelDisplayName" → Discord role ID.
// The owner gives you the exact tier names from their /join page; fill in the
// role IDs you create in the Discord server.
export const TIER_TO_ROLE = {
  "BIG FAN's UWU":              "1505899564304175216",
  "Headset SAVINGS":            "1505899706901991424",
  "Saving for RAM Until 2029":  "1505899798719496292",
};

// Roles the bot is allowed to add/remove during reconcile. Any role on a
// member that is NOT in this set is left alone.
export const MANAGED_ROLES = new Set(Object.values(TIER_TO_ROLE));

export const RECONCILE_INTERVAL_MS =
  Number(process.env.RECONCILE_INTERVAL_MIN || 30) * 60_000;

// Months at which we celebrate a member's anniversary in the shoutout channel.
// Crossings are detected against the prior reconcile snapshot, so adding a
// milestone here will trigger it the next time a member crosses it.
export const MEMBERSHIP_MILESTONES = [1, 3, 6, 12, 24, 36, 48, 60];
