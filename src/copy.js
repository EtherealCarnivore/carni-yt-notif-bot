// All premade, user-facing bot copy lives here so it can be edited in one
// place. Functions are templates that take values (URLs, names, etc.); plain
// strings are static. Logic lives in the feature modules — this is text only.

export const LINK_YOUTUBE = {
  embedTitle: 'Got a YouTube membership for Iva Markova?',
  embedDescription:
    'Click the button below to link your YouTube account and **automatically get your member role** in this server.\n\n' +
    '**Before you click:** make sure your YouTube account is connected to Discord.\n' +
    'In Discord: **User Settings → Connections → Add → YouTube** — and sign in with the YouTube account that has the membership.\n\n' +
    'Channel: https://www.youtube.com/@Iva_m1',
  embedFooter: 'Roles sync automatically when your tier changes or expires.',
  buttonLabel: 'Link YouTube',
  // Shown ephemerally after clicking the button.
  authorizeReply: (url) =>
    `Click here to authorize: <${url}>\n\n` +
    `If Discord says "No YouTube connection found", add it under **User Settings → Connections → YouTube** first, then click the button again.`,
  // Shown when triggered from a slash command instead of a button.
  slashReply: (url) =>
    `Click to link your YouTube account: <${url}>\n` +
    `If you don't have YouTube connected in Discord yet: ` +
    `**User Settings → Connections → Add → YouTube** first.`,
};

export const VIDEO = {
  // content for a new-upload post. roleMention is '' when no ping role is set.
  notification: ({ roleMention, feedTitle, videoTitle, videoUrl }) =>
    `${roleMention ? roleMention + ' ' : ''}🎬 **New video from ${feedTitle}!**\n\n**${videoTitle}**\n${videoUrl}`,
  subscribeLabel: 'Subscribe',
  allVideosLabel: 'All Videos',
};

export const PERKS = {
  title: '🔓 Membership Perks',
  intro: 'Become a channel member to unlock these exclusive channels:',
  cascadeNote: 'Higher tiers include everything in the tiers below them.',
  howTo:
    '**How to unlock:**\n' +
    '1. Get a membership — tap **Get Membership** below.\n' +
    '2. Connect YouTube to Discord (User Settings → Connections → YouTube).\n' +
    '3. Tap **Link YouTube** to claim your role.',
  footer: 'Roles sync automatically — upgrades, downgrades, and cancellations all update.',
  noTiers: '*(no tiers configured yet)*',
  getMembershipLabel: 'Get Membership',
};

export const VERIFY = {
  embedTitle: 'Verify you are human',
  embedDescription:
    'Welcome! To access the rest of the server, click the button below.\n\n' +
    'This is a quick anti-bot check — no account info is shared, just a click.',
  embedFooter: 'Trouble? DM a moderator.',
  buttonLabel: 'I am human',
  notConfigured: 'Verification is not configured. Ping a mod.',
  accountTooNew: (days) =>
    `Your Discord account is too new to be verified automatically. ` +
    `Try again in **~${days} day${days === 1 ? '' : 's'}**, or DM a mod for manual review.`,
  alreadyVerified: 'You are already verified.',
  success: '✅ Verified. Welcome in.',
  failure: (reason) => `Failed to verify: ${reason}`,
  captchaRedirect: (url) =>
    `One more step: click here to complete the human check → <${url}>\n` +
    `Link expires in 10 minutes.`,
  // Best-effort DM after a fresh verification. `where` is a channel mention or '#set-roles'.
  welcomeDm: (guildName, where) =>
    `✅ You're verified — welcome to **${guildName}**!\n\n` +
    `Head to ${where} to pick your notifications (new videos, PoE patch notes) ` +
    `and to link your YouTube membership for member perks.`,
};

// DM sent to brand-new joiners (separate from the verify flow).
export const WELCOME = {
  joinDmGreeting: (guildName) => `👋 Welcome to ${guildName}!`,
};

export const ROLE_PICKER = {
  embedTitle: 'Notifications & Membership',
  embedDescription:
    'Tap **Manage Notifications** to pick your patch-note pings. ' +
    'A green ✓ shows what you already have.\n\n' +
    '⚔️ **PoE 1 Pings** — Path of Exile patch notes\n' +
    '🔮 **PoE 2 Pings** — Path of Exile 2 patch notes\n' +
    '💎 **Link YouTube** — claim your channel-membership role',
  manageButtonLabel: 'Manage Notifications',
  linkYouTubeLabel: 'Link YouTube',
  poe1Label: 'PoE 1 Pings',
  poe2Label: 'PoE 2 Pings',
  manageText: 'Toggle your pings — **green ✓** means you have it:',
  noneConfigured: 'No notification roles are configured right now.',
};

export const POE = {
  game1Label: 'Path of Exile',
  game2Label: 'Path of Exile 2',
};
